import { z } from "zod";

/**
 * Claim/source filtering and coverage checks adapt the grounding concepts in
 * toxirerkinov70-commits/huquq-ai@1bce500c69b8213373d8ce0b40d56be7d83f6aec.
 * MIT License, Copyright (c) 2026 Toxir Erkinov. This implementation adds
 * exact request-scoped Lex span IDs/hashes and JURO's provider-neutral schema.
 */

import { containsLegalSourceUiNoise } from "../legal/source-parser";
import { parsePrivateDocumentLocator } from "../document-analysis/private-document-locator";
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
import type { AiReasoningMode } from "./reasoning-mode";
import type { ConversationContextSummary } from "./conversation-context";

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
    conversationSummary?: ConversationContextSummary | null;
  }): { query: string; rewritten: boolean };
  planOfficialResearch(input: {
    question: string;
    locale: "ru" | "uz";
    conversationHistory?: readonly { user: string; assistant: string }[];
    conversationSummary?: ConversationContextSummary | null;
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
    locale: "ru" | "uz";
    answerMode: "short" | "detailed";
    reasoningMode: AiReasoningMode;
    legalDatabaseAsOf: string;
    availableDocumentTemplateCodes?: readonly string[];
  }): ValidatedLegalGatewayResult;
  providerHealth(): AiProviderStatus;
}

type CandidateClaim = Omit<LegalGatewayClaim, "sourceId" | "sourceSpanId" | "confidence"> & {
  sourceIds: readonly string[];
};

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

function claimTypeForSource(claim: CandidateClaim, source: LegalSourceContext): LegalGatewayClaim["type"] {
  return trustedPrivateSource(source) ? "fact" : claim.type;
}

