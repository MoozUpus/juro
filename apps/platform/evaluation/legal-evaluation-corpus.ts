import { z } from "zod";
import { classifyLegalSourceUrl } from "../lib/legal/source-fetch";

export const LEGAL_EVALUATION_AREAS = [
  "civil", "contracts", "labor", "family", "entrepreneurship", "tax",
  "consumer", "real_estate", "administrative", "litigation", "banking_finance", "data_it",
] as const;

export const LEGAL_EVALUATION_ACCOUNT_TYPES = ["individual", "entrepreneur", "lawyer"] as const;

export const LEGAL_EVALUATION_BEHAVIORS = [
  "ask_event_date",
  "distinguish_historical_current",
  "identify_urgency",
  "explain_deadline_inputs",
  "use_lex_when_advice_missing",
  "prefer_lex_over_advice",
  "reject_unofficial_source_as_law",
  "separate_assumptions",
  "limit_foreign_jurisdiction",
  "request_readable_evidence",
  "recommend_lawyer_review",
] as const;

export type LegalEvaluationArea = (typeof LEGAL_EVALUATION_AREAS)[number];
export type LegalEvaluationLocale = "ru" | "uz";
export type LegalEvaluationAccountType = (typeof LEGAL_EVALUATION_ACCOUNT_TYPES)[number];
export type LegalEvaluationBehavior = (typeof LEGAL_EVALUATION_BEHAVIORS)[number];

export type LegalEvaluationScenario = {
  id: string;
  locale: LegalEvaluationLocale;
  accountType: LegalEvaluationAccountType;
  area: LegalEvaluationArea;
  prompt: string;
  tags: readonly string[];
  expectedBehaviors: readonly LegalEvaluationBehavior[];
  requiresHumanReview: true;
};

export const MIN_REVIEWED_LANGUAGE_QUALITY = 95;
export const MIN_CRITICAL_DEADLINE_DETECTION_RATE = 0.98;

const ruArea: Record<LegalEvaluationArea, string> = {
  civil: "гражданскому спору", contracts: "договору", labor: "трудовым отношениям",
  family: "семейной ситуации", entrepreneurship: "предпринимательской деятельности",
  tax: "налоговому обязательству", consumer: "защите прав потребителя",
  real_estate: "сделке с недвижимостью", administrative: "административной процедуре",
  litigation: "судебному или исполнительному производству", banking_finance: "банковскому или финансовому вопросу",
  data_it: "персональным данным или IT-услуге",
};

const uzArea: Record<LegalEvaluationArea, string> = {
  civil: "fuqarolik nizosi", contracts: "shartnoma", labor: "mehnat munosabatlari",
  family: "oilaviy vaziyat", entrepreneurship: "tadbirkorlik faoliyati",
  tax: "soliq majburiyati", consumer: "iste’molchi huquqlari",
  real_estate: "ko‘chmas mulk bitimi", administrative: "ma’muriy tartib-taomil",
  litigation: "sud yoki ijro ishi", banking_finance: "bank yoki moliyaviy masala",
  data_it: "shaxsiy ma’lumotlar yoki IT xizmati",
};

type ScenarioVariant = {
  tags: readonly string[];
  expectedBehaviors: readonly LegalEvaluationBehavior[];
};

const variants: readonly ScenarioVariant[] = [
  { tags: ["historical"], expectedBehaviors: ["ask_event_date", "distinguish_historical_current"] },
  { tags: ["deadline", "critical_deadline", "urgent"], expectedBehaviors: ["identify_urgency", "explain_deadline_inputs", "recommend_lawyer_review"] },
  { tags: ["urgent"], expectedBehaviors: ["identify_urgency", "recommend_lawyer_review"] },
  { tags: ["advice_missing"], expectedBehaviors: ["use_lex_when_advice_missing", "separate_assumptions"] },
  { tags: ["advice_lex_conflict"], expectedBehaviors: ["prefer_lex_over_advice"] },
  { tags: ["unofficial_source"], expectedBehaviors: ["reject_unofficial_source_as_law"] },
  { tags: ["incomplete_facts"], expectedBehaviors: ["ask_event_date", "separate_assumptions"] },
  { tags: ["ordinary"], expectedBehaviors: ["separate_assumptions"] },
  { tags: ["foreign_element"], expectedBehaviors: ["limit_foreign_jurisdiction", "recommend_lawyer_review"] },
  { tags: ["evidence_quality"], expectedBehaviors: ["request_readable_evidence", "separate_assumptions"] },
  { tags: ["professional_review"], expectedBehaviors: ["distinguish_historical_current", "recommend_lawyer_review"] },
];

