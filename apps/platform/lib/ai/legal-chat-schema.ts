import { z } from "zod";
import type { LegalDatabaseFreshness } from "../legal/verified-retrieval";
import {
  nonRepeatingLegalDetail,
  sanitizeClarificationQuestions,
} from "./legal-output-safety";
export { deriveLegalEvidenceMode } from "./legal-evidence-mode";

const sourceIdList = z.array(z.string().min(1).max(160)).max(12);

export const legalFindingSchema = z.object({
  title: z.string().min(1).max(240),
  explanation: z.string().min(1).max(4_000),
  sourceIds: sourceIdList,
}).strict();

/**
 * Non-authoritative context attached by JURO, never by the model. A secondary
 * public-web material can explain background but cannot establish legislation,
 * so it is presented here instead of under `confirmedFindings`.
 */
export const legalReferenceNoteSchema = z.object({
  title: z.string().min(1).max(240),
  note: z.string().min(1).max(3_000),
  sourceIds: sourceIdList,
}).strict();

export const legalAssumptionSchema = z.object({
  statement: z.string().min(1).max(1_000),
  impact: z.string().min(1).max(2_000),
}).strict();

export const legalRiskSchema = z.object({
  level: z.enum(["low", "medium", "high", "critical"]),
  title: z.string().min(1).max(240),
  explanation: z.string().min(1).max(3_000),
  sourceIds: sourceIdList,
}).strict();

const legalSourceRefModelSchema = z.object({
  sourceId: z.string().min(1).max(160),
  actTitle: z.string().min(1).max(500),
  actIdentifier: z.string().max(240).nullable(),
  article: z.string().max(240).nullable(),
  excerpt: z.string().max(1_200).nullable(),
  originalUrl: z.string().url().max(2_000),
  status: z.enum(["current", "historical", "repealed", "pending_effect", "unconfirmed"]),
  effectiveDate: z.string().max(64).nullable(),
  verifiedAt: z.string().max(64),
}).strict();

/**
 * These fields are attached from the validated corpus packet by JURO. They are
 * deliberately absent from the provider schema so the model cannot invent
 * document metadata, provenance, language, or live/indexed state.
 */
export const legalSourceRefSchema = legalSourceRefModelSchema.extend({
  documentType: z.string().max(160).nullable().optional(),
  documentNumber: z.string().max(240).nullable().optional(),
  adoptingAuthority: z.string().max(500).nullable().optional(),
  sourceClass: z.enum([
    "OFFICIAL_LEGISLATION",
    "OFFICIAL_GOVERNMENT_GUIDANCE",
    "OWNER_TRUSTED_GLOBAL",
    "TENANT_TRUSTED_PRIVATE",
    "USER_TRUSTED_PRIVATE",
    "DERIVED_TRANSLATION",
    "SECONDARY_REFERENCE",
  ]).optional(),
  language: z.enum(["uz-Latn", "uz-Cyrl", "ru", "en"]).optional(),
  sourceOrigin: z.enum(["indexed", "live", "web"]).optional(),
}).strict();

export const requiredDocumentSchema = z.object({
  name: z.string().min(1).max(240),
  reason: z.string().min(1).max(1_000),
  required: z.boolean(),
}).strict();

export const actionStepSchema = z.object({
  title: z.string().min(1).max(240),
  description: z.string().min(1).max(2_000),
  sourceIds: sourceIdList,
}).strict();

export const legalDeadlineSchema = z.object({
  title: z.string().min(1).max(240),
  dueDate: z.string().max(64).nullable(),
  sourceDate: z.string().max(64).nullable(),
  calculationMethod: z.string().min(1).max(1_500),
  confidence: z.enum(["preliminary", "confirmed"]),
  sourceIds: sourceIdList,
}).strict();

export const suggestedDocumentSchema = z.object({
  templateCode: z.string().max(160).nullable(),
  title: z.string().min(1).max(240),
  reason: z.string().min(1).max(1_000),
}).strict();

