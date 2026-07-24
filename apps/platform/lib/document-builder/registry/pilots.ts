import { confirmationField, courtBlock, naturalPersonBlock, representativeBlock, t, yesNoOptions } from "./shared-blocks";
import type { DocumentDefinition, QuestionnaireField } from "./types";
import { STANDARD_COLLABORATION } from "./collaboration";

const UPDATED_AT = "2026-07-24T00:00:00.000Z";

const warning = t(
  "Этот шаблон предназначен для подготовки проекта документа. В сложных или спорных ситуациях рекомендуется проверка юристом.",
  "Ushbu shablon hujjat loyihasini tayyorlash uchun mo‘ljallangan. Murakkab yoki nizoli vaziyatlarda yurist tekshiruvi tavsiya etiladi.",
);

const attachmentsField: QuestionnaireField = {
  id: "claim.attachments",
  type: "long-text",
  label: t("Перечень прилагаемых документов", "Ilova qilinadigan hujjatlar ro‘yxati"),
  help: t("Каждый документ укажите с новой строки.", "Har bir hujjatni yangi qatordan ko‘rsating."),
  required: true,
};

export const DIVORCE_CLAIM: DocumentDefinition = {
  id: "family-divorce-claim-v1",
  code: "0101001",
  categoryCode: "01",
  subcategoryCode: "01",
  documentCode: "001",
  slug: "divorce-claim",
  categorySlug: "family",
  titleRu: "Исковое заявление о расторжении брака",
  titleUz: "Nikohdan ajratish to‘g‘risida da’vo arizasi",
  descriptionRu: "Проект искового заявления в суд о расторжении брака с учётом детей, позиции второй стороны и сопутствующих требований.",
  descriptionUz: "Bolalar, ikkinchi tomonning pozitsiyasi va qo‘shimcha talablarni hisobga olgan holda nikohdan ajratish bo‘yicha sudga da’vo arizasi loyihasi.",
  legalBasisRu: ["Семейный кодекс Республики Узбекистан", "Гражданский процессуальный кодекс Республики Узбекистан"],
  legalBasisUz: ["O‘zbekiston Respublikasining Oila kodeksi", "O‘zbekiston Respublikasining Fuqarolik protsessual kodeksi"],
  status: "published",
  editorialStatus: "Published",
  version: "1.0.0",
  estimatedMinutes: 12,
  collaboration: STANDARD_COLLABORATION,
  popular: true,
  updatedAt: UPDATED_AT,
  questionnaire: [
    { id: "court-and-parties", title: t("Суд и участники", "Sud va ishtirokchilar"), description: t("Укажите суд, истца, ответчика и представителя.", "Sud, da’vogar, javobgar va vakilni ko‘rsating."), fields: [...courtBlock(), ...naturalPersonBlock("claimant", "истец", "Da’vogar"), ...naturalPersonBlock("respondent", "ответчик", "Javobgar"), ...representativeBlock()] },
    { id: "marriage", title: t("Сведения о браке", "Nikoh to‘g‘risidagi ma’lumotlar"), fields: [
      { id: "marriage.registrationDate", type: "date", label: t("Дата регистрации брака", "Nikoh qayd etilgan sana"), required: true, reusableBlock: "marriage-details" },
      { id: "marriage.registryOffice", type: "short-text", label: t("Орган ЗАГС, зарегистрировавший брак", "Nikohni qayd etgan FHDYo organi"), required: true, reusableBlock: "marriage-details" },
      { id: "marriage.recordNumber", type: "short-text", label: t("Номер актовой записи — если известен", "Dalolatnoma yozuvi raqami — ma’lum bo‘lsa"), reusableBlock: "marriage-details" },
      { id: "marriage.endedAt", type: "date", label: t("С какого времени семейные отношения фактически прекращены", "Oilaviy munosabatlar qachondan amalda tugagan"), reusableBlock: "marriage-details" },
      { id: "marriage.reason", type: "long-text", label: t("Причины расторжения брака", "Nikohdan ajratish sabablari"), required: true, reusableBlock: "marriage-details" },
      { id: "marriage.reconciliationPossible", type: "radio", label: t("Возможно ли примирение?", "Yarashish mumkinmi?"), required: true, options: yesNoOptions, reusableBlock: "marriage-details" },
      { id: "marriage.respondentAgrees", type: "radio", label: t("Ответчик согласен на расторжение брака?", "Javobgar nikohdan ajratishga rozimi?"), required: true, options: [...yesNoOptions, { value: "unknown", label: t("Неизвестно", "Noma’lum") }], reusableBlock: "marriage-details" },
    ] },
    { id: "children", title: t("Дети и связанные вопросы", "Bolalar va bog‘liq masalalar"), fields: [
      { id: "children.hasJointMinorChildren", type: "radio", label: t("Есть общие несовершеннолетние дети?", "Umumiy voyaga yetmagan bolalar bormi?"), required: true, options: yesNoOptions, reusableBlock: "child-details" },
      { id: "children.items", type: "repeatable-group", label: t("Сведения о детях", "Bolalar to‘g‘risidagi ma’lumotlar"), required: true, condition: { field: "children.hasJointMinorChildren", operator: "equals", value: "yes" }, reusableBlock: "child-details", fields: [
        { id: "fullName", type: "full-name", label: t("Ф.И.О. ребёнка", "Bolaning F.I.Sh."), required: true },
        { id: "birthDate", type: "date", label: t("Дата рождения", "Tug‘ilgan sana"), required: true },
        { id: "residesWith", type: "select", label: t("С кем проживает ребёнок", "Bola kim bilan yashaydi"), required: true, options: [{ value: "claimant", label: t("С истцом", "Da’vogar bilan") }, { value: "respondent", label: t("С ответчиком", "Javobgar bilan") }, { value: "other", label: t("Иное", "Boshqa") }] },
      ] },
      { id: "children.hasResidenceDispute", type: "radio", label: t("Есть спор о месте проживания или порядке общения с детьми?", "Bolalarning yashash joyi yoki ular bilan muloqot tartibi bo‘yicha nizo bormi?"), condition: { field: "children.hasJointMinorChildren", operator: "equals", value: "yes" }, options: yesNoOptions, required: true },
      { id: "children.relatedRequest", type: "long-text", label: t("Опишите дополнительное требование о детях", "Bolalar bo‘yicha qo‘shimcha talabni bayon qiling"), condition: { field: "children.hasResidenceDispute", operator: "equals", value: "yes" } },
    ] },
    { id: "requests", title: t("Требования и приложения", "Talablar va ilovalar"), fields: [
      { id: "claim.propertyDispute", type: "radio", label: t("Заявляется ли одновременно спор об имуществе?", "Mol-mulk bo‘yicha nizo ham bir vaqtda bildiriladimi?"), options: yesNoOptions, required: true },
      { id: "claim.propertyDetails", type: "long-text", label: t("Опишите имущественные требования", "Mulkiy talablarni bayon qiling"), condition: { field: "claim.propertyDispute", operator: "equals", value: "yes" } },
      { id: "claim.surnameAfterDivorce", type: "short-text", label: t("Фамилия истца после расторжения брака", "Nikohdan ajratilgandan keyin da’vogarning familiyasi") },
      { id: "claim.additionalRequests", type: "long-text", label: t("Дополнительные просьбы к суду — необязательно", "Sudga qo‘shimcha iltimoslar — ixtiyoriy") },
      attachmentsField,
    ] },
    { id: "review", title: t("Проверка и создание", "Tekshirish va yaratish"), description: warning, fields: [confirmationField()] },
  ],
  generationSchema: {
    fileName: t("Иск о расторжении брака", "Nikohdan ajratish da’vosi"),
    paragraphs: [
      { id: "recipient", kind: "body", text: t("В {{court.name}}\nИстец: {{claimant.fullName}}, адрес: {{claimant.address}}, телефон: {{claimant.phone}}\nОтветчик: {{respondent.fullName}}, адрес: {{respondent.address}}, телефон: {{respondent.phone}}", "{{court.name}}ga\nDa’vogar: {{claimant.fullName}}, manzil: {{claimant.address}}, telefon: {{claimant.phone}}\nJavobgar: {{respondent.fullName}}, manzil: {{respondent.address}}, telefon: {{respondent.phone}}") },
      { id: "title", kind: "title", text: t("ИСКОВОЕ ЗАЯВЛЕНИЕ\nо расторжении брака", "NIKОHDAN AJRATISH TO‘G‘RISIDA\nDA’VO ARIZASI") },
      { id: "marriage", kind: "body", text: t("{{marriage.registrationDate}} между мной и ответчиком зарегистрирован брак в {{marriage.registryOffice}}, актовая запись № {{marriage.recordNumber}}.", "{{marriage.registrationDate}} kuni men va javobgar o‘rtasidagi nikoh {{marriage.registryOffice}}da qayd etilgan, dalolatnoma yozuvi № {{marriage.recordNumber}}.") },
      { id: "facts", kind: "body", text: t("Семейные отношения фактически прекращены с {{marriage.endedAt}}. Причины расторжения брака: {{marriage.reason}}", "Oilaviy munosabatlar {{marriage.endedAt}}dan amalda tugagan. Nikohdan ajratish sabablari: {{marriage.reason}}") },
      { id: "children-heading", kind: "heading", text: t("Сведения о детях", "Bolalar to‘g‘risidagi ma’lumotlar"), condition: { field: "children.hasJointMinorChildren", operator: "equals", value: "yes" } },
      { id: "child", kind: "list", text: t("{{fullName}}, дата рождения: {{birthDate}}, проживает: {{residesWith}}.", "{{fullName}}, tug‘ilgan sana: {{birthDate}}, yashaydi: {{residesWith}}."), condition: { field: "children.hasJointMinorChildren", operator: "equals", value: "yes" }, repeatFor: "children.items" },
      { id: "child-request", kind: "body", text: t("Дополнительное требование о детях: {{children.relatedRequest}}", "Bolalar bo‘yicha qo‘shimcha talab: {{children.relatedRequest}}"), condition: { field: "children.hasResidenceDispute", operator: "equals", value: "yes" } },
      { id: "legal", kind: "body", text: t("На основании Семейного кодекса Республики Узбекистан и Гражданского процессуального кодекса Республики Узбекистан прошу суд:", "O‘zbekiston Respublikasining Oila kodeksi va Fuqarolik protsessual kodeksiga asosan suddan quyidagilarni so‘rayman:") },
      { id: "request-1", kind: "list", text: t("1. Расторгнуть брак между истцом и ответчиком.", "1. Da’vogar va javobgar o‘rtasidagi nikohdan ajratish.") },
      { id: "request-property", kind: "list", text: t("2. Рассмотреть имущественные требования: {{claim.propertyDetails}}", "2. Mulkiy talablarni ko‘rib chiqish: {{claim.propertyDetails}}"), condition: { field: "claim.propertyDispute", operator: "equals", value: "yes" } },
      { id: "additional", kind: "body", text: t("Дополнительные просьбы: {{claim.additionalRequests}}", "Qo‘shimcha iltimoslar: {{claim.additionalRequests}}"), condition: { field: "claim.additionalRequests", operator: "filled" } },
      { id: "attachments", kind: "heading", text: t("Приложения", "Ilovalar") },
      { id: "attachments-list", kind: "body", text: t("{{claim.attachments}}", "{{claim.attachments}}") },
      { id: "signature", kind: "signature", text: t("Дата: ____________    Подпись: ____________ / {{claimant.fullName}} /", "Sana: ____________    Imzo: ____________ / {{claimant.fullName}} /") },
    ],
  },
};

