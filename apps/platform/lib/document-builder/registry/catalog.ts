import { DOCUMENT_CATEGORIES } from "./categories";
import { createGenericGeneration, createGenericQuestionnaire } from "./generic-documents";
import { PILOT_DOCUMENTS } from "./pilots";
import type { DocumentDefinition, DocumentLibraryItem } from "./types";
import { getUzTitle } from "./uz-titles";
import { RECEIPT_COLLABORATION, STANDARD_COLLABORATION } from "./collaboration";
import { YURXIZMAT_CANDIDATES } from "./yurxizmat-candidates";
import { createBulkYurxizmatCandidates } from "./yurxizmat-bulk";

type ReviewSeed = { title: string; sourceOrder: number; duplicateOf?: string };

function reviewDocuments(
  categorySlug: string,
  sourceCategory: string,
  seeds: ReviewSeed[],
  options: { start?: number; subcategoryCode?: string } = {},
): DocumentDefinition[] {
  const category = DOCUMENT_CATEGORIES.find((item) => item.slug === categorySlug);
  if (!category) throw new Error(`Unknown document category: ${categorySlug}`);
  const start = options.start ?? 1;
  const subcategoryCode = options.subcategoryCode ?? "01";
  return seeds.map((seed, index) => {
    const documentCode = String(start + index).padStart(3, "0");
    const code = `${category.code}${subcategoryCode}${documentCode}`;
    const titleUz = getUzTitle(seed.title, code);
    return {
      id: `template-${code}-v1`,
      code,
      categoryCode: category.code,
      subcategoryCode,
      documentCode,
      slug: `document-${code}`,
      categorySlug,
      titleRu: seed.title,
      titleUz,
      descriptionRu: "Интерактивный бета-конструктор проекта документа. Структура доступна для заполнения, но перед подачей результат необходимо проверить у юриста.",
      descriptionUz: "Hujjat loyihasining interaktiv beta-konstruktori. Tuzilma to‘ldirish uchun ochiq, ammo topshirishdan oldin natijani yurist tekshirishi kerak.",
      status: "published",
      editorialStatus: "Translation Review",
      version: "0.5.0",
      estimatedMinutes: 12,
      collaboration: STANDARD_COLLABORATION,
      questionnaire: createGenericQuestionnaire(category),
      generationSchema: createGenericGeneration(seed.title, titleUz),
      updatedAt: "2026-07-24T00:00:00.000Z",
      sourceCategory,
      sourceOrder: seed.sourceOrder,
      duplicateOf: seed.duplicateOf,
    };
  });
}

const debtCategory = DOCUMENT_CATEGORIES.find((item) => item.slug === "debt");
if (!debtCategory) throw new Error("Debt category is required for the receipt template");

const RECEIPT_DOCUMENT: DocumentDefinition = {
  id: "receipt-money-v1",
  code: "0602001",
  categoryCode: "06",
  subcategoryCode: "02",
  documentCode: "001",
  slug: "money-receipt",
  categorySlug: "debt",
  titleRu: "Расписка в получении денежных средств",
  titleUz: "Pul mablag‘larini olganlik to‘g‘risida tilxat",
  descriptionRu: "Специализированный конструктор расписки с условиями передачи и возврата денег, процентами, свидетелями и совместным согласованием.",
  descriptionUz: "Pulni topshirish va qaytarish shartlari, foizlar, guvohlar hamda birgalikda kelishish imkoniyatiga ega maxsus tilxat konstruktori.",
  legalDisclaimerRu: "Этот шаблон предназначен для подготовки проекта документа. В сложных или спорных ситуациях рекомендуется проверка юристом.",
  legalDisclaimerUz: "Ushbu shablon hujjat loyihasini tayyorlash uchun mo‘ljallangan. Murakkab yoki nizoli vaziyatlarda yurist tekshiruvi tavsiya etiladi.",
  status: "published",
  editorialStatus: "Published",
  version: "1.0.0",
  estimatedMinutes: 15,
  popular: true,
  questionnaire: createGenericQuestionnaire(debtCategory),
  generationSchema: createGenericGeneration("Расписка в получении денежных средств", "Pul mablag‘larini olganlik to‘g‘risida tilxat"),
  collaboration: RECEIPT_COLLABORATION,
  legacyPaths: ["/document-builder"],
  sourceReferences: [{ source: "juro", reviewedAt: "2026-07-24", note: "Существующий специализированный конструктор JURO" }],
  specialBuilder: "receipt",
  updatedAt: "2026-07-24T00:00:00.000Z",
};

