import type { LegalChatResponse } from "./legal-chat-schema";
import { aiText, type AiOutputLocale } from "./localization";

/**
 * Attaches validated public-web context without allowing it to occupy any
 * field that communicates legal authority. Both authenticated and guest chat
 * pass through this server-owned partition.
 */
export function attachSecondaryReferenceContext(input: {
  result: LegalChatResponse;
  secondarySources: LegalChatResponse["sources"];
  referenceNotes: NonNullable<LegalChatResponse["referenceNotes"]>;
  locale: AiOutputLocale;
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

  return {
    ...input.result,
    responseKind: "clarification_required",
    summary: aiText(input.locale, "Справочный ответ: официальная норма Lex.uz не подтверждена.", "Ma’lumotnoma javobi: Lex.uz rasmiy normasi tasdiqlanmadi.", "Reference answer: an official legal provision from Lex.uz was not verified."),
    answer: aiText(input.locale, "Найдены справочные интернет-материалы, но их недостаточно для подтверждённого правового вывода. Ниже доступны источники и вопросы, которые помогут уточнить применимые нормы.", "Internetda ma’lumotnoma materiallari topildi, ammo tasdiqlangan huquqiy xulosa uchun ular yetarli emas. Quyida manbalar va amaldagi qoidalarni aniqlashtiruvchi savollar keltirilgan.", "Reference materials were found online, but they are insufficient for a verified legal conclusion. The sources and questions below can help identify the applicable rules."),
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