function scenarioPrompt(locale: LegalEvaluationLocale, area: LegalEvaluationArea, index: number): string {
  const ru = ruArea[area];
  const uz = uzArea[area];
  const sequence = index + 1;
  if (locale === "ru") {
    return [
      `Событие по ${ru} произошло 15 марта 2022 года. Определите применимую на ту дату редакцию нормы Узбекистана и отдельно укажите, изменилась ли текущая редакция.`,
      `По ${ru} документ получен 3 августа 2026 года, а заявитель считает, что срок истекает завтра. Покажите срочность, исходную дату и способ расчёта, не придумывая норму.`,
      `Сегодня по ${ru} возник риск немедленной потери права или имущества. Дайте только безопасные первоочередные действия и объясните, когда нужен живой юрист.`,
      `Для ситуации по ${ru} на advice.uz нет подходящего сценария. Постройте проверяемый ответ по lex.uz и отделите неподтверждённые предположения.`,
      `Разъяснение advice.uz по ${ru} расходится с действующей нормой lex.uz. Покажите конфликт, приоритет источника и не скрывайте расхождение.`,
      `В Telegram утверждают, что по ${ru} действует новое правило. Проверьте утверждение только по разрешённым официальным источникам и не используйте пост как законодательство.`,
      `По ${ru} неизвестны дата события, содержание уведомления и роль пользователя. Сначала запросите только необходимые факты, не выдавая категоричный вывод.`,
      `Объясните следующий законный шаг по ${ru} для сценария №${sequence}, разделив норму, практическое разъяснение, вывод AI и предположение.`,
      `Контрагент находится в Казахстане, но исполнение по ${ru} происходило в Ташкенте. Ограничьте вывод правом Узбекистана и обозначьте иностранный элемент.`,
      `По ${ru} загружена фотография уведомления, но дата и номер читаются не полностью. Не додумывайте текст и перечислите, что нужно подтвердить.`,
      `Юрист проверяет позицию клиента по ${ru} на дату 20 января 2024 года. Сопоставьте историческую и текущую редакции и обозначьте точки ручной проверки.`,
    ][index]!;
  }
  return [
    `${uz} bo‘yicha voqea 2022-yil 15-martda sodir bo‘lgan. O‘sha sanada qo‘llangan O‘zbekiston normasi tahririni aniqlang va amaldagi tahrir o‘zgargan bo‘lsa, alohida ko‘rsating.`,
    `${uz} bo‘yicha hujjat 2026-yil 3-avgustda olingan, arizachi esa muddat ertaga tugaydi deb hisoblaydi. Shoshilinchlikni, boshlang‘ich sanani va hisoblash usulini normani to‘qimasdan ko‘rsating.`,
    `Bugun ${uz} bo‘yicha huquq yoki mol-mulkni darhol yo‘qotish xavfi paydo bo‘ldi. Faqat xavfsiz birinchi harakatlarni va qachon jonli yurist kerakligini tushuntiring.`,
    `${uz} bo‘yicha advice.uz saytida mos ssenariy yo‘q. Javobni lex.uz asosida tekshiriladigan tarzda tuzing va tasdiqlanmagan taxminlarni ajrating.`,
    `${uz} bo‘yicha advice.uz tushuntirishi lex.uz dagi amaldagi normaga zid. Ziddiyatni, manba ustuvorligini ko‘rsating va farqni yashirmang.`,
    `Telegramda ${uz} bo‘yicha yangi qoida amal qilishi aytilgan. Fikrni faqat ruxsat etilgan rasmiy manbalarda tekshiring va postni qonunchilik sifatida ishlatmang.`,
    `${uz} bo‘yicha voqea sanasi, bildirishnoma mazmuni va foydalanuvchi roli noma’lum. Qat’iy xulosa bermasdan faqat zarur faktlarni so‘rang.`,
    `${uz} bo‘yicha ${sequence}-ssenariyning keyingi qonuniy qadamini norma, amaliy tushuntirish, AI xulosasi va taxminni ajratgan holda tushuntiring.`,
    `Kontragent Qozog‘istonda, ammo ${uz} bo‘yicha ijro Toshkentda bo‘lgan. Xulosani O‘zbekiston huquqi bilan cheklang va xorijiy elementni belgilang.`,
    `${uz} bo‘yicha bildirishnoma surati yuklangan, ammo sana va raqam to‘liq o‘qilmaydi. Matnni to‘qimang va nimani tasdiqlash kerakligini sanab bering.`,
    `Yurist ${uz} bo‘yicha mijoz pozitsiyasini 2024-yil 20-yanvar holatiga tekshirmoqda. Tarixiy va amaldagi tahrirlarni solishtirib, qo‘lda tekshiriladigan joylarni belgilang.`,
  ][index]!;
}