export const legalChatResponseSchema = z.object({
  // Structured Outputs follows schema property order. Put the first
  // independently verifiable legal unit first so the server can validate and
  // stream a useful answer before the rest of the response finishes.
  confirmedFindings: z.array(legalFindingSchema).max(16),
  responseKind: z.enum(["answer", "clarification_required"]),
  summary: z.string().min(1).max(1_500),
  answer: z.string().min(1).max(20_000),
  language: z.enum(["ru", "uz"]),
  jurisdiction: z.literal("UZ"),
  answerMode: z.enum(["short", "detailed"]),
  reasoningMode: z.enum(["fast", "deep"]),
  clarificationQuestions: z.array(z.string().min(1).max(500)).max(8),
  assumptions: z.array(legalAssumptionSchema).max(16),
  risks: z.array(legalRiskSchema).max(16),
  sources: z.array(legalSourceRefSchema).max(12),
  requiredDocuments: z.array(requiredDocumentSchema).max(16),
  actionPlan: z.array(actionStepSchema).max(16),
  deadlines: z.array(legalDeadlineSchema).max(12),
  successOutlook: z.object({
    level: z.enum(["low", "medium", "high"]),
    positiveFactors: z.array(z.string().min(1).max(500)).max(10),
    negativeFactors: z.array(z.string().min(1).max(500)).max(10),
  }).strict().nullable(),
  urgency: z.enum(["normal", "high", "critical"]),
  suggestedDocument: suggestedDocumentSchema.nullable(),
  suggestLawyer: z.boolean(),
  legalDatabaseAsOf: z.string().max(64),
  sourceAccessMode: z.enum(["direct", "approved_package", "mixed"]).optional(),
  evidenceMode: z.enum(["official", "mixed", "secondary_only", "private_only", "none"]).optional(),
  sourcesRetrievedAt: z.string().max(64).nullable().optional(),
  sourceValidationStatus: z.enum(["validated", "unavailable"]).optional(),
  coverageStatus: z.enum(["good_coverage", "partial_coverage", "weak_coverage", "no_coverage"]).optional(),
  referenceNotes: z.array(legalReferenceNoteSchema).max(8).optional(),
}).strict();

export type LegalChatResponse = z.infer<typeof legalChatResponseSchema>;

/**
 * Source-access fields are attached by the server after direct retrieval has
 * been validated. They are intentionally absent from the provider contract:
 * OpenAI Structured Outputs requires every property in an object schema to be
 * listed as required, whereas these fields must remain server-owned.
 * `referenceNotes` is server-owned for a second reason: the model must not be
 * able to choose which material is demoted to non-authoritative context.
 */
export const legalChatModelResponseSchema = legalChatResponseSchema
  .omit({
    sourceAccessMode: true,
    evidenceMode: true,
    sourcesRetrievedAt: true,
    sourceValidationStatus: true,
    coverageStatus: true,
    referenceNotes: true,
  })
  .extend({ sources: z.array(legalSourceRefModelSchema).max(12) });

export const legalChatJsonSchema = z.toJSONSchema(legalChatModelResponseSchema, {
  target: "draft-7",
  unrepresentable: "throw",
}) as Record<string, unknown>;

export function parseLegalChatResponse(value: unknown): LegalChatResponse {
  return legalChatResponseSchema.parse(value);
}