export const SALARY_CLAIM: DocumentDefinition = {
  id: "work-salary-claim-v1", code: "0201001", categoryCode: "02", subcategoryCode: "01", documentCode: "001", slug: "salary-recovery-claim", categorySlug: "work",
  titleRu: "Исковое заявление о взыскании заработной платы", titleUz: "Ish haqini undirish to‘g‘risida da’vo arizasi",
  descriptionRu: "Проект иска работника о взыскании начисленной, но не выплаченной заработной платы и связанных сумм.", descriptionUz: "Hisoblangan, ammo to‘lanmagan ish haqi va unga bog‘liq summalarni undirish bo‘yicha xodim da’vosi loyihasi.",
  legalBasisRu: ["Трудовой кодекс Республики Узбекистан", "Гражданский процессуальный кодекс Республики Узбекистан"], legalBasisUz: ["O‘zbekiston Respublikasining Mehnat kodeksi", "O‘zbekiston Respublikasining Fuqarolik protsessual kodeksi"],
  status: "published", editorialStatus: "Published", version: "1.0.0", estimatedMinutes: 10, popular: true, updatedAt: UPDATED_AT,
  collaboration: STANDARD_COLLABORATION,
  questionnaire: [
    { id: "court-and-parties", title: t("Суд и стороны", "Sud va taraflar"), fields: [...courtBlock(), ...naturalPersonBlock("employee", "работник (истец)", "Xodim (da’vogar)"),
      { id: "employer.name", type: "company-name", label: t("Наименование работодателя", "Ish beruvchining nomi"), required: true, reusableBlock: "party-legal-entity" },
      { id: "employer.tin", type: "tin", label: t("ИНН работодателя — если известен", "Ish beruvchining STIRi — ma’lum bo‘lsa"), reusableBlock: "company-details" },
      { id: "employer.address", type: "address", label: t("Адрес работодателя", "Ish beruvchining manzili"), required: true, reusableBlock: "party-legal-entity" },
      ...representativeBlock()] },
    { id: "employment", title: t("Трудовые отношения", "Mehnat munosabatlari"), fields: [
      { id: "employment.position", type: "short-text", label: t("Должность", "Lavozim"), required: true, reusableBlock: "employment-details" },
      { id: "employment.startDate", type: "date", label: t("Дата начала работы", "Ish boshlangan sana"), required: true, reusableBlock: "employment-details" },
      { id: "employment.contractNumber", type: "short-text", label: t("Номер трудового договора — если есть", "Mehnat shartnomasi raqami — mavjud bo‘lsa"), reusableBlock: "employment-details" },
      { id: "employment.contractDate", type: "date", label: t("Дата трудового договора", "Mehnat shartnomasi sanasi"), reusableBlock: "employment-details" },
      { id: "employment.current", type: "radio", label: t("Трудовые отношения продолжаются?", "Mehnat munosabatlari davom etmoqdami?"), options: yesNoOptions, required: true, reusableBlock: "employment-details" },
      { id: "employment.endDate", type: "date", label: t("Дата прекращения трудовых отношений", "Mehnat munosabatlari tugagan sana"), condition: { field: "employment.current", operator: "equals", value: "no" }, reusableBlock: "employment-details" },
    ] },
    { id: "calculation", title: t("Задолженность и расчёт", "Qarzdorlik va hisob-kitob"), fields: [
      { id: "debt.periodFrom", type: "date", label: t("Начало периода задолженности", "Qarzdorlik davrining boshlanishi"), required: true, reusableBlock: "payment-terms" },
      { id: "debt.periodTo", type: "date", label: t("Конец периода задолженности", "Qarzdorlik davrining oxiri"), required: true, reusableBlock: "payment-terms" },
      { id: "debt.salaryAmount", type: "money", label: t("Сумма невыплаченной заработной платы", "To‘lanmagan ish haqi summasi"), required: true, reusableBlock: "payment-terms" },
      { id: "debt.currency", type: "currency", label: t("Валюта", "Valyuta"), options: [{ value: "UZS", label: t("Узбекский сум", "O‘zbekiston so‘mi") }, { value: "USD", label: t("Доллар США", "AQSh dollari") }], required: true, reusableBlock: "payment-terms" },
      { id: "debt.otherAmounts", type: "long-text", label: t("Иные начисленные, но не выплаченные суммы", "Hisoblangan, ammo to‘lanmagan boshqa summalar"), help: t("Например: компенсация, надбавка, премия.", "Masalan: kompensatsiya, ustama, mukofot.") },
      { id: "debt.calculation", type: "long-text", label: t("Расчёт задолженности", "Qarzdorlik hisob-kitobi"), required: true },
    ] },
    { id: "evidence", title: t("Обращения, доказательства и требования", "Murojaatlar, dalillar va talablar"), fields: [
      { id: "claim.pretrialRequest", type: "long-text", label: t("Как и когда вы обращались к работодателю", "Ish beruvchiga qachon va qanday murojaat qilgansiz") },
      { id: "claim.evidence", type: "long-text", label: t("Доказательства трудовых отношений и задолженности", "Mehnat munosabatlari va qarzdorlik dalillari"), required: true },
      { id: "claim.additionalRequests", type: "long-text", label: t("Дополнительные требования — необязательно", "Qo‘shimcha talablar — ixtiyoriy") }, attachmentsField,
    ] },
    { id: "review", title: t("Проверка и создание", "Tekshirish va yaratish"), description: warning, fields: [confirmationField()] },
  ],
  generationSchema: { fileName: t("Иск о взыскании заработной платы", "Ish haqini undirish da’vosi"), paragraphs: [
    { id: "recipient", kind: "body", text: t("В {{court.name}}\nИстец: {{employee.fullName}}, адрес: {{employee.address}}, телефон: {{employee.phone}}\nОтветчик: {{employer.name}}, адрес: {{employer.address}}, ИНН: {{employer.tin}}", "{{court.name}}ga\nDa’vogar: {{employee.fullName}}, manzil: {{employee.address}}, telefon: {{employee.phone}}\nJavobgar: {{employer.name}}, manzil: {{employer.address}}, STIR: {{employer.tin}}") },
    { id: "title", kind: "title", text: t("ИСКОВОЕ ЗАЯВЛЕНИЕ\nо взыскании заработной платы", "ISH HAQINI UNDIRISH TO‘G‘RISIDA\nDA’VO ARIZASI") },
    { id: "employment", kind: "body", text: t("Я работаю (работал) у ответчика в должности {{employment.position}} с {{employment.startDate}}. Трудовой договор: № {{employment.contractNumber}} от {{employment.contractDate}}.", "Men javobgarda {{employment.position}} lavozimida {{employment.startDate}}dan ishlayman (ishlaganman). Mehnat shartnomasi: № {{employment.contractNumber}}, {{employment.contractDate}}.") },
    { id: "debt", kind: "body", text: t("За период с {{debt.periodFrom}} по {{debt.periodTo}} ответчиком не выплачена заработная плата в размере {{debt.salaryAmount}} {{debt.currency}}. Расчёт: {{debt.calculation}}", "{{debt.periodFrom}}dan {{debt.periodTo}}gacha bo‘lgan davr uchun javobgar {{debt.salaryAmount}} {{debt.currency}} miqdoridagi ish haqini to‘lamadi. Hisob-kitob: {{debt.calculation}}") },
    { id: "facts", kind: "body", text: t("Обращения к работодателю: {{claim.pretrialRequest}}\nДоказательства: {{claim.evidence}}", "Ish beruvchiga murojaatlar: {{claim.pretrialRequest}}\nDalillar: {{claim.evidence}}") },
    { id: "legal", kind: "body", text: t("На основании Трудового кодекса Республики Узбекистан и Гражданского процессуального кодекса Республики Узбекистан прошу суд:", "O‘zbekiston Respublikasining Mehnat kodeksi va Fuqarolik protsessual kodeksiga asosan suddan quyidagilarni so‘rayman:") },
    { id: "request", kind: "list", text: t("1. Взыскать с ответчика задолженность по заработной плате в размере {{debt.salaryAmount}} {{debt.currency}}.", "1. Javobgardan {{debt.salaryAmount}} {{debt.currency}} miqdoridagi ish haqi qarzdorligini undirish.") },
    { id: "other", kind: "list", text: t("2. Взыскать иные суммы: {{debt.otherAmounts}}. Дополнительные требования: {{claim.additionalRequests}}", "2. Boshqa summalarni undirish: {{debt.otherAmounts}}. Qo‘shimcha talablar: {{claim.additionalRequests}}"), condition: { field: "debt.otherAmounts", operator: "filled" } },
    { id: "attachments", kind: "heading", text: t("Приложения", "Ilovalar") }, { id: "attachments-list", kind: "body", text: t("{{claim.attachments}}", "{{claim.attachments}}") },
    { id: "signature", kind: "signature", text: t("Дата: ____________    Подпись: ____________ / {{employee.fullName}} /", "Sana: ____________    Imzo: ____________ / {{employee.fullName}} /") },
  ] },
};

