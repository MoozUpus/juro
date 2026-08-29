import { z } from "zod";

/**
 * Claim/source filtering and coverage checks adapt the grounding concepts in
 * toxirerkinov70-commits/huquq-ai@1bce500c69b8213373d8ce0b40d56be7d83f6aec.
 * MIT License, Copyright (c) 2026 Toxir Erkinov. This implementation adds
 * exact request-scoped Lex span IDs/hashes and JURO's provider-neutral schema.
 */

import { containsLegalSourceUiNoise } from "../legal/source-parser";
import { canonicalSecondaryInternetUrl } from "../legal/secondary-internet-url";
import { parsePrivateDocumentLocator } from "../document-analysis/private-document-locator";
import { AiUnavailableError } from "../document-builder/ai/openai";
import {
  containsSensitiveAgentContent,
  containsUnvalidatedHttpLink,
  groundedTextComparisonKey,
  nonRepeatingLegalText,
  plainGroundedText,
  sanitizeClarificationQuestions,
} from "./legal-output-safety";
import {
  classifyLegalIntent,
  planLegalResearch,
  rewriteLegalFollowUp,
  type LegalIntentDecision,
  type LegalResearchPlan,
} from "./legal-query-planner";
import {
  forceClarificationWithoutVerifiedSources,
  legalFindingSchema,
  type LegalChatResponse,
} from "./legal-chat-schema";
import { attachSecondaryReferenceContext } from "./secondary-reference-result";
import {
  aiProviderStatus,
  type AiProviderStatus,
  type LegalAiProvider,
  type LegalAiRunOptions,
  type LegalAiRunResult,
  type LegalChatRequest,
  type LegalSourceContext,
  type LegalSourceSpan,
} from "./provider";

const claimTypeSchema = z.enum(["legal_basis", "action", "deadline", "risk", "fact"]);

export const legalGatewayClaimSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
  type: claimTypeSchema,
  sourceId: z.string().trim().min(1).max(160).nullable(),
  sourceSpanId: z.string().trim().min(1).max(200).nullable(),
  confidence: z.number().min(0).max(1),
}).strict();

export const legalGatewaySourceSchema = z.object({
  sourceId: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(500),
  article: z.string().trim().max(240).nullable(),
  paragraph: z.string().trim().max(240).nullable(),
  canonicalUrl: z.string().url().max(2_000),
  accessedAt: z.string().datetime({ offset: true }),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const legalGatewayProviderMetadataSchema = z.object({
  provider: z.enum(["openai", "anthropic"]),
  model: z.string().trim().min(1).max(160),
  providerResponseId: z.string().trim().max(240).nullable(),
  attempts: z.number().int().min(1).max(3),
  latencyMs: z.number().int().nonnegative(),
  fallbackFromProvider: z.enum(["openai", "anthropic"]).nullable(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
}).strict();

export const legalGatewayAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(20_000),
  claims: z.array(legalGatewayClaimSchema).max(64),
  sources: z.array(legalGatewaySourceSchema).max(12),
  nextSteps: z.array(z.string().trim().min(1).max(2_000)).max(16),
  uncertainty: z.array(z.string().trim().min(1).max(2_000)).max(24),
  providerMetadata: legalGatewayProviderMetadataSchema,
}).strict();

export const groundedLegalPreliminarySchema = z.object({
  kind: z.literal("grounded_answer"),
  message: z.string().trim().min(1).max(4_500),
  claim: legalGatewayClaimSchema,
  source: legalGatewaySourceSchema,
}).strict();

export type LegalGatewayClaim = z.infer<typeof legalGatewayClaimSchema>;
export type LegalGatewayAnswer = z.infer<typeof legalGatewayAnswerSchema>;
export type GroundedLegalPreliminary = z.infer<typeof groundedLegalPreliminarySchema>;

export type LegalAiGatewayRunOptions = LegalAiRunOptions & {
  /** Receives only a claim that has passed the authoritative Lex span gate. */
  onGroundedPreliminary?: (preliminary: GroundedLegalPreliminary) => void | Promise<void>;
};

export type ValidatedLegalGatewayResult = {
  run: LegalAiRunResult;
  answer: LegalGatewayAnswer;
  removedClaimCount: number;
};

export interface LegalAiGateway {
  classifyIntent(question: string): LegalIntentDecision;
  rewriteFollowUp(input: {
    question: string;
    locale: "ru" | "uz";
    conversationHistory?: readonly { user: string; assistant: string }[];
  }): { query: string; rewritten: boolean };
  planOfficialResearch(input: {
    question: string;
    locale: "ru" | "uz";
    conversationHistory?: readonly { user: string; assistant: string }[];
  }): LegalResearchPlan;
  generateGroundedAnswer(
    input: LegalChatRequest,
    options?: LegalAiGatewayRunOptions,
  ): Promise<ValidatedLegalGatewayResult>;
  validateAnswerContract(input: {
    result: LegalChatResponse;
    run: LegalAiRunResult;
    sources: readonly LegalSourceContext[];
    question?: string;
    retrievalQuery?: string;
    locale: "ru" | "uz";
    answerMode: "short" | "detailed";
    reasoningMode: "fast" | "deep";
    legalDatabaseAsOf: string;
    availableDocumentTemplateCodes?: readonly string[];
  }): ValidatedLegalGatewayResult;
  providerHealth(): AiProviderStatus;
}

type CandidateClaim = Omit<LegalGatewayClaim, "sourceId" | "sourceSpanId" | "confidence"> & {
  sourceIds: readonly string[];
  rawText?: string;
};

const SOURCE_FALLBACK_CODES = new Set([
  "PROVIDER_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "INVALID_AI_OUTPUT",
] as const);

function officialLexUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.port === ""
      && url.username === ""
      && url.password === ""
      && (url.hostname === "lex.uz" || url.hostname === "www.lex.uz");
  } catch {
    return false;
  }
}