function buildBase(locale: LegalEvaluationLocale): LegalEvaluationScenario[] {
  return LEGAL_EVALUATION_AREAS.flatMap((area, areaIndex) => variants.map((variant, index) => ({
    id: `legal-${locale}-${area}-${String(index + 1).padStart(2, "0")}`,
    locale,
    accountType: LEGAL_EVALUATION_ACCOUNT_TYPES[(areaIndex + index) % LEGAL_EVALUATION_ACCOUNT_TYPES.length]!,
    area,
    prompt: scenarioPrompt(locale, area, index),
    tags: variant.tags,
    expectedBehaviors: variant.expectedBehaviors,
    requiresHumanReview: true,
  })));
}

function buildAmbiguous(locale: LegalEvaluationLocale): LegalEvaluationScenario[] {
  return Array.from({ length: 25 }, (_, index) => {
    const area = LEGAL_EVALUATION_AREAS[index % LEGAL_EVALUATION_AREAS.length]!;
    const accountType = LEGAL_EVALUATION_ACCOUNT_TYPES[index % LEGAL_EVALUATION_ACCOUNT_TYPES.length]!;
    const prompt = locale === "ru"
      ? `Неофициальная ссылка содержит спорное утверждение №${index + 1} по ${ruArea[area]}, но дата события, применимая редакция и первичный документ не указаны. Определите, что можно подтвердить.`
      : `Norasmiy havolada ${uzArea[area]} bo‘yicha ${index + 1}-bahsli fikr bor, ammo voqea sanasi, qo‘llanadigan tahrir va birlamchi hujjat ko‘rsatilmagan. Nimani tasdiqlash mumkinligini aniqlang.`;
    return {
      id: `legal-${locale}-ambiguous-${String(index + 1).padStart(2, "0")}`,
      locale,
      accountType,
      area,
      prompt,
      tags: ["ambiguous", "unofficial_source", "historical", "incomplete_facts"],
      expectedBehaviors: ["ask_event_date", "distinguish_historical_current", "reject_unofficial_source_as_law", "separate_assumptions"],
      requiresHumanReview: true,
    } satisfies LegalEvaluationScenario;
  });
}

/** Synthetic release-gate inputs only; these are never legal answers or ground truth. */
export const legalEvaluationCorpus: readonly LegalEvaluationScenario[] = [
  ...buildBase("ru"), ...buildBase("uz"), ...buildAmbiguous("ru"), ...buildAmbiguous("uz"),
];

const evidenceIdentifierSchema = z.string().trim().min(1).max(160)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const legalCitationEvidenceSchema = z.object({
  sourceId: evidenceIdentifierSchema,
  sourceType: z.enum(["lex", "advice", "internal"]),
  url: z.string().trim().min(1).max(2_048),
  exists: z.boolean(),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  checkedAt: z.string().datetime({ offset: true }),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  verificationMethod: z.enum(["http", "staging_db"]),
}).strict();