export function forceClarificationWithoutVerifiedSources(
  result: LegalChatResponse,
  options: {
    locale: "ru" | "uz";
    answerMode: "short" | "detailed";
    reasoningMode: "fast" | "deep";
    legalDatabaseAsOf: string;
  },
): LegalChatResponse {
  // No verified source survived any tier of the authority ladder: the JURO
  // index, live Lex.uz and public-web reference material were all empty for
  // this request. No provider-authored prose may remain in the terminal
  // payload, because an answer written from the model's general knowledge is
  // indistinguishable, to the reader, from one grounded in Uzbek law. Only
  // fixed refusal text and sanitized follow-up questions survive — a
  // "question" can otherwise smuggle an unsupported deadline, document list
  // or legal premise. This step does not charge the answer limit.
  const clarificationQuestions = sanitizeClarificationQuestions(
    result.clarificationQuestions,
    options.locale,
  );
  if (clarificationQuestions.length === 0) {
    clarificationQuestions.push(options.locale === "ru"
      ? "Какие ключевые даты, документы и действия сторон уже известны?"
      : "Qaysi asosiy sanalar, hujjatlar va tomonlarning harakatlari ma’lum?");
  }
  return {
    ...result,
    responseKind: "clarification_required",
    summary: options.locale === "ru"
      ? "Для надёжного ответа нужны дополнительные факты и проверенный правовой источник."
      : "Ishonchli javob uchun qo‘shimcha faktlar va tekshirilgan huquqiy manba kerak.",
    answer: options.locale === "ru"
      ? "JURO пока не сформировал правовой вывод: релевантный фрагмент не удалось получить напрямую из доступных официальных источников. Ответьте на уточняющие вопросы или попробуйте позже — этот шаг не списывает лимит ответа."
      : "JURO hozircha huquqiy xulosa tuzmadi: tegishli parcha mavjud rasmiy manbalardan bevosita olinmadi. Aniqlashtiruvchi savollarga javob bering yoki keyinroq urinib ko‘ring — bu bosqich javob limitidan yechilmaydi.",
    language: options.locale,
    jurisdiction: "UZ",
    answerMode: options.answerMode,
    reasoningMode: options.reasoningMode,
    clarificationQuestions,
    confirmedFindings: [],
    referenceNotes: [],
    assumptions: [],
    risks: [],
    sources: [],
    requiredDocuments: [],
    actionPlan: [],
    deadlines: [],
    successOutlook: null,
    suggestedDocument: null,
    suggestLawyer: result.suggestLawyer || result.urgency !== "normal",
    legalDatabaseAsOf: options.legalDatabaseAsOf,
    evidenceMode: "none",
  };
}

export function enforceLegalDatabaseFreshness(
  result: LegalChatResponse,
  freshness: LegalDatabaseFreshness,
  options: {
    locale: "ru" | "uz";
    answerMode: "short" | "detailed";
    reasoningMode: "fast" | "deep";
  },
): LegalChatResponse {
  if (freshness.status === "unavailable") {
    const nonLegislativeFactsOnly = result.sources.length > 0
      && result.sources.every((source) =>
        source.sourceClass === "USER_TRUSTED_PRIVATE"
        || source.sourceClass === "SECONDARY_REFERENCE"
      );
    if (nonLegislativeFactsOnly) {
      const warning = options.locale === "ru"
        ? "Факты ниже опираются только на ваши документы и/или справочные интернет-материалы. Достаточная норма Lex.uz не найдена; каждый такой материал не является официальным источником законодательства."
        : "Quyidagi faktlar faqat hujjatlaringiz va/yoki internetdagi ma’lumotnoma materiallariga tayangan. Yetarli Lex.uz normasi topilmadi; bu materiallar qonunchilik tasdig‘i emas.";
      return {
        ...result,
        assumptions: [{
          statement: options.locale === "ru"
            ? "Правовое основание требует отдельной проверки"
            : "Huquqiy asos alohida tekshirilishi kerak",
          impact: warning,
        }, ...result.assumptions].slice(0, 16),
        deadlines: [],
        successOutlook: null,
        suggestLawyer: true,
        legalDatabaseAsOf: freshness.asOf,
      };
    }
    return forceClarificationWithoutVerifiedSources(result, {
      ...options,
      legalDatabaseAsOf: freshness.asOf,
    });
  }
  if (freshness.status === "fresh") {
    return { ...result, legalDatabaseAsOf: freshness.asOf };
  }

  const warning = options.locale === "ru"
    ? `Правовая база JURO не обновлялась более ${freshness.maxAgeDays} дней (последняя полная синхронизация: ${freshness.asOf}). Выводы ниже предварительные и требуют проверки по актуальной редакции или юристом.`
    : `JURO huquqiy bazasi ${freshness.maxAgeDays} kundan ortiq yangilanmagan (oxirgi to‘liq sinxronlash: ${freshness.asOf}). Quyidagi xulosalar dastlabki bo‘lib, amaldagi tahrir yoki yurist tomonidan tekshirilishi kerak.`;
  const staleAssumption = {
    statement: options.locale === "ru"
      ? "Актуальность правовой базы требует подтверждения"
      : "Huquqiy bazaning dolzarbligi tasdiqlanishi kerak",
    impact: warning.slice(0, 2_000),
  };
  const formerFindings = result.confirmedFindings.map((finding) => {
    const uniqueDetail = nonRepeatingLegalDetail(finding.title, finding.explanation);
    const prefix = options.locale === "ru"
      ? "Ранее подтверждённый вывод переведён в предварительный до обновления базы"
      : "Oldin tasdiqlangan xulosa baza yangilanguncha dastlabki deb ko‘rsatiladi";
    return {
      statement: finding.title.slice(0, 1_000),
      impact: (uniqueDetail ? `${prefix}: ${uniqueDetail}` : `${prefix}.`).slice(0, 2_000),
    };
  });
  const assumptions = [
    staleAssumption,
    ...result.assumptions,
    ...formerFindings,
  ].filter((assumption, index, all) => {
    const key = `${assumption.statement.trim()}\n${assumption.impact.trim()}`;
    return all.findIndex((candidate) =>
      `${candidate.statement.trim()}\n${candidate.impact.trim()}` === key
    ) === index;
  }).slice(0, 16);
  const answer = result.answer.includes(warning)
    ? result.answer
    : `${warning}\n\n${result.answer}`.slice(0, 20_000);
  return {
    ...result,
    answer,
    confirmedFindings: [],
    assumptions,
    deadlines: result.deadlines.map((deadline) => ({
      ...deadline,
      confidence: "preliminary" as const,
    })),
    successOutlook: null,
    suggestLawyer: true,
    legalDatabaseAsOf: freshness.asOf,
  };
}

