/**
 * Request-scoped legal intent, follow-up rewrite, and Lex query planning.
 *
 * The deterministic routing and bounded-expansion concepts are adapted from
 * toxirerkinov70-commits/huquq-ai at commit
 * 1bce500c69b8213373d8ce0b40d56be7d83f6aec (MIT License, Copyright 2026
 * Toxir Erkinov). This TypeScript implementation is JURO-specific: it removes
 * the local corpus/vector dependencies, redacts sensitive data, and emits only
 * direct-live Lex.uz discovery plans.
 */

import type { ConversationContextSummary } from "./conversation-context";

export const legalIntentKinds = [
  "conversation",
  "legal_question",
  "document",
  "calculation",
  "out_of_scope",
] as const;

export type LegalIntentKind = (typeof legalIntentKinds)[number];
export type LegalDomainMode =
  | "labor"
  | "family"
  | "civil"
  | "housing"
  | "contracts"
  | "business"
  | "tax"
  | "litigation"
  | "migration"
  | "transport"
  | "consumer"
  | "administrative"
  | "banking_finance"
  | "digital_rights"
  | "general";

export type LegalIntentDecision = {
  intent: LegalIntentKind;
  confidence: "high" | "medium" | "low";
  shouldRetrieveLex: boolean;
  chargeableOnSuccess: boolean;
};

export type LegalResearchPlan = {
  locale: "ru" | "uz";
  domain: LegalDomainMode;
  primaryQuery: string;
  expandedQueries: string[];
  articleNumber: string | null;
  paragraphNumber: string | null;
  actName: string | null;
  directLookupPreferred: boolean;
  needsDocument: boolean;
  needsActionPlan: boolean;
  companionQueries: string[];
};

const GREETING = /^(?:привет|здравствуйте|добрый\s+(?:день|вечер|утро)|салом|ассалом(?:у\s+алайкум)?|salom|hello|hi|как\s+дела|qalaysiz)[!,.?\s]*$/iu;
const THANKS = /^(?:спасибо|благодарю|рахмат|tashakkur|thank\s+you)[!,.?\s]*$/iu;
const DOCUMENT_REQUEST = /(?:состав(?:ь|ить)|подготов(?:ь|ить)|заполн(?:и|ить)|шаблон|образец|договор|заявлени[ея]|жалоб[ау]|исков(?:ое)?\s+заявление|hujjat|shartnoma|ariza|da.vo|namuna|tayyorla|to.ldir)/iu;
const CALCULATION_REQUEST = /(?:рассчита(?:й|ть)|посчита(?:й|ть)|калькулятор|расч[её]т|пен[яи]|процент|госпошлин|soliqni\s+hisob|hisobla|foiz|penya|davlat\s+boji)/iu;
const OUT_OF_SCOPE = /(?:медицинск(?:ий|ая)\s+диагноз|назначь\s+лекарство|взлом|обойти\s+защиту|оружи[ея]|malware|парол[ья]\s+чуж|ставк[аи]\s+на\s+спорт)/iu;
const LEGAL_MARKERS = /(?:прав[оа]|закон|кодекс|стать[яию]|договор|суд|налог|штраф|увольн|работодатель|работник|брак|развод|алименты|наслед|регистрац|лицензи|обязан|можно\s+ли|имею\s+ли|qonun|huquq|kodeks|modda|sud|soliq|jarima|ishdan|nikoh|aliment|meros|ro.yxat|majbur)/iu;

const SENSITIVE_PATTERNS: RegExp[] = [
  /\b\d{14}\b/gu,
  /\b(?:AA|AB|AC|AD|AE|KA|FA)\s?\d{7}\b/giu,
  /\b(?:8600|9860|5440|5614)\s?(?:\d[ -]?){12}\b/gu,
  /\+?998[\s()-]?\d{2}[\s()-]?(?:\d[\s()-]?){7}\b/gu,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  /\b\d{9,19}\b/gu,
];

const FOLLOW_UP = /^(?:а\s+)?(?:какие|какой|как|когда|куда|что|сколько|почему|где|можно\s+ли|нужн\p{L}*|qanday|qaysi|qachon|qayerga|nima|qancha|nega|kerakmi)(?:\s|$)/iu;
const FOLLOW_UP_NOUN = /^(?:а\s+)?(?:какие\s+)?(?:документы|сроки|риски|шаги|основания|hujjatlar|muddatlar|xavflar|qadamlar|asoslar)[?!.\s]*$/iu;