const courtSeeds: ReviewSeed[] = [
  "О вызове свидетелей в судебное заседание", "О допуске представителя к участию в деле", "О наложении ареста на имущество", "О назначении автотехнической экспертизы", "О назначении дополнительной экспертизы", "О назначении экспертизы", "О назначении медицинской экспертизы", "О назначении почерковедческой экспертизы", "О назначении повторной экспертизы", "О назначении психиатрической экспертизы", "О назначении строительной экспертизы", "О передаче дела в другой суд", "Ходатайство об отложении судебного заседания", "Ходатайство об обеспечении переводчиком", "Заявление о прекращении производства по делу", "Ходатайство об отсрочке уплаты государственной пошлины", "Ходатайство о приобщении доказательств к материалам дела", "Ходатайство о восстановлении процессуального срока", "Ходатайство о рассмотрении дела без участия стороны", "Заявление о принятии мер по обеспечению иска", "Заявление о приостановлении исполнительного производства", "Ходатайство о привлечении дополнительного ответчика", "Ходатайство о привлечении специалиста", "Ходатайство о продлении процессуального срока", "Ходатайство о ведении аудио-видеозаписи судебного заседания", "Заявление о разъяснении решения суда", "Заявление о направлении судебного поручения", "Ходатайство о назначении технической экспертизы", "Ходатайство о привлечении третьего лица к участию в деле", "Ходатайство об отложении судебного заседания", "Ходатайство о восстановлении срока на подачу апелляционной жалобы", "Заявление об отзыве искового заявления", "Ходатайство о возврате государственной пошлины", "Ходатайство о выдаче исполнительного листа", "Ходатайство о вынесении дополнительного решения", "Ходатайство о вызове эксперта", "Ходатайство о взыскании судебных расходов", "Ходатайство о рассмотрении дела в закрытом судебном заседании", "Ходатайство о замене ответчика", "Ходатайство о заочном рассмотрении дела", "Ходатайство об истребовании доказательств", "Ходатайство об истребовании документов", "Ходатайство об изменении основания иска", "Заявление об отзыве ходатайства", "Заявление об уменьшении исковых требований", "Заявление об увеличении исковых требований", "Заявление об уточнении исковых требований", "Заявление об утверждении мирового соглашения", "Заявление об отводе судьи", "Заявление об отмене обеспечительных мер по иску", "Заявление о прекращении производства по делу в связи с отказом от иска", "Ходатайство о снижении размера неустойки", "Ходатайство об отложении судебного заседания", "Ходатайство об объединении гражданских дел", "Ходатайство об ознакомлении с материалами гражданского дела", "Возражение на ходатайство", "Ходатайство о снижении размера государственной пошлины", "Ходатайство о приостановлении производства по делу", "Ходатайство об ускорении рассмотрения дела", "Заявление о пересмотре заочного решения", "Заявление о выдаче копии решения", "Ходатайство о признании доказательств подложными", "Заявление об изменении предмета иска", "Заявление об изменении обеспечительных мер по иску", "Заявление об исправлении описки", "Заявление о признании иска ответчиком", "Заявление о выдаче дубликата исполнительного листа", "Заявление о признании иска третьим лицом", "Заявление об отводе прокурора", "Заявление о выдаче дубликата судебного приказа", "Заявление об обратном исполнении решения суда", "Заявление о выдаче копии протокола судебного заседания", "Заявление о применении последствий пропуска срока обращения в суд", "Заявление об отсрочке исполнения решения суда", "Заявление о выдаче копии решения", "Заявление о выдаче копий документов", "Заявление о пересмотре решения суда по новым обстоятельствам",
].map((title, index) => ({ title, sourceOrder: index + 1, duplicateOf: index === 29 || index === 52 ? "0301013" : index === 74 ? "0301061" : undefined }));