function legalTerms(value: string): string[] {
  // Uzbek apostrophes are written with several Unicode characters. Treat
  // them as part of the word before tokenization; otherwise a term such as
  // `bo‘lishi` becomes the misleading standalone token `lishi` and can make
  // a correctly grounded Article 14 answer fail the relevance gate.
  const normalized = value.toLocaleLowerCase().replace(/[‘’ʼʻ']/gu, "");
  return [...new Set(normalized.match(/[\p{L}\p{N}]{4,}/gu) ?? [])]
    .filter((term) => !/^(?:котор|этого|также|uchun|bilan|bo.yicha|kerak)$/iu.test(term))
    .slice(0, 40);
}

const QUESTION_RELEVANCE_STOPWORDS = new Set([
  "answer", "candidate", "give", "juro", "legal", "lex", "official", "please", "qa", "staging", "source",
  "дайте", "должен", "должны", "есть", "какие", "какой", "когда", "можно", "нужно", "ответьте", "официальный", "источник", "укажите", "узбекистан", "узбекистане",
  "bolishi", "jamiyat", "javob", "kerak", "mchj", "nima", "nimalar", "qanday", "qaysi", "qisqa", "rasmiy", "manba", "ozbekiston",
  // LLC/domain words identify the act, not the requested proposition. They
  // must not make every provision in that act relevant to every LLC question.
  "общество", "общества", "ооо",
]);

function relevanceRoot(value: string): string {
  const normalized = value.toLocaleLowerCase().replace(/[‘’ʼʻ']/gu, "");
  const withoutRegistrationPrefix = normalized.replace(/^зарегистр/iu, "регистр");
  return withoutRegistrationPrefix.length >= 7 ? withoutRegistrationPrefix.slice(0, 6) : withoutRegistrationPrefix;
}

function questionRelevanceRoots(value: string): string[] {
  return [...new Set(legalTerms(value)
    .filter((term) => !QUESTION_RELEVANCE_STOPWORDS.has(term))
    .map(relevanceRoot)
    .filter((term) => term.length >= 4))];
}

function claimAnswersQuestion(question: string, claimText: string, span: LegalSourceSpan): boolean {
  const llcFormationQuestion = /(?:^|[^\p{L}\p{N}])(?:ооо|llc|мчж|mchj(?:ni|ga|ning)?)(?:$|[^\p{L}\p{N}])/iu.test(question)
    && /(?:как\s+(?:открыть|создать|зарегистрировать)|qanday\s+(?:och\p{L}*|tashkil\s+etish|ro.yxatdan\s+o.tkazish))/iu.test(question);
  if (llcFormationQuestion) {
    const articleNumber = (span.article ?? span.text).match(/(?:(?:статья|модда|modda|article)\s+(\d+)|(?:^|\s)(\d+)\s*(?:-\s*)?modda\b)/iu);
    return new Set(["3", "5", "11", "12", "13", "14"]).has(articleNumber?.[1] ?? articleNumber?.[2] ?? "");
  }
  const requested = questionRelevanceRoots(question);
  if (requested.length === 0) return true;
  const grounded = new Set(legalTerms(`${span.article ?? ""} ${claimText}`).map(relevanceRoot));
  const matches = requested.filter((term) => grounded.has(term)).length;
  return matches >= Math.min(2, requested.length);
}

function numericTokens(value: string): string[] {
  return [...new Set(value.match(/\b\d+(?:[.,-]\d+)*\b/gu) ?? [])];
}

function spanCoverage(text: string, span: LegalSourceSpan): number {
  const terms = legalTerms(text);
  if (terms.length === 0) return 0;
  const lower = span.text.toLocaleLowerCase();
  return terms.filter((term) => lower.includes(term)).length / terms.length;
}

function validateSpanForClaim(
  claim: CandidateClaim,
  source: LegalSourceContext,
  span: LegalSourceSpan,
): boolean {
  const verifiedLex = source.sourceType === "lex"
    && ["direct_validated", "verified"].includes(source.verificationState)
    && source.sourceQuality?.passed === true
    && officialLexUrl(source.officialUrl);
  if (!verifiedLex && !trustedPrivateSource(source)) return false;
  if (span.quality !== "high" || containsLegalSourceUiNoise(span.text)) return false;
  if (!/^[a-f0-9]{64}$/u.test(span.textSha256)) return false;
  const spanText = span.text.toLocaleLowerCase();
  if (numericTokens(claim.text).some((token) => !spanText.includes(token.toLocaleLowerCase()))) return false;
  return spanCoverage(claim.text, span) >= 0.12;
}

function bestValidatedSpan(
  claim: CandidateClaim,
  sources: ReadonlyMap<string, LegalSourceContext>,
): { source: LegalSourceContext; span: LegalSourceSpan; coverage: number } | null {
  let best: { source: LegalSourceContext; span: LegalSourceSpan; coverage: number } | null = null;
  for (const sourceId of claim.sourceIds) {
    const source = sources.get(sourceId);
    if (!source) continue;
    for (const span of source.spans ?? []) {
      if (!validateSpanForClaim(claim, source, span)) continue;
      const coverage = spanCoverage(claim.text, span);
      if (!best || coverage > best.coverage) best = { source, span, coverage };
    }
  }
  return best;
}

function candidateClaims(result: LegalChatResponse): CandidateClaim[] {
  return [
    ...result.confirmedFindings.map((finding) => ({
      text: `${finding.title}. ${finding.explanation}`,
      type: "legal_basis" as const,
      sourceIds: finding.sourceIds,
    })),
    ...result.actionPlan.filter((step) => step.sourceIds.length > 0).map((step) => ({
      text: `${step.title}. ${step.description}`,
      type: "action" as const,
      sourceIds: step.sourceIds,
    })),
    ...result.risks.filter((risk) => risk.sourceIds.length > 0).map((risk) => ({
      text: `${risk.title}. ${risk.explanation}`,
      type: "risk" as const,
      sourceIds: risk.sourceIds,
    })),
    ...result.deadlines.filter((deadline) => deadline.confidence === "confirmed").map((deadline) => ({
      text: `${deadline.title}. ${deadline.dueDate ?? ""} ${deadline.calculationMethod}`.trim(),
      type: "deadline" as const,
      sourceIds: deadline.sourceIds,
    })),
  ];
}

function sourceMetadata(source: LegalSourceContext, span: LegalSourceSpan) {
  return {
    sourceId: source.id,
    title: source.actTitle,
    article: span.article ?? source.article ?? null,
    paragraph: span.paragraph,
    canonicalUrl: source.officialUrl,
    accessedAt: source.verifiedAt,
    contentSha256: source.contentSha256,
  };
}

function filteredLegacyResult(
  result: LegalChatResponse,
  validClaims: readonly LegalGatewayClaim[],
  validSourceIds: ReadonlySet<string>,
  availableDocumentTemplateCodes: ReadonlySet<string>,
): LegalChatResponse {
  const supportedText = new Set(validClaims.map((claim) => claim.text));
  const supported = (title: string, explanation: string) => supportedText.has(`${title}. ${explanation}`);
  return {
    ...result,
    confirmedFindings: result.confirmedFindings.filter((finding) =>
      supported(finding.title, finding.explanation)
        && finding.sourceIds.every((sourceId) => validSourceIds.has(sourceId)),
    ),
    risks: result.risks.filter((risk) =>
      risk.sourceIds.length > 0 && (supported(risk.title, risk.explanation)
        && risk.sourceIds.every((sourceId) => validSourceIds.has(sourceId))),
    ),
    actionPlan: result.actionPlan.filter((step) =>
      step.sourceIds.length > 0 && (supported(step.title, step.description)
        && step.sourceIds.every((sourceId) => validSourceIds.has(sourceId))),
    ),
    deadlines: result.deadlines.filter((deadline) =>
      validClaims.some((claim) => claim.type === "deadline" && claim.text.startsWith(`${deadline.title}.`)),
    ),
    sources: [],
    suggestedDocument: result.suggestedDocument
      && result.suggestedDocument.templateCode
      && availableDocumentTemplateCodes.has(result.suggestedDocument.templateCode)
      ? result.suggestedDocument
      : null,
  };
}

function groundedVisibleAnswer(
  claims: readonly LegalGatewayClaim[],
  locale: "ru" | "uz",
  labelled = false,
): string {
  const statements = claims.slice(0, 3).map((claim) => claim.text.trim()).filter(Boolean);
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
    text: `${parsed.data.title}. ${parsed.data.explanation}`,
    type: "legal_basis",
    sourceIds: parsed.data.sourceIds,
  };
  const match = bestValidatedSpan(
    candidate,
    new Map(input.sources.map((source) => [source.id, source])),
  );
  if (!match) return null;
  // Streaming preliminaries are intentionally limited to authoritative law.
  // Private files may ground terminal factual claims only after the complete
  // answer has passed the same tenant-scoped final validation path.
  if (trustedPrivateSource(match.source)) return null;
  if (input.question && !claimAnswersQuestion(input.question, candidate.text, match.span)) return null;
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
  const claim = result.answer.claims.find((candidate) => candidate.sourceId && candidate.sourceSpanId);
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
    actTitle: source.actTitle,
    actIdentifier: source.actIdentifier,
    article: span.article ?? source.article ?? null,
    excerpt: null,
    originalUrl: source.officialUrl,
    status: source.applicabilityStatus ?? "current",
    effectiveDate: source.effectiveDate ?? null,
    verifiedAt: source.verifiedAt,
    documentType: source.documentType ?? null,
    documentNumber: source.documentNumber ?? source.actIdentifier ?? null,
    adoptingAuthority: source.adoptingAuthority ?? null,
    sourceClass: source.sourceClass ?? "OFFICIAL_LEGISLATION",
    language,
    sourceOrigin: source.verificationState === "direct_validated" ? "live" : "indexed",
  };
}

function sourceGroundedFallback(
  sources: readonly LegalSourceContext[],
  question?: string,
): { claim: LegalGatewayClaim; source: LegalSourceContext; span: LegalSourceSpan } | null {
  for (const source of sources) {
    for (const span of source.spans ?? []) {
      const normalized = span.text
        .replace(/\s+/gu, " ")
        .trim();
      const sentence = (normalized
        .split(/(?<=[.!?])\s+/u)
        .map((part) => part.trim())
        .find((part) => part.length >= 40) ?? normalized)
        .slice(0, 1_200);
      if (sentence.length < 40) continue;
      const candidate: CandidateClaim = {
        text: sentence,
        type: trustedPrivateSource(source) ? "fact" : "legal_basis",
        sourceIds: [source.id],
      };
      if (!validateSpanForClaim(candidate, source, span)) continue;
      if (question && !claimAnswersQuestion(question, candidate.text, span)) continue;
      return {
        claim: {
          text: sentence,
          type: claimTypeForSource(candidate, source),
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

export function validateLegalGatewayAnswer(input: {
  result: LegalChatResponse;
  run: LegalAiRunResult;
  sources: readonly LegalSourceContext[];
  question?: string;
  locale: "ru" | "uz";
  answerMode: "short" | "detailed";
  reasoningMode: AiReasoningMode;
  legalDatabaseAsOf: string;
  availableDocumentTemplateCodes?: readonly string[];
}): ValidatedLegalGatewayResult {
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const candidates = candidateClaims(input.result);
  const providerValidated = candidates.flatMap((claim): LegalGatewayClaim[] => {
    const match = bestValidatedSpan(claim, sourceById);
    if (!match) return [];
    if (input.question && !claimAnswersQuestion(input.question, claim.text, match.span)) return [];
    return [{
      text: claim.text,
      type: claimTypeForSource(claim, match.source),
      sourceId: match.source.id,
      sourceSpanId: match.span.id,
      confidence: Math.min(1, Math.max(0.5, match.coverage)),
    }];
  });
  const fallback = providerValidated.length === 0 ? sourceGroundedFallback(input.sources, input.question) : null;
  const validated = fallback ? [fallback.claim] : providerValidated;
  const validSourceIds = new Set(validated.flatMap((claim) => claim.sourceId ? [claim.sourceId] : []));
  const firstSpanBySource = new Map<string, LegalSourceSpan>();
  for (const claim of validated) {
    const source = claim.sourceId ? sourceById.get(claim.sourceId) : null;
    const span = source?.spans?.find((candidate) => candidate.id === claim.sourceSpanId);
    if (source && span && !firstSpanBySource.has(source.id)) firstSpanBySource.set(source.id, span);
  }
  const filtered = filteredLegacyResult(
    input.result,
    validated,
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
    : filtered;
  const canonicalSources = [...validSourceIds].flatMap((sourceId) => {
    const source = sourceById.get(sourceId);
    const span = firstSpanBySource.get(sourceId);
    return source && span ? [canonicalLegacySource(source, span)] : [];
  });
  const safeResult = validSourceIds.size === 0
    ? forceClarificationWithoutVerifiedSources(grounded, {
      locale: input.locale,
      answerMode: input.answerMode,
      reasoningMode: input.reasoningMode,
      legalDatabaseAsOf: input.legalDatabaseAsOf,
    })
    : {
      ...grounded,
      responseKind: "answer" as const,
      summary: groundedVisibleAnswer(validated.slice(0, 1), input.locale, true),
      answer: groundedVisibleAnswer(validated, input.locale),
      clarificationQuestions: [],
      assumptions: [],
      requiredDocuments: [],
      successOutlook: null,
      sources: canonicalSources,
    };
  const sources = [...validSourceIds].flatMap((sourceId) => {
    const source = sourceById.get(sourceId);
    const span = firstSpanBySource.get(sourceId);
    return source && span ? [sourceMetadata(source, span)] : [];
  });
  const answer = legalGatewayAnswerSchema.parse({
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
    const run = await this.provider.runLegalChat(input, {
      ...options,
      onPartialLegalFinding: options.onGroundedPreliminary
        ? async (finding) => {
          await emitPreliminary(validateGroundedPreliminaryFinding({
            finding,
            sources: input.sources,
            question: input.question,
            locale: input.locale,
          }));
        }
        : undefined,
    });
    const validated = this.validateAnswerContract({
      result: run.data,
      run,
      sources: input.sources,
      question: input.question,
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
