import {
  enforceLegalChatSourceBoundary,
  parseLegalChatResponse,
  type LegalChatResponse,
} from "./legal-chat-schema";
import { aiText, type AiOutputLocale } from "./localization";

/**
 * Server-owned first useful content for a request that has no usable official
 * Lex.uz source. It is deliberately a clarification, not a legal conclusion:
 * there are no findings, citations, risks, deadlines, or generated documents.
 *
 * The object is parsed through the same strict response schema and source
 * boundary as a provider result before it can be emitted to an SSE client or
 * counted in the first-useful SLO. This makes the fast path observable without
 * treating a provider delta or a generic loading message as legal content.
 */
export function createUnavailableVerifiedSourceClarification(input: {
  locale: AiOutputLocale;
  answerMode: "short" | "detailed";
  reasoningMode: "fast" | "deep";
  legalDatabaseAsOf: string;
}): LegalChatResponse {
  const response = parseLegalChatResponse({
    responseKind: "clarification_required",
    summary: aiText(input.locale, "Для правового вывода нужны детали ситуации и доступный официальный источник Lex.uz.", "Huquqiy xulosa uchun vaziyat tafsilotlari va mavjud Lex.uz rasmiy manbasi kerak.", "A legal conclusion requires details of the situation and an available official source from Lex.uz."),
    answer: aiText(input.locale, "JURO пока не делает правовой вывод: Lex.uz не отдал подходящий официальный фрагмент для этого запроса. Укажите действие или документ, дату события и вашу цель либо повторите попытку позже — этот предварительный этап не списывает лимит ответа.", "JURO hozircha huquqiy xulosa bermaydi: Lex.uz ushbu so‘rov uchun mos rasmiy parchani bermadi. Harakat yoki hujjatni, voqea sanasini va maqsadingizni yozing yoki keyinroq qayta urinib ko‘ring — bu dastlabki bosqich javob limitidan yechilmaydi.", "JURO is not providing a legal conclusion yet because Lex.uz did not return a suitable official passage for this request. Specify the action or document, the event date and your objective, or try again later. This preliminary step does not use your answer allowance."),
    language: input.locale,
    jurisdiction: "UZ",
    answerMode: input.answerMode,
    reasoningMode: input.reasoningMode,
    clarificationQuestions: [aiText(input.locale, "Какое действие или документ вы хотите проверить, когда произошло событие и какой результат вам нужен?", "Qaysi harakat yoki hujjatni tekshirmoqchisiz, voqea qachon bo‘lgan va qanday natija kerak?", "Which action or document do you want to check, when did the event occur, and what outcome do you need?")],
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