const familySeeds: ReviewSeed[] = [
  { sourceOrder: 1, title: "Исковое заявление о взыскании алиментов (на содержание истца)" },
  { sourceOrder: 2, title: "Исковое заявление об освобождении от уплаты задолженности по алиментам" },
  { sourceOrder: 3, title: "Исковое заявление об уменьшении размера алиментов" },
  { sourceOrder: 4, title: "Исковое заявление о взыскании неустойки по алиментам" },
  { sourceOrder: 5, title: "Исковое заявление о перерасчёте и взыскании алиментов" },
  { sourceOrder: 6, title: "Исковое заявление о взыскании алиментов в твёрдой денежной сумме" },
  { sourceOrder: 7, title: "Исковое заявление об изменении установленного размера алиментов и взыскании алиментов в твёрдой денежной сумме" },
  { sourceOrder: 8, title: "Исковое заявление о взыскании алиментов на ребёнка" },
  { sourceOrder: 9, title: "Исковое заявление о взыскании алиментов на содержание совершеннолетнего нетрудоспособного ребёнка" },
  { sourceOrder: 10, title: "Исковое заявление о разделе имущества, нажитого в период брака" },
  { sourceOrder: 12, title: "Исковое заявление о взыскании алиментов на содержание родителя" },
  { sourceOrder: 13, title: "Заявление об отмене судебного приказа о взыскании алиментов" },
  { sourceOrder: 14, title: "Исковое заявление об осуществлении родительских прав при раздельном проживании" },
  { sourceOrder: 15, title: "Исковое заявление об оспаривании отцовства" },
  { sourceOrder: 16, title: "Исковое заявление об установлении отцовства и взыскании алиментов" },
  { sourceOrder: 17, title: "Исковое заявление об определении места жительства ребёнка" },
  { sourceOrder: 18, title: "Исковое заявление об устранении препятствий к общению с ребёнком" },
  { sourceOrder: 19, title: "Исковое заявление об установлении порядка общения с ребёнком" },
  { sourceOrder: 20, title: "Исковое заявление об отмене усыновления (удочерения)" },
  { sourceOrder: 21, title: "Исковое заявление об определении места жительства ребёнка", duplicateOf: "0101016" },
  { sourceOrder: 22, title: "Исковое заявление о восстановлении материнских (отцовских) прав" },
  { sourceOrder: 30, title: "Исковое заявление о признании недействительными заключения брака и его расторжения" },
  { sourceOrder: 31, title: "Исковое заявление о взыскании ущерба в связи с признанием брака недействительным" },
  { sourceOrder: 32, title: "Исковое заявление о расторжении брака", duplicateOf: "0101001" },
  { sourceOrder: 33, title: "Исковое заявление о признании фиктивного брака недействительным" },
  { sourceOrder: 34, title: "Исковое заявление о признании брака недействительным (супруг состоял в другом браке)" },
];

const inheritanceSeeds: ReviewSeed[] = [
  { sourceOrder: 23, title: "Исковое заявление о признании недействительными свидетельства о праве на наследство и завещания" },
  { sourceOrder: 24, title: "Исковое заявление о признании завещания недействительным" },
  { sourceOrder: 25, title: "Исковое заявление о признании наследника недостойным" },
  { sourceOrder: 26, title: "Исковое заявление о восстановлении срока для принятия наследства" },
  { sourceOrder: 27, title: "Исковое заявление о разделе наследственного имущества" },
  { sourceOrder: 28, title: "Исковое заявление о разделе наследственного имущества (вариант 2)", duplicateOf: "1001005" },
  { sourceOrder: 29, title: "Исковое заявление о включении имущества в состав наследства" },
];

const workSeeds: ReviewSeed[] = [
  { sourceOrder: 1, title: "Исковое заявление о восстановлении на работе и взыскании морального вреда" },
  { sourceOrder: 3, title: "Исковое заявление о взыскании заработной платы и компенсации за задержку выплат" },
  { sourceOrder: 4, title: "Исковое заявление о взыскании невыплаченных премий" },
  { sourceOrder: 5, title: "Исковое заявление о выдаче трудовой книжки и иных документов после увольнения" },
  { sourceOrder: 6, title: "Исковое заявление о признании трудовых отношений и понуждении работодателя к заключению трудового договора" },
  { sourceOrder: 7, title: "Исковое заявление о признании увольнения незаконным" },
];

const debtSeeds: ReviewSeed[] = [
  { sourceOrder: 1, title: "Исковое заявление о взыскании задолженности по арендной плате" },
  { sourceOrder: 2, title: "Исковое заявление о расторжении договора аренды и взыскании задолженности" },
  { sourceOrder: 3, title: "Исковое заявление о взыскании задолженности по кредитному договору" },
];

const civilSeeds: ReviewSeed[] = [
  { sourceOrder: 8, title: "Исковое заявление о признании гражданина недееспособным" },
  { sourceOrder: 9, title: "Исковое заявление о расторжении договора купли-продажи" },
  { sourceOrder: 12, title: "Исковое заявление о расторжении договора" },
];

const propertySeeds: ReviewSeed[] = [
  { sourceOrder: 6, title: "Исковое заявление об истребовании имущества из чужого незаконного владения" },
  { sourceOrder: 7, title: "Исковое заявление об исключении имущества из описи (снятии ареста)" },
  { sourceOrder: 13, title: "О признании права собственности на земельный участок" },
  { sourceOrder: 14, title: "О государственной регистрации перехода права собственности" },
  { sourceOrder: 15, title: "О признании права собственности на часть жилого дома" },
  { sourceOrder: 16, title: "О признании права собственности на автомобиль" },
  { sourceOrder: 17, title: "О признании права собственности" },
  { sourceOrder: 18, title: "О признании права собственности на гараж" },
  { sourceOrder: 21, title: "Об устранении препятствий в пользовании имуществом" },
];

const consumerSeeds: ReviewSeed[] = [
  { sourceOrder: 19, title: "О замене некачественного товара" },
  { sourceOrder: 20, title: "О защите прав потребителей и взыскании морального вреда" },
];