function trustedPrivateSource(source: LegalSourceContext): boolean {
  return source.sourceType === "internal"
    && source.sourceClass === "USER_TRUSTED_PRIVATE"
    && source.verificationState === "user_supplied"
    && source.status === "user_supplied"
    && parsePrivateDocumentLocator(source.officialUrl) !== null
    && /^[a-f0-9]{64}$/u.test(source.contentSha256)
    && source.sourceQuality?.passed === true;
}

function trustedSecondarySource(source: LegalSourceContext): boolean {
  return source.sourceType === "advice"
    && source.sourceClass === "SECONDARY_REFERENCE"
    && source.verificationState === "web_cited"
    && source.status === "unconfirmed"
    && canonicalSecondaryInternetUrl(source.officialUrl) === source.officialUrl
    && /^[a-f0-9]{64}$/u.test(source.contentSha256)
    && source.sourceQuality?.passed === true;
}

function verifiedLexSource(source: LegalSourceContext): boolean {
  return source.sourceType === "lex"
    && ["direct_validated", "verified"].includes(source.verificationState)
    && source.sourceQuality?.passed === true
    && officialLexUrl(source.officialUrl);
}

/**
 * The three publication tiers. `authoritative` may be published as law.
 * `private` is the asker's own document: it can confirm a fact about their
 * situation. `secondary` is public-web reference material: it can explain
 * background but can never establish legislation, a normative deadline, a
 * calculation or a mandatory action, so it is published only as a reference
 * note. Anything else is not publishable at all.
 */
type LegalSourceTier = "authoritative" | "private" | "secondary";

function sourceTier(source: LegalSourceContext): LegalSourceTier | null {
  if (verifiedLexSource(source)) return "authoritative";
  if (trustedPrivateSource(source)) return "private";
  if (trustedSecondarySource(source)) return "secondary";
  return null;
}

function claimTypeForSource(claim: CandidateClaim, source: LegalSourceContext): LegalGatewayClaim["type"] {
  return sourceTier(source) === "authoritative" ? claim.type : "fact";
}

/**
 * Interrogatives, copulas, connectives and answer-format imperatives carry no
 * proposition, so they must not be treated as something a provision has to
 * repeat. This is a closed grammatical class in ru/uz/en — not a legal, topical
 * or synonym vocabulary — so it cannot bias the gate toward any subject matter.
 */
const GRAMMATICAL_FUNCTION_WORD = /^(?:котор\p{L}*|этого|также|чтобы|можно|нужно|нужны|надо|какие|какой|какая|когда|почему|должен|должны|есть|дайте|укажите|ответьте|скажите|uchun|bilan|bo\p{L}*yicha|kerak|keyin|oldin|nima|nimalar|nimani|qanday|qaysi|qachon|nega|bo\p{L}?lishi|bo\p{L}?ladi|javob|please|should|could|would|which|there|about)$/iu;