export function referencedSourceIds(result: LegalChatResponse): Set<string> {
  return new Set([
    ...result.sources.map((source) => source.sourceId),
    ...result.confirmedFindings.flatMap((finding) => finding.sourceIds),
    ...(result.referenceNotes ?? []).flatMap((note) => note.sourceIds),
    ...result.risks.flatMap((risk) => risk.sourceIds),
    ...result.actionPlan.flatMap((step) => step.sourceIds),
    ...result.deadlines.flatMap((deadline) => deadline.sourceIds),
  ]);
}

export function enforceLegalChatSourceBoundary(
  result: LegalChatResponse,
  allowedSourceIds: ReadonlySet<string>,
): LegalChatResponse {
  const declaredSourceIds = new Set<string>();
  for (const source of result.sources) {
    if (declaredSourceIds.has(source.sourceId)) {
      throw new Error(`AI_SOURCE_DUPLICATED:${source.sourceId}`);
    }
    declaredSourceIds.add(source.sourceId);
  }
  for (const sourceId of referencedSourceIds(result)) {
    if (!allowedSourceIds.has(sourceId)) {
      throw new Error(`AI_SOURCE_NOT_ALLOWED:${sourceId}`);
    }
  }
  const citedSourceIds = new Set([
    ...result.confirmedFindings.flatMap((finding) => finding.sourceIds),
    ...(result.referenceNotes ?? []).flatMap((note) => note.sourceIds),
    ...result.risks.flatMap((risk) => risk.sourceIds),
    ...result.actionPlan.flatMap((step) => step.sourceIds),
    ...result.deadlines.flatMap((deadline) => deadline.sourceIds),
  ]);
  for (const sourceId of citedSourceIds) {
    if (!declaredSourceIds.has(sourceId)) {
      throw new Error(`AI_CITATION_REFERENCE_MISSING:${sourceId}`);
    }
  }
  if (result.confirmedFindings.some((finding) => finding.sourceIds.length === 0)) {
    throw new Error("AI_CONFIRMED_FINDING_REQUIRES_CITATION");
  }
  if ((result.referenceNotes ?? []).some((note) => note.sourceIds.length === 0)) {
    throw new Error("AI_REFERENCE_NOTE_REQUIRES_CITATION");
  }
  if (result.deadlines.some((deadline) =>
    deadline.confidence === "confirmed" && deadline.sourceIds.length === 0
  )) {
    throw new Error("AI_CONFIRMED_DEADLINE_REQUIRES_CITATION");
  }
  return result;
}