const damageSeeds: ReviewSeed[] = [
  { sourceOrder: 5, title: "Исковое заявление о взыскании морального вреда" },
  { sourceOrder: 10, title: "Исковое заявление о взыскании в порядке регресса" },
  { sourceOrder: 11, title: "Исковое заявление о взыскании вреда, причинённого здоровью гражданина" },
  { sourceOrder: 22, title: "О взыскании ущерба, причинённого автомобилю" },
  { sourceOrder: 23, title: "О взыскании ущерба, причинённого пожаром" },
  { sourceOrder: 24, title: "О взыскании материального ущерба с работника" },
  { sourceOrder: 25, title: "О взыскании ущерба, причинённого имуществу" },
  { sourceOrder: 26, title: "О взыскании ущерба, причинённого несовершеннолетним" },
  { sourceOrder: 27, title: "О взыскании ущерба, причинённого преступлением" },
];

const housingSeeds: ReviewSeed[] = [
  "Исковое заявление о выселении временно проживающих", "Исковое заявление о вселении в жилое помещение в принудительном порядке", "Исковое заявление о принудительном выселении из жилого дома", "Исковое заявление о признании утратившим право пользования жилым помещением и снятии с регистрационного учёта", "Исковое заявление о выселении из общежития", "Исковое заявление о признании права собственности на самовольную постройку", "Исковое заявление о сносе самовольной постройки", "Исковое заявление о взыскании ущерба, причинённого заливом квартиры", "Исковое заявление об определении порядка пользования жилым помещением", "Исковое заявление об определении порядка пользования домом",
].map((title, index) => ({ title, sourceOrder: index + 1 }));

const appealSeeds: ReviewSeed[] = [{ sourceOrder: 1, title: "Апелляционная жалоба на решение суда" }];

const REVIEW_DOCUMENTS = [
  ...reviewDocuments("court", "Заявления и ходатайства", courtSeeds),
  ...reviewDocuments("family", "Семейные споры", familySeeds, { start: 2 }),
  ...reviewDocuments("inheritance", "Семейные споры", inheritanceSeeds),
  ...reviewDocuments("work", "Трудовые споры", workSeeds, { start: 2 }),
  ...reviewDocuments("debt", "Прочие гражданские споры", debtSeeds, { start: 2 }),
  ...reviewDocuments("civil", "Прочие гражданские споры", civilSeeds),
  ...reviewDocuments("property", "Прочие гражданские споры", propertySeeds),
  ...reviewDocuments("consumer", "Прочие гражданские споры", consumerSeeds),
  ...reviewDocuments("damages", "Прочие гражданские споры", damageSeeds),
  ...reviewDocuments("housing", "Жилищные споры", housingSeeds),
  ...reviewDocuments("appeals", "Жалобы", appealSeeds),
];

const BASE_DOCUMENTS: readonly DocumentDefinition[] = [
  ...PILOT_DOCUMENTS,
  ...REVIEW_DOCUMENTS,
  RECEIPT_DOCUMENT,
  ...YURXIZMAT_CANDIDATES,
];

export const BULK_YURXIZMAT_CANDIDATES = createBulkYurxizmatCandidates(BASE_DOCUMENTS);

export const DOCUMENT_REGISTRY: readonly DocumentDefinition[] = [
  ...BASE_DOCUMENTS,
  ...BULK_YURXIZMAT_CANDIDATES,
].sort((left, right) => left.code.localeCompare(right.code));

export const OCCUPIED_DOCUMENT_CODES = Object.freeze(DOCUMENT_REGISTRY.map((document) => document.code));

export const DOCUMENT_LIBRARY: readonly DocumentLibraryItem[] = DOCUMENT_REGISTRY.map((document) => ({
  code: document.code,
  categorySlug: document.categorySlug,
  titleRu: document.titleRu,
  titleUz: document.titleUz,
  descriptionRu: document.descriptionRu,
  descriptionUz: document.descriptionUz,
  status: document.status,
  editorialStatus: document.editorialStatus,
  estimatedMinutes: document.estimatedMinutes,
  popular: document.popular,
}));

export function getDocumentByCode(code: string): DocumentDefinition | undefined {
  return DOCUMENT_REGISTRY.find((document) => document.code === code);
}

export function getDocumentsByCategory(categorySlug: string): DocumentDefinition[] {
  return DOCUMENT_REGISTRY.filter((document) => document.categorySlug === categorySlug);
}

export function getLibraryDocumentsByCategory(categorySlug: string): DocumentLibraryItem[] {
  return DOCUMENT_LIBRARY.filter((document) => document.categorySlug === categorySlug);
}

export function getPublishedDocuments(): DocumentDefinition[] {
  return DOCUMENT_REGISTRY.filter((document) => document.status === "published");
}
