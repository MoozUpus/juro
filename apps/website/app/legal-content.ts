import previewCorpus from "../content/legal-preview.generated.json";

export type LegalLocale = "ru" | "uz";
export type LegalBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading3"; text: string }
  | { type: "bullet_list" | "ordered_list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

export type LegalSection = { heading: string; blocks: LegalBlock[] };
export type LegalDocument = {
  id: string;
  slug: string;
  version: string;
  title: string;
  description: string;
  sections: LegalSection[];
};

type CorpusDocument = {
  id: string;
  slug: string;
  version: string;
  locales: Record<LegalLocale, Omit<LegalDocument, "id" | "slug" | "version">>;
};

type LegalCorpus = { documents: CorpusDocument[] };

const corpus = previewCorpus as LegalCorpus;

export const legalSlugs = corpus.documents.map((document) => document.slug);
export type LegalSlug = (typeof legalSlugs)[number];

export const legalGroups = [
  {
    id: "using-juro",
    documents: ["legal-information", "user-agreement", "public-offer", "acceptable-use-policy"],
    ru: { title: "Использование JURO", description: "Статус платформы, правила доступа и условия цифровых функций." },
    uz: { title: "JUROdan foydalanish", description: "Platforma maqomi, kirish qoidalari va raqamli funksiyalar shartlari." },
  },
  {
    id: "privacy",
    documents: ["privacy-policy", "personal-data-processing-policy", "personal-data-consent", "cross-border-ai-consent", "cookie-policy", "data-subject-request-form"],
    ru: { title: "Конфиденциальность и данные", description: "Обработка данных, cookies, согласия и права субъекта данных." },
    uz: { title: "Maxfiylik va ma’lumotlar", description: "Ma’lumotlarni qayta ishlash, cookie, roziliklar va ma’lumotlar subyekti huquqlari." },
  },
  {
    id: "ai-documents",
    documents: ["ai-use-policy", "document-storage-rules", "electronic-communications-consent"],
    ru: { title: "AI и документы", description: "Границы AI, работа с файлами и электронные взаимодействия." },
    uz: { title: "AI va hujjatlar", description: "AI chegaralari, fayllar bilan ishlash va elektron o‘zaro aloqalar." },
  },
  {
    id: "marketplace",
    documents: ["marketplace-client-rules", "lawyer-platform-terms"],
    ru: { title: "Маркетплейс специалистов", description: "Правила для клиентов, юристов и адвокатов." },
    uz: { title: "Mutaxassislar marketpleysi", description: "Mijozlar, yuristlar va advokatlar uchun qoidalar." },
  },
  {
    id: "payments-communications",
    documents: ["payments-subscriptions-refunds", "marketing-consent", "complaints-disputes"],
    ru: { title: "Оплата и обращения", description: "Подписки, сообщения, жалобы и порядок разрешения споров." },
    uz: { title: "To‘lov va murojaatlar", description: "Obunalar, xabarlar, shikoyatlar va nizolarni ko‘rib chiqish tartibi." },
  },
] as const;

export const legacyLegalRoutes: Record<string, LegalSlug> = {
  terms: "user-agreement",
  "privacy-policy": "privacy-policy",
  "personal-data-processing": "personal-data-processing-policy",
  cookies: "cookie-policy",
  "ai-rules": "ai-use-policy",
};

export function isLegalLocale(value: string): value is LegalLocale {
  return value === "ru" || value === "uz";
}

export function getLegalDocument(locale: LegalLocale, slug: string): LegalDocument | null {
  const document = corpus.documents.find((candidate) => candidate.slug === slug);
  if (!document) return null;
  return { id: document.id, slug: document.slug, version: document.version, ...document.locales[locale] };
}

export function legalPath(locale: LegalLocale, slug: string): string {
  return `/${locale}/legal/${slug}`;
}

export function relatedLegalDocuments(locale: LegalLocale, slug: string): LegalDocument[] {
  const group = legalGroups.find((candidate) => candidate.documents.includes(slug as never));
  const slugs = group ? group.documents : legalSlugs;
  return slugs
    .filter((candidate) => candidate !== slug)
    .map((candidate) => getLegalDocument(locale, candidate))
    .filter((candidate): candidate is LegalDocument => candidate !== null)
    .slice(0, 4);
}
