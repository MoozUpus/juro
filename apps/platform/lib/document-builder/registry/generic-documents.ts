import { confirmationField, courtBlock, naturalPersonBlock, representativeBlock, t, yesNoOptions } from "./shared-blocks";
import type { DocumentCategory, GenerationSchema, QuestionnaireField, QuestionnaireStep } from "./types";

const currencyOptions = [
  { value: "UZS", label: t("Узбекский сум", "O‘zbekiston so‘mi") },
  { value: "USD", label: t("Доллар США", "AQSh dollari") },
];

const partyTypeOptions = [
  { value: "person", label: t("Физическое лицо", "Jismoniy shaxs") },
  { value: "company", label: t("Юридическое лицо", "Yuridik shaxs") },
];

const categoryMatter: Record<string, { titleRu: string; titleUz: string; detailsRu: string; detailsUz: string }> = {
  family: { titleRu: "Семейные обстоятельства", titleUz: "Oilaviy holatlar", detailsRu: "Опишите семейные отношения, сведения о браке, детях и иных значимых обстоятельствах", detailsUz: "Oilaviy munosabatlar, nikoh, bolalar va boshqa muhim holatlarni bayon qiling" },
  work: { titleRu: "Трудовые отношения", titleUz: "Mehnat munosabatlari", detailsRu: "Опишите должность, период работы, договор и допущенное нарушение", detailsUz: "Lavozim, ish davri, shartnoma va sodir etilgan buzilishni bayon qiling" },
  debt: { titleRu: "Обязательство и задолженность", titleUz: "Majburiyat va qarzdorlik", detailsRu: "Опишите основание долга, срок исполнения и допущенную просрочку", detailsUz: "Qarz asosi, bajarish muddati va yo‘l qo‘yilgan kechikishni bayon qiling" },
  property: { titleRu: "Имущество и право", titleUz: "Mol-mulk va huquq", detailsRu: "Опишите имущество, его характеристики, основание владения и возникший спор", detailsUz: "Mol-mulk, uning xususiyatlari, egalik asosi va yuzaga kelgan nizoni bayon qiling" },
  consumer: { titleRu: "Товар или услуга", titleUz: "Tovar yoki xizmat", detailsRu: "Опишите товар или услугу, дату приобретения, недостатки и обращение к продавцу", detailsUz: "Tovar yoki xizmat, xarid sanasi, kamchiliklar va sotuvchiga murojaatni bayon qiling" },
  damages: { titleRu: "Причинённый вред", titleUz: "Yetkazilgan zarar", detailsRu: "Опишите событие, причинённый вред, причинную связь и подтверждающие документы", detailsUz: "Hodisa, yetkazilgan zarar, sababiy bog‘lanish va tasdiqlovchi hujjatlarni bayon qiling" },
  inheritance: { titleRu: "Наследственные обстоятельства", titleUz: "Meros holatlari", detailsRu: "Опишите наследодателя, состав наследства, наследников и спорные обстоятельства", detailsUz: "Meros qoldiruvchi, meros tarkibi, merosxo‘rlar va nizoli holatlarni bayon qiling" },
  housing: { titleRu: "Жилое помещение", titleUz: "Turar joy", detailsRu: "Опишите жилое помещение, права сторон, проживание, регистрацию и возникший спор", detailsUz: "Turar joy, taraflarning huquqlari, yashash, ro‘yxat va yuzaga kelgan nizoni bayon qiling" },
  appeals: { titleRu: "Обжалуемый судебный акт", titleUz: "Shikoyat qilinayotgan sud hujjati", detailsRu: "Укажите суд, дату, номер дела, содержание решения и причины несогласия", detailsUz: "Sud, sana, ish raqami, qaror mazmuni va norozilik sabablarini ko‘rsating" },
  civil: { titleRu: "Спорные правоотношения", titleUz: "Nizoli huquqiy munosabatlar", detailsRu: "Опишите договор, событие или иное основание спора и допущенное нарушение", detailsUz: "Shartnoma, hodisa yoki nizoning boshqa asosi va sodir etilgan buzilishni bayon qiling" },
  court: { titleRu: "Обстоятельства обращения", titleUz: "Murojaat holatlari", detailsRu: "Опишите дело, процессуальную ситуацию и причины подачи этого документа", detailsUz: "Ish, protsessual vaziyat va ushbu hujjatni topshirish sabablarini bayon qiling" },
  contracts: { titleRu: "Предмет и условия договора", titleUz: "Shartnoma predmeti va shartlari", detailsRu: "Опишите предмет, сроки, порядок исполнения и согласованные условия договора", detailsUz: "Shartnoma predmeti, muddatlari, bajarish tartibi va kelishilgan shartlarni bayon qiling" },
  "powers-of-attorney": { titleRu: "Полномочия представителя", titleUz: "Vakilning vakolatlari", detailsRu: "Опишите представителя, объём полномочий, срок и допустимые ограничения", detailsUz: "Vakil, vakolatlar hajmi, muddati va cheklovlarni bayon qiling" },
  applications: { titleRu: "Основание заявления", titleUz: "Ariza asosi", detailsRu: "Опишите обстоятельства, адресата, просьбу и подтверждающие документы", detailsUz: "Holatlar, manzil, iltimos va tasdiqlovchi hujjatlarni bayon qiling" },
  corporate: { titleRu: "Корпоративное решение", titleUz: "Korporativ qaror", detailsRu: "Опишите организацию, компетентный орган, повестку и принимаемое решение", detailsUz: "Tashkilot, vakolatli organ, kun tartibi va qabul qilinadigan qarorni bayon qiling" },
  personal: { titleRu: "Личные обстоятельства", titleUz: "Shaxsiy holatlar", detailsRu: "Опишите заявителя, жизненную ситуацию, адресата и требуемый результат", detailsUz: "Arizachi, hayotiy vaziyat, manzil va kerakli natijani bayon qiling" },
  notarial: { titleRu: "Нотариально значимые обстоятельства", titleUz: "Notarial ahamiyatga ega holatlar", detailsRu: "Опишите участников, волеизъявление, полномочия и требуемую нотариальную форму", detailsUz: "Ishtirokchilar, iroda, vakolatlar va talab qilinadigan notarial shaklni bayon qiling" },
};