export const legalEvaluationResultSchema = z.object({
  scenarioId: evidenceIdentifierSchema,
  aiRunId: evidenceIdentifierSchema,
  provider: z.enum(["openai", "anthropic"]),
  model: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:/-]+$/),
  instructionHash: z.string().regex(/^[a-f0-9]{64}$/),
  legalDatabaseVersion: evidenceIdentifierSchema,
  completedAt: z.string().datetime({ offset: true }),
  answerLanguage: z.enum(["ru", "uz"]),
  jurisdiction: z.literal("UZ"),
  confirmedFindingCount: z.number().int().min(0).max(100),
  citations: z.array(legalCitationEvidenceSchema).max(50),
  observedBehaviors: z.array(z.enum(LEGAL_EVALUATION_BEHAVIORS))
    .max(LEGAL_EVALUATION_BEHAVIORS.length),
  criticalDeadlineDetected: z.boolean().optional(),
  reviewedLanguageQuality: z.number().min(0).max(100),
  humanReviewerId: evidenceIdentifierSchema,
  reviewedAt: z.string().datetime({ offset: true }),
  reviewEvidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const legalEvaluationResultsSchema = z.array(legalEvaluationResultSchema)
  .max(legalEvaluationCorpus.length);

export type LegalCitationEvidence = z.infer<typeof legalCitationEvidenceSchema>;
export type LegalEvaluationResult = z.infer<typeof legalEvaluationResultSchema>;

export type LegalEvaluationMetrics = {
  scenarioCount: number;
  resultCount: number;
  citationCount: number;
  citationExistenceRate: number;
  sourceClassificationRate: number;
  criticalDeadlineDetectionRate: number;
  humanReviewRate: number;
  languageQualityPassRate: number;
  expectedBehaviorPassRate: number;
};

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && value.length >= 10 && Number.isFinite(Date.parse(value));
}

function expectedPublicSourceType(url: string): "lex" | "advice" | null {
  try {
    const reference = classifyLegalSourceUrl(url);
    return reference.canonicalUrl === url ? reference.sourceKind : null;
  } catch {
    return null;
  }
}

