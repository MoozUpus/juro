import {
  enforceLegalChatSourceBoundary,
  parseLegalChatResponse,
  type LegalChatResponse,
} from "./legal-chat-schema";
import type { AiReasoningMode } from "./reasoning-mode";

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
  locale: "ru" | "uz";
  answerMode: "short" | "detailed";
  reasoningMode: AiReasoningMode;
  legalDatabaseAsOf: string;
}): LegalChatResponse {
  const ru = input.locale === "ru";
  const response = parseLegalChatResponse({
    responseKind: "clarification_required",
    summary: ru
      ? "Для правового вывода нужны детали ситуации и доступный официальный источник Lex.uz."
      : "Huquqiy xulosa uchun vaziyat tafsilotlari va mavjud Lex.uz rasmiy manbasi kerak.",
    answer: ru
      ? "JURO пока не делает правовой вывод: Lex.uz не отдал подходящий официальный фрагмент для этого запроса. Укажите действие или документ, дату события и вашу цель либо повторите попытку позже — этот предварительный этап не списывает лимит ответа."
      : "JURO hozircha huquqiy xulosa bermaydi: Lex.uz ushbu so‘rov uchun mos rasmiy parchani bermadi. Harakat yoki hujjatni, voqea sanasini va maqsadingizni yozing yoki keyinroq qayta urinib ko‘ring — bu dastlabki bosqich javob limitidan yechilmaydi.",
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