export const LOAN_DEBT_CLAIM: DocumentDefinition = {
  id: "debt-loan-claim-v1", code: "0601001", categoryCode: "06", subcategoryCode: "01", documentCode: "001", slug: "loan-debt-recovery-claim", categorySlug: "debt",
  titleRu: "Исковое заявление о взыскании задолженности по договору займа", titleUz: "Qarz shartnomasi bo‘yicha qarzdorlikni undirish to‘g‘risida da’vo arizasi",
  descriptionRu: "Проект иска займодавца о взыскании суммы займа, согласованных процентов и иных подтверждённых требований.", descriptionUz: "Qarz beruvchining qarz summasi, kelishilgan foizlar va boshqa tasdiqlangan talablarni undirish bo‘yicha da’vo loyihasi.",
  legalBasisRu: ["Гражданский кодекс Республики Узбекистан", "Гражданский процессуальный кодекс Республики Узбекистан"], legalBasisUz: ["O‘zbekiston Respublikasining Fuqarolik kodeksi", "O‘zbekiston Respublikasining Fuqarolik protsessual kodeksi"],
  status: "published", editorialStatus: "Published", version: "1.0.0", estimatedMinutes: 11, popular: true, updatedAt: UPDATED_AT,
  collaboration: STANDARD_COLLABORATION,
  questionnaire: [
    { id: "court-and-parties", title: t("Суд и стороны", "Sud va taraflar"), fields: [...courtBlock(), ...naturalPersonBlock("creditor", "займодавец (истец)", "Qarz beruvchi (da’vogar)"), ...naturalPersonBlock("debtor", "заёмщик (ответчик)", "Qarz oluvchi (javobgar)"), ...representativeBlock()] },
    { id: "loan", title: t("Займ и передача денег", "Qarz va pulni topshirish"), fields: [
      { id: "loan.documentType", type: "select", label: t("Чем подтверждается займ", "Qarz nima bilan tasdiqlanadi"), required: true, options: [{ value: "agreement", label: t("Договором займа", "Qarz shartnomasi bilan") }, { value: "receipt", label: t("Распиской", "Tilxat bilan") }, { value: "other", label: t("Иным документом или доказательством", "Boshqa hujjat yoki dalil bilan") }], reusableBlock: "debt-details" },
      { id: "loan.documentDate", type: "date", label: t("Дата документа", "Hujjat sanasi"), required: true, reusableBlock: "debt-details" },
      { id: "loan.documentNumber", type: "short-text", label: t("Номер документа — если есть", "Hujjat raqami — mavjud bo‘lsa"), reusableBlock: "debt-details" },
      { id: "loan.amount", type: "money", label: t("Сумма займа", "Qarz summasi"), required: true, reusableBlock: "debt-details" },
      { id: "loan.currency", type: "currency", label: t("Валюта", "Valyuta"), required: true, options: [{ value: "UZS", label: t("Узбекский сум", "O‘zbekiston so‘mi") }, { value: "USD", label: t("Доллар США", "AQSh dollari") }], reusableBlock: "debt-details" },
      { id: "loan.transferDate", type: "date", label: t("Дата передачи денег", "Pul topshirilgan sana"), required: true, reusableBlock: "debt-details" },
      { id: "loan.transferMethod", type: "select", label: t("Способ передачи денег", "Pulni topshirish usuli"), required: true, options: [{ value: "cash", label: t("Наличными", "Naqd pulda") }, { value: "bank", label: t("Банковским переводом", "Bank o‘tkazmasi orqali") }, { value: "card", label: t("Переводом на карту", "Kartaga o‘tkazish orqali") }, { value: "other", label: t("Иным способом", "Boshqa usulda") }], reusableBlock: "payment-terms" },
      { id: "loan.transferEvidence", type: "long-text", label: t("Подтверждение передачи денег", "Pul topshirilganini tasdiqlovchi dalil"), required: true, reusableBlock: "debt-details" },
    ] },
    { id: "repayment", title: t("Срок, проценты и задолженность", "Muddat, foizlar va qarzdorlik"), fields: [
      { id: "loan.dueDate", type: "date", label: t("Срок возврата займа", "Qarzni qaytarish muddati"), required: true, reusableBlock: "debt-details" },
      { id: "loan.interestMode", type: "radio", label: t("Займ является процентным?", "Qarz foizlimi?"), required: true, options: [{ value: "interest", label: t("Да", "Ha") }, { value: "free", label: t("Нет, беспроцентный", "Yo‘q, foizsiz") }], reusableBlock: "debt-details" },
      { id: "loan.interestRate", type: "percent", label: t("Процентная ставка", "Foiz stavkasi"), condition: { field: "loan.interestMode", operator: "equals", value: "interest" }, reusableBlock: "debt-details" },
      { id: "debt.principal", type: "money", label: t("Невозвращённая основная сумма", "Qaytarilmagan asosiy summa"), required: true, reusableBlock: "debt-details" },
      { id: "debt.interest", type: "money", label: t("Сумма процентов — если требуется", "Foiz summasi — talab qilinsa"), condition: { field: "loan.interestMode", operator: "equals", value: "interest" }, reusableBlock: "debt-details" },
      { id: "debt.penalty", type: "money", label: t("Неустойка или иная сумма — если обоснована", "Neustoyka yoki boshqa summa — asoslangan bo‘lsa"), reusableBlock: "penalty-details" },
      { id: "debt.calculation", type: "long-text", label: t("Подробный расчёт требований", "Talablarning batafsil hisob-kitobi"), required: true, reusableBlock: "debt-details" },
    ] },
    { id: "claim", title: t("Досудебные действия и требования", "Sudgacha harakatlar va talablar"), fields: [
      { id: "claim.demandSent", type: "radio", label: t("Направлялось требование о возврате долга?", "Qarzni qaytarish talabi yuborilganmi?"), options: yesNoOptions, required: true },
      { id: "claim.demandDetails", type: "long-text", label: t("Дата, способ и результат направления требования", "Talab yuborilgan sana, usul va natija"), condition: { field: "claim.demandSent", operator: "equals", value: "yes" } },
      { id: "claim.additionalRequests", type: "long-text", label: t("Дополнительные требования — необязательно", "Qo‘shimcha talablar — ixtiyoriy") }, attachmentsField,
    ] },
    { id: "review", title: t("Проверка и создание", "Tekshirish va yaratish"), description: warning, fields: [confirmationField()] },
  ],
  generationSchema: { fileName: t("Иск о взыскании долга по займу", "Qarz bo‘yicha qarzdorlikni undirish da’vosi"), paragraphs: [
    { id: "recipient", kind: "body", text: t("В {{court.name}}\nИстец: {{creditor.fullName}}, адрес: {{creditor.address}}, телефон: {{creditor.phone}}\nОтветчик: {{debtor.fullName}}, адрес: {{debtor.address}}, телефон: {{debtor.phone}}", "{{court.name}}ga\nDa’vogar: {{creditor.fullName}}, manzil: {{creditor.address}}, telefon: {{creditor.phone}}\nJavobgar: {{debtor.fullName}}, manzil: {{debtor.address}}, telefon: {{debtor.phone}}") },
    { id: "title", kind: "title", text: t("ИСКОВОЕ ЗАЯВЛЕНИЕ\nо взыскании задолженности по договору займа", "QARZ SHARTNOMASI BO‘YICHA QARZDORLIKNI UNDIRISH TO‘G‘RISIDA\nDA’VO ARIZASI") },
    { id: "loan", kind: "body", text: t("{{loan.documentDate}} между сторонами оформлен займ ({{loan.documentType}}) на сумму {{loan.amount}} {{loan.currency}}. Денежные средства переданы {{loan.transferDate}} способом: {{loan.transferMethod}}. Подтверждение: {{loan.transferEvidence}}", "{{loan.documentDate}} kuni taraflar o‘rtasida {{loan.amount}} {{loan.currency}} miqdorida qarz ({{loan.documentType}}) rasmiylashtirilgan. Pul {{loan.transferDate}} kuni {{loan.transferMethod}} usulida topshirilgan. Tasdiq: {{loan.transferEvidence}}") },
    { id: "breach", kind: "body", text: t("Срок возврата наступил {{loan.dueDate}}, однако обязательство исполнено не полностью. Невозвращённая сумма составляет {{debt.principal}} {{loan.currency}}. Расчёт требований: {{debt.calculation}}", "Qarzni qaytarish muddati {{loan.dueDate}}da kelgan, biroq majburiyat to‘liq bajarilmagan. Qaytarilmagan summa {{debt.principal}} {{loan.currency}}ni tashkil etadi. Talablar hisob-kitobi: {{debt.calculation}}") },
    { id: "demand", kind: "body", text: t("Сведения о досудебном требовании: {{claim.demandDetails}}", "Sudgacha talab to‘g‘risidagi ma’lumotlar: {{claim.demandDetails}}"), condition: { field: "claim.demandSent", operator: "equals", value: "yes" } },
    { id: "legal", kind: "body", text: t("На основании Гражданского кодекса Республики Узбекистан и Гражданского процессуального кодекса Республики Узбекистан прошу суд:", "O‘zbekiston Respublikasining Fuqarolik kodeksi va Fuqarolik protsessual kodeksiga asosan suddan quyidagilarni so‘rayman:") },
    { id: "request-1", kind: "list", text: t("1. Взыскать с ответчика основной долг в размере {{debt.principal}} {{loan.currency}}.", "1. Javobgardan {{debt.principal}} {{loan.currency}} miqdoridagi asosiy qarzni undirish.") },
    { id: "request-2", kind: "list", text: t("2. Взыскать проценты в размере {{debt.interest}} {{loan.currency}}.", "2. {{debt.interest}} {{loan.currency}} miqdoridagi foizlarni undirish."), condition: { field: "loan.interestMode", operator: "equals", value: "interest" } },
    { id: "request-3", kind: "list", text: t("3. Иные требования: {{claim.additionalRequests}}", "3. Boshqa talablar: {{claim.additionalRequests}}"), condition: { field: "claim.additionalRequests", operator: "filled" } },
    { id: "attachments", kind: "heading", text: t("Приложения", "Ilovalar") }, { id: "attachments-list", kind: "body", text: t("{{claim.attachments}}", "{{claim.attachments}}") },
    { id: "signature", kind: "signature", text: t("Дата: ____________    Подпись: ____________ / {{creditor.fullName}} /", "Sana: ____________    Imzo: ____________ / {{creditor.fullName}} /") },
  ] },
};

export const PILOT_DOCUMENTS = [DIVORCE_CLAIM, SALARY_CLAIM, LOAN_DEBT_CLAIM] as const;
