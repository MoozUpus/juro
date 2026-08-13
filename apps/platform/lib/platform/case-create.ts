import { z } from "zod";

import type { AccountType, PlatformLocale } from "./routing";

type Localized = { ru: string; uz: string };
type ScenarioAudience = "all" | "business";
type ScenarioRisk = "standard" | "elevated";

export const CASE_DIRECTIONS = {
  employment: { ru: "Работа и трудовые отношения", uz: "Mehnat va ish munosabatlari" },
  family: { ru: "Семья и наследство", uz: "Oila va meros" },
  housing: { ru: "Жильё, земля и ЖКХ", uz: "Uy-joy, yer va kommunal xizmatlar" },
  civil: { ru: "Долги, договоры и защита потребителей", uz: "Qarzlar, shartnomalar va iste’molchi huquqlari" },
  business: { ru: "Бизнес и корпоративные вопросы", uz: "Biznes va korporativ masalalar" },
  finance: { ru: "Налоги, банки и финансы", uz: "Soliqlar, banklar va moliya" },
  justice: { ru: "Суд, государственные органы и исполнение", uz: "Sud, davlat organlari va ijro" },
  migration: { ru: "Миграция, гражданство и госуслуги", uz: "Migratsiya, fuqarolik va davlat xizmatlari" },
  transport: { ru: "Транспорт, таможня и имущество", uz: "Transport, bojxona va mol-mulk" },
  digital: { ru: "Цифровые права, IP, образование и здоровье", uz: "Raqamli huquqlar, IP, ta’lim va sog‘liq" },
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
  options: Pick<Scenario, "audience" | "risk" | "requiresLawyerReview"> = {
    audience: "all",
    risk: "standard",
    requiresLawyerReview: false,
  },
): Scenario {
  return {
    direction,
    ...options,
    label: { ru, uz },
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
    },
    sourceAuthority: "lex.uz",
  };
}

/**
 * Editorial catalogue modelled on Advice.uz topic navigation, but it contains
 * no Advice.uz URLs or legal conclusions. User-facing legal sources stay Lex.uz.
 */
