import { z } from "zod";

import type { AccountType, PlatformLocale } from "./routing";

type Localized = { ru: string; uz: string; en: string };
type ScenarioAudience = "all" | "business";
type ScenarioRisk = "standard" | "elevated";

export const CASE_DIRECTIONS = {
  employment: { ru: "Работа и трудовые отношения", uz: "Mehnat va ish munosabatlari", en: "Employment and workplace matters" },
  family: { ru: "Семья и наследство", uz: "Oila va meros", en: "Family and inheritance" },
  housing: { ru: "Жильё, земля и ЖКХ", uz: "Uy-joy, yer va kommunal xizmatlar", en: "Housing, land and utilities" },
  civil: { ru: "Долги, договоры и защита потребителей", uz: "Qarzlar, shartnomalar va iste’molchi huquqlari", en: "Debt, contracts and consumer protection" },
  business: { ru: "Бизнес и корпоративные вопросы", uz: "Biznes va korporativ masalalar", en: "Business and corporate matters" },
  finance: { ru: "Налоги, банки и финансы", uz: "Soliqlar, banklar va moliya", en: "Tax, banking and finance" },
  justice: { ru: "Суд, государственные органы и исполнение", uz: "Sud, davlat organlari va ijro", en: "Courts, public authorities and enforcement" },
  migration: { ru: "Миграция, гражданство и госуслуги", uz: "Migratsiya, fuqarolik va davlat xizmatlari", en: "Migration, citizenship and public services" },
  transport: { ru: "Транспорт, таможня и имущество", uz: "Transport, bojxona va mol-mulk", en: "Transport, customs and property" },
  digital: { ru: "Цифровые права, IP, образование и здоровье", uz: "Raqamli huquqlar, IP, ta’lim va sog‘liq", en: "Digital rights, IP, education and healthcare" },
  other: { ru: "Другое", uz: "Boshqa", en: "Other" },
} as const satisfies Record<string, Localized>;

export type CaseDirectionId = keyof typeof CASE_DIRECTIONS;

type Scenario = {
  direction: CaseDirectionId;
  audience: ScenarioAudience;
  risk: ScenarioRisk;
  requiresLawyerReview: boolean;
  label: Localized;
  steps: Record<PlatformLocale, readonly string[]>;
  sourceAuthority: "lex.uz";
};

function scenario(
  direction: CaseDirectionId,
  ru: string,
  uz: string,
  en: string,
  options: Pick<Scenario, "audience" | "risk" | "requiresLawyerReview"> = {
    audience: "all",
    risk: "standard",
    requiresLawyerReview: false,
  },
): Scenario {
  return {
    direction,
    ...options,
    label: { ru, uz, en },
    // The catalogue deliberately starts with neutral evidence and confirmation
    // steps. A legal editor attaches jurisdiction-specific Lex.uz references
    // before a scenario can make a legal deadline or entitlement claim.
    steps: {
      ru: [
        "Собрать документы, переписку и другие подтверждения",
        "Уточнить факты, цель и безопасный следующий шаг",
        "Подготовить обращение, запрос или проект документа",
        "Зафиксировать результат и проверить дальнейшие действия",
      ],
      uz: [
        "Hujjatlar, yozishmalar va boshqa tasdiqlarni yig‘ish",
        "Faktlar, maqsad va xavfsiz keyingi qadamni aniqlashtirish",
        "Murojaat, so‘rov yoki hujjat loyihasini tayyorlash",
        "Natijani qayd etib, keyingi harakatlarni tekshirish",
      ],
      en: [
        "Gather documents, correspondence and other supporting evidence",
        "Clarify the facts, objective and safest next step",
        "Prepare an application, request or draft document",
        "Record the outcome and review any follow-up actions",
      ],
    },
    sourceAuthority: "lex.uz",
  };
}

/**
 * Editorial catalogue contains no external-source URLs or legal conclusions.
 * User-facing legal sources stay Lex.uz-only.
 */