function partyFields(): QuestionnaireField[] {
  return [
    { id: "otherParty.type", type: "radio", label: t("Вторая сторона", "Ikkinchi taraf"), options: partyTypeOptions, required: true },
    { id: "otherParty.fullName", type: "full-name", label: t("Ф.И.О. второй стороны", "Ikkinchi tarafning F.I.Sh."), condition: { field: "otherParty.type", operator: "equals", value: "person" }, required: true, reusableBlock: "party-natural-person" },
    { id: "otherParty.companyName", type: "company-name", label: t("Наименование организации", "Tashkilot nomi"), condition: { field: "otherParty.type", operator: "equals", value: "company" }, required: true, reusableBlock: "party-legal-entity" },
    { id: "otherParty.tin", type: "tin", label: t("ИНН организации — если известен", "Tashkilot STIRi — ma’lum bo‘lsa"), condition: { field: "otherParty.type", operator: "equals", value: "company" }, reusableBlock: "company-details" },
    { id: "otherParty.address", type: "address", label: t("Адрес второй стороны", "Ikkinchi taraf manzili"), required: true },
    { id: "otherParty.phone", type: "phone", label: t("Телефон второй стороны — если известен", "Ikkinchi taraf telefoni — ma’lum bo‘lsa") },
  ];
}

function matterFields(categorySlug: string): QuestionnaireField[] {
  const fields: QuestionnaireField[] = [
    { id: "matter.eventDate", type: "date", label: t("Дата основного события — если применимо", "Asosiy hodisa sanasi — tegishli bo‘lsa") },
    { id: "matter.details", type: "long-text", label: t(categoryMatter[categorySlug].detailsRu, categoryMatter[categorySlug].detailsUz), required: true },
    { id: "matter.hasAmount", type: "radio", label: t("Связано ли требование с денежной суммой?", "Talab pul summasi bilan bog‘liqmi?"), options: yesNoOptions, required: true },
    { id: "matter.amount", type: "money", label: t("Сумма требования", "Talab summasi"), condition: { field: "matter.hasAmount", operator: "equals", value: "yes" }, required: true },
    { id: "matter.currency", type: "currency", label: t("Валюта", "Valyuta"), options: currencyOptions, condition: { field: "matter.hasAmount", operator: "equals", value: "yes" }, required: true },
    { id: "matter.calculation", type: "long-text", label: t("Расчёт суммы и пояснения", "Summa hisob-kitobi va izohlar"), condition: { field: "matter.hasAmount", operator: "equals", value: "yes" } },
  ];
  if (categorySlug === "family") fields.push({ id: "matter.children", type: "long-text", label: t("Сведения о детях и их интересах — если применимо", "Bolalar va ularning manfaatlari to‘g‘risidagi ma’lumotlar — tegishli bo‘lsa"), reusableBlock: "child-details" });
  if (["property", "housing", "inheritance", "damages"].includes(categorySlug)) fields.push({ id: "matter.propertyDescription", type: "long-text", label: t("Подробное описание имущества или объекта", "Mol-mulk yoki obyektning batafsil tavsifi"), reusableBlock: "property-description" });
  if (categorySlug === "work") fields.push({ id: "matter.employmentDocument", type: "long-text", label: t("Трудовой договор, приказ и иные документы", "Mehnat shartnomasi, buyruq va boshqa hujjatlar"), reusableBlock: "employment-details" });
  return fields;
}

