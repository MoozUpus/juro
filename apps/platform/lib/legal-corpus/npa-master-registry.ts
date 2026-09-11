/**
 * The bounded P0 corpus.  These entries are identity targets, never asserted
 * source metadata: a target becomes usable only after `npa-registry` has
 * independently verified a canonical LexUZ card and its consolidated text.
 */
/** Reference date for the first controlled run. Runtime decisions must use
 * `npaAsOfDate()` so a deployed worker never silently freezes the law. */
export const NPA_BASELINE_AS_OF_DATE = "2026-09-11";
export const NPA_TIME_ZONE = "Asia/Tashkent";

export function npaAsOfDate(now = new Date()): string {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: NPA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export type NpaActType =
  | "constitution"
  | "code"
  | "law"
  | "presidential_decree"
  | "presidential_resolution"
  | "cabinet_resolution"
  | "departmental_npa";

export type NpaTarget = Readonly<{
  documentKey: string;
  titleRu: string;
  shortTitle: string;
  actType: NpaActType;
  expectedActNumber: string | null;
  expectedAdoptionDate: string | null;
  /** Catalog position; only 1–100 is part of the P0 ingestion contract. */
  registryPosition: number | null;
  knowledgeLayer: 1 | 2 | null;
  /** Extra, explicitly reviewed historic/current Lex labels. */
  titleAliases?: readonly string[];
  /** A source URL is merely an acquisition hint and is re-verified. */
  verifiedSourceSeed?: string;
  successorDocumentKey?: string;
  replacesDocumentKey?: string;
}>;

type TargetInput = Omit<NpaTarget, "actType" | "registryPosition" | "knowledgeLayer"> & {
  actType?: NpaTarget["actType"];
  registryPosition?: number | null;
  knowledgeLayer?: 1 | 2 | null;
};
const npa = (input: TargetInput): NpaTarget => ({
  ...input,
  actType: input.actType ?? "law",
  registryPosition: input.registryPosition ?? null,
  knowledgeLayer: input.knowledgeLayer ?? null,
});

/** Exactly the 100 acts requested for JURO's first production corpus. */
const NPA_LAYER_1_RAW = [
  npa({ documentKey: "constitution_2023", titleRu: "Конституция Республики Узбекистан", shortTitle: "Конституция", actType: "constitution", expectedActNumber: null, expectedAdoptionDate: "2023-04-30" }),
  npa({ documentKey: "civil_code_part_1", titleRu: "Гражданский кодекс Республики Узбекистан (часть первая)", shortTitle: "ГК, часть I", actType: "code", expectedActNumber: "163-I", expectedAdoptionDate: "1995-12-21", verifiedSourceSeed: "https://lex.uz/ru/docs/111189", titleAliases: ["Гражданский кодекс Республики Узбекистан"] }),
  npa({ documentKey: "civil_code_part_2", titleRu: "Гражданский кодекс Республики Узбекистан (часть вторая)", shortTitle: "ГК, часть II", actType: "code", expectedActNumber: "256-I", expectedAdoptionDate: "1996-08-29" }),
  npa({ documentKey: "labor_code", titleRu: "Трудовой кодекс Республики Узбекистан", shortTitle: "Трудовой кодекс", actType: "code", expectedActNumber: "ЗРУ-798", expectedAdoptionDate: "2022-10-28", verifiedSourceSeed: "https://lex.uz/ru/docs/6257291" }),
  npa({ documentKey: "tax_code", titleRu: "Налоговый кодекс Республики Узбекистан", shortTitle: "Налоговый кодекс", actType: "code", expectedActNumber: "ЗРУ-599", expectedAdoptionDate: "2019-12-30", verifiedSourceSeed: "https://lex.uz/ru/docs/4674902" }),
  npa({ documentKey: "customs_code", titleRu: "Таможенный кодекс Республики Узбекистан", shortTitle: "Таможенный кодекс", actType: "code", expectedActNumber: "ЗРУ-400", expectedAdoptionDate: "2016-01-20" }),
  npa({ documentKey: "family_code", titleRu: "Семейный кодекс Республики Узбекистан", shortTitle: "Семейный кодекс", actType: "code", expectedActNumber: "607-I", expectedAdoptionDate: "1998-04-30", verifiedSourceSeed: "https://lex.uz/ru/docs/104723" }),
  npa({ documentKey: "housing_code", titleRu: "Жилищный кодекс Республики Узбекистан", shortTitle: "Жилищный кодекс", actType: "code", expectedActNumber: "713-I", expectedAdoptionDate: "1998-12-24" }),
  npa({ documentKey: "land_code", titleRu: "Земельный кодекс Республики Узбекистан", shortTitle: "Земельный кодекс", actType: "code", expectedActNumber: "598-I", expectedAdoptionDate: "1998-04-30", verifiedSourceSeed: "https://lex.uz/ru/docs/149947" }),
  npa({ documentKey: "urban_planning_code", titleRu: "Градостроительный кодекс Республики Узбекистан", shortTitle: "Градостроительный кодекс", actType: "code", expectedActNumber: "ЗРУ-676", expectedAdoptionDate: "2021-02-22" }),
  npa({ documentKey: "budget_code", titleRu: "Бюджетный кодекс Республики Узбекистан", shortTitle: "Бюджетный кодекс", actType: "code", expectedActNumber: "ЗРУ-360", expectedAdoptionDate: "2013-12-26", verifiedSourceSeed: "https://lex.uz/ru/docs/2304140" }),
  npa({ documentKey: "civil_procedure_code", titleRu: "Гражданский процессуальный кодекс Республики Узбекистан", shortTitle: "ГПК", actType: "code", expectedActNumber: "ЗРУ-460", expectedAdoptionDate: "2018-01-22", verifiedSourceSeed: "https://lex.uz/ru/docs/3517334" }),
  npa({ documentKey: "economic_procedure_code", titleRu: "Экономический процессуальный кодекс Республики Узбекистан", shortTitle: "ЭПК", actType: "code", expectedActNumber: "ЗРУ-461", expectedAdoptionDate: "2018-01-24" }),
  npa({ documentKey: "administrative_court_procedure_code", titleRu: "Кодекс Республики Узбекистан об административном судопроизводстве", shortTitle: "КАС", actType: "code", expectedActNumber: "ЗРУ-462", expectedAdoptionDate: "2018-01-25", verifiedSourceSeed: "https://lex.uz/ru/docs/3527365" }),
  npa({ documentKey: "administrative_responsibility_code", titleRu: "Кодекс Республики Узбекистан об административной ответственности", shortTitle: "КоАО", actType: "code", expectedActNumber: "2015-XII", expectedAdoptionDate: "1994-09-22", verifiedSourceSeed: "https://lex.uz/ru/docs/97664" }),
  npa({ documentKey: "criminal_code", titleRu: "Уголовный кодекс Республики Узбекистан", shortTitle: "УК", actType: "code", expectedActNumber: "2012-XII", expectedAdoptionDate: "1994-09-22", verifiedSourceSeed: "https://lex.uz/ru/docs/111457" }),
  npa({ documentKey: "criminal_procedure_code", titleRu: "Уголовно-процессуальный кодекс Республики Узбекистан", shortTitle: "УПК", actType: "code", expectedActNumber: "2013-XII", expectedAdoptionDate: "1994-09-22", verifiedSourceSeed: "https://lex.uz/ru/docs/111463" }),
  npa({ documentKey: "criminal_execution_code", titleRu: "Уголовно-исполнительный кодекс Республики Узбекистан", shortTitle: "УИК", actType: "code", expectedActNumber: "409-I", expectedAdoptionDate: "1997-04-25", verifiedSourceSeed: "https://lex.uz/ru/docs/163627" }),

  npa({ documentKey: "limited_liability_companies", titleRu: "Об обществах с ограниченной и дополнительной ответственностью", shortTitle: "ООО и ОДО", expectedActNumber: "310-II", expectedAdoptionDate: "2001-12-06", titleAliases: ["Об обществах с ограниченной ответственностью"] }),
  npa({ documentKey: "joint_stock_companies", titleRu: "Об акционерных обществах и защите прав акционеров", shortTitle: "Об АО", expectedActNumber: "ЗРУ-370", expectedAdoptionDate: "2014-05-06" }),
  npa({ documentKey: "business_partnerships", titleRu: "О хозяйственных товариществах", shortTitle: "О хозяйственных товариществах", expectedActNumber: "308-II", expectedAdoptionDate: "2001-12-06" }),
  npa({ documentKey: "private_enterprise", titleRu: "О частном предприятии", shortTitle: "О частном предприятии", expectedActNumber: "558-II", expectedAdoptionDate: "2003-12-11" }),
  npa({ documentKey: "family_business", titleRu: "О семейном предпринимательстве", shortTitle: "О семейном предпринимательстве", expectedActNumber: "ЗРУ-327", expectedAdoptionDate: "2012-04-26" }),
  npa({ documentKey: "entrepreneurship_freedom_guarantees", titleRu: "О гарантиях свободы предпринимательской деятельности", shortTitle: "Гарантии предпринимательства", expectedActNumber: "ЗРУ-328", expectedAdoptionDate: "2012-05-02" }),
  npa({ documentKey: "licensing_permits_notifications", titleRu: "О лицензировании, разрешительных и уведомительных процедурах", shortTitle: "Лицензирование", expectedActNumber: "ЗРУ-701", expectedAdoptionDate: "2021-07-14" }),
  npa({ documentKey: "competition", titleRu: "О конкуренции", shortTitle: "О конкуренции", expectedActNumber: "ЗРУ-850", expectedAdoptionDate: "2023-07-03" }),
  npa({ documentKey: "consumer_protection", titleRu: "О защите прав потребителей", shortTitle: "Защита потребителей", expectedActNumber: "221-I", expectedAdoptionDate: "1996-04-26" }),
  npa({ documentKey: "advertising", titleRu: "О рекламе", shortTitle: "О рекламе", expectedActNumber: "ЗРУ-776", expectedAdoptionDate: "2022-06-07" }),
  npa({ documentKey: "insolvency", titleRu: "О неплатежеспособности", shortTitle: "О неплатежеспособности", expectedActNumber: "ЗРУ-763", expectedAdoptionDate: "2022-04-12" }),
  npa({ documentKey: "accounting", titleRu: "О бухгалтерском учете", shortTitle: "Бухгалтерский учет", expectedActNumber: "ЗРУ-404", expectedAdoptionDate: "2016-04-13" }),
  npa({ documentKey: "audit", titleRu: "Об аудиторской деятельности", shortTitle: "Аудиторская деятельность", expectedActNumber: "ЗРУ-677", expectedAdoptionDate: "2021-02-25" }),
  npa({ documentKey: "public_procurement", titleRu: "О государственных закупках", shortTitle: "Госзакупки", expectedActNumber: "ЗРУ-684", expectedAdoptionDate: "2021-04-22" }),
  npa({ documentKey: "public_private_partnership", titleRu: "О государственно-частном партнерстве", shortTitle: "ГЧП", expectedActNumber: "ЗРУ-537", expectedAdoptionDate: "2019-05-10" }),
  npa({ documentKey: "investments", titleRu: "Об инвестициях и инвестиционной деятельности", shortTitle: "Инвестиции", expectedActNumber: "ЗРУ-598", expectedAdoptionDate: "2019-12-25" }),
  npa({ documentKey: "special_economic_zones", titleRu: "О специальных экономических зонах", shortTitle: "СЭЗ", expectedActNumber: "ЗРУ-604", expectedAdoptionDate: "2020-02-17" }),
  npa({ documentKey: "commercial_secret", titleRu: "О коммерческой тайне", shortTitle: "Коммерческая тайна", expectedActNumber: "ЗРУ-374", expectedAdoptionDate: "2014-09-11" }),

  npa({ documentKey: "international_commercial_arbitration", titleRu: "О международном коммерческом арбитраже", shortTitle: "Международный арбитраж", expectedActNumber: "ЗРУ-674", expectedAdoptionDate: "2021-02-16" }),
  npa({ documentKey: "arbitration_courts", titleRu: "О третейских судах", shortTitle: "Третейские суды", expectedActNumber: "ЗРУ-64", expectedAdoptionDate: "2006-10-16" }),
  npa({ documentKey: "mediation", titleRu: "О медиации", shortTitle: "Медиация", expectedActNumber: "ЗРУ-482", expectedAdoptionDate: "2018-07-03" }),
  npa({ documentKey: "enforcement_of_acts", titleRu: "Об исполнении судебных актов и актов иных органов", shortTitle: "Исполнение актов", expectedActNumber: "258-II", expectedAdoptionDate: "2001-08-29" }),
  npa({ documentKey: "state_duty", titleRu: "О государственной пошлине", shortTitle: "Государственная пошлина", expectedActNumber: "ЗРУ-600", expectedAdoptionDate: "2020-01-06" }),
  npa({ documentKey: "administrative_procedures", titleRu: "Об административных процедурах", shortTitle: "Административные процедуры", expectedActNumber: "ЗРУ-457", expectedAdoptionDate: "2018-01-08" }),
  npa({ documentKey: "appeals_of_persons", titleRu: "Об обращениях физических и юридических лиц", shortTitle: "Обращения", expectedActNumber: "ЗРУ-445", expectedAdoptionDate: "2017-09-11" }),
  npa({ documentKey: "normative_legal_acts", titleRu: "О нормативно-правовых актах", shortTitle: "НПА", expectedActNumber: "ЗРУ-682", expectedAdoptionDate: "2021-04-20" }),
  npa({ documentKey: "courts", titleRu: "О судах", shortTitle: "О судах", expectedActNumber: "ЗРУ-703", expectedAdoptionDate: "2021-07-28" }),
  npa({ documentKey: "notariat", titleRu: "О нотариате", shortTitle: "Нотариат", expectedActNumber: "343-I", expectedAdoptionDate: "1996-12-26" }),
  npa({ documentKey: "advocacy", titleRu: "Об адвокатуре", shortTitle: "Адвокатура", expectedActNumber: "349-I", expectedAdoptionDate: "1996-12-27" }),
  npa({ documentKey: "advocate_guarantees", titleRu: "О гарантиях адвокатской деятельности и социальной защите адвокатов", shortTitle: "Гарантии адвокатов", expectedActNumber: "721-I", expectedAdoptionDate: "1998-12-25" }),
  npa({ documentKey: "real_estate_rights_registration", titleRu: "О государственной регистрации прав на недвижимое имущество", shortTitle: "Регистрация недвижимости", expectedActNumber: "ЗРУ-803", expectedAdoptionDate: "2022-11-28" }),
  npa({ documentKey: "privatization_state_property", titleRu: "О приватизации государственного имущества", shortTitle: "Приватизация", expectedActNumber: "ЗРУ-907", expectedAdoptionDate: "2024-02-14" }),
  npa({ documentKey: "apartment_building_management", titleRu: "Об управлении многоквартирными домами", shortTitle: "Управление МКД", expectedActNumber: "ЗРУ-581", expectedAdoptionDate: "2019-11-07" }),
  npa({ documentKey: "mortgage", titleRu: "Об ипотеке", shortTitle: "Ипотека", expectedActNumber: "ЗРУ-58", expectedAdoptionDate: "2006-10-04" }),
  npa({ documentKey: "pledge", titleRu: "О залоге", shortTitle: "Залог", expectedActNumber: "614-I", expectedAdoptionDate: "1998-05-01" }),
  npa({ documentKey: "leasing", titleRu: "О лизинге", shortTitle: "Лизинг", expectedActNumber: "756-I", expectedAdoptionDate: "1999-04-14" }),
  npa({ documentKey: "valuation_activity", titleRu: "Об оценочной деятельности", shortTitle: "Оценочная деятельность", expectedActNumber: "811-I", expectedAdoptionDate: "1999-08-19" }),
  npa({ documentKey: "realtor_activity_2010", titleRu: "О риэлторской деятельности", shortTitle: "Риэлторская деятельность", expectedActNumber: "ЗРУ-269", expectedAdoptionDate: "2010-12-22", verifiedSourceSeed: "https://lex.uz/ru/docs/1714039", successorDocumentKey: "realtor_activity_2026" }),
  npa({ documentKey: "private_property_protection", titleRu: "О защите частной собственности и гарантиях прав собственников", shortTitle: "Защита частной собственности", expectedActNumber: "ЗРУ-336", expectedAdoptionDate: "2012-09-24" }),

  npa({ documentKey: "central_bank", titleRu: "О Центральном банке Республики Узбекистан", shortTitle: "Центральный банк", expectedActNumber: "ЗРУ-582", expectedAdoptionDate: "2019-11-11" }),
  npa({ documentKey: "banks_and_banking", titleRu: "О банках и банковской деятельности", shortTitle: "Банки", expectedActNumber: "ЗРУ-580", expectedAdoptionDate: "2019-11-05" }),
  npa({ documentKey: "payments_and_payment_systems", titleRu: "О платежах и платежных системах", shortTitle: "Платежные системы", expectedActNumber: "ЗРУ-578", expectedAdoptionDate: "2019-11-01" }),
  npa({ documentKey: "currency_regulation", titleRu: "О валютном регулировании", shortTitle: "Валютное регулирование", expectedActNumber: "ЗРУ-573", expectedAdoptionDate: "2019-10-22" }),
  npa({ documentKey: "securities_market", titleRu: "О рынке ценных бумаг", shortTitle: "Рынок ценных бумаг", expectedActNumber: "ЗРУ-387", expectedAdoptionDate: "2015-06-03" }),
  npa({ documentKey: "investment_and_unit_funds", titleRu: "Об инвестиционных и паевых фондах", shortTitle: "Инвестиционные фонды", expectedActNumber: "ЗРУ-392", expectedAdoptionDate: "2015-08-25" }),
  npa({ documentKey: "insurance_activity", titleRu: "О страховой деятельности", shortTitle: "Страхование", expectedActNumber: "ЗРУ-730", expectedAdoptionDate: "2021-11-23" }),
  npa({ documentKey: "nonbank_credit_and_microfinance", titleRu: "О небанковских кредитных организациях и микрофинансовой деятельности", shortTitle: "НКО и микрофинансирование", expectedActNumber: "ЗРУ-765", expectedAdoptionDate: "2022-04-20" }),
  npa({ documentKey: "credit_information_exchange", titleRu: "Об обмене кредитной информацией", shortTitle: "Кредитная информация", expectedActNumber: "ЗРУ-301", expectedAdoptionDate: "2011-10-04" }),
  npa({ documentKey: "consumer_credit", titleRu: "О потребительском кредите", shortTitle: "Потребительский кредит", expectedActNumber: "ЗРУ-33", expectedAdoptionDate: "2006-05-06" }),
  npa({ documentKey: "banking_secrecy", titleRu: "О банковской тайне", shortTitle: "Банковская тайна", expectedActNumber: "530-II", expectedAdoptionDate: "2003-08-30" }),
  npa({ documentKey: "aml_cft", titleRu: "О противодействии легализации доходов, полученных от преступной деятельности, финансированию терроризма и финансированию распространения оружия массового уничтожения", shortTitle: "ПОД/ФТ/ФРОМУ", expectedActNumber: "660-II", expectedAdoptionDate: "2004-08-26" }),
  npa({ documentKey: "bank_deposit_protection", titleRu: "О гарантиях защиты вкладов в банках", shortTitle: "Защита вкладов", expectedActNumber: "ЗРУ-1031", expectedAdoptionDate: "2025-02-18" }),
  npa({ documentKey: "mandatory_motor_liability_insurance", titleRu: "Об обязательном страховании гражданской ответственности владельцев транспортных средств", shortTitle: "ОСАГО", expectedActNumber: "ЗРУ-155", expectedAdoptionDate: "2008-04-21" }),

  npa({ documentKey: "informatization", titleRu: "Об информатизации", shortTitle: "Информатизация", expectedActNumber: "560-II", expectedAdoptionDate: "2003-12-11" }),
  npa({ documentKey: "electronic_commerce", titleRu: "Об электронной коммерции", shortTitle: "Электронная коммерция", expectedActNumber: "ЗРУ-792", expectedAdoptionDate: "2022-09-29" }),
  npa({ documentKey: "electronic_document_management", titleRu: "Об электронном документообороте", shortTitle: "ЭДО", expectedActNumber: "611-II", expectedAdoptionDate: "2004-04-29" }),
  npa({ documentKey: "electronic_digital_signature", titleRu: "Об электронной цифровой подписи", shortTitle: "ЭЦП", expectedActNumber: "ЗРУ-793", expectedAdoptionDate: "2022-10-12" }),
  npa({ documentKey: "personal_data", titleRu: "О персональных данных", shortTitle: "Персональные данные", expectedActNumber: "ЗРУ-547", expectedAdoptionDate: "2019-07-02" }),
  npa({ documentKey: "cybersecurity", titleRu: "О кибербезопасности", shortTitle: "Кибербезопасность", expectedActNumber: "ЗРУ-764", expectedAdoptionDate: "2022-04-15" }),
  npa({ documentKey: "electronic_government", titleRu: "Об электронном правительстве", shortTitle: "Электронное правительство", expectedActNumber: "ЗРУ-395", expectedAdoptionDate: "2015-12-09" }),
  npa({ documentKey: "telecommunications", titleRu: "О телекоммуникациях", shortTitle: "Телекоммуникации", expectedActNumber: "822-I", expectedAdoptionDate: "1999-08-20" }),
  npa({ documentKey: "freedom_of_access_to_information", titleRu: "О свободе доступа к информации", shortTitle: "Доступ к информации", expectedActNumber: "400-I", expectedAdoptionDate: "1997-04-24" }),
  npa({ documentKey: "copyright_and_related_rights", titleRu: "Об авторском праве и смежных правах", shortTitle: "Авторское право", expectedActNumber: "ЗРУ-42", expectedAdoptionDate: "2006-07-20" }),
  npa({ documentKey: "inventions_models_designs", titleRu: "Об изобретениях, полезных моделях и промышленных образцах", shortTitle: "Патенты", expectedActNumber: "397-II", expectedAdoptionDate: "2002-08-29" }),
  npa({ documentKey: "trademarks", titleRu: "О товарных знаках, знаках обслуживания и наименованиях мест происхождения товаров", shortTitle: "Товарные знаки", expectedActNumber: "267-II", expectedAdoptionDate: "2001-08-30" }),
  npa({ documentKey: "computer_programs_and_databases", titleRu: "О правовой охране программ для электронных вычислительных машин и баз данных", shortTitle: "Программы и БД", expectedActNumber: "1060-XII", expectedAdoptionDate: "1994-05-06" }),
  npa({ documentKey: "firm_names", titleRu: "О фирменных наименованиях", shortTitle: "Фирменные наименования", expectedActNumber: "ЗРУ-51", expectedAdoptionDate: "2006-09-18" }),

  npa({ documentKey: "employment", titleRu: "О занятости населения", shortTitle: "Занятость", expectedActNumber: "ЗРУ-642", expectedAdoptionDate: "2020-10-20" }),
  npa({ documentKey: "labor_protection", titleRu: "Об охране труда", shortTitle: "Охрана труда", expectedActNumber: "ЗРУ-410", expectedAdoptionDate: "2016-09-22" }),
  npa({ documentKey: "trade_unions", titleRu: "О профессиональных союзах", shortTitle: "Профсоюзы", expectedActNumber: "ЗРУ-588", expectedAdoptionDate: "2019-12-06" }),
  npa({ documentKey: "private_employment_agencies", titleRu: "О частных агентствах занятости", shortTitle: "Частные агентства занятости", expectedActNumber: "ЗРУ-501", expectedAdoptionDate: "2018-10-16" }),
  npa({ documentKey: "state_pension_provision", titleRu: "О государственном пенсионном обеспечении граждан", shortTitle: "Пенсионное обеспечение", expectedActNumber: "938-XII", expectedAdoptionDate: "1993-09-03" }),
  npa({ documentKey: "rights_of_persons_with_disabilities", titleRu: "О правах лиц с инвалидностью", shortTitle: "Права лиц с инвалидностью", expectedActNumber: "ЗРУ-641", expectedAdoptionDate: "2020-10-15" }),
  npa({ documentKey: "child_rights_guarantees", titleRu: "О гарантиях прав ребенка", shortTitle: "Права ребенка", expectedActNumber: "ЗРУ-139", expectedAdoptionDate: "2008-01-07" }),
  npa({ documentKey: "guardianship_and_trusteeship", titleRu: "Об опеке и попечительстве", shortTitle: "Опека и попечительство", expectedActNumber: "ЗРУ-364", expectedAdoptionDate: "2014-01-02" }),
  npa({ documentKey: "education", titleRu: "Об образовании", shortTitle: "Образование", expectedActNumber: "ЗРУ-637", expectedAdoptionDate: "2020-09-23" }),
  npa({ documentKey: "citizenship", titleRu: "О гражданстве Республики Узбекистан", shortTitle: "Гражданство", expectedActNumber: "ЗРУ-610", expectedAdoptionDate: "2020-03-13" }),
  npa({ documentKey: "legal_status_of_foreigners", titleRu: "О правовом положении иностранных граждан и лиц без гражданства в Республике Узбекистан", shortTitle: "Статус иностранцев", expectedActNumber: "ЗРУ-692", expectedAdoptionDate: "2021-06-04" }),
  npa({ documentKey: "protection_of_women_from_harassment_violence", titleRu: "О защите женщин от притеснения и насилия", shortTitle: "Защита женщин", expectedActNumber: "ЗРУ-561", expectedAdoptionDate: "2019-09-02" }),
  npa({ documentKey: "equal_rights_women_men", titleRu: "О гарантиях равных прав и возможностей для женщин и мужчин", shortTitle: "Равные права", expectedActNumber: "ЗРУ-562", expectedAdoptionDate: "2019-09-02" }),
  npa({ documentKey: "road_traffic", titleRu: "О дорожном движении", shortTitle: "Дорожное движение", expectedActNumber: "ЗРУ-900", expectedAdoptionDate: "2024-01-19" }),
  npa({ documentKey: "geographical_indications", titleRu: "О географических указаниях", shortTitle: "Географические указания", expectedActNumber: "ЗРУ-757", expectedAdoptionDate: "2022-03-03" }),
] as const satisfies readonly NpaTarget[];

/** The mandatory first hundred for the production P0 corpus. */
export const NPA_MASTER_TARGETS = NPA_LAYER_1_RAW.map((target, index) => ({
  ...target,
  registryPosition: index + 1,
  knowledgeLayer: 1 as const,
}));

const layer2 = (registryPosition: number, input: Omit<TargetInput, "registryPosition" | "knowledgeLayer">): NpaTarget => npa({
  ...input,
  registryPosition,
  knowledgeLayer: 2,
});

/**
 * Applied Legislation (positions 101–200). These remain target declarations,
 * not legal facts: LexUZ verification must complete before RAG can use them.
 */
export const NPA_LAYER_2_TARGETS = [
  layer2(101, { documentKey: "anti_corruption_2017", titleRu: "О противодействии коррупции", shortTitle: "Противодействие коррупции", expectedActNumber: "ЗРУ-419", expectedAdoptionDate: "2017-01-03" }),
  layer2(102, { documentKey: "conflict_of_interest_2024", titleRu: "О конфликте интересов", shortTitle: "Конфликт интересов", expectedActNumber: "ЗРУ-931", expectedAdoptionDate: "2024-06-05" }),
  layer2(103, { documentKey: "public_control_2018", titleRu: "Об общественном контроле", shortTitle: "Общественный контроль", expectedActNumber: "ЗРУ-474", expectedAdoptionDate: "2018-04-12" }),
  layer2(104, { documentKey: "government_openness_2014", titleRu: "Об открытости деятельности органов государственной власти и управления", shortTitle: "Открытость власти", expectedActNumber: "ЗРУ-369", expectedAdoptionDate: "2014-05-05" }),
  layer2(105, { documentKey: "information_freedom_guarantees", titleRu: "О принципах и гарантиях свободы информации", shortTitle: "Свобода информации", expectedActNumber: "439-II", expectedAdoptionDate: "2002-12-12" }),
  layer2(106, { documentKey: "state_civil_service", titleRu: "О государственной гражданской службе", shortTitle: "Государственная служба", expectedActNumber: "ЗРУ-788", expectedAdoptionDate: "2022-08-08" }),
  layer2(107, { documentKey: "crime_prevention", titleRu: "О профилактике правонарушений", shortTitle: "Профилактика правонарушений", expectedActNumber: "ЗРУ-371", expectedAdoptionDate: "2014-05-14" }),
  layer2(108, { documentKey: "state_legal_aid", titleRu: "Об оказании юридической помощи за счет государства", shortTitle: "Юридическая помощь", expectedActNumber: "ЗРУ-848", expectedAdoptionDate: "2023-06-16" }),
  layer2(109, { documentKey: "residence_registration_2025", titleRu: "О регистрации граждан Республики Узбекистан, иностранных граждан и лиц без гражданства по месту жительства и месту пребывания", shortTitle: "Регистрация по месту жительства", expectedActNumber: "ЗРУ-1074", expectedAdoptionDate: "2025-07-10" }),
  layer2(110, { documentKey: "sanitary_epidemiological_welfare", titleRu: "О санитарно-эпидемиологическом благополучии населения", shortTitle: "Санитарное благополучие", expectedActNumber: "ЗРУ-393", expectedAdoptionDate: "2015-08-26" }),
  layer2(111, { documentKey: "transport_2021", titleRu: "О транспорте", shortTitle: "Транспорт", expectedActNumber: "ЗРУ-706", expectedAdoptionDate: "2021-08-09" }),
  layer2(112, { documentKey: "tourism_2019", titleRu: "О туризме", shortTitle: "Туризм", expectedActNumber: "ЗРУ-549", expectedAdoptionDate: "2019-07-18" }),
  layer2(113, { documentKey: "employer_liability_insurance", titleRu: "Об обязательном страховании гражданской ответственности работодателя", shortTitle: "Страхование работодателя", expectedActNumber: "ЗРУ-210", expectedAdoptionDate: "2009-04-16" }),
  layer2(114, { documentKey: "carrier_liability_insurance", titleRu: "Об обязательном страховании гражданской ответственности перевозчика", shortTitle: "Страхование перевозчика", expectedActNumber: "ЗРУ-386", expectedAdoptionDate: "2015-05-26" }),
  layer2(115, { documentKey: "standardization_2022", titleRu: "О стандартизации", shortTitle: "Стандартизация", expectedActNumber: "ЗРУ-800", expectedAdoptionDate: "2022-11-03" }),
  layer2(116, { documentKey: "technical_regulation_2023", titleRu: "О техническом регулировании", shortTitle: "Техническое регулирование", expectedActNumber: "ЗРУ-819", expectedAdoptionDate: "2023-02-27" }),
  layer2(117, { documentKey: "conformity_assessment_accreditation", titleRu: "Об аккредитации органов по оценке соответствия", shortTitle: "Аккредитация соответствия", expectedActNumber: "ЗРУ-820", expectedAdoptionDate: "2023-02-27" }),
  layer2(118, { documentKey: "metrology_2020", titleRu: "О метрологии", shortTitle: "Метрология", expectedActNumber: "ЗРУ-614", expectedAdoptionDate: "2020-04-07" }),
  layer2(119, { documentKey: "state_land_cadastre", titleRu: "О государственном земельном кадастре", shortTitle: "Земельный кадастр", expectedActNumber: "666-I", expectedAdoptionDate: "1998-08-28" }),
  layer2(120, { documentKey: "mass_media", titleRu: "О средствах массовой информации", shortTitle: "СМИ", expectedActNumber: "ЗРУ-78", expectedAdoptionDate: "2007-01-15" }),
  layer2(121, { documentKey: "water_code_2025", titleRu: "Водный кодекс Республики Узбекистан", shortTitle: "Водный кодекс", actType: "code", expectedActNumber: "ЗРУ-1076", expectedAdoptionDate: "2025-07-30" }),
  layer2(122, { documentKey: "teacher_status", titleRu: "О статусе педагога", shortTitle: "Статус педагога", expectedActNumber: "ЗРУ-901", expectedAdoptionDate: "2024-02-01" }),
  layer2(123, { documentKey: "health_protection", titleRu: "Об охране здоровья граждан", shortTitle: "Охрана здоровья", expectedActNumber: "265-I", expectedAdoptionDate: "1996-08-29" }),
  layer2(124, { documentKey: "railway_transport", titleRu: "О железнодорожном транспорте", shortTitle: "Железнодорожный транспорт", expectedActNumber: "ЗРУ-1006", expectedAdoptionDate: "2024-11-27" }),
  layer2(125, { documentKey: "environmental_expertise_2025", titleRu: "Об экологической экспертизе, оценке воздействия на окружающую среду и стратегической экологической оценке", shortTitle: "Экологическая экспертиза", expectedActNumber: "ЗРУ-1036", expectedAdoptionDate: "2025-02-24" }),

  layer2(126, { documentKey: "cm_66_business_registration", titleRu: "О мерах по реализации постановления Президента Республики Узбекистан от 28 октября 2016 года № ПП-2646", shortTitle: "Регистрация бизнеса", actType: "cabinet_resolution", expectedActNumber: "66", expectedAdoptionDate: "2017-02-09" }),
  layer2(127, { documentKey: "cm_704_voluntary_liquidation", titleRu: "О порядке добровольной ликвидации субъектов предпринимательства и прекращения их деятельности", shortTitle: "Ликвидация бизнеса", actType: "cabinet_resolution", expectedActNumber: "704", expectedAdoptionDate: "2019-08-21" }),
  layer2(128, { documentKey: "cm_80_licensing", titleRu: "Об утверждении Единого положения о порядке лицензирования отдельных видов деятельности посредством специальной электронной системы", shortTitle: "Лицензирование", actType: "cabinet_resolution", expectedActNumber: "80", expectedAdoptionDate: "2022-02-21" }),
  layer2(129, { documentKey: "cm_86_permits", titleRu: "Об утверждении Единого положения о процедурах выдачи отдельных документов разрешительного характера посредством специальной электронной системы", shortTitle: "Разрешительные документы", actType: "cabinet_resolution", expectedActNumber: "86", expectedAdoptionDate: "2022-02-22" }),
  layer2(130, { documentKey: "cm_88_notifications", titleRu: "Об утверждении Единого положения о порядке уведомления уполномоченного органа о начале или прекращении деятельности", shortTitle: "Уведомление о деятельности", actType: "cabinet_resolution", expectedActNumber: "88", expectedAdoptionDate: "2022-02-25" }),
  layer2(131, { documentKey: "pp_374_business_inspections", titleRu: "О совершенствовании порядка координации проведения проверок деятельности субъектов предпринимательства", shortTitle: "Проверки бизнеса", actType: "presidential_resolution", expectedActNumber: "ПП-374", expectedAdoptionDate: "2022-09-13" }),
  layer2(132, { documentKey: "pp_247_individual_entrepreneurs", titleRu: "О создании благоприятных условий для индивидуальных предпринимателей и самозанятых лиц", shortTitle: "ИП и самозанятые", actType: "presidential_resolution", expectedActNumber: "ПП-247", expectedAdoptionDate: "2025-08-12" }),
  layer2(133, { documentKey: "cm_885_ecommerce", titleRu: "О мерах по дальнейшему развитию сферы электронной коммерции в Республике Узбекистан", shortTitle: "Электронная коммерция", actType: "cabinet_resolution", expectedActNumber: "885", expectedAdoptionDate: "2024-12-26" }),
  layer2(134, { documentKey: "cm_943_online_cash_registers", titleRu: "О мерах по обеспечению применения онлайн контрольно-кассовых машин и системы виртуальной кассы", shortTitle: "Онлайн-кассы", actType: "cabinet_resolution", expectedActNumber: "943", expectedAdoptionDate: "2019-11-23" }),
  layer2(135, { documentKey: "cm_489_invoices", titleRu: "О совершенствовании порядка учета и оформления счетов-фактур", shortTitle: "Счета-фактуры", actType: "cabinet_resolution", expectedActNumber: "489", expectedAdoptionDate: "2020-08-14" }),
  layer2(136, { documentKey: "cm_75_retail_trade", titleRu: "Об утверждении Правил розничной торговли в Республике Узбекистан и Правил производства и реализации продукции (услуг) общественного питания", shortTitle: "Розничная торговля", actType: "cabinet_resolution", expectedActNumber: "75", expectedAdoptionDate: "2003-02-13" }),
  layer2(137, { documentKey: "pp_296_consumer_protection", titleRu: "О мерах по организации эффективной защиты прав потребителей", shortTitle: "Защита потребителей", actType: "presidential_resolution", expectedActNumber: "ПП-296", expectedAdoptionDate: "2025-10-06" }),
  layer2(138, { documentKey: "cm_169_state_service_conclusions", titleRu: "О дальнейшем совершенствовании системы оказания государственных услуг по выдаче заключений", shortTitle: "Госуслуги по заключениям", actType: "cabinet_resolution", expectedActNumber: "169", expectedAdoptionDate: "2024-03-29" }),

  layer2(139, { documentKey: "cm_71_land_privatization", titleRu: "О мерах по реализации Закона Республики Узбекистан «О приватизации земельных участков несельскохозяйственного назначения»", shortTitle: "Приватизация земли", actType: "cabinet_resolution", expectedActNumber: "71", expectedAdoptionDate: "2022-02-14" }),
  layer2(140, { documentKey: "cm_535_cadastre_services", titleRu: "Об утверждении административных регламентов оказания отдельных государственных услуг в сфере кадастра", shortTitle: "Кадастровые услуги", actType: "cabinet_resolution", expectedActNumber: "535", expectedAdoptionDate: "2020-09-02" }),
  layer2(141, { documentKey: "cm_200_building_regulations", titleRu: "Об утверждении единых административных строительных регламентов в сфере строительства", shortTitle: "Строительные регламенты", actType: "cabinet_resolution", expectedActNumber: "200", expectedAdoptionDate: "2022-04-20" }),
  layer2(142, { documentKey: "cm_614_land_use_classifier", titleRu: "О внедрении Единого классификатора видов разрешенного использования земельных участков и объектов капитального строительства", shortTitle: "Классификатор землепользования", actType: "cabinet_resolution", expectedActNumber: "614", expectedAdoptionDate: "2024-09-30" }),
  layer2(143, { documentKey: "cm_601_mortgage_subsidies", titleRu: "О мерах по упрощению процессов предоставления населению ипотечных кредитов и субсидий для приобретения жилья", shortTitle: "Ипотечные субсидии", actType: "cabinet_resolution", expectedActNumber: "601", expectedAdoptionDate: "2022-10-14" }),
  layer2(144, { documentKey: "cm_3_apartment_management", titleRu: "Об утверждении Правил осуществления деятельности по управлению многоквартирными домами", shortTitle: "Управление МКД", actType: "cabinet_resolution", expectedActNumber: "3", expectedAdoptionDate: "2022-01-03" }),
  layer2(145, { documentKey: "cm_256_utility_connections", titleRu: "Об утверждении административных регламентов оказания государственных услуг по подключению к инженерно-коммуникационным сетям", shortTitle: "Подключение к сетям", actType: "cabinet_resolution", expectedActNumber: "256", expectedAdoptionDate: "2018-03-31" }),
  layer2(146, { documentKey: "cm_319_energy_gas_rules", titleRu: "Об утверждении Правил пользования электрической энергией и природным газом", shortTitle: "Электроэнергия и газ", actType: "cabinet_resolution", expectedActNumber: "319", expectedAdoptionDate: "2024-05-31" }),

  layer2(147, { documentKey: "reg_3420_bank_accounts", titleRu: "Инструкция о порядке открытия, ведения и закрытия банковских счетов", shortTitle: "Банковские счета", actType: "departmental_npa", expectedActNumber: "3420", expectedAdoptionDate: "2023-02-08" }),
  layer2(148, { documentKey: "reg_3281_currency_operations", titleRu: "Правила осуществления валютных операций в Республике Узбекистан", shortTitle: "Валютные операции", actType: "departmental_npa", expectedActNumber: "3281", expectedAdoptionDate: "2020-08-31" }),
  layer2(149, { documentKey: "reg_3229_cashless_payments", titleRu: "Положение о безналичных расчетах в Республике Узбекистан", shortTitle: "Безналичные расчеты", actType: "departmental_npa", expectedActNumber: "3229", expectedAdoptionDate: null }),
  layer2(150, { documentKey: "reg_3030_bank_consumer_requirements", titleRu: "Положение о минимальных требованиях к деятельности коммерческих банков при взаимодействии с потребителями банковских услуг", shortTitle: "Права банковских клиентов", actType: "departmental_npa", expectedActNumber: "3030", expectedAdoptionDate: "2018-07-02" }),
  layer2(151, { documentKey: "reg_2886_bank_aml", titleRu: "Правила внутреннего контроля по противодействию легализации доходов, полученных от преступной деятельности, финансированию терроризма и финансированию распространения оружия массового уничтожения для коммерческих банков", shortTitle: "ПОД/ФТ банков", actType: "departmental_npa", expectedActNumber: "2886", expectedAdoptionDate: "2017-05-23" }),
  layer2(152, { documentKey: "reg_2925_nonbank_aml", titleRu: "Правила внутреннего контроля для небанковских кредитных организаций", shortTitle: "ПОД/ФТ НКО", actType: "departmental_npa", expectedActNumber: "2925", expectedAdoptionDate: null }),
  layer2(153, { documentKey: "reg_3266_payment_aml", titleRu: "Правила внутреннего контроля для платежных организаций, операторов платежных систем и операторов систем электронных денег", shortTitle: "ПОД/ФТ платежей", actType: "departmental_npa", expectedActNumber: "3266", expectedAdoptionDate: null }),
  layer2(154, { documentKey: "reg_3431_payment_authorizations", titleRu: "Положение о порядке прохождения разрешительных процедур в сфере деятельности операторов платежных систем и платежных организаций", shortTitle: "Разрешения платежных организаций", actType: "departmental_npa", expectedActNumber: "3431", expectedAdoptionDate: null }),
  layer2(155, { documentKey: "reg_3513_payment_cybersecurity", titleRu: "Положение о мерах по обеспечению информационной безопасности и кибербезопасности платежных систем", shortTitle: "Кибербезопасность платежей", actType: "departmental_npa", expectedActNumber: "3513", expectedAdoptionDate: "2024-05-21" }),
  layer2(156, { documentKey: "reg_3423_microfinance_authorizations", titleRu: "Положение о порядке прохождения разрешительных и уведомительных процедур в сфере деятельности микрофинансовых организаций и ломбардов", shortTitle: "Разрешения МФО", actType: "departmental_npa", expectedActNumber: "3423", expectedAdoptionDate: null }),
  layer2(157, { documentKey: "reg_2467_currency_monitoring", titleRu: "Положение о порядке осуществления мониторинга за обоснованностью проведения юридическими и физическими лицами валютных операций", shortTitle: "Мониторинг валютных операций", actType: "departmental_npa", expectedActNumber: "2467", expectedAdoptionDate: "2013-06-12" }),
  layer2(158, { documentKey: "cm_66_cash_currency_border", titleRu: "О мерах по упорядочению ввоза и вывоза наличной иностранной валюты физическими лицами", shortTitle: "Наличная валюта через границу", actType: "cabinet_resolution", expectedActNumber: "66", expectedAdoptionDate: "2018-01-30" }),
  layer2(159, { documentKey: "up_246_cashless_payments", titleRu: "О дополнительных мерах, направленных на популяризацию безналичных расчетов и сокращение доли теневой экономики", shortTitle: "Безналичные расчеты", actType: "presidential_decree", expectedActNumber: "УП-246", expectedAdoptionDate: "2025-12-10" }),

  layer2(160, { documentKey: "reg_2773_cargo_customs_declaration", titleRu: "Инструкция о порядке заполнения грузовой таможенной декларации", shortTitle: "Грузовая таможенная декларация", actType: "departmental_npa", expectedActNumber: "2773", expectedAdoptionDate: "2016-04-06" }),
  layer2(161, { documentKey: "reg_2606_passenger_customs_declaration", titleRu: "Инструкция о порядке заполнения и оформления пассажирской таможенной декларации", shortTitle: "Пассажирская декларация", actType: "departmental_npa", expectedActNumber: "2606", expectedAdoptionDate: null }),
  layer2(162, { documentKey: "reg_2727_eds_public_services", titleRu: "Правила использования электронной цифровой подписи во всех видах услуг, оказываемых государственными органами и коммерческими банками", shortTitle: "ЭЦП в услугах", actType: "departmental_npa", expectedActNumber: "2727", expectedAdoptionDate: "2015-11-13" }),
  layer2(163, { documentKey: "reg_2808_tax_reporting", titleRu: "Положение о порядке представления финансовой и налоговой отчетности посредством телекоммуникационных каналов связи в органы налоговой службы", shortTitle: "Электронная налоговая отчетность", actType: "departmental_npa", expectedActNumber: "2808", expectedAdoptionDate: "2016-07-12" }),
  layer2(164, { documentKey: "reg_2219_postal_services", titleRu: "Правила оказания услуг почтовой связи", shortTitle: "Почтовые услуги", actType: "departmental_npa", expectedActNumber: "2219", expectedAdoptionDate: null }),
  layer2(165, { documentKey: "reg_3113_notarial_actions", titleRu: "Инструкция о порядке совершения нотариальных действий нотариусами", shortTitle: "Нотариальные действия", actType: "departmental_npa", expectedActNumber: "3113", expectedAdoptionDate: null }),
  layer2(166, { documentKey: "reg_3235_notary_fees", titleRu: "Максимальные размеры платежей за дополнительные действия правового и технического характера, совершаемые нотариусами", shortTitle: "Платежи нотариусов", actType: "departmental_npa", expectedActNumber: "3235", expectedAdoptionDate: null }),
  layer2(167, { documentKey: "reg_2020_notary_advocate_aml", titleRu: "Правила внутреннего контроля для нотариальных контор и адвокатских формирований", shortTitle: "ПОД/ФТ нотариусов", actType: "departmental_npa", expectedActNumber: "2020", expectedAdoptionDate: null }),
  layer2(168, { documentKey: "cm_550_civil_status", titleRu: "О систематизации нормативно-правовых актов в сфере брака, семьи и записи актов гражданского состояния", shortTitle: "Акты гражданского состояния", actType: "cabinet_resolution", expectedActNumber: "550", expectedAdoptionDate: "2023-10-20" }),
  layer2(169, { documentKey: "cm_593_foreigner_registration", titleRu: "О мерах по упрощению процедуры регистрации иностранных граждан и лиц без гражданства", shortTitle: "Регистрация иностранцев", actType: "cabinet_resolution", expectedActNumber: "593", expectedAdoptionDate: "2020-09-28" }),
  layer2(170, { documentKey: "cm_408_foreigner_entry", titleRu: "О порядке въезда, выезда, пребывания и транзитного проезда иностранных граждан и лиц без гражданства", shortTitle: "Въезд и пребывание иностранцев", actType: "cabinet_resolution", expectedActNumber: "408", expectedAdoptionDate: "1996-11-21" }),
  layer2(171, { documentKey: "pp_282_biometric_passport", titleRu: "О дальнейшем упрощении государственной услуги по выдаче гражданам Республики Узбекистан биометрического паспорта для выезда за границу", shortTitle: "Загранпаспорт", actType: "presidential_resolution", expectedActNumber: "ПП-282", expectedAdoptionDate: "2022-06-16" }),
  layer2(172, { documentKey: "cm_177_pinfl", titleRu: "О совершенствовании порядка определения и выдачи персонального идентификационного номера физического лица", shortTitle: "ПИНФЛ", actType: "cabinet_resolution", expectedActNumber: "177", expectedAdoptionDate: "2022-04-12" }),
  layer2(173, { documentKey: "cm_129_id_cards", titleRu: "О мерах по внедрению системы оформления и выдачи идентификационных ID-карт в Республике Узбекистан", shortTitle: "ID-карты", actType: "cabinet_resolution", expectedActNumber: "129", expectedAdoptionDate: "2020-03-06" }),
  layer2(174, { documentKey: "apostille_current_regulation", titleRu: "О дополнительных мерах по совершенствованию порядка оказания государственных услуг", shortTitle: "Апостиль", actType: "cabinet_resolution", expectedActNumber: "134", expectedAdoptionDate: "2019-02-15" }),

  layer2(175, { documentKey: "cm_971_unified_national_labor", titleRu: "О мерах по внедрению межведомственного программно-аппаратного комплекса «Единая национальная система труда»", shortTitle: "Единая национальная система труда", actType: "cabinet_resolution", expectedActNumber: "971", expectedAdoptionDate: "2019-12-05" }),
  layer2(176, { documentKey: "cm_592_state_pensions", titleRu: "Об утверждении Положения о порядке назначения и выплаты государственных пенсий", shortTitle: "Назначение пенсий", actType: "cabinet_resolution", expectedActNumber: "592", expectedAdoptionDate: "2022-10-13" }),
  layer2(177, { documentKey: "cm_654_social_protection", titleRu: "О дальнейшем совершенствовании системы социальной защиты населения", shortTitle: "Социальная защита", actType: "cabinet_resolution", expectedActNumber: "654", expectedAdoptionDate: "2021-10-21" }),
  layer2(178, { documentKey: "cm_62_medico_social_expertise", titleRu: "Об утверждении нормативно-правовых актов об организационной структуре и организации деятельности службы медико-социальной экспертизы", shortTitle: "Медико-социальная экспертиза", actType: "cabinet_resolution", expectedActNumber: "62", expectedAdoptionDate: "2022-02-08" }),
  layer2(179, { documentKey: "cm_123_social_care", titleRu: "О внедрении новой системы оказания социальных услуг и помощи лицам, нуждающимся в постороннем уходе", shortTitle: "Социальный уход", actType: "cabinet_resolution", expectedActNumber: "123", expectedAdoptionDate: "2024-03-11" }),
  layer2(180, { documentKey: "cm_316_social_support_centers", titleRu: "О совершенствовании деятельности центров социальной поддержки, оказывающих социальные услуги и помощь лицам, нуждающимся в постороннем уходе", shortTitle: "Центры социальной поддержки", actType: "cabinet_resolution", expectedActNumber: "316", expectedAdoptionDate: "2024-05-31" }),
  layer2(181, { documentKey: "pp_171_social_services", titleRu: "О мерах по расширению спектра социальных услуг лицам, нуждающимся в постороннем уходе", shortTitle: "Расширение социальных услуг", actType: "presidential_resolution", expectedActNumber: "ПП-171", expectedAdoptionDate: "2025-05-08" }),
  layer2(182, { documentKey: "up_84_poor_families", titleRu: "О дальнейшем совершенствовании системы государственной социальной поддержки бедных семей", shortTitle: "Поддержка бедных семей", actType: "presidential_decree", expectedActNumber: "УП-84", expectedAdoptionDate: "2025-05-08" }),
  layer2(183, { documentKey: "cm_286_work_accidents", titleRu: "О расследовании и учете несчастных случаев на производстве и иных повреждений здоровья работников", shortTitle: "Несчастные случаи на производстве", actType: "cabinet_resolution", expectedActNumber: "286", expectedAdoptionDate: "1997-06-06" }),
  layer2(184, { documentKey: "cm_60_work_injury_compensation", titleRu: "Об утверждении Правил возмещения вреда, причиненного работникам увечьем, профессиональным заболеванием либо иным повреждением здоровья", shortTitle: "Возмещение вреда работникам", actType: "cabinet_resolution", expectedActNumber: "60", expectedAdoptionDate: "2005-02-11" }),
  layer2(185, { documentKey: "cm_246_labor_protection_services", titleRu: "О дальнейшем развитии рынка услуг в области охраны труда", shortTitle: "Услуги охраны труда", actType: "cabinet_resolution", expectedActNumber: "246", expectedAdoptionDate: "2017-04-27" }),
  layer2(186, { documentKey: "cm_486_workers_with_disabilities", titleRu: "О мерах по созданию благоприятных условий для осуществления трудовой деятельности лицами с инвалидностью", shortTitle: "Труд лиц с инвалидностью", actType: "cabinet_resolution", expectedActNumber: "486", expectedAdoptionDate: "2022-08-31" }),
  layer2(187, { documentKey: "pp_64_employment_financial_aid", titleRu: "О дополнительных мерах по совершенствованию системы выделения финансовой помощи для привлечения населения к предпринимательству и обеспечения занятости", shortTitle: "Финансовая помощь занятости", actType: "presidential_resolution", expectedActNumber: "ПП-64", expectedAdoptionDate: "2025-02-14" }),

  layer2(188, { documentKey: "cm_172_traffic_rules", titleRu: "Об утверждении Правил дорожного движения Республики Узбекистан", shortTitle: "Правила дорожного движения", actType: "cabinet_resolution", expectedActNumber: "172", expectedAdoptionDate: "2022-04-12" }),
  layer2(189, { documentKey: "cm_683_vehicle_registration", titleRu: "О совершенствовании порядка государственной регистрации и выдачи государственных регистрационных номерных знаков для автомототранспортных средств", shortTitle: "Регистрация автомобилей", actType: "cabinet_resolution", expectedActNumber: "683", expectedAdoptionDate: "2017-08-31" }),
  layer2(190, { documentKey: "cm_139_driver_training", titleRu: "О мерах по совершенствованию порядка подготовки, переподготовки и повышения квалификации водителей автомототранспортных средств", shortTitle: "Подготовка водителей", actType: "cabinet_resolution", expectedActNumber: "139", expectedAdoptionDate: "2018-02-23" }),
  layer2(191, { documentKey: "cm_125_vehicle_inspection", titleRu: "О дополнительных мерах по совершенствованию порядка проведения обязательного технического осмотра транспортных средств", shortTitle: "Техосмотр", actType: "cabinet_resolution", expectedActNumber: "125", expectedAdoptionDate: "2021-03-09" }),
  layer2(192, { documentKey: "cm_141_motor_liability_rules", titleRu: "О мерах по реализации Закона Республики Узбекистан «Об обязательном страховании гражданской ответственности владельцев транспортных средств»", shortTitle: "Правила ОСАГО", actType: "cabinet_resolution", expectedActNumber: "141", expectedAdoptionDate: "2008-06-24" }),
  layer2(193, { documentKey: "cm_177_employer_liability_rules", titleRu: "О мерах по реализации Закона Республики Узбекистан «Об обязательном страховании гражданской ответственности работодателя»", shortTitle: "Правила страхования работодателя", actType: "cabinet_resolution", expectedActNumber: "177", expectedAdoptionDate: "2009-06-24" }),
  layer2(194, { documentKey: "cm_266_carrier_liability_rules", titleRu: "О мерах по реализации Закона Республики Узбекистан «Об обязательном страховании гражданской ответственности перевозчика»", shortTitle: "Правила страхования перевозчика", actType: "cabinet_resolution", expectedActNumber: "266", expectedAdoptionDate: "2015-09-15" }),
  layer2(195, { documentKey: "cm_200_passenger_transport_2025", titleRu: "О дополнительных мерах регулирования деятельности по пассажирским перевозкам на автомобильном транспорте", shortTitle: "Пассажирские перевозки", actType: "cabinet_resolution", expectedActNumber: "200", expectedAdoptionDate: "2025-04-02" }),
  layer2(196, { documentKey: "pp_5108_passenger_transport", titleRu: "О дополнительных мерах по упрощению регулирования пассажирских перевозок автомобильным транспортом", shortTitle: "Регулирование пассажирских перевозок", actType: "presidential_resolution", expectedActNumber: "ПП-5108", expectedAdoptionDate: "2021-05-07" }),
  layer2(197, { documentKey: "cm_482_passenger_baggage_road", titleRu: "Об утверждении Правил перевозки пассажиров и багажа автомобильным транспортом", shortTitle: "Перевозка пассажиров и багажа", actType: "cabinet_resolution", expectedActNumber: "482", expectedAdoptionDate: "2003-11-04" }),
  layer2(198, { documentKey: "reg_2238_air_passenger_baggage", titleRu: "Правила перевозки пассажиров и багажа на воздушном транспорте", shortTitle: "Воздушная перевозка пассажиров", actType: "departmental_npa", expectedActNumber: "2238", expectedAdoptionDate: null }),
  layer2(199, { documentKey: "cm_71_personal_data_registry", titleRu: "Об утверждении Положения о Государственном реестре баз персональных данных", shortTitle: "Реестр баз персональных данных", actType: "cabinet_resolution", expectedActNumber: "71", expectedAdoptionDate: "2020-02-08" }),
  layer2(200, { documentKey: "cm_707_personal_data_security", titleRu: "О мерах по совершенствованию информационной безопасности во всемирной информационной сети Интернет", shortTitle: "Информационная безопасность персональных данных", actType: "cabinet_resolution", expectedActNumber: "707", expectedAdoptionDate: "2018-09-05" }),
] as const satisfies readonly NpaTarget[];

/**
 * These links describe the intended statutory graph, but are not retrieval
 * evidence by themselves. They are promoted only after both canonical LexUZ
 * cards are verified; source provisions can then add article-level links.
 */
export type NpaDeclaredRelationship = Readonly<{
  sourceDocumentKey: string;
  targetDocumentKey: string;
  relationType: "implemented_by" | "supplemented_by" | "related_to" | "vehicle_registration" | "technical_inspection";
}>;

export const NPA_DECLARED_RELATIONSHIPS = [
  { sourceDocumentKey: "licensing_permits_notifications", targetDocumentKey: "cm_80_licensing", relationType: "implemented_by" },
  { sourceDocumentKey: "licensing_permits_notifications", targetDocumentKey: "cm_86_permits", relationType: "implemented_by" },
  { sourceDocumentKey: "licensing_permits_notifications", targetDocumentKey: "cm_88_notifications", relationType: "implemented_by" },
  { sourceDocumentKey: "personal_data", targetDocumentKey: "cm_71_personal_data_registry", relationType: "implemented_by" },
  { sourceDocumentKey: "personal_data", targetDocumentKey: "cm_707_personal_data_security", relationType: "supplemented_by" },
  { sourceDocumentKey: "currency_regulation", targetDocumentKey: "reg_3281_currency_operations", relationType: "implemented_by" },
  { sourceDocumentKey: "currency_regulation", targetDocumentKey: "reg_2467_currency_monitoring", relationType: "related_to" },
  { sourceDocumentKey: "banks_and_banking", targetDocumentKey: "reg_3420_bank_accounts", relationType: "implemented_by" },
  { sourceDocumentKey: "banks_and_banking", targetDocumentKey: "reg_3030_bank_consumer_requirements", relationType: "supplemented_by" },
  { sourceDocumentKey: "electronic_commerce", targetDocumentKey: "cm_885_ecommerce", relationType: "implemented_by" },
  { sourceDocumentKey: "road_traffic", targetDocumentKey: "cm_172_traffic_rules", relationType: "implemented_by" },
  { sourceDocumentKey: "road_traffic", targetDocumentKey: "cm_683_vehicle_registration", relationType: "vehicle_registration" },
  { sourceDocumentKey: "road_traffic", targetDocumentKey: "cm_125_vehicle_inspection", relationType: "technical_inspection" },
  { sourceDocumentKey: "mandatory_motor_liability_insurance", targetDocumentKey: "cm_141_motor_liability_rules", relationType: "implemented_by" },
  { sourceDocumentKey: "employer_liability_insurance", targetDocumentKey: "cm_177_employer_liability_rules", relationType: "implemented_by" },
  { sourceDocumentKey: "carrier_liability_insurance", targetDocumentKey: "cm_266_carrier_liability_rules", relationType: "implemented_by" },
] as const satisfies readonly NpaDeclaredRelationship[];

/** Explicitly separate from the mandatory 100 until its effective date. */
export const NPA_FUTURE_TARGETS = [
  npa({
    documentKey: "realtor_activity_2026",
    titleRu: "О риэлторской деятельности",
    shortTitle: "Риэлторская деятельность 2026",
    expectedActNumber: "ЗРУ-1163",
    expectedAdoptionDate: "2026-08-07",
    replacesDocumentKey: "realtor_activity_2010",
  }),
] as const satisfies readonly NpaTarget[];

function assertLayer(targets: readonly NpaTarget[], layer: 1 | 2, firstPosition: number): void {
  if (targets.length !== 100) throw new Error(`NPA_LAYER_${layer}_TARGET_COUNT:${targets.length}`);
  const keys = new Set(targets.map((target) => target.documentKey));
  if (keys.size !== targets.length) throw new Error(`NPA_LAYER_${layer}_TARGET_KEY_DUPLICATE`);
  const positions = targets.map((target) => target.registryPosition).sort((left, right) => (left ?? 0) - (right ?? 0));
  for (let index = 0; index < 100; index += 1) {
    if (positions[index] !== firstPosition + index || targets[index]?.knowledgeLayer !== layer) {
      throw new Error(`NPA_LAYER_${layer}_POSITION_INTEGRITY_REJECTED`);
    }
  }
}

export function assertNpaMasterTargets(): void {
  assertLayer(NPA_MASTER_TARGETS, 1, 1);
  const currentKeys = new Set(NPA_MASTER_TARGETS.map((target) => target.documentKey));
  if (currentKeys.size !== 100) throw new Error("NPA_MASTER_TARGET_KEY_DUPLICATE");
  if (NPA_FUTURE_TARGETS.some((target) => currentKeys.has(target.documentKey))) {
    throw new Error("NPA_FUTURE_TARGET_MUST_NOT_COUNT_AS_CURRENT");
  }
}

assertNpaMasterTargets();
