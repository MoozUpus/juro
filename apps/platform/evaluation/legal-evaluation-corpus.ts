export const LEGAL_EVALUATION_AREAS = [
  "civil", "contracts", "labor", "family", "entrepreneurship", "tax",
  "consumer", "real_estate", "administrative", "litigation", "banking_finance", "data_it",
] as const;

export type LegalEvaluationArea = (typeof LEGAL_EVALUATION_AREAS)[number];
export type LegalEvaluationLocale = "ru" | "uz";
export type LegalEvaluationScenario = {
  id: string;
  locale: LegalEvaluationLocale;
  area: LegalEvaluationArea;
  prompt: string;
  tags: readonly string[];
  requiresHumanReview: true;
};

export const MIN_REVIEWED_LANGUAGE_QUALITY = 95;
export const MIN_CRITICAL_DEADLINE_DETECTION_RATE = 0.98;

const ruArea: Record<LegalEvaluationArea, string> = {
  civil: "гражданском споре", contracts: "договоре", labor: "трудовых отношениях",
  family: "семейной ситуации", entrepreneurship: "предпринимательской деятельности",
  tax: "налоговом обязательстве", consumer: "защите прав потребителя",
  real_estate: "сделке с недвижимостью", administrative: "административной процедуре",
  litigation: "судебном или исполнительном производстве", banking_finance: "банковском или финансовом вопросе",
  data_it: "персональных данных или IT-услуге",
};
const uzArea: Record<LegalEvaluationArea, string> = {
  civil: "fuqarolik nizosi", contracts: "shartnoma", labor: "mehnat munosabatlari",
  family: "oilaviy vaziyat", entrepreneurship: "tadbirkorlik faoliyati",
  tax: "soliq majburiyati", consumer: "iste’molchi huquqlari",
  real_estate: "ko‘chmas mulk bitimi", administrative: "ma’muriy tartib-taomil",
  litigation: "sud yoki ijro ishi", banking_finance: "bank yoki moliyaviy masala",
  data_it: "shaxsiy ma’lumotlar yoki IT xizmati",
};

const coverageTags = [
  "historical", "deadline", "urgent", "advice_missing", "advice_lex_conflict", "unofficial_source",
] as const;

function basePrompt(locale: LegalEvaluationLocale, area: LegalEvaluationArea, index: number): string {
  const coverage = coverageTags[index % coverageTags.length];
  if (coverage === "deadline") {
    return locale === "ru"
      ? `По ${ruArea[area]} срок подачи важного заявления истекает завтра. Объясните первоочередное действие, какую дату нужно подтвердить и почему срок нельзя считать без применимой нормы Узбекистана.`
      : `${uzArea[area]} bo‘yicha muhim ariza berish muddati ertaga tugaydi. Birinchi harakatni, qaysi sanani tasdiqlash kerakligini va O‘zbekistonning qo‘llanadigan normasiz muddatni nega hisoblab bo‘lmasligini tushuntiring.`;
  }
  if (locale === "ru") {
    return `Нужна помощь по ${ruArea[area]}. Событие произошло ${index % 2 === 0 ? "ранее" : "недавно"}; объясните, какие факты и дату нужно уточнить, прежде чем делать юридический вывод по праву Узбекистана.`;
  }
  return `${uzArea[area]} bo‘yicha yordam kerak. Voqea ${index % 2 === 0 ? "avval" : "yaqinda"} bo‘lgan; O‘zbekiston huquqi bo‘yicha xulosa berishdan oldin qaysi faktlar va sanani aniqlashtirish kerakligini tushuntiring.`;
}

function buildBase(locale: LegalEvaluationLocale): LegalEvaluationScenario[] {
  return LEGAL_EVALUATION_AREAS.flatMap((area) =>
    Array.from({ length: 11 }, (_, index) => {
      const coverage = coverageTags[index % coverageTags.length]!;
      return {
        id: `legal-${locale}-${area}-${String(index + 1).padStart(2, "0")}`,
        locale,
        area,
        prompt: basePrompt(locale, area, index),
        tags: [coverage, ...(coverage === "deadline" ? ["critical_deadline"] : []), index % 3 === 0 ? "incomplete_facts" : "ordinary"],
        requiresHumanReview: true,
      };
    }),
  );
}