export const CASE_SCENARIOS = {
  "unpaid-salary": scenario("employment", "Невыплата заработной платы", "Ish haqi to‘lanmasligi"),
  "unlawful-dismissal": scenario("employment", "Незаконное увольнение", "Noqonuniy ishdan bo‘shatish", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "leave-and-benefits": scenario("employment", "Отпуск, пособия и выплаты", "Ta’til, nafaqa va to‘lovlar"),
  "employment-contract": scenario("employment", "Трудовой договор и изменение условий", "Mehnat shartnomasi va shartlarni o‘zgartirish"),
  "workplace-harm": scenario("employment", "Вред на работе и компенсация", "Ishdagi zarar va kompensatsiya", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  divorce: scenario("family", "Развод", "Ajrashish", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  alimony: scenario("family", "Алименты", "Aliment"),
  "child-residence": scenario("family", "Дети: место проживания и общение", "Bolalar: yashash joyi va muloqot", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "marital-property": scenario("family", "Раздел имущества супругов", "Er-xotin mol-mulkini bo‘lish", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  inheritance: scenario("family", "Наследство и принятие наследства", "Meros va merosni qabul qilish", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  "residential-lease": scenario("housing", "Аренда жилья и выселение", "Uy-joy ijarasi va ko‘chirish"),
  "property-registration": scenario("housing", "Покупка, продажа и регистрация жилья", "Uy-joyni sotib olish, sotish va ro‘yxatdan o‘tkazish", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  utilities: scenario("housing", "Коммунальные услуги и начисления", "Kommunal xizmatlar va hisob-kitoblar"),
  "land-rights": scenario("housing", "Земельный участок и права на землю", "Yer uchastkasi va yer huquqlari", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  construction: scenario("housing", "Строительство, реконструкция и разрешения", "Qurilish, rekonstruksiya va ruxsatlar", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  debt: scenario("civil", "Возврат долга по расписке", "Tilxat bo‘yicha qarzni qaytarish"),
  "contract-breach": scenario("civil", "Нарушение договора", "Shartnoma buzilishi"),
  "property-damage": scenario("civil", "Возмещение имущественного ущерба", "Mol-mulk zararini qoplash"),
  consumer: scenario("civil", "Возврат товара, гарантия и качество услуг", "Tovarni qaytarish, kafolat va xizmat sifati"),
  insurance: scenario("civil", "Страховой случай и выплата", "Sug‘urta hodisasi va to‘lov"),

  "business-registration": scenario("business", "Регистрация бизнеса и выбор формы", "Biznesni ro‘yxatdan o‘tkazish va shakl tanlash", { audience: "business", risk: "standard", requiresLawyerReview: false }),
  "commercial-contract": scenario("business", "Коммерческий договор и оплата", "Tijorat shartnomasi va to‘lov", { audience: "business", risk: "standard", requiresLawyerReview: false }),
  // Stable legacy ID kept so saved cases and inbound links from the previous
  // catalogue remain resolvable after the direction catalogue migration.
  "debt-recovery": scenario("business", "Взыскание задолженности", "Qarzdorlikni undirish", { audience: "business", risk: "elevated", requiresLawyerReview: true }),
  "founder-dispute": scenario("business", "Спор учредителей или участников", "Ta’sischilar yoki ishtirokchilar nizosi", { audience: "business", risk: "elevated", requiresLawyerReview: true }),
  "licence-inspection": scenario("business", "Лицензия, разрешение или проверка", "Litsenziya, ruxsatnoma yoki tekshiruv", { audience: "business", risk: "elevated", requiresLawyerReview: true }),
  "business-reorganisation": scenario("business", "Закрытие или реорганизация бизнеса", "Biznesni yopish yoki qayta tashkil etish", { audience: "business", risk: "elevated", requiresLawyerReview: true }),

  "tax-dispute": scenario("finance", "Налоговая задолженность, возврат или спор", "Soliq qarzdorligi, qaytarish yoki nizo", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "bank-payment": scenario("finance", "Банковская карта, перевод или платёж", "Bank kartasi, o‘tkazma yoki to‘lov"),
  credit: scenario("finance", "Кредит, микрозайм и реструктуризация", "Kredit, mikroqarz va qayta tuzish", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  enforcement: scenario("finance", "Исполнительное производство", "Ijro ishi", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  insolvency: scenario("finance", "Финансовая неплатёжеспособность", "Moliyaviy to‘lovga qodir emaslik", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  "government-appeal": scenario("justice", "Жалоба на решение или бездействие органа", "Organ qarori yoki harakatsizligi ustidan shikoyat"),
  "administrative-fine": scenario("justice", "Административный штраф", "Ma’muriy jarima"),
  "civil-claim": scenario("justice", "Подготовка гражданского иска", "Fuqarolik da’vosini tayyorlash", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  appeal: scenario("justice", "Апелляция и процессуальный срок", "Apellyatsiya va protsessual muddat", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "asset-arrest": scenario("justice", "Арест имущества или действия исполнителя", "Mol-mulkni xatlash yoki ijrochi harakatlari", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  "identity-records": scenario("migration", "Паспорт, ID и ЗАГС", "Pasport, ID va FHDYO"),
  citizenship: scenario("migration", "Гражданство и постоянное проживание", "Fuqarolik va doimiy yashash", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "foreigner-status": scenario("migration", "Виза, регистрация и статус иностранца", "Viza, ro‘yxatdan o‘tish va chet el fuqarosi maqomi", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "state-service": scenario("migration", "Отказ или ошибка в госуслуге", "Davlat xizmatidagi rad javobi yoki xato"),
  "social-support": scenario("migration", "Пособие, пенсия и инвалидность", "Nafaqa, pensiya va nogironlik", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  "road-incident": scenario("transport", "ДТП и страхование", "YTH va sug‘urta", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "traffic-fine": scenario("transport", "Штрафы и обжалование", "Jarimalar va shikoyat qilish"),
  vehicle: scenario("transport", "Покупка, продажа или регистрация автомобиля", "Avtomobilni sotib olish, sotish yoki ro‘yxatdan o‘tkazish"),
  carriage: scenario("transport", "Транспортные услуги и перевозка", "Transport xizmatlari va tashish"),
  customs: scenario("transport", "Импорт, экспорт и таможня", "Import, eksport va bojxona", { audience: "all", risk: "elevated", requiresLawyerReview: true }),

  "personal-data": scenario("digital", "Персональные данные и онлайн-мошенничество", "Shaxsiy ma’lumotlar va onlayn firibgarlik", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  "digital-service": scenario("digital", "IT-услуги, домены и e-commerce", "IT-xizmatlar, domenlar va e-commerce"),
  "intellectual-property": scenario("digital", "Авторское право и товарный знак", "Mualliflik huquqi va tovar belgisi", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
  education: scenario("digital", "Образование, договор и права учащегося", "Ta’lim, shartnoma va o‘quvchi huquqlari"),
  healthcare: scenario("digital", "Медицинские документы и услуги", "Tibbiy hujjatlar va xizmatlar", { audience: "all", risk: "elevated", requiresLawyerReview: true }),
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
  locale: z.enum(["ru", "uz"]),
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