export function createGenericQuestionnaire(category: DocumentCategory): QuestionnaireStep[] {
  const matter = categoryMatter[category.slug];
  return [
    { id: "court-and-parties", title: t("Суд и участники", "Sud va ishtirokchilar"), description: t("Укажите получателя документа и данные участников.", "Hujjat oluvchisi va ishtirokchilar ma’lumotlarini ko‘rsating."), fields: [...courtBlock(), ...naturalPersonBlock("applicant", "заявитель (истец)", "Arizachi (da’vogar)"), ...partyFields(), ...representativeBlock()] },
    { id: "case", title: t("Дело и основание обращения", "Ish va murojaat asosi"), fields: [
      { id: "case.number", type: "short-text", label: t("Номер дела — если оно уже рассматривается", "Ish raqami — ish ko‘rilayotgan bo‘lsa") },
      { id: "case.judge", type: "full-name", label: t("Судья — если известен", "Sudya — ma’lum bo‘lsa") },
      { id: "case.proceduralStatus", type: "select", label: t("Положение заявителя", "Arizachining protsessual maqomi"), required: true, options: [
        { value: "claimant", label: t("Истец или заявитель", "Da’vogar yoki arizachi") },
        { value: "respondent", label: t("Ответчик", "Javobgar") },
        { value: "third-party", label: t("Третье лицо", "Uchinchi shaxs") },
        { value: "other", label: t("Иное", "Boshqa") },
      ] },
      { id: "case.background", type: "long-text", label: t("Краткая история ситуации", "Vaziyatning qisqacha tarixi"), required: true },
    ] },
    { id: "matter", title: t(matter.titleRu, matter.titleUz), fields: matterFields(category.slug) },
    { id: "request-and-evidence", title: t("Требования и доказательства", "Talablar va dalillar"), fields: [
      { id: "claim.request", type: "long-text", label: t("Что вы просите у суда", "Suddan nimani so‘raysiz"), required: true },
      { id: "claim.legalGrounds", type: "long-text", label: t("Правовые основания — если известны", "Huquqiy asoslar — ma’lum bo‘lsa"), help: t("Не указывайте непроверенные статьи закона. JURO сформирует нейтральную вводную формулировку.", "Tekshirilmagan qonun moddalarini ko‘rsatmang. JURO neytral kirish jumlasini shakllantiradi.") },
      { id: "claim.pretrial", type: "long-text", label: t("Досудебные обращения и их результат — если были", "Sudgacha murojaatlar va ularning natijasi — bo‘lgan bo‘lsa") },
      { id: "claim.evidence", type: "long-text", label: t("Доказательства", "Dalillar"), required: true },
      { id: "claim.attachments", type: "long-text", label: t("Перечень приложений", "Ilovalar ro‘yxati"), required: true, help: t("Каждый документ укажите с новой строки.", "Har bir hujjatni yangi qatordan ko‘rsating.") },
    ] },
    { id: "review", title: t("Проверка и создание", "Tekshirish va yaratish"), description: t("Это бета-шаблон проекта документа. Перед подачей рекомендуется индивидуальная проверка юристом.", "Bu hujjat loyihasining beta-shabloni. Topshirishdan oldin yuristning individual tekshiruvi tavsiya etiladi."), fields: [confirmationField()] },
  ];
}