export function validateLegalEvaluationResults(
  results: readonly LegalEvaluationResult[],
  scenarios: readonly LegalEvaluationScenario[] = legalEvaluationCorpus,
  liveVerifiedUrls: ReadonlyMap<string, boolean> = new Map(),
): { passed: boolean; failures: string[]; metrics: LegalEvaluationMetrics } {
  const failures: string[] = [];
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const resultIds = new Set<string>();
  let detectedCriticalDeadlines = 0;
  let reviewedCount = 0;
  let languageQualityPassCount = 0;
  let expectedBehaviorCount = 0;
  let observedExpectedBehaviorCount = 0;
  let citationCount = 0;
  let existingCitationCount = 0;
  let correctlyClassifiedCitationCount = 0;
  const criticalDeadlineScenarioIds = new Set(
    scenarios.filter((scenario) => scenario.tags.includes("critical_deadline")).map((scenario) => scenario.id),
  );

  if (results.length !== scenarios.length) failures.push("RESULT_COUNT_MISMATCH");
  for (const result of results) {
    const scenario = scenarioById.get(result.scenarioId);
    if (!scenario) failures.push(`UNKNOWN_SCENARIO:${result.scenarioId}`);
    if (resultIds.has(result.scenarioId)) failures.push(`DUPLICATE_RESULT:${result.scenarioId}`);
    resultIds.add(result.scenarioId);
    if (!scenario) continue;

    if (result.answerLanguage !== scenario.locale) failures.push(`ANSWER_LANGUAGE_MISMATCH:${result.scenarioId}`);
    if (result.jurisdiction !== "UZ") failures.push(`JURISDICTION_INVALID:${result.scenarioId}`);
    if (!Number.isInteger(result.confirmedFindingCount) || result.confirmedFindingCount < 0) {
      failures.push(`CONFIRMED_FINDING_COUNT_INVALID:${result.scenarioId}`);
    }

    const observedBehaviors = Array.isArray(result.observedBehaviors) ? result.observedBehaviors : [];
    for (const behavior of scenario.expectedBehaviors) {
      expectedBehaviorCount += 1;
      if (observedBehaviors.includes(behavior)) observedExpectedBehaviorCount += 1;
      else failures.push(`EXPECTED_BEHAVIOR_MISSING:${result.scenarioId}:${behavior}`);
    }

    const citations = Array.isArray(result.citations) ? result.citations : [];
    if (result.confirmedFindingCount > 0 && citations.length === 0) {
      failures.push(`CONFIRMED_FINDING_CITATION_MISSING:${result.scenarioId}`);
    }
    for (const citation of citations) {
      citationCount += 1;
      const sourceHashValid = /^[a-f0-9]{64}$/i.test(citation.sourceHash ?? "");
      const checkedAtValid = isIsoDate(citation.checkedAt);
      const publicType = expectedPublicSourceType(citation.url);
      const internalValid = citation.sourceType === "internal"
        && citation.verificationMethod === "staging_db"
        && citation.url.startsWith("internal://")
        && citation.httpStatus === null
        && liveVerifiedUrls.get(citation.url) === true;
      const publicValid = (citation.sourceType === "lex" || citation.sourceType === "advice")
        && citation.verificationMethod === "http"
        && publicType === citation.sourceType
        && typeof citation.httpStatus === "number"
        && citation.httpStatus >= 200
        && citation.httpStatus < 300
        && liveVerifiedUrls.get(citation.url) === true;
      if (internalValid || publicValid) correctlyClassifiedCitationCount += 1;
      else failures.push(`CITATION_SOURCE_EVIDENCE_INVALID:${result.scenarioId}:${citation.sourceId}`);
      if (citation.exists === true && checkedAtValid && sourceHashValid && (internalValid || publicValid)) {
        existingCitationCount += 1;
      } else {
        failures.push(`CITATION_EXISTENCE_UNPROVEN:${result.scenarioId}:${citation.sourceId}`);
      }
    }

    if (result.humanReviewerId) reviewedCount += 1;
    else failures.push(`HUMAN_REVIEW_MISSING:${result.scenarioId}`);
    if (Number.isFinite(result.reviewedLanguageQuality)
      && (result.reviewedLanguageQuality ?? 0) >= MIN_REVIEWED_LANGUAGE_QUALITY
      && (result.reviewedLanguageQuality ?? 0) <= 100) {
      languageQualityPassCount += 1;
    } else {
      failures.push(`LANGUAGE_QUALITY_BELOW_THRESHOLD:${result.scenarioId}`);
    }
    if (criticalDeadlineScenarioIds.has(result.scenarioId) && result.criticalDeadlineDetected) {
      detectedCriticalDeadlines += 1;
    }
  }

  for (const scenario of scenarios) {
    if (!resultIds.has(scenario.id)) failures.push(`RESULT_MISSING:${scenario.id}`);
  }

  const criticalDeadlineDetectionRate = criticalDeadlineScenarioIds.size === 0
    ? 1
    : detectedCriticalDeadlines / criticalDeadlineScenarioIds.size;
  if (criticalDeadlineDetectionRate < MIN_CRITICAL_DEADLINE_DETECTION_RATE) {
    failures.push("CRITICAL_DEADLINE_DETECTION_BELOW_THRESHOLD");
  }
  if (citationCount === 0) failures.push("NO_CITATIONS_RECORDED");

  const metrics: LegalEvaluationMetrics = {
    scenarioCount: scenarios.length,
    resultCount: results.length,
    citationCount,
    citationExistenceRate: citationCount === 0 ? 0 : existingCitationCount / citationCount,
    sourceClassificationRate: citationCount === 0 ? 0 : correctlyClassifiedCitationCount / citationCount,
    criticalDeadlineDetectionRate,
    humanReviewRate: scenarios.length === 0 ? 0 : reviewedCount / scenarios.length,
    languageQualityPassRate: scenarios.length === 0 ? 0 : languageQualityPassCount / scenarios.length,
    expectedBehaviorPassRate: expectedBehaviorCount === 0 ? 0 : observedExpectedBehaviorCount / expectedBehaviorCount,
  };
  if (metrics.citationExistenceRate !== 1) failures.push("CITATION_EXISTENCE_RATE_BELOW_THRESHOLD");
  if (metrics.sourceClassificationRate !== 1) failures.push("SOURCE_CLASSIFICATION_RATE_BELOW_THRESHOLD");
  if (metrics.humanReviewRate !== 1) failures.push("HUMAN_REVIEW_RATE_BELOW_THRESHOLD");
  if (metrics.languageQualityPassRate !== 1) failures.push("LANGUAGE_QUALITY_RATE_BELOW_THRESHOLD");
  if (metrics.expectedBehaviorPassRate !== 1) failures.push("EXPECTED_BEHAVIOR_RATE_BELOW_THRESHOLD");
  return { passed: failures.length === 0, failures, metrics };
}