export const CASE_SCENARIOS = {
  "unpaid-salary": scenario("employment", "Невыплата заработной платы", "Ish haqi to‘lanmasligi", "Unpaid wages"),
  "unlawful-dismissal": scenario("employment", "Незаконное увольнение", "Noqonuniy ishdan bo‘shatish", "Unlawful dismissal", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "leave-and-benefits": scenario("employment", "Отпуск, пособия и выплаты", "Ta’til, nafaqa va to‘lovlar", "Leave, benefits and other payments"),
  "employment-contract": scenario("employment", "Трудовой договор и изменение условий", "Mehnat shartnomasi va shartlarni o‘zgartirish", "Employment contract and changes to terms"),
  "workplace-harm": scenario("employment", "Вред на работе и компенсация", "Ishdagi zarar va kompensatsiya", "Workplace injury and compensation", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  divorce: scenario("family", "Развод", "Ajrashish", "Divorce", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  alimony: scenario("family", "Алименты", "Aliment", "Child support (alimony)"),
  "child-residence": scenario("family", "Дети: место проживания и общение", "Bolalar: yashash joyi va muloqot", "Children: residence and contact", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "marital-property": scenario("family", "Раздел имущества супругов", "Er-xotin mol-mulkini bo‘lish", "Division of marital property", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  inheritance: scenario("family", "Наследство и принятие наследства", "Meros va merosni qabul qilish", "Inheritance and acceptance of inheritance", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  "residential-lease": scenario("housing", "Аренда жилья и выселение", "Uy-joy ijarasi va ko‘chirish", "Residential lease and eviction"),
  "property-registration": scenario("housing", "Покупка, продажа и регистрация жилья", "Uy-joyni sotib olish, sotish va ro‘yxatdan o‘tkazish", "Purchase, sale and registration of residential property", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  utilities: scenario("housing", "Коммунальные услуги и начисления", "Kommunal xizmatlar va hisob-kitoblar", "Utility services and charges"),
  "land-rights": scenario("housing", "Земельный участок и права на землю", "Yer uchastkasi va yer huquqlari", "Land plots and land rights", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  construction: scenario("housing", "Строительство, реконструкция и разрешения", "Qurilish, rekonstruksiya va ruxsatlar", "Construction, renovation and permits", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  debt: scenario("civil", "Возврат долга по расписке", "Tilxat bo‘yicha qarzni qaytarish", "Recovery of a debt evidenced by an IOU"),
  "contract-breach": scenario("civil", "Нарушение договора", "Shartnoma buzilishi", "Breach of contract"),
  "property-damage": scenario("civil", "Возмещение имущественного ущерба", "Mol-mulk zararini qoplash", "Compensation for property damage"),
  consumer: scenario("civil", "Возврат товара, гарантия и качество услуг", "Tovarni qaytarish, kafolat va xizmat sifati", "Returns, warranties and service quality"),
  insurance: scenario("civil", "Страховой случай и выплата", "Sug‘urta hodisasi va to‘lov", "Insurance claim and payment"),

  "business-registration": scenario("business", "Регистрация бизнеса и выбор формы", "Biznesni ro‘yxatdan o‘tkazish va shakl tanlash", "Business registration and choice of legal form", { audience: "all", risk: "standard", requiresLawyerReview: false }),
  "commercial-contract": scenario("business", "Коммерческий договор и оплата", "Tijorat shartnomasi va to‘lov", "Commercial contract and payment", { audience: "all", risk: "standard", requiresLawyerReview: false }),
  // Stable legacy ID kept so saved cases and inbound links from the previous
  // catalogue remain resolvable after the direction catalogue migration.
  "debt-recovery": scenario("business", "Взыскание задолженности", "Qarzdorlikni undirish", "Debt recovery", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "founder-dispute": scenario("business", "Спор учредителей или участников", "Ta’sischilar yoki ishtirokchilar nizosi", "Dispute between founders or participants", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "licence-inspection": scenario("business", "Лицензия, разрешение или проверка", "Litsenziya, ruxsatnoma yoki tekshiruv", "Licence, permit or inspection", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "business-reorganisation": scenario("business", "Закрытие или реорганизация бизнеса", "Biznesni yopish yoki qayta tashkil etish", "Business closure or reorganisation", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  "tax-dispute": scenario("finance", "Налоговая задолженность, возврат или спор", "Soliq qarzdorligi, qaytarish yoki nizo", "Tax liability, refund or dispute", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "bank-payment": scenario("finance", "Банковская карта, перевод или платёж", "Bank kartasi, o‘tkazma yoki to‘lov", "Bank card, transfer or payment"),
  credit: scenario("finance", "Кредит, микрозайм и реструктуризация", "Kredit, mikroqarz va qayta tuzish", "Loans, microloans and restructuring", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  enforcement: scenario("finance", "Исполнительное производство", "Ijro ishi", "Enforcement proceedings", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  insolvency: scenario("finance", "Финансовая неплатёжеспособность", "Moliyaviy to‘lovga qodir emaslik", "Financial insolvency", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  "government-appeal": scenario("justice", "Жалоба на решение или бездействие органа", "Organ qarori yoki harakatsizligi ustidan shikoyat", "Appeal against an authority's decision or inaction"),
  "administrative-fine": scenario("justice", "Административный штраф", "Ma’muriy jarima", "Administrative fine"),
  "civil-claim": scenario("justice", "Подготовка гражданского иска", "Fuqarolik da’vosini tayyorlash", "Preparing a civil claim", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  appeal: scenario("justice", "Апелляция и процессуальный срок", "Apellyatsiya va protsessual muddat", "Appeal and procedural deadlines", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "asset-arrest": scenario("justice", "Арест имущества или действия исполнителя", "Mol-mulkni xatlash yoki ijrochi harakatlari", "Asset seizure or enforcement officer actions", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  "identity-records": scenario("migration", "Паспорт, ID и ЗАГС", "Pasport, ID va FHDYO", "Passport, ID and civil status records"),
  citizenship: scenario("migration", "Гражданство и постоянное проживание", "Fuqarolik va doimiy yashash", "Citizenship and permanent residence", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "foreigner-status": scenario("migration", "Виза, регистрация и статус иностранца", "Viza, ro‘yxatdan o‘tish va chet el fuqarosi maqomi", "Visa, registration and foreign national status", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "state-service": scenario("migration", "Отказ или ошибка в госуслуге", "Davlat xizmatidagi rad javobi yoki xato", "Error or refusal in a public service"),
  "social-support": scenario("migration", "Пособие, пенсия и инвалидность", "Nafaqa, pensiya va nogironlik", "Benefits, pension and disability", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  "road-incident": scenario("transport", "ДТП и страхование", "YTH va sug‘urta", "Road traffic accident and insurance", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "traffic-fine": scenario("transport", "Штрафы и обжалование", "Jarimalar va shikoyat qilish", "Fines and appeals"),
  vehicle: scenario("transport", "Покупка, продажа или регистрация автомобиля", "Avtomobilni sotib olish, sotish yoki ro‘yxatdan o‘tkazish", "Vehicle purchase, sale or registration"),
  carriage: scenario("transport", "Транспортные услуги и перевозка", "Transport xizmatlari va tashish", "Transport services and carriage"),
  customs: scenario("transport", "Импорт, экспорт и таможня", "Import, eksport va bojxona", "Import, export and customs", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  "personal-data": scenario("digital", "Персональные данные и онлайн-мошенничество", "Shaxsiy ma’lumotlar va onlayn firibgarlik", "Personal data and online fraud", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "digital-service": scenario("digital", "IT-услуги, домены и e-commerce", "IT-xizmatlar, domenlar va e-commerce", "IT services, domains and e-commerce"),
  "intellectual-property": scenario("digital", "Авторское право и товарный знак", "Mualliflik huquqi va tovar belgisi", "Copyright and trade marks", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  education: scenario("digital", "Образование, договор и права учащегося", "Ta’lim, shartnoma va o‘quvchi huquqlari", "Education, contracts and student rights"),
  healthcare: scenario("digital", "Медицинские документы и услуги", "Tibbiy hujjatlar va xizmatlar", "Medical records and services", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  other: scenario("other", "Другая ситуация", "Boshqa vaziyat", "Another matter"),
} as const satisfies Record<string, Scenario>;

export type CaseScenarioId = keyof typeof CASE_SCENARIOS;

/** IDs emitted by the five-scenario catalogue before the direction migration. */
export const LEGACY_CASE_SCENARIO_MIGRATIONS = {
  "unpaid-salary": "unpaid-salary",
  debt: "debt",
  consumer: "consumer",
  "contract-breach": "contract-breach",
  "debt-recovery": "debt-recovery",
} as const satisfies Record<string, CaseScenarioId>;

export function isCaseScenarioId(value: string): value is CaseScenarioId {
  return Object.prototype.hasOwnProperty.call(CASE_SCENARIOS, value);
}

export const caseCreateInputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2_000).optional(),
  legalArea: z.string().trim().refine(isCaseScenarioId, "Unknown case scenario"),
  locale: z.enum(["ru", "uz", "en"]),
  accountType: z.enum(["individual", "entrepreneur", "lawyer", "business"]),
}).strict().refine(
  (input) => isCaseScenarioId(input.legalArea)
    && caseScenarioMatchesAccount(input.legalArea, input.accountType),
  { path: ["legalArea"], message: "Scenario is not available for this account type" },
);

export function caseScenarioMatchesAccount(id: CaseScenarioId, accountType: AccountType): boolean {
  const audience = CASE_SCENARIOS[id].audience;
  return audience === "all" || accountType === "business" || accountType === "entrepreneur" || accountType === "lawyer";
}

export function caseDirectionsForAccount(accountType: AccountType) {
  return (Object.entries(CASE_DIRECTIONS) as Array<[CaseDirectionId, Localized]>).filter(([direction]) =>
    (Object.entries(CASE_SCENARIOS) as Array<[CaseScenarioId, Scenario]>).some(([id, scenario]) =>
      scenario.direction === direction && caseScenarioMatchesAccount(id, accountType),
    ),
  ).map(([id, label]) => ({ id, ...label }));
}

export function caseScenariosForAccount(accountType: AccountType, direction?: CaseDirectionId) {
  return (Object.entries(CASE_SCENARIOS) as Array<[CaseScenarioId, Scenario]>)
    .filter(([id, scenario]) => caseScenarioMatchesAccount(id, accountType) && (!direction || scenario.direction === direction))
    .map(([id, scenario]) => ({
      id,
      direction: scenario.direction,
      risk: scenario.risk,
      requiresLawyerReview: scenario.requiresLawyerReview,
      sourceAuthority: scenario.sourceAuthority,
      ...scenario.label,
    }));
}

export function caseScenarioSteps(id: CaseScenarioId, locale: PlatformLocale): readonly string[] {
  return CASE_SCENARIOS[id].steps[locale];
}