export function createGenericGeneration(titleRu: string, titleUz: string): GenerationSchema {
  return {
    fileName: t(titleRu, titleUz),
    paragraphs: [
      { id: "recipient-person", kind: "body", text: t("В {{court.name}}\nЗаявитель: {{applicant.fullName}}, адрес: {{applicant.address}}, телефон: {{applicant.phone}}\nДругая сторона: {{otherParty.fullName}}, адрес: {{otherParty.address}}", "{{court.name}}ga\nArizachi: {{applicant.fullName}}, manzil: {{applicant.address}}, telefon: {{applicant.phone}}\nIkkinchi taraf: {{otherParty.fullName}}, manzil: {{otherParty.address}}"), condition: { field: "otherParty.type", operator: "equals", value: "person" } },
      { id: "recipient-company", kind: "body", text: t("В {{court.name}}\nЗаявитель: {{applicant.fullName}}, адрес: {{applicant.address}}, телефон: {{applicant.phone}}\nДругая сторона: {{otherParty.companyName}}, ИНН: {{otherParty.tin}}, адрес: {{otherParty.address}}", "{{court.name}}ga\nArizachi: {{applicant.fullName}}, manzil: {{applicant.address}}, telefon: {{applicant.phone}}\nIkkinchi taraf: {{otherParty.companyName}}, STIR: {{otherParty.tin}}, manzil: {{otherParty.address}}"), condition: { field: "otherParty.type", operator: "equals", value: "company" } },
      { id: "case", kind: "subtitle", text: t("Дело № {{case.number}}", "Ish № {{case.number}}"), condition: { field: "case.number", operator: "filled" } },
      { id: "title", kind: "title", text: t(titleRu.toLocaleUpperCase("ru-RU"), titleUz.toLocaleUpperCase("uz-UZ")) },
      { id: "background", kind: "body", text: t("Обстоятельства дела: {{case.background}}", "Ish holatlari: {{case.background}}") },
      { id: "matter", kind: "body", text: t("Существенные сведения: {{matter.details}}", "Muhim ma’lumotlar: {{matter.details}}") },
      { id: "event-date", kind: "body", text: t("Дата основного события: {{matter.eventDate}}", "Asosiy hodisa sanasi: {{matter.eventDate}}"), condition: { field: "matter.eventDate", operator: "filled" } },
      { id: "property", kind: "body", text: t("Описание имущества или объекта: {{matter.propertyDescription}}", "Mol-mulk yoki obyekt tavsifi: {{matter.propertyDescription}}"), condition: { field: "matter.propertyDescription", operator: "filled" } },
      { id: "amount", kind: "body", text: t("Сумма требования: {{matter.amount}} {{matter.currency}}. Расчёт: {{matter.calculation}}", "Talab summasi: {{matter.amount}} {{matter.currency}}. Hisob-kitob: {{matter.calculation}}"), condition: { field: "matter.hasAmount", operator: "equals", value: "yes" } },
      { id: "pretrial", kind: "body", text: t("Досудебные обращения: {{claim.pretrial}}", "Sudgacha murojaatlar: {{claim.pretrial}}"), condition: { field: "claim.pretrial", operator: "filled" } },
      { id: "legal", kind: "body", text: t("На основании применимого законодательства Республики Узбекистан и представленных обстоятельств прошу:", "O‘zbekiston Respublikasining qo‘llaniladigan qonunchiligi va keltirilgan holatlarga asosan quyidagilarni so‘rayman:") },
      { id: "request", kind: "list", text: t("{{claim.request}}", "{{claim.request}}") },
      { id: "grounds", kind: "body", text: t("Указанные заявителем правовые основания: {{claim.legalGrounds}}", "Arizachi ko‘rsatgan huquqiy asoslar: {{claim.legalGrounds}}"), condition: { field: "claim.legalGrounds", operator: "filled" } },
      { id: "evidence", kind: "heading", text: t("Доказательства", "Dalillar") },
      { id: "evidence-list", kind: "body", text: t("{{claim.evidence}}", "{{claim.evidence}}") },
      { id: "attachments", kind: "heading", text: t("Приложения", "Ilovalar") },
      { id: "attachments-list", kind: "body", text: t("{{claim.attachments}}", "{{claim.attachments}}") },
      { id: "signature", kind: "signature", text: t("Дата: ____________    Подпись: ____________ / {{applicant.fullName}} /", "Sana: ____________    Imzo: ____________ / {{applicant.fullName}} /") },
    ],
  };
}
