import { z } from "zod";
import { DOCUMENT_REGISTRY, getDocumentByCode } from "../document-builder/registry";
import {
  fetchDirectOfficialLexDocument,
  type DirectLegalSourceEvidence,
} from "../legal/direct-retrieval";
import { retrieveLiveLexSources, type LiveLexRetrievalResult } from "../legal/live-lex-retrieval";
import { classifyLegalSourceUrl } from "../legal/source-fetch";
import type { LegalSourceContext, LegalSourceSpan } from "./provider";

const localeSchema = z.enum(["ru", "uz"]);
const querySchema = z.string().trim().min(2).max(2_000);
const officialUrlSchema = z.string().url().max(2_048);
const legalAgentCapabilityBrand = Symbol("legal-agent-capability");

export type LegalAgentOperation =
  | "search_official_sources"
  | "read_official_document"
  | "draft_action_plan"
  | "open_document_template";

export type LegalAgentToolCapability = {
  readonly [legalAgentCapabilityBrand]: true;
  readonly locale: "ru" | "uz";
  readonly allowedOperations: ReadonlySet<LegalAgentOperation>;
  readonly maxReadCalls: number;
  readonly allowedCaseIds: ReadonlySet<string>;
  readonly allowedTemplateIds: ReadonlySet<string>;
};

/** Server code mints the narrow request capability; model/user input cannot. */
export function issueLegalAgentToolCapability(input: {
  locale: "ru" | "uz";
  allowedOperations: readonly LegalAgentOperation[];
  maxReadCalls?: number;
  allowedCaseIds?: readonly string[];
  allowedTemplateIds?: readonly string[];
}): LegalAgentToolCapability {
  return Object.freeze({
    [legalAgentCapabilityBrand]: true as const,
    locale: input.locale,
    allowedOperations: new Set(input.allowedOperations),
    maxReadCalls: Math.max(0, Math.min(input.maxReadCalls ?? 0, 8)),
    allowedCaseIds: new Set(input.allowedCaseIds ?? []),
    allowedTemplateIds: new Set(input.allowedTemplateIds ?? []),
  });
}

function officialLexReference(value: string, locale: "ru" | "uz") {
  const reference = classifyLegalSourceUrl(value);
  if (reference.sourceKind !== "lex" || reference.locale !== locale) {
    throw new TypeError("OFFICIAL_LEX_URL_REQUIRED");
  }
  return reference;
}

function publicPacket(source: LegalSourceContext) {
  return {
    sourceId: source.id,
    title: source.actTitle,
    canonicalUrl: source.officialUrl,
    canonicalId: source.actIdentifier,
    article: source.article ?? null,
    accessedAt: source.verifiedAt,
    spans: source.spans ?? [],
  };
}

export type LegalAgentToolDependencies = {
  search?: (input: { query: string; locale: "ru" | "uz"; limit: number }) => Promise<LiveLexRetrievalResult>;
  document?: (input: { url: string; locale: "ru" | "uz"; query?: string }) => Promise<{
    source: LegalSourceContext;
    evidence: DirectLegalSourceEvidence;
  }>;
};

/**
 * Strict server-side tools available to the legal gateway. None mutates a case
 * or document. Network access is limited to canonical HTTPS Lex.uz documents;
 * template and plan operations return confirmation-required drafts only.
 */