const DOMAIN_PATTERNS: ReadonlyArray<[LegalDomainMode, RegExp]> = [
  ["labor", /(?:труд|работодател|работник|увольн|зарплат|отпуск|mehnat|ish\s+beruvchi|xodim|ishdan|ta.til)/iu],
  ["family", /(?:семь|брак|развод|алимент|опек|nikoh|ajrim|aliment|vasiy)/iu],
  ["civil", /(?:гражданск\p{L}*\s+(?:спор|правоотношен)|fuqarolik\s+nizo)/iu],
  ["housing", /(?:жиль|квартир|аренд|недвижим|uy-joy|kvartira|ijara|ko.chmas)/iu],
  ["tax", /(?:налог|ндс|инн|солиқ|soliq|qqs)/iu],
  ["contracts", /(?:договор|контракт|обязательств|неустойк|shartnoma|majburiyat)/iu],
  ["business", /(?:ооо|llc|мчж|mchj(?:ni|ga|ning)?|общество\s+с\s+ограниченной|tadbirkor|компани|biznes)/iu],
  ["litigation", /(?:суд|иск|апелляц|исполнител|sud|da.vo|apellyats|ijro)/iu],
  ["migration", /(?:миграц|виза|вид\s+на\s+жительство|гражданств|migrats|viza|fuqarolik)/iu],
  ["transport", /(?:транспорт|автомоб|водител|дтп|yo.l|transport|avtomobil)/iu],
  ["consumer", /(?:потребител|iste.molchi)/iu],
  ["administrative", /(?:административн(?:ой|ая|ую|ые)?\s+(?:процедур|производств)|ma.muriy\s+tartib-taomil)/iu],
  ["banking_finance", /(?:центральн\p{L}*\s+банк|банковск|кредит|марказий\s+банк|markaziy\s+bank|bank\s+xizmat)/iu],
  ["digital_rights", /(?:персональн|данн|цифров|электронн|онлайн|shaxsiy\s+ma.lumot|raqamli|elektron)/iu],
];
const LLC_DOMAIN_MARKER = /(?:ооо|llc|мчж|mchj(?:ni|ga|ning)?|общество\s+с\s+ограниченной|mas.?.uliyati\s+cheklangan\s+jamiyat|jamiyat(?:ning)?\s+ustav)/iu;