function buildAmbiguous(locale: LegalEvaluationLocale): LegalEvaluationScenario[] {
  return Array.from({ length: 25 }, (_, index) => {
    const area = LEGAL_EVALUATION_AREAS[index % LEGAL_EVALUATION_AREAS.length];
    const prompt = locale === "ru"
      ? `Проверьте спорное утверждение из неофициальной ссылки по ${ruArea[area]}; дата события и применимая редакция нормы не указаны.`
      : `${uzArea[area]} bo‘yicha norasmiy havoladagi bahsli fikrni tekshiring; voqea sanasi va normaning qo‘llanadigan tahriri ko‘rsatilmagan.`;
    return {
      id: `legal-${locale}-ambiguous-${String(index + 1).padStart(2, "0")}`,
      locale,
      area,
      prompt,
      tags: ["ambiguous", "unofficial_source", "historical", "incomplete_facts"],
      requiresHumanReview: true,
    };
  });
}

/** Synthetic release-gate inputs only; these are never legal answers or ground truth. */
export const legalEvaluationCorpus: readonly LegalEvaluationScenario[] = [
  ...buildBase("ru"), ...buildBase("uz"), ...buildAmbiguous("ru"), ...buildAmbiguous("uz"),
];

export type LegalEvaluationResult = {
  scenarioId: string;
  citedUrls: readonly string[];
  citedSourceTypes: readonly ("lex" | "advice" | "internal")[];
  criticalDeadlineDetected?: boolean;
  reviewedLanguageQuality?: number;
  humanReviewerId?: string;
};

export function validateLegalEvaluationResults(
  results: readonly LegalEvaluationResult[],
  scenarios: readonly LegalEvaluationScenario[] = legalEvaluationCorpus,
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  const scenarioIds = new Set(scenarios.map(({ id }) => id));
  if (results.length !== scenarios.length) failures.push("RESULT_COUNT_MISMATCH");
  const resultIds = new Set<string>();
  let detectedCriticalDeadlines = 0;
  const criticalDeadlineScenarioIds = new Set(
    scenarios.filter((scenario) => scenario.tags.includes("critical_deadline")).map((scenario) => scenario.id),
  );
  for (const result of results) {
    if (!scenarioIds.has(result.scenarioId)) failures.push(`UNKNOWN_SCENARIO:${result.scenarioId}`);
    if (resultIds.has(result.scenarioId)) failures.push(`DUPLICATE_RESULT:${result.scenarioId}`);
    resultIds.add(result.scenarioId);
    if (result.citedUrls.length !== result.citedSourceTypes.length) {
      failures.push(`CITATION_SOURCE_TYPE_MISMATCH:${result.scenarioId}`);
    }
    for (const [index, url] of result.citedUrls.entries()) {
      const declaredType = result.citedSourceTypes[index];
      const expectedType = /^https:\/\/lex\.uz\//.test(url)
        ? "lex"
        : /^https:\/\/advice\.uz\//.test(url)
          ? "advice"
          : null;
      if (!expectedType) {
        failures.push(`UNVERIFIED_CITATION:${result.scenarioId}`);
      } else if (declaredType !== expectedType) {
        failures.push(`CITATION_SOURCE_TYPE_INVALID:${result.scenarioId}`);
      }
    }
    if (!result.humanReviewerId) failures.push(`HUMAN_REVIEW_MISSING:${result.scenarioId}`);
    if (!Number.isFinite(result.reviewedLanguageQuality)
      || (result.reviewedLanguageQuality ?? 0) < MIN_REVIEWED_LANGUAGE_QUALITY) {
      failures.push(`LANGUAGE_QUALITY_BELOW_THRESHOLD:${result.scenarioId}`);
    }
    if (criticalDeadlineScenarioIds.has(result.scenarioId) && result.criticalDeadlineDetected) {
      detectedCriticalDeadlines += 1;
    }
  }
  for (const scenario of scenarios) {
    if (!resultIds.has(scenario.id)) failures.push(`RESULT_MISSING:${scenario.id}`);
  }
  if (criticalDeadlineScenarioIds.size > 0
    && detectedCriticalDeadlines / criticalDeadlineScenarioIds.size < MIN_CRITICAL_DEADLINE_DETECTION_RATE) {
    failures.push("CRITICAL_DEADLINE_DETECTION_BELOW_THRESHOLD");
  }
  return { passed: failures.length === 0, failures };
}
