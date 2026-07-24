import { DOCUMENT_CATEGORIES } from "./categories";
import { STANDARD_COLLABORATION } from "./collaboration";
import { createGenericGeneration, createGenericQuestionnaire } from "./generic-documents";
import type { DocumentDefinition } from "./types";

type CandidateSeed = {
  code: string;
  categorySlug: string;
  titleRu: string;
  titleUz: string;
  descriptionRu: string;
  descriptionUz: string;
  sourceUrl: string;
};

const candidates: CandidateSeed[] = [
  {
    code: "0202001",
    categorySlug: "work",
    titleRu: "Договор о полной материальной ответственности работника",
    titleUz: "Xodimning to‘liq moddiy javobgarligi to‘g‘risidagi shartnoma",
    descriptionRu: "Кандидат на отдельный трудовой конструктор с данными работодателя, работника, должности и передаваемых ценностей.",
    descriptionUz: "Ish beruvchi, xodim, lavozim va topshiriladigan boyliklar haqidagi ma’lumotlar bilan mehnat konstruktori nomzodi.",
    sourceUrl: "https://yurxizmat.uz/ru/document/1603",
  },
  {
    code: "1301001",
    categorySlug: "contracts",
    titleRu: "Договор купли-продажи товаров между организациями",
    titleUz: "Tashkilotlar o‘rtasida tovar oldi-sotdi shartnomasi",
    descriptionRu: "Кандидат на коммерческий договор с перечнем товаров, ценой, оплатой, поставкой, приёмкой и реквизитами сторон.",
    descriptionUz: "Tovarlar ro‘yxati, narx, to‘lov, yetkazib berish, qabul qilish va tomonlar rekvizitlari bilan tijorat shartnomasi nomzodi.",
    sourceUrl: "https://yurxizmat.uz/ru/document/138",
  },
  {
    code: "1401001",
    categorySlug: "powers-of-attorney",
    titleRu: "Доверенность на ведение дела в суде",
    titleUz: "Sudda ish yuritish uchun ishonchnoma",
    descriptionRu: "Кандидат на конструктор полномочий представителя с обязательным предупреждением о нотариальной форме в применимых случаях.",
    descriptionUz: "Tegishli hollarda notarial shakl haqida majburiy ogohlantirish bilan vakil vakolatlari konstruktori nomzodi.",
    sourceUrl: "https://yurxizmat.uz/ru/document/134",
  },
  {
    code: "1501001",
    categorySlug: "applications",
    titleRu: "Заявление о регистрации по месту постоянного проживания",
    titleUz: "Doimiy yashash joyi bo‘yicha ro‘yxatdan o‘tish to‘g‘risida ariza",
    descriptionRu: "Кандидат на заявление с данными заявителя, адресом, основанием проживания и перечнем подтверждающих документов.",
    descriptionUz: "Arizachi ma’lumotlari, manzil, yashash asosi va tasdiqlovchi hujjatlar ro‘yxati bilan ariza nomzodi.",
    sourceUrl: "https://yurxizmat.uz/uz/document/296",
  },
];

export const YURXIZMAT_CANDIDATES: readonly DocumentDefinition[] = candidates.map((seed) => {
  const category = DOCUMENT_CATEGORIES.find((item) => item.slug === seed.categorySlug);
  if (!category) throw new Error(`Unknown candidate category: ${seed.categorySlug}`);
  const subcategoryCode = seed.code.slice(2, 4);
  const documentCode = seed.code.slice(4);
  return {
    id: `candidate-${seed.code}-v1`,
    code: seed.code,
    categoryCode: category.code,
    subcategoryCode,
    documentCode,
    slug: `document-${seed.code}`,
    categorySlug: seed.categorySlug,
    titleRu: seed.titleRu,
    titleUz: seed.titleUz,
    descriptionRu: seed.descriptionRu,
    descriptionUz: seed.descriptionUz,
    legalDisclaimerRu: "Это редактируемый проект, а не юридически проверенная финальная редакция. Перед подписанием или подачей документ необходимо проверить у юриста.",
    legalDisclaimerUz: "Bu tahrirlanadigan loyiha, huquqiy jihatdan tekshirilgan yakuniy tahrir emas. Imzolash yoki topshirishdan oldin hujjatni yuristga tekshirtirish zarur.",
    status: "published",
    editorialStatus: "Legal Review",
    version: "0.1.0",
    estimatedMinutes: 12,
    questionnaire: createGenericQuestionnaire(category),
    generationSchema: createGenericGeneration(seed.titleRu, seed.titleUz),
    collaboration: STANDARD_COLLABORATION,
    sourceReferences: [{ source: "yurxizmat", url: seed.sourceUrl, reviewedAt: "2026-07-24", note: "Использованы только публичные метаданные и функциональный сценарий; текст не копировался." }],
    updatedAt: "2026-07-24T00:00:00.000Z",
  };
});