function legalTerms(value: string): string[] {
  // Uzbek apostrophes are written with several Unicode characters. Treat
  // them as part of the word before tokenization; otherwise a term such as
  // `bo‘lishi` becomes the misleading standalone token `lishi` and can make
  // a correctly grounded Article 14 answer fail the relevance gate.
  const normalized = value.toLocaleLowerCase().replace(/[‘’ʼʻ']/gu, "");
  return [...new Set(normalized.match(/[\p{L}\p{N}]{4,}/gu) ?? [])]
    .filter((term) => !GRAMMATICAL_FUNCTION_WORD.test(term))
    .slice(0, 40);
}

const MIN_SHARED_STEM = 5;
const MAX_COMPARED_TERM_LENGTH = 24;

/**
 * Two words are treated as the same concept when they share a substring of at
 * least five characters. This replaces both a fixed-length prefix root and the
 * per-word normalisation rules it needed: `зарегистрировать` and `регистрации`
 * share `регистра`, and `ustavida` matches `ustavining`, without any synonym
 * table, prefix list or topic vocabulary. Work is bounded by the token length
 * cap, so a long pasted word cannot make this expensive.
 */
function sharesStem(left: string, right: string): boolean {
  const a = left.slice(0, MAX_COMPARED_TERM_LENGTH);
  const b = right.slice(0, MAX_COMPARED_TERM_LENGTH);
  if (a.length < MIN_SHARED_STEM || b.length < MIN_SHARED_STEM) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  for (let start = 0; start + MIN_SHARED_STEM <= shorter.length; start += 1) {
    if (longer.includes(shorter.slice(start, start + MIN_SHARED_STEM))) return true;
  }
  return false;
}

/**
 * Terms shorter than the shared-stem window are abbreviations and short forms
 * (a legal form, a party code) that name the act rather than the requested
 * proposition. Demanding that a provision repeat them only produces false
 * negatives, so length — not a list of words — decides what must be matched.
 */
function numericTokens(value: string): string[] {
  return [...new Set(value.match(/\b\d+(?:[.,-]\d+)*\b/gu) ?? [])];
}

function spanCoverage(text: string, span: LegalSourceSpan): number {
  const terms = legalTerms(plainGroundedText(text));
  if (terms.length === 0) return 0;
  const spanTerms = legalTerms(span.text);
  return terms.filter((term) => spanTerms.some((candidate) =>
    candidate === term || sharesStem(term, candidate)
  )).length / terms.length;
}

function validateSpanForClaim(
  claim: CandidateClaim,
  source: LegalSourceContext,
  span: LegalSourceSpan,
  allowedUrls: ReadonlySet<string>,
): boolean {
  const tier = sourceTier(source);
  if (!tier) return false;
  // A non-authoritative source may support a statement that JURO will later
  // demote to a fact or a reference note, but it must never be the evidence
  // behind a mandatory action, a normative deadline or a legal risk. Those
  // candidate types are rejected outright here; the demotion of what survives
  // happens in validateLegalGatewayAnswer, which is the only place that may
  // publish a claim.
  if (tier !== "authoritative" && claim.type !== "legal_basis") return false;
  if (containsSensitiveAgentContent(claim.rawText ?? claim.text)) return false;
  if (containsUnvalidatedHttpLink(claim.rawText ?? claim.text, allowedUrls)) return false;
  if (span.quality !== "high" || containsLegalSourceUiNoise(span.text)) return false;
  if (!/^[a-f0-9]{64}$/u.test(span.textSha256)) return false;
  const spanText = span.text.toLocaleLowerCase();
  if (numericTokens(claim.text).some((token) => !spanText.includes(token.toLocaleLowerCase()))) return false;
  const coverage = spanCoverage(claim.text, span);
  const termCount = legalTerms(plainGroundedText(claim.text)).length;
  return coverage >= 0.35 && (termCount < 4 || coverage * termCount >= 2);
}

function bestValidatedSpan(
  claim: CandidateClaim,
  sources: ReadonlyMap<string, LegalSourceContext>,
): { source: LegalSourceContext; span: LegalSourceSpan; coverage: number } | null {
  let best: { source: LegalSourceContext; span: LegalSourceSpan; coverage: number } | null = null;
  const allowedUrls = new Set([...sources.values()].map((source) => source.officialUrl));
  for (const sourceId of claim.sourceIds) {
    const source = sources.get(sourceId);
    if (!source) continue;
    for (const span of source.spans ?? []) {
      if (!validateSpanForClaim(claim, source, span, allowedUrls)) continue;
      const coverage = spanCoverage(claim.text, span);
      if (!best || coverage > best.coverage) best = { source, span, coverage };
    }
  }
  return best;
}

function candidateClaims(result: LegalChatResponse): CandidateClaim[] {
  const claim = (title: string, explanation: string) => {
    const rawText = `${title}. ${explanation}`;
    return { text: nonRepeatingLegalText(title, explanation), rawText };
  };
  return [
    ...result.confirmedFindings.map((finding) => ({
      ...claim(finding.title, finding.explanation),
      type: "legal_basis" as const,
      sourceIds: finding.sourceIds,
    })),
    ...(result.conditionalBranches ?? []).map((branch) => ({
      ...claim(branch.condition, branch.outcome),
      type: "legal_basis" as const,
      sourceIds: branch.sourceIds,
    })),
    ...result.actionPlan.filter((step) => step.sourceIds.length > 0).map((step) => ({
      ...claim(step.title, step.description),
      type: "action" as const,
      sourceIds: step.sourceIds,
    })),
    ...result.risks.filter((risk) => risk.sourceIds.length > 0).map((risk) => ({
      ...claim(risk.title, risk.explanation),
      type: "risk" as const,
      sourceIds: risk.sourceIds,
    })),
    ...result.deadlines.filter((deadline) => deadline.confidence === "confirmed").map((deadline) => ({
      text: plainGroundedText(`${deadline.title}. ${deadline.dueDate ?? ""} ${deadline.calculationMethod}`),
      rawText: `${deadline.title}. ${deadline.dueDate ?? ""} ${deadline.calculationMethod}`,
      type: "deadline" as const,
      sourceIds: deadline.sourceIds,
    })),
  ];
}

function sourceMetadata(source: LegalSourceContext, span: LegalSourceSpan) {
  return {
    sourceId: source.id,
    title: boundedRequiredMetadata(source.actTitle, 500, "Официальный источник"),
    article: boundedNullableMetadata(span.article ?? source.article, 240),
    paragraph: boundedNullableMetadata(span.paragraph, 240),
    canonicalUrl: source.officialUrl,
    accessedAt: source.verifiedAt,
    contentSha256: source.contentSha256,
  };
}

function boundedNullableMetadata(value: string | null | undefined, maxLength: number): string | null {
  const normalized = value?.replace(/\s+/gu, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function boundedRequiredMetadata(value: string | null | undefined, maxLength: number, fallback: string): string {
  return boundedNullableMetadata(value, maxLength) ?? fallback;
}

function filteredLegacyResult(
  result: LegalChatResponse,
  validClaims: readonly LegalGatewayClaim[],
  validSourceIds: ReadonlySet<string>,
  availableDocumentTemplateCodes: ReadonlySet<string>,
): LegalChatResponse {
  const supportedText = new Set(validClaims.map((claim) => claim.text));
  const supported = (title: string, explanation: string) =>
    supportedText.has(nonRepeatingLegalText(title, explanation));
  return {
    ...result,
    confirmedFindings: result.confirmedFindings.filter((finding) =>
      supported(finding.title, finding.explanation)
        && finding.sourceIds.every((sourceId) => validSourceIds.has(sourceId)),
    ).map((finding) => ({
      ...finding,
      title: plainGroundedText(finding.title),
      explanation: plainGroundedText(finding.explanation),
    })),
    conditionalBranches: (result.conditionalBranches ?? []).filter((branch) =>
      supported(branch.condition, branch.outcome)
        && branch.sourceIds.every((sourceId) => validSourceIds.has(sourceId)),
    ).map((branch) => ({
      ...branch,
      condition: plainGroundedText(branch.condition),
      outcome: plainGroundedText(branch.outcome),
    })),
    risks: result.risks.filter((risk) =>
      risk.sourceIds.length > 0 && (supported(risk.title, risk.explanation)
        && risk.sourceIds.every((sourceId) => validSourceIds.has(sourceId))),
    ).map((risk) => ({ ...risk, title: plainGroundedText(risk.title), explanation: plainGroundedText(risk.explanation) })),
    actionPlan: result.actionPlan.filter((step) =>
      step.sourceIds.length > 0 && (supported(step.title, step.description)
        && step.sourceIds.every((sourceId) => validSourceIds.has(sourceId))),
    ).map((step) => ({ ...step, title: plainGroundedText(step.title), description: plainGroundedText(step.description) })),
    deadlines: result.deadlines.filter((deadline) =>
      validClaims.some((claim) => claim.type === "deadline"
        && claim.text.startsWith(`${plainGroundedText(deadline.title)}.`)),
    ).map((deadline) => ({
      ...deadline,
      title: plainGroundedText(deadline.title),
      calculationMethod: plainGroundedText(deadline.calculationMethod),
    })),
    sources: [],
    suggestedDocument: result.suggestedDocument
      && result.suggestedDocument.templateCode
      && availableDocumentTemplateCodes.has(result.suggestedDocument.templateCode)
      && !containsSensitiveAgentContent(`${result.suggestedDocument.title}\n${result.suggestedDocument.reason}`)
      && !containsUnvalidatedHttpLink(`${result.suggestedDocument.title}\n${result.suggestedDocument.reason}`, new Set())
      ? {
        ...result.suggestedDocument,
        title: plainGroundedText(result.suggestedDocument.title),
        reason: plainGroundedText(result.suggestedDocument.reason),
      }
      : null,
  };
}

function groundedVisibleAnswer(
  claims: readonly LegalGatewayClaim[],
  locale: "ru" | "uz",
  labelled = false,
  limit = 3,
): string {
  const seen = new Set<string>();
  const statements = claims.flatMap((claim) => {
    const statement = claim.text.trim();
    const key = groundedTextComparisonKey(statement);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [statement];
  }).slice(0, limit);
  if (!labelled) return statements.join(" ");
  return locale === "ru" ? `Краткий вывод: ${statements.join(" ")}` : `Qisqa xulosa: ${statements.join(" ")}`;
}

export function validateGroundedPreliminaryFinding(input: {
  finding: unknown;
  sources: readonly LegalSourceContext[];
  question?: string;
  locale: "ru" | "uz";
}): GroundedLegalPreliminary | null {
  const parsed = legalFindingSchema.safeParse(input.finding);
  if (!parsed.success) return null;
  const candidate: CandidateClaim = {
    text: nonRepeatingLegalText(parsed.data.title, parsed.data.explanation),
    type: "legal_basis",
    sourceIds: parsed.data.sourceIds,
  };
  const match = bestValidatedSpan(
    candidate,
    new Map(input.sources.map((source) => [source.id, source])),
  );
  if (!match) return null;
  // Streaming preliminaries are intentionally limited to authoritative law.
  // Private files and public-web material may ground terminal factual claims or
  // reference notes only after the complete answer has passed the same
  // tenant-scoped final validation path.
  if (sourceTier(match.source) !== "authoritative") return null;
  const claim: LegalGatewayClaim = {
    text: candidate.text,
    type: candidate.type,
    sourceId: match.source.id,
    sourceSpanId: match.span.id,
    confidence: Math.min(1, Math.max(0.5, match.coverage)),
  };
  return groundedLegalPreliminarySchema.parse({
    kind: "grounded_answer",
    message: groundedVisibleAnswer([claim], input.locale, true),
    claim,
    source: sourceMetadata(match.source, match.span),
  });
}

function preliminaryFromValidatedResult(
  result: ValidatedLegalGatewayResult,
  locale: "ru" | "uz",
): GroundedLegalPreliminary | null {
  // `type: "fact"` marks a claim that was grounded on a private document or on
  // public-web material. Those must never be streamed as a legal conclusion, so
  // only authoritative claim types are eligible to become a preliminary.
  const claim = result.answer.claims.find((candidate) =>
    candidate.sourceId && candidate.sourceSpanId && candidate.type !== "fact");
  if (!claim?.sourceId) return null;
  const source = result.answer.sources.find((candidate) => candidate.sourceId === claim.sourceId);
  if (!source) return null;
  return groundedLegalPreliminarySchema.parse({
    kind: "grounded_answer",
    message: groundedVisibleAnswer([claim], locale, true),
    claim,
    source,
  });
}

function canonicalLegacySource(
  source: LegalSourceContext,
  span: LegalSourceSpan,
): LegalChatResponse["sources"][number] {
  const language = source.locale === "uzc" ? "uz-Cyrl" as const
    : source.locale === "uz" ? "uz-Latn" as const
      : source.locale === "en" ? "en" as const : "ru" as const;
  return {
    sourceId: source.id,
    actTitle: boundedRequiredMetadata(source.actTitle, 500, "Официальный источник"),
    actIdentifier: boundedNullableMetadata(source.actIdentifier, 240),
    article: boundedNullableMetadata(span.article ?? source.article, 240),
    excerpt: null,
    originalUrl: source.officialUrl,
    status: source.applicabilityStatus ?? "current",
    effectiveDate: boundedNullableMetadata(source.effectiveDate, 64),
    verifiedAt: boundedRequiredMetadata(source.verifiedAt, 64, new Date(0).toISOString()),
    documentType: boundedNullableMetadata(source.documentType, 160),
    documentNumber: boundedNullableMetadata(source.documentNumber ?? source.actIdentifier, 240),
    adoptingAuthority: boundedNullableMetadata(source.adoptingAuthority, 500),
    sourceClass: source.sourceClass ?? "OFFICIAL_LEGISLATION",
    language,
    sourceOrigin: source.verificationState === "web_cited"
      ? "web"
      : source.verificationState === "direct_validated" ? "live" : "indexed",
  };
}

/**
 * Last resort when no provider claim survives: publish one exact sentence of
 * the highest-ranked exact span instead of discarding request-owned evidence.
 * Source tier still decides whether that sentence is law, a private fact, or a
 * non-authoritative reference note.
 */
function sourceGroundedFallback(
  sources: readonly LegalSourceContext[],
  question?: string,
): { claim: LegalGatewayClaim; source: LegalSourceContext; span: LegalSourceSpan } | null {
  const questionTerms = question ? legalTerms(question) : [];
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const allowedUrls = new Set(sources.map((source) => source.officialUrl));
  for (const source of sources) {
    if (!sourceTier(source)) continue;
    for (const span of source.spans ?? []) {
      if (questionTerms.length > 0) {
        const sourceTerms = legalTerms([
          source.actTitle,
          source.article,
          span.article,
          span.text,
        ].filter(Boolean).join(" "));
        const matches = questionTerms.filter((term) => sourceTerms.some((candidate) =>
          candidate === term || sharesStem(term, candidate)
        )).length;
        const required = questionTerms.length === 1
          ? 1
          : Math.min(4, Math.max(2, Math.ceil(questionTerms.length / 4)));
        if (matches < required) continue;
      }
      const normalized = span.text
        .replace(/\s+/gu, " ")
        .trim();
      const articleHeadingKey = groundedTextComparisonKey(span.article ?? "")
        .replace(/^(?:статья|ст|модда|modda|article)?\s*\d+(?:[.-]\d+)?\s*/iu, "")
        .trim();
      const sentences = normalized
        .split(/(?<=[.!?])\s+/u)
        .map((part) => part.trim());
      const sentence = (sentences.find((part) => {
        if (part.length < 40) return false;
        const partKey = groundedTextComparisonKey(part)
          .replace(/^(?:статья|ст|модда|modda|article)?\s*\d+(?:[.-]\d+)?\s*/iu, "")
          .trim();
        // Long provision headings often form their own sentence. Prefer the
        // operative text below the heading when it is present.
        return !articleHeadingKey
          || (partKey !== articleHeadingKey
            && !articleHeadingKey.includes(partKey)
            && !partKey.includes(articleHeadingKey));
      }) ?? sentences.find((part) => part.length >= 40) ?? normalized)
        .slice(0, 1_200);
      if (sentence.length < 40 || containsSensitiveAgentContent(sentence)) continue;
      const candidate: CandidateClaim = {
        text: sentence,
        type: "legal_basis",
        sourceIds: [source.id],
      };
      if (!validateSpanForClaim(candidate, source, span, allowedUrls)) continue;
      return {
        claim: {
          text: sentence,
          type: claimTypeForSource(candidate, sourceMap.get(source.id) ?? source),
          sourceId: source.id,
          sourceSpanId: span.id,
          confidence: 1,
        },
        source,
        span,
      };
    }
  }
  return null;
}

/**
 * Preserves verified evidence when synthesis providers are unavailable.
 * Every visible legal sentence is copied from an exact, hashed request-owned
 * span and passes the same claim/span validation as a provider-authored claim.
 * This is deliberately a limited source reader, not a model-free legal
 * opinion: it emits no inferred action, deadline, risk, or outcome.
 */
export function buildVerifiedSourceOnlyFallback(input: {
  sources: readonly LegalSourceContext[];
  question?: string;
  retrievalQuery?: string;
  locale: "ru" | "uz";
  answerMode: "short" | "detailed";
  reasoningMode: "fast" | "deep";
  legalDatabaseAsOf: string;
  provider: "openai" | "anthropic";
  model: string;
  attempts: number;
  latencyMs: number;
  reason: "PROVIDER_TIMEOUT" | "PROVIDER_UNAVAILABLE" | "INVALID_AI_OUTPUT";
}): ValidatedLegalGatewayResult | null {
  const firstDeterministic = input.sources.find((source) =>
    source.retrievalSelection === "deterministic_fallback");
  const fallbackSources = [
    ...(firstDeterministic ? [firstDeterministic] : []),
    ...input.sources.filter((source) => source.retrievalSelection !== "deterministic_fallback"),
  ];
  const grounded = fallbackSources.flatMap((source) => {
    const fallback = sourceGroundedFallback([source]);
    return fallback ? [fallback] : [];
  }).slice(0, input.answerMode === "short" ? 1 : 4);
  if (grounded.length === 0) return null;

  const exactText = grounded.map(({ claim }) => claim.text).join(" ");
  const response: LegalChatResponse = {
    confirmedFindings: grounded.map(({ claim, source, span }) => ({
      title: (span.article ?? source.actTitle).slice(0, 240),
      explanation: claim.text,
      sourceIds: [source.id],
    })),
    responseKind: "answer",
    summary: input.locale === "ru"
      ? "Показаны точные положения из проверенных источников."
      : "Tekshirilgan manbalardagi aniq qoidalar ko‘rsatildi.",
    answer: exactText,
    language: input.locale,
    jurisdiction: "UZ",
    answerMode: input.answerMode,
    reasoningMode: input.reasoningMode,
    clarificationQuestions: [],
    assumptions: [],
    risks: [],
    sources: [],
    requiredDocuments: [],
    actionPlan: [],
    deadlines: [],
    successOutlook: null,
    urgency: "normal",
    suggestedDocument: null,
    suggestLawyer: true,
    legalDatabaseAsOf: input.legalDatabaseAsOf,
  };
  const run: LegalAiRunResult = {
    data: response,
    provider: input.provider,
    model: input.model,
    providerResponseId: null,
    attempts: Math.max(1, Math.min(3, Math.trunc(input.attempts))),
    latencyMs: Math.max(0, Math.trunc(input.latencyMs)),
    usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    fallbackFromProvider: null,
    sourceFallback: true,
    sourceFallbackReason: input.reason,
  };
  return validateLegalGatewayAnswer({
    result: response,
    run,
    sources: input.sources,
    question: input.question,
    retrievalQuery: input.retrievalQuery,
    locale: input.locale,
    answerMode: input.answerMode,
    reasoningMode: input.reasoningMode,
    legalDatabaseAsOf: input.legalDatabaseAsOf,
  });
}

export function validateLegalGatewayAnswer(input: {
  result: LegalChatResponse;
  run: LegalAiRunResult;
  sources: readonly LegalSourceContext[];
  question?: string;
  retrievalQuery?: string;
  locale: "ru" | "uz";
  answerMode: "short" | "detailed";
  reasoningMode: "fast" | "deep";
  legalDatabaseAsOf: string;
  availableDocumentTemplateCodes?: readonly string[];
}): ValidatedLegalGatewayResult {
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const candidates = candidateClaims(input.result);
  const providerValidated = candidates.flatMap((claim): LegalGatewayClaim[] => {
    const match = bestValidatedSpan(claim, sourceById);
    if (!match) return [];
    return [{
      text: claim.text,
      type: claimTypeForSource(claim, match.source),
      sourceId: match.source.id,
      sourceSpanId: match.span.id,
      confidence: Math.min(1, Math.max(0.5, match.coverage)),
    }];
  });
  const validationQuestion = [input.question, input.retrievalQuery]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
  const fallback = providerValidated.length === 0
    ? sourceGroundedFallback(input.sources, validationQuestion)
    : null;
  const providerOrFallback = fallback ? [fallback.claim] : providerValidated;
  const alreadyGroundedSourceIds = new Set(providerOrFallback.flatMap((claim) =>
    claim.sourceId ? [claim.sourceId] : [],
  ));
  // Retrieval has already reduced the official corpus to a bounded set of
  // exact, verified passages. A synthesis model may choose a shorter answer
  // and omit one of those provisions (or time out and take the source-only
  // path), but that must not make source discovery appear different between
  // otherwise identical requests. Preserve an omitted official provision only
  // when its own exact span independently passes the question-relevance gate.
  // The copied span remains the visible claim; no model-authored law is added.
  const serverGroundedOfficial = input.sources.flatMap((source) => {
    if (
      sourceTier(source) !== "authoritative"
      || source.retrievalSelection === "deterministic_fallback"
      || alreadyGroundedSourceIds.has(source.id)
    ) return [];
    const matched = sourceGroundedFallback([source], validationQuestion);
    return matched ? [matched] : [];
  }).slice(0, input.answerMode === "detailed" ? 8 : 3);
  for (const { source } of serverGroundedOfficial) alreadyGroundedSourceIds.add(source.id);
  // Public-web material is already a server-refetched exact span. Preserve up
  // to three such references even when the answer model focused only on the
  // official norm; otherwise useful open-web research silently disappears
  // from the response despite having passed the lower-authority source gate.
  const serverGroundedSecondary = input.sources.flatMap((source) => {
    if (sourceTier(source) !== "secondary" || alreadyGroundedSourceIds.has(source.id)) return [];
    const grounded = sourceGroundedFallback([source]);
    return grounded ? [grounded.claim] : [];
  }).slice(0, 3);
  const validated = [
    ...providerOrFallback,
    ...serverGroundedOfficial.map(({ claim }) => claim),
    ...serverGroundedSecondary,
  ];
  const validSourceIds = new Set(validated.flatMap((claim) => claim.sourceId ? [claim.sourceId] : []));
  // Open-web material counts as a source found — the ladder did return
  // something, so JURO does not refuse — but it can only ever be published as a
  // reference note. Splitting here, before anything is rendered, is what keeps
  // it out of `confirmedFindings` and therefore out of the "confirmed by
  // sources" heading.
  const isSecondaryClaim = (claim: LegalGatewayClaim) => {
    const source = claim.sourceId ? sourceById.get(claim.sourceId) : null;
    return Boolean(source && sourceTier(source) === "secondary");
  };
  const publishable = validated.filter((claim) => !isSecondaryClaim(claim));
  const secondaryClaims = validated.filter(isSecondaryClaim);
  const referenceNotes = secondaryClaims.slice(0, 8).flatMap((claim) => {
    const source = claim.sourceId ? sourceById.get(claim.sourceId) : null;
    if (!source || !claim.sourceId) return [];
    const linkLabel = input.locale === "ru" ? "Открыть справочный источник" : "Ma’lumotnoma manbasini ochish";
    return [{
      title: source.actTitle.slice(0, 240),
      note: `${claim.text.slice(0, 800)}\n\n[${linkLabel}](${source.officialUrl})`.slice(0, 3_000),
      sourceIds: [claim.sourceId],
    }];
  });
  const firstSpanBySource = new Map<string, LegalSourceSpan>();
  for (const claim of validated) {
    const source = claim.sourceId ? sourceById.get(claim.sourceId) : null;
    const span = source?.spans?.find((candidate) => candidate.id === claim.sourceSpanId);
    if (source && span && !firstSpanBySource.has(source.id)) firstSpanBySource.set(source.id, span);
  }
  const filtered = filteredLegacyResult(
    input.result,
    publishable,
    validSourceIds,
    new Set(input.availableDocumentTemplateCodes ?? []),
  );
  const grounded = fallback
    ? {
      ...filtered,
      confirmedFindings: [{
        title: (fallback.span.article ?? fallback.source.actTitle).slice(0, 240),
        explanation: fallback.claim.text,
        sourceIds: [fallback.source.id],
      }],
    }
    : {
      ...filtered,
      confirmedFindings: [
        ...filtered.confirmedFindings,
        ...serverGroundedOfficial.map(({ claim, source, span }) => ({
          title: (span.article ?? source.actTitle).slice(0, 240),
          explanation: claim.text,
          sourceIds: [source.id],
        })),
      ],
    };
  const canonicalSources = [...validSourceIds].flatMap((sourceId) => {
    const source = sourceById.get(sourceId);
    const span = firstSpanBySource.get(sourceId);
    return source && span ? [canonicalLegacySource(source, span)] : [];
  });
  const secondaryCanonicalSources = canonicalSources.filter((source) => source.sourceClass === "SECONDARY_REFERENCE");
  const authoritativeCanonicalSources = canonicalSources.filter((source) => source.sourceClass !== "SECONDARY_REFERENCE");
  const retainedTiers = new Set(authoritativeCanonicalSources.map((source) => {
    if (source.sourceClass === "USER_TRUSTED_PRIVATE") return "private";
    return "official";
  }));
  const evidenceMode = retainedTiers.size === 0 ? "none" as const
    : retainedTiers.size > 1 ? "mixed" as const
      : retainedTiers.has("official") ? "official" as const
        : "private_only" as const;
  const groundedResult: LegalChatResponse = {
    ...grounded,
    responseKind: "answer",
    summary: groundedVisibleAnswer(publishable.slice(0, 1), input.locale, true),
    answer: groundedVisibleAnswer(publishable, input.locale, false, input.answerMode === "detailed" ? 8 : 3),
    referenceNotes: [],
    clarificationQuestions: sanitizeClarificationQuestions(grounded.clarificationQuestions, input.locale),
    assumptions: [],
    requiredDocuments: [],
    successOutlook: null,
    suggestLawyer: grounded.suggestLawyer,
    sources: authoritativeCanonicalSources,
    evidenceMode,
  };
  const safeResult = validSourceIds.size === 0
    ? forceClarificationWithoutVerifiedSources(grounded, {
      locale: input.locale,
      answerMode: input.answerMode,
      reasoningMode: input.reasoningMode,
      legalDatabaseAsOf: input.legalDatabaseAsOf,
    })
    : attachSecondaryReferenceContext({
      result: groundedResult,
      secondarySources: secondaryCanonicalSources,
      referenceNotes,
      locale: input.locale,
      contextText: secondaryClaims.map((claim) => claim.text).join(" "),
    });
  const sources = [...validSourceIds].flatMap((sourceId) => {
    const source = sourceById.get(sourceId);
    const span = firstSpanBySource.get(sourceId);
    return source && span ? [sourceMetadata(source, span)] : [];
  });
  const parsedAnswer = legalGatewayAnswerSchema.safeParse({
    answer: safeResult.answer,
    claims: validated,
    sources,
    nextSteps: safeResult.actionPlan.map((step) => `${step.title}. ${step.description}`),
    uncertainty: [
      ...safeResult.assumptions.map((item) => `${item.statement}. ${item.impact}`),
      ...safeResult.risks.filter((risk) => risk.sourceIds.length === 0).map((risk) => `${risk.title}. ${risk.explanation}`),
    ],
    providerMetadata: {
      provider: input.run.provider,
      model: input.run.model,
      providerResponseId: input.run.providerResponseId,
      attempts: input.run.attempts,
      latencyMs: input.run.latencyMs,
      fallbackFromProvider: input.run.fallbackFromProvider,
      inputTokens: input.run.usage.inputTokens,
      outputTokens: input.run.usage.outputTokens,
      cachedInputTokens: input.run.usage.cachedInputTokens,
    },
  });
  if (!parsedAnswer.success) {
    const issue = parsedAnswer.error.issues[0];
    const path = issue?.path
      .map((part) => String(part).replace(/[^A-Za-z0-9_-]/gu, ""))
      .filter(Boolean)
      .join("_")
      .slice(0, 80) || "root";
    const code = issue?.code.replace(/[^A-Za-z0-9_-]/gu, "").slice(0, 40) || "unknown";
    throw new AiUnavailableError(
      "AI-ответ не прошёл внутренний контракт подтверждённых источников.",
      "INVALID_AI_OUTPUT",
      false,
      null,
      `gateway_contract_${path}_${code}`,
    );
  }
  const answer = parsedAnswer.data;
  return {
    run: { ...input.run, data: safeResult },
    answer,
    removedClaimCount: candidates.length - providerValidated.length,
  };
}

class DefaultLegalAiGateway implements LegalAiGateway {
  constructor(private readonly provider: LegalAiProvider) {}

  classifyIntent(question: string): LegalIntentDecision {
    return classifyLegalIntent(question);
  }

  rewriteFollowUp(input: Parameters<LegalAiGateway["rewriteFollowUp"]>[0]) {
    return rewriteLegalFollowUp(input);
  }

  planOfficialResearch(input: Parameters<LegalAiGateway["planOfficialResearch"]>[0]) {
    return planLegalResearch(input);
  }

  async generateGroundedAnswer(input: LegalChatRequest, options: LegalAiGatewayRunOptions = {}) {
    const validationQuestion = [input.question, input.retrievalQuery]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" ");
    let preliminaryEmitted = false;
    const emitPreliminary = async (preliminary: GroundedLegalPreliminary | null) => {
      if (!preliminary || preliminaryEmitted || !options.onGroundedPreliminary) return;
      preliminaryEmitted = true;
      try {
        await options.onGroundedPreliminary(preliminary);
      } catch {
        // A disconnected client or telemetry observer must not discard the
        // authoritative final provider response.
      }
    };
    const startedAt = Date.now();
    let run: LegalAiRunResult;
    try {
      run = await this.provider.runLegalChat(input, {
        ...options,
        onPartialLegalFinding: options.onGroundedPreliminary
          ? async (finding) => {
            await emitPreliminary(validateGroundedPreliminaryFinding({
              finding,
              sources: input.sources,
              question: validationQuestion,
              locale: input.locale,
            }));
          }
          : undefined,
      });
    } catch (error) {
      const reason = error instanceof AiUnavailableError
        && SOURCE_FALLBACK_CODES.has(error.code as "PROVIDER_TIMEOUT" | "PROVIDER_UNAVAILABLE" | "INVALID_AI_OUTPUT")
        ? error.code as "PROVIDER_TIMEOUT" | "PROVIDER_UNAVAILABLE" | "INVALID_AI_OUTPUT"
        : null;
      const fallback = reason && !options.signal?.aborted
        ? buildVerifiedSourceOnlyFallback({
          sources: input.sources,
          question: input.question,
          retrievalQuery: input.retrievalQuery,
          locale: input.locale,
          answerMode: input.answerMode,
          reasoningMode: input.reasoningMode,
          legalDatabaseAsOf: input.legalDatabaseAsOf,
          provider: this.provider.name === "anthropic" ? "anthropic" : "openai",
          model: input.runtimeSettings
            ? (input.reasoningMode === "deep"
              ? input.runtimeSettings.openaiDeepModel
              : input.runtimeSettings.openaiChatModel)
            : "juro-source-reader",
          attempts: 1,
          latencyMs: Date.now() - startedAt,
          reason,
        })
        : null;
      if (fallback) return fallback;
      throw error;
    }
    const validated = this.validateAnswerContract({
      result: run.data,
      run,
      sources: input.sources,
      question: input.question,
      retrievalQuery: input.retrievalQuery,
      locale: input.locale,
      answerMode: input.answerMode,
      reasoningMode: input.reasoningMode,
      legalDatabaseAsOf: input.legalDatabaseAsOf,
      availableDocumentTemplateCodes: input.availableDocumentTemplates?.map((template) => template.templateCode),
    });
    await emitPreliminary(preliminaryFromValidatedResult(validated, input.locale));
    return validated;
  }

  validateAnswerContract(input: Parameters<LegalAiGateway["validateAnswerContract"]>[0]) {
    return validateLegalGatewayAnswer(input);
  }

  providerHealth(): AiProviderStatus {
    return aiProviderStatus();
  }
}

export function createLegalAiGateway(provider: LegalAiProvider): LegalAiGateway {
  return new DefaultLegalAiGateway(provider);
}
