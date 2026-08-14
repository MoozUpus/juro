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
export function createLegalAgentTools(dependencies: LegalAgentToolDependencies = {}) {
  const search = dependencies.search ?? ((input) => retrieveLiveLexSources(input));
  const document = dependencies.document ?? ((input) => fetchDirectOfficialLexDocument(
    input.url,
    input.locale,
    { query: input.query },
  ));

  return {
    async searchOfficialLex(input: unknown) {
      const parsed = z.object({ query: querySchema, locale: localeSchema, limit: z.number().int().min(1).max(5).default(3) }).strict().parse(input);
      const result = await search(parsed);
      return {
        status: result.sourceValidationStatus,
        sources: result.sources.map(publicPacket),
        safeErrors: result.errors.map((error) => error.code),
      };
    },

    async getOfficialLexDocument(input: unknown) {
      const parsed = z.object({ url: officialUrlSchema, locale: localeSchema, query: querySchema.optional() }).strict().parse(input);
      const reference = officialLexReference(parsed.url, parsed.locale);
      const result = await document({ ...parsed, url: reference.canonicalUrl });
      return publicPacket(result.source);
    },

    async getOfficialLexArticle(input: unknown) {
      const parsed = z.object({ url: officialUrlSchema, locale: localeSchema, articleOrAnchor: z.string().trim().min(1).max(120) }).strict().parse(input);
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
      return { kind: "action_plan_draft" as const, ...parsed, confirmationRequired: true as const, persisted: false as const };
    },

    startExistingDocumentTemplate(input: unknown) {
      const parsed = z.object({ templateId: z.string().trim().min(1).max(150), locale: localeSchema }).strict().parse(input);
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