const ARTICLE_PATTERN = /(?:(?:стать(?:я|и|ю|е)|ст\.?|modda(?:si|ning)?|article)\s*[№#]?\s*(\d+(?:[.-]\d+)?)|(\d+(?:[.-]\d+)?)\s*(?:-\s*)?modda\b)/iu;
const PARAGRAPH_PATTERN = /(?:пункт(?:а|е|ом)?|п\.?|band(?:i|ning)?)\s*[№#]?\s*(\d+(?:[.-]\d+)?)/iu;
const ACT_NAME_PATTERNS = [
  /(?:трудов(?:ой|ого)|семейн(?:ый|ого)|гражданск(?:ий|ого)|налогов(?:ый|ого)|жилищн(?:ый|ого))\s+кодекс(?:а)?/iu,
  /(?:mehnat|oila|fuqarolik|soliq|uy-joy)\s+kodeksi/iu,
  /(?:закон(?:а)?\s+(?:республики\s+узбекистан\s+)?[«"]([^»"]{4,180})[»"])/iu,
  /(?:[«"]([^»"]{4,180})[»"]\s+(?:тўғрисида|to.g.risida))/iu,
] as const;

const DOMAIN_COMPANIONS: Partial<Record<LegalDomainMode, { ru: string[]; uz: string[] }>> = {
  business: {
    ru: ["государственная регистрация юридического лица", "устав общества с ограниченной ответственностью"],
    uz: ["yuridik shaxsni davlat ro.yxatidan o.tkazish", "mas.uliyati cheklangan jamiyat ustavi"],
  },
  labor: {
    ru: ["Трудовой кодекс Республики Узбекистан", "трудовой договор права работника"],
    uz: ["O‘zbekiston Respublikasining Mehnat kodeksi", "mehnat shartnomasi xodim huquqlari"],
  },
  family: {
    ru: ["Семейный кодекс Республики Узбекистан"],
    uz: ["O‘zbekiston Respublikasining Oila kodeksi"],
  },
  civil: {
    ru: ["Гражданский кодекс Республики Узбекистан первая часть"],
    uz: ["O‘zbekiston Respublikasining Fuqarolik kodeksi birinchi qism"],
  },
  contracts: {
    ru: ["Гражданский кодекс Республики Узбекистан"],
    uz: ["O‘zbekiston Respublikasining Fuqarolik kodeksi"],
  },
  tax: {
    ru: ["Налоговый кодекс Республики Узбекистан"],
    uz: ["O‘zbekiston Respublikasining Soliq kodeksi"],
  },
  housing: {
    ru: ["Гражданский кодекс Республики Узбекистан недвижимость"],
    uz: ["O‘zbekiston Respublikasining Fuqarolik kodeksi ko‘chmas mulk"],
  },
  consumer: {
    ru: ["О защите прав потребителей"],
    uz: ["Iste’molchilarning huquqlarini himoya qilish to‘g‘risida"],
  },
  administrative: {
    ru: ["Об административных процедурах"],
    uz: ["Ma’muriy tartib-taomillar to‘g‘risida"],
  },
  banking_finance: {
    ru: ["О Центральном банке Республики Узбекистан"],
    uz: ["O‘zbekiston Respublikasining Markaziy banki to‘g‘risida"],
  },
  digital_rights: {
    ru: ["О персональных данных"],
    uz: ["Shaxsga doir ma’lumotlar to‘g‘risida"],
  },
  litigation: {
    ru: ["Гражданский процессуальный кодекс Республики Узбекистан", "процессуальный срок обращение в суд"],
    uz: ["O‘zbekiston Respublikasining Fuqarolik protsessual kodeksi", "sudga murojaat qilish protsessual muddati"],
  },
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function redactLegalQuerySensitiveData(value: string): string {
  return normalizeWhitespace(SENSITIVE_PATTERNS.reduce(
    (result, pattern) => result.replace(pattern, "[REDACTED]"),
    value,
  ));
}

export function classifyLegalIntent(question: string): LegalIntentDecision {
  const normalized = normalizeWhitespace(question);
  if (!normalized || GREETING.test(normalized) || THANKS.test(normalized)) {
    return { intent: "conversation", confidence: "high", shouldRetrieveLex: false, chargeableOnSuccess: false };
  }
  if (OUT_OF_SCOPE.test(normalized)) {
    return { intent: "out_of_scope", confidence: "high", shouldRetrieveLex: false, chargeableOnSuccess: false };
  }
  if (CALCULATION_REQUEST.test(normalized)) {
    return { intent: "calculation", confidence: "high", shouldRetrieveLex: LEGAL_MARKERS.test(normalized), chargeableOnSuccess: true };
  }
  if (DOCUMENT_REQUEST.test(normalized)) {
    return { intent: "document", confidence: "high", shouldRetrieveLex: LEGAL_MARKERS.test(normalized), chargeableOnSuccess: true };
  }
  if (LEGAL_MARKERS.test(normalized)) {
    return { intent: "legal_question", confidence: "high", shouldRetrieveLex: true, chargeableOnSuccess: true };
  }
  // huquq-ai's conservative default is preserved: uncertainty is routed to
  // the legal path so a real question is not silently dismissed.
  return { intent: "legal_question", confidence: "low", shouldRetrieveLex: true, chargeableOnSuccess: true };
}

function relevantHistorySubject(
  history: readonly { user: string; assistant: string }[],
  summary?: ConversationContextSummary | null,
): string | null {
  for (const turn of [...history].slice(-6).reverse()) {
    const candidate = redactLegalQuerySensitiveData(turn.user);
    if (candidate.length < 4 || GREETING.test(candidate) || THANKS.test(candidate)) continue;
    if (classifyLegalIntent(candidate).intent === "legal_question" || DOCUMENT_REQUEST.test(candidate)) {
      return candidate.slice(0, 500);
    }
  }
  for (const turn of [...(summary?.turns ?? [])].reverse()) {
    const candidate = redactLegalQuerySensitiveData(turn.user);
    if (candidate.length < 4 || GREETING.test(candidate) || THANKS.test(candidate)) continue;
    if (classifyLegalIntent(candidate).intent === "legal_question" || DOCUMENT_REQUEST.test(candidate)) {
      return candidate.slice(0, 500);
    }
  }
  return null;
}

export function rewriteLegalFollowUp(input: {
  question: string;
  locale: "ru" | "uz";
  conversationHistory?: readonly { user: string; assistant: string }[];
  conversationSummary?: ConversationContextSummary | null;
}): { query: string; rewritten: boolean } {
  const question = redactLegalQuerySensitiveData(input.question).slice(0, 500);
  const history = input.conversationHistory ?? [];
  const shortFollowUp = question.length <= 120 && (FOLLOW_UP.test(question) || FOLLOW_UP_NOUN.test(question));
  if (!shortFollowUp) return { query: question, rewritten: false };
  const subject = relevantHistorySubject(history, input.conversationSummary);
  if (!subject) return { query: question, rewritten: false };
  const query = input.locale === "ru"
    ? `${subject}. Уточняющий вопрос: ${question}`
    : `${subject}. Aniqlashtiruvchi savol: ${question}`;
  return { query: redactLegalQuerySensitiveData(query).slice(0, 900), rewritten: true };
}

function detectDomain(value: string): LegalDomainMode {
  // A founding agreement is still an LLC/business question. The generic
  // contract marker must not route an explicit company query to the Civil
  // Code before the dedicated LLC act is considered.
  if (LLC_DOMAIN_MARKER.test(value)) return "business";
  return DOMAIN_PATTERNS.find(([, pattern]) => pattern.test(value))?.[0] ?? "general";
}

function extractActName(value: string): string | null {
  for (const pattern of ACT_NAME_PATTERNS) {
    const match = value.match(pattern);
    if (match) return normalizeWhitespace(match[1] ?? match[0]).slice(0, 240);
  }
  return null;
}

function expandCompanyAlias(value: string, locale: "ru" | "uz"): string {
  if (!LLC_DOMAIN_MARKER.test(value)) return value;
  return locale === "ru"
    ? "общество с ограниченной ответственностью"
    : "mas'uliyati cheklangan jamiyat";
}

function compactSearchQuery(value: string): string {
  return normalizeWhitespace(value)
    .replace(/\[REDACTED\]/gu, "")
    .replace(/[?!,:;]+/gu, " ")
    .slice(0, 240)
    .trim();
}

export function planLegalResearch(input: {
  question: string;
  locale: "ru" | "uz";
  conversationHistory?: readonly { user: string; assistant: string }[];
  conversationSummary?: ConversationContextSummary | null;
}): LegalResearchPlan {
  const rewrite = rewriteLegalFollowUp(input);
  const normalized = rewrite.query;
  const domain = detectDomain(normalized);
  const articleMatch = normalized.match(ARTICLE_PATTERN);
  const articleNumber = articleMatch?.[1] ?? articleMatch?.[2] ?? null;
  const paragraphNumber = normalized.match(PARAGRAPH_PATTERN)?.[1] ?? null;
  const actName = extractActName(normalized);
  const aliasQuery = expandCompanyAlias(normalized, input.locale);
  const primaryQuery = compactSearchQuery(
    actName && articleNumber
      ? `${actName} ${input.locale === "ru" ? "статья" : "modda"} ${articleNumber}`
      : aliasQuery,
  );
  const expansions: string[] = [];
  const alias = expandCompanyAlias(input.question, input.locale);
  if (alias !== input.question && compactSearchQuery(alias) !== primaryQuery) expansions.push(compactSearchQuery(alias));
  if (actName && compactSearchQuery(actName) !== primaryQuery) expansions.push(compactSearchQuery(actName));
  const companions = (DOMAIN_COMPANIONS[domain]?.[input.locale] ?? [])
    .filter((query) => query !== primaryQuery)
    .slice(0, 2);
  for (const query of companions) {
    if (expansions.length >= 2) break;
    if (!expansions.includes(query)) expansions.push(query);
  }
  return {
    locale: input.locale,
    domain,
    primaryQuery,
    expandedQueries: expansions.slice(0, 2),
    articleNumber,
    paragraphNumber,
    actName,
    directLookupPreferred: Boolean(articleNumber || actName),
    needsDocument: DOCUMENT_REQUEST.test(normalized),
    needsActionPlan: /(?:что\s+делать|как\s+(?:открыть|создать|зарегистрировать|оформить)|шаг|план|действ|qanday\s+(?:qilish|och\p{L}*|tashkil\s+etish|ro.yxatdan\s+o.tkazish)|qadam|reja|harakat)/iu.test(normalized),
    companionQueries: companions,
  };
}
