import { z } from "zod";
import type { LegalDatabaseFreshness } from "../legal/verified-retrieval";

const sourceIdList = z.array(z.string().min(1).max(160)).max(12);

export const legalFindingSchema = z.object({
  title: z.string().min(1).max(240),
  explanation: z.string().min(1).max(4_000),
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

export const legalSourceRefSchema = z.object({
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
  responseKind: z.enum(["answer", "clarification_required"]),
  summary: z.string().min(1).max(1_500),
  answer: z.string().min(1).max(20_000),
  language: z.enum(["ru", "uz"]),
  jurisdiction: z.literal("UZ"),
  answerMode: z.enum(["short", "detailed"]),
  reasoningMode: z.enum(["fast", "deep"]),
  clarificationQuestions: z.array(z.string().min(1).max(500)).max(8),
  confirmedFindings: z.array(legalFindingSchema).max(16),
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
}).strict();

export type LegalChatResponse = z.infer<typeof legalChatResponseSchema>;

export const legalChatJsonSchema = z.toJSONSchema(legalChatResponseSchema, {
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
  const clarificationQuestions = result.clarificationQuestions.length > 0
    ? result.clarificationQuestions
    : [options.locale === "ru" ? "Какие факты и даты можно уточнить?" : "Qaysi faktlar va sanalarni aniqlashtirish mumkin?"];
  return {
    ...result,
    responseKind: "clarification_required",
    summary: options.locale === "ru"
      ? "Для надёжного ответа нужны дополнительные факты и проверенный правовой источник."
      : "Ishonchli javob uchun qo‘shimcha faktlar va tekshirilgan huquqiy manba kerak.",
    answer: options.locale === "ru"
      ? "JURO пока не сформировал правовой вывод: релевантный подтверждённый фрагмент законодательства не найден. Ответьте на уточняющие вопросы — этот шаг не списывает лимит ответа."
      : "JURO hozircha huquqiy xulosa tuzmadi: tegishli tasdiqlangan qonunchilik parchasi topilmadi. Aniqlashtiruvchi savollarga javob bering — bu bosqich javob limitidan yechilmaydi.",
    language: options.locale,
    jurisdiction: "UZ",
    answerMode: options.answerMode,
    reasoningMode: options.reasoningMode,
    clarificationQuestions,
    confirmedFindings: [],
    risks: [],
    sources: [],
    actionPlan: [],
    deadlines: [],
    successOutlook: null,
    suggestedDocument: null,
    suggestLawyer: result.suggestLawyer || result.urgency !== "normal",
    legalDatabaseAsOf: options.legalDatabaseAsOf,
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
  const formerFindings = result.confirmedFindings.map((finding) => ({
    statement: finding.title.slice(0, 1_000),
    impact: (options.locale === "ru"
      ? `Ранее подтверждённый вывод переведён в предварительный до обновления базы: ${finding.explanation}`
      : `Oldin tasdiqlangan xulosa baza yangilanguncha dastlabki deb ko‘rsatiladi: ${finding.explanation}`
    ).slice(0, 2_000),
  }));
  return {
    ...result,
    answer: `${warning}\n\n${result.answer}`.slice(0, 20_000),
    confirmedFindings: [],
    assumptions: [
      staleAssumption,
      ...result.assumptions,
      ...formerFindings,
    ].slice(0, 16),
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
  if (result.deadlines.some((deadline) =>
    deadline.confidence === "confirmed" && deadline.sourceIds.length === 0
  )) {
    throw new Error("AI_CONFIRMED_DEADLINE_REQUIRES_CITATION");
  }
  return result;
}