export function createLegalAgentTools(
  dependencies: LegalAgentToolDependencies,
  capability: LegalAgentToolCapability,
) {
  const search = dependencies.search ?? ((input) => retrieveLiveLexSources(input));
  const document = dependencies.document ?? ((input) => fetchDirectOfficialLexDocument(
    input.url,
    input.locale,
    { query: input.query },
  ));
  let readCalls = 0;
  const authorize = (operation: LegalAgentOperation, locale?: "ru" | "uz") => {
    if (
      capability[legalAgentCapabilityBrand] !== true
      || !capability.allowedOperations.has(operation)
      || (locale && locale !== capability.locale)
    ) throw new TypeError("LEGAL_OPERATION_NOT_AVAILABLE");
    if (operation === "search_official_sources" || operation === "read_official_document") {
      readCalls += 1;
      if (readCalls > capability.maxReadCalls) throw new TypeError("LEGAL_OPERATION_NOT_AVAILABLE");
    }
  };

  return {
    async searchOfficialLex(input: unknown) {
      const parsed = z.object({ query: querySchema, locale: localeSchema, limit: z.number().int().min(1).max(5).default(3) }).strict().parse(input);
      authorize("search_official_sources", parsed.locale);
      const result = await search(parsed);
      return {
        status: result.sourceValidationStatus,
        sources: result.sources.map(publicPacket),
        safeErrors: result.errors.map((error) => error.code),
      };
    },

    async getOfficialLexDocument(input: unknown) {
      const parsed = z.object({ url: officialUrlSchema, locale: localeSchema, query: querySchema.optional() }).strict().parse(input);
      authorize("read_official_document", parsed.locale);
      const reference = officialLexReference(parsed.url, parsed.locale);
      const result = await document({ ...parsed, url: reference.canonicalUrl });
      return publicPacket(result.source);
    },

    async getOfficialLexArticle(input: unknown) {
      const parsed = z.object({ url: officialUrlSchema, locale: localeSchema, articleOrAnchor: z.string().trim().min(1).max(120) }).strict().parse(input);
      authorize("read_official_document", parsed.locale);
      const reference = officialLexReference(parsed.url, parsed.locale);
      const result = await document({ url: reference.canonicalUrl, locale: parsed.locale, query: parsed.articleOrAnchor });
      const needle = parsed.articleOrAnchor.toLocaleLowerCase();
      const spans = (result.source.spans ?? []).filter((span) =>
        span.article?.toLocaleLowerCase().includes(needle)
        || span.paragraph?.toLocaleLowerCase().includes(needle)
        || span.text.toLocaleLowerCase().startsWith(needle),
      );
      if (spans.length === 0) throw new TypeError("OFFICIAL_LEX_ARTICLE_NOT_FOUND");
      return { ...publicPacket(result.source), spans };
    },

    async getOfficialLexStructure(input: unknown) {
      const parsed = z.object({ url: officialUrlSchema, locale: localeSchema }).strict().parse(input);
      authorize("read_official_document", parsed.locale);
      const reference = officialLexReference(parsed.url, parsed.locale);
      const result = await document({ url: reference.canonicalUrl, locale: parsed.locale });
      const spans = result.source.spans ?? [];
      return {
        sourceId: result.source.id,
        title: result.source.actTitle,
        canonicalUrl: result.source.officialUrl,
        articles: [...new Set(spans.map((span: LegalSourceSpan) => span.article).filter((value): value is string => Boolean(value)))],
        paragraphs: [...new Set(spans.map((span: LegalSourceSpan) => span.paragraph).filter((value): value is string => Boolean(value)))],
      };
    },

    createActionPlanDraft(input: unknown) {
      const parsed = z.object({
        caseContext: z.object({ caseId: z.string().uuid(), title: z.string().trim().min(1).max(300), summary: z.string().trim().max(4_000) }).strict(),
        proposedSteps: z.array(z.object({ title: z.string().trim().min(1).max(240), description: z.string().trim().max(1_000) }).strict()).max(12).default([]),
      }).strict().parse(input);
      authorize("draft_action_plan");
      if (!capability.allowedCaseIds.has(parsed.caseContext.caseId)) {
        throw new TypeError("LEGAL_OPERATION_NOT_AVAILABLE");
      }
      return { kind: "action_plan_draft" as const, ...parsed, confirmationRequired: true as const, persisted: false as const };
    },

    startExistingDocumentTemplate(input: unknown) {
      const parsed = z.object({ templateId: z.string().trim().min(1).max(150), locale: localeSchema }).strict().parse(input);
      authorize("open_document_template", parsed.locale);
      if (!capability.allowedTemplateIds.has(parsed.templateId)) {
        throw new TypeError("LEGAL_OPERATION_NOT_AVAILABLE");
      }
      const definition = getDocumentByCode(parsed.templateId)
        ?? DOCUMENT_REGISTRY.find((candidate) => candidate.id === parsed.templateId);
      if (!definition || definition.status !== "published") throw new TypeError("DOCUMENT_TEMPLATE_UNAVAILABLE");
      return {
        kind: "document_template_handoff" as const,
        templateId: definition.id,
        templateCode: definition.code,
        categorySlug: definition.categorySlug,
        title: parsed.locale === "ru" ? definition.titleRu : definition.titleUz,
        href: `/document-builder/${encodeURIComponent(definition.categorySlug)}?template=${encodeURIComponent(definition.code)}`,
        confirmationRequired: true as const,
        documentCreated: false as const,
      };
    },
  };
}

export type LegalAgentTools = ReturnType<typeof createLegalAgentTools>;
