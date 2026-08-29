import type { LegalChatResponse } from "./legal-chat-schema";

/**
 * Attaches validated public-web context without allowing it to occupy any
 * field that communicates legal authority. Both authenticated and guest chat
 * pass through this server-owned partition.
 */
export function attachSecondaryReferenceContext(input: {
  result: LegalChatResponse;
  secondarySources: LegalChatResponse["sources"];
  referenceNotes: NonNullable<LegalChatResponse["referenceNotes"]>;
  locale: "ru" | "uz";
  contextText?: string;
}): LegalChatResponse {
  const sourceById = new Map(input.secondarySources.map((source) => [source.sourceId, source]));
  const referenceNotes = input.referenceNotes.flatMap((note) => {
    const sourceIds = note.sourceIds.filter((sourceId) => sourceById.has(sourceId));
    return sourceIds.length > 0 ? [{ ...note, sourceIds }] : [];
  }).slice(0, 8);
  const referencedIds = new Set(referenceNotes.flatMap((note) => note.sourceIds));
  const secondarySources = input.secondarySources.filter((source) => referencedIds.has(source.sourceId));
  if (secondarySources.length === 0) return input.result;

  const authoritativeSources = input.result.sources.filter((source) => !referencedIds.has(source.sourceId));
  if (authoritativeSources.length > 0) {
    return {
      ...input.result,
      sources: [...authoritativeSources, ...secondarySources],
      referenceNotes: [...(input.result.referenceNotes ?? []), ...referenceNotes].slice(0, 8),
      evidenceMode: "mixed",
      suggestLawyer: true,
    };
  }

  const context = (input.contextText ?? referenceNotes.map((note) => note.note).join(" ")).slice(0, 12_000);
  return {
    ...input.result,
    responseKind: "answer",
    summary: input.locale === "ru"
      ? "Справочный ответ: официальная норма Lex.uz не подтверждена."
      : "Ma’lumotnoma javobi: Lex.uz rasmiy normasi tasdiqlanmadi.",
    answer: (input.locale === "ru"
      ? `Официальная норма Lex.uz не подтверждена. Материал ниже даёт только справочный контекст и не устанавливает законодательство, сроки, расчёты или обязательные действия. ${context}`
      : `Lex.uz rasmiy normasi tasdiqlanmadi. Quyidagi material faqat ma’lumotnoma kontekstini beradi hamda qonunchilik, muddat, hisob-kitob yoki majburiy harakatni belgilamaydi. ${context}`).slice(0, 20_000),
    confirmedFindings: [],
    conditionalBranches: [],
    assumptions: [],
    risks: [],
    requiredDocuments: [],
    actionPlan: [],
    deadlines: [],
    successOutlook: null,
    suggestedDocument: null,
    suggestLawyer: true,
    sources: secondarySources,
    referenceNotes,
    evidenceMode: "secondary_only",
  };
}
