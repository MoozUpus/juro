import { DOCUMENT_CATEGORIES } from "./categories";
import { STANDARD_COLLABORATION } from "./collaboration";
import { createGenericGeneration, createGenericQuestionnaire } from "./generic-documents";
import type { DocumentDefinition } from "./types";
import { YURXIZMAT_PUBLIC_CATALOG } from "./yurxizmat-public-catalog";

const CATEGORY_MAP = {
  contracts: { categorySlug: "contracts", categoryCode: "13" },
  statements: { categorySlug: "applications", categoryCode: "15" },
  "personal-documents": { categorySlug: "personal", categoryCode: "17" },
  notarial: { categorySlug: "notarial", categoryCode: "18" },
  court: { categorySlug: "court", categoryCode: "03" },
  "corporate-documents": { categorySlug: "corporate", categoryCode: "16" },
} as const;

const CURATED_SOURCE_IDS = new Set([134, 138, 296, 1603]);

function normalizedTitle(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").trim();
}

export function createBulkYurxizmatCandidates(reserved: readonly DocumentDefinition[]): DocumentDefinition[] {
  const occupiedTitles = new Set(reserved.map((document) => normalizedTitle(document.titleRu)));
  const categoryCounters = new Map<string, number>();
  const candidates: DocumentDefinition[] = [];
  for (const item of YURXIZMAT_PUBLIC_CATALOG) {
    const sequence = (categoryCounters.get(item.sourceCategory) ?? 0) + 1;
    categoryCounters.set(item.sourceCategory, sequence);
    if (CURATED_SOURCE_IDS.has(item.sourceId) || occupiedTitles.has(normalizedTitle(item.titleRu))) continue;
    const mapping = CATEGORY_MAP[item.sourceCategory];
    const category = DOCUMENT_CATEGORIES.find((entry) => entry.slug === mapping.categorySlug);
    if (!category) throw new Error(`Missing JURO category for ${item.sourceCategory}`);
    const documentCode = String(sequence).padStart(3, "0");
    const code = `${mapping.categoryCode}90${documentCode}`;
    const titleUz = item.titleUz || `Tarjima tekshiruvida — ${item.titleRu}`;
    candidates.push({
      id: `yurxizmat-candidate-${item.sourceId}-v1`,
      code,
      categoryCode: mapping.categoryCode,
      subcategoryCode: "90",
      documentCode,
      slug: `document-${code}`,
      categorySlug: mapping.categorySlug,
      titleRu: item.titleRu,
      titleUz,
      descriptionRu: "Редактируемый проект документа на основе самостоятельной универсальной формы JURO. Перед подписанием требуется юридическая проверка.",
      descriptionUz: "JUROning mustaqil universal shakli asosidagi tahrirlanadigan hujjat loyihasi. Imzolashdan oldin huquqiy tekshiruv talab etiladi.",
      legalDisclaimerRu: "Это редактируемый проект, а не юридически проверенная финальная редакция. Перед подписанием или подачей документ необходимо проверить у юриста.",
      legalDisclaimerUz: "Bu tahrirlanadigan loyiha, huquqiy jihatdan tekshirilgan yakuniy tahrir emas. Imzolash yoki topshirishdan oldin hujjatni yuristga tekshirtirish zarur.",
      status: "published",
      editorialStatus: item.titleUz ? "Legal Review" : "Translation Review",
      version: "0.1.0",
      estimatedMinutes: 12,
      questionnaire: createGenericQuestionnaire(category),
      generationSchema: createGenericGeneration(item.titleRu, titleUz),
      collaboration: STANDARD_COLLABORATION,
      sourceReferences: [{ source: "yurxizmat", url: item.sourceUrl, reviewedAt: "2026-07-24", note: "Только публичные метаданные и классификация; текст документа не копировался." }],
      sourceCategory: item.sourceCategory,
      sourceOrder: sequence,
      updatedAt: "2026-07-24T00:00:00.000Z",
    });
    occupiedTitles.add(normalizedTitle(item.titleRu));
  }
  return candidates;
}
