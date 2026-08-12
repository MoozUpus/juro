import {
  enforceLegalChatSourceBoundary,
  parseLegalChatResponse,
  type LegalChatResponse,
} from "./legal-chat-schema";

/**
 * Server-owned first useful content for a request that has no usable verified
 * legal source. It is deliberately a clarification, not a legal conclusion:
 * there are no findings, citations, risks, deadlines, or generated documents.
 *
 * The object is parsed through the same strict response schema and source
 * boundary as a provider result before it can be emitted to an SSE client or
 * counted in the first-useful SLO. This makes the fast path observable without
 * treating a provider delta or a generic loading message as legal content.
 */
export function createUnavailableVerifiedSourceClarification(input: {
  locale: "ru" | "uz";
  answerMode: "short" | "detailed";
  reasoningMode: "fast" | "deep";
  legalDatabaseAsOf: string;
}): LegalChatResponse {
  const ru = input.locale === "ru";
  const response = parseLegalChatResponse({
    responseKind: "clarification_required",
    summary: ru
      ? "Для правового вывода нужны детали ситуации и проверенный официальный источник."
      : "Huquqiy xulosa uchun vaziyat tafsilotlari va tekshirilgan rasmiy manba kerak.",
    answer: ru
      ? "JURO пока не делает правовой вывод: в доступной проверенной базе не найден подходящий фрагмент. Укажите действие или документ, дату события и вашу цель — этот предварительный этап не списывает лимит ответа."
      : "JURO hozircha huquqiy xulosa bermaydi: mavjud tekshirilgan bazada mos parcha topilmadi. Harakat yoki hujjatni, voqea sanasini va maqsadingizni yozing — bu dastlabki bosqich javob limitidan yechilmaydi.",
    language: input.locale,
    jurisdiction: "UZ",
    answerMode: input.answerMode,
    reasoningMode: input.reasoningMode,
    clarificationQuestions: [ru
      ? "Какое действие или документ вы хотите проверить, когда произошло событие и какой результат вам нужен?"
      : "Qaysi harakat yoki hujjatni tekshirmoqchisiz, voqea qachon bo‘lgan va qanday natija kerak?"],
    confirmedFindings: [],
    assumptions: [],
    risks: [],
    sources: [],
    requiredDocuments: [],
    actionPlan: [],
    deadlines: [],
    successOutlook: null,
    urgency: "normal",
    suggestedDocument: null,
    suggestLawyer: false,
    legalDatabaseAsOf: input.legalDatabaseAsOf,
    sourceAccessMode: "approved_package",
    sourcesRetrievedAt: null,
    sourceValidationStatus: "unavailable",
  });
  return enforceLegalChatSourceBoundary(response, new Set());
}
