import type { LegalCorpusLanguage } from "./trust";

export type LexDiscoveredDocument = {
  canonicalDocumentId: string;
  language: LegalCorpusLanguage;
  sourceUrl: string;
};

export const LEX_CORPUS_CATEGORIES = [
  { key: "laws", searchKind: "nat", query: "sort_id=3975&form_id=3968" },
  { key: "oliy_majlis", searchKind: "oliy", query: "" },
  { key: "president", searchKind: "nat", query: "sort_id=3985" },
  { key: "government", searchKind: "nat", query: "sort_id=3988" },
  { key: "ministries", searchKind: "nat", query: "sort_id=3991" },
  { key: "local_authorities", searchKind: "loc", query: "" },
  { key: "court_acts", searchKind: "nat", query: "sort_id=4015" },
  { key: "international", searchKind: "int", query: "" },
  { key: "technical", searchKind: "tech", query: "" },
  { key: "court_practice", searchKind: "court", query: "" },
  { key: "central_election_commission", searchKind: "nat", query: "sort_id=18951" },
] as const;

export type LexCorpusCategoryKey = (typeof LEX_CORPUS_CATEGORIES)[number]["key"];

export const LEX_CORPUS_LANGUAGES = [
  { language: "ru" as const, pathPrefix: "/ru", langId: "1" },
  { language: "en" as const, pathPrefix: "/en", langId: "2" },
  { language: "uz-Cyrl" as const, pathPrefix: "", langId: "3" },
  { language: "uz-Latn" as const, pathPrefix: "/uz", langId: "4" },
] as const;

const LEX_ORIGIN = "https://lex.uz";
const DOCUMENT_PATH = /^\/(?:(?<locale>ru|uz|uzc|en)\/)?docs\/(?<id>-?\d+)(?:[/?#]|$)/iu;

function officialLexUrl(value: string, baseUrl = LEX_ORIGIN): URL | null {
  try {
    const url = new URL(value, baseUrl);
    if (
      url.protocol !== "https:"
      || (url.hostname !== "lex.uz" && url.hostname !== "www.lex.uz")
      || url.username
      || url.password
      || url.port
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function languageForLocale(value: string): LegalCorpusLanguage {
  return value.toLocaleLowerCase() === "ru"
    ? "ru"
    : value.toLocaleLowerCase() === "en"
      ? "en"
    : value.toLocaleLowerCase() === "uzc"
      ? "uz-Cyrl"
      : "uz-Latn";
}

function localeForLanguage(language: LegalCorpusLanguage): "ru" | "uz" | "uzc" | "en" {
  if (language === "ru") return "ru";
  if (language === "en") return "en";
  if (language === "uz-Cyrl") return "uzc";
  return "uz";
}

function documentUrlFor(language: LegalCorpusLanguage, id: string): string {
  if (language === "uz-Cyrl") return `${LEX_ORIGIN}/docs/${id.replace(/^-/, "")}`;
  return `${LEX_ORIGIN}/${localeForLanguage(language)}/docs/${id}`;
}

export function parseLexDocumentUrl(value: string, baseUrl = LEX_ORIGIN): LexDiscoveredDocument | null {
  const url = officialLexUrl(value, baseUrl);
  if (!url) return null;
  const match = DOCUMENT_PATH.exec(url.pathname);
  if (!match?.groups?.id) return null;
  const canonicalDocumentId = "lexuz:" + match.groups.id.replace(/^-/, "");
  const locale = (match.groups.locale ?? "uzc").toLocaleLowerCase();
  const language = languageForLocale(locale);
  return {
    canonicalDocumentId,
    language,
    sourceUrl: documentUrlFor(language, match.groups.id),
  };
}

export function lexCatalogSearchUrl(
  categoryKey: LexCorpusCategoryKey,
  language: LegalCorpusLanguage,
): string {
  const category = LEX_CORPUS_CATEGORIES.find((entry) => entry.key === categoryKey);
  const locale = LEX_CORPUS_LANGUAGES.find((entry) => entry.language === language);
  if (!category || !locale) throw new TypeError("LEX_CATALOG_ROUTE_REJECTED");
  const params = new URLSearchParams(category.query);
  params.set("lang", locale.langId);
  const query = params.toString();
  return `${LEX_ORIGIN}${locale.pathPrefix}/search/${category.searchKind}${query ? `?${query}` : ""}`;
}

/**
 * Parses only Lex document links. Navigation, JavaScript and third-party URLs
 * are ignored, so discovery cannot treat untrusted page chrome as source data.
 */
export function discoverLexDocumentLinks(html: string, baseUrl = LEX_ORIGIN): LexDiscoveredDocument[] {
  const result: LexDiscoveredDocument[] = [];
  const seen = new Set<string>();
  const href = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/giu;
  for (const match of html.matchAll(href)) {
    const candidate = match[1] ?? match[2] ?? match[3];
    if (!candidate) continue;
    const parsed = parseLexDocumentUrl(candidate.replaceAll("&amp;", "&"), baseUrl);
    if (!parsed) continue;
    const key = parsed.canonicalDocumentId + ":" + parsed.language;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(parsed);
  }
  return result;
}

export function languageVariantsFromLinks(
  documentId: string,
  links: readonly LexDiscoveredDocument[],
): LexDiscoveredDocument[] {
  const variants = new Map<LegalCorpusLanguage, LexDiscoveredDocument>();
  for (const link of links) {
    if (link.canonicalDocumentId !== documentId || variants.has(link.language)) continue;
    variants.set(link.language, link);
  }
  return [...variants.values()];
}

function htmlAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "iu");
  const match = pattern.exec(tag);
  return (match?.[1] ?? match?.[2] ?? null)?.replaceAll("&amp;", "&") ?? null;
}

function languageFromTitle(title: string): LegalCorpusLanguage | null {
  const normalized = title.toLocaleLowerCase();
  if (normalized.includes("english")) return "en";
  if (normalized.includes("рус")) return "ru";
  if (normalized.includes("ўзбек")) return "uz-Cyrl";
  if (normalized.includes("o'zbek") || normalized.includes("o‘zbek")) return "uz-Latn";
  return null;
}

/** Links official language variants exposed by Lex document chrome. The
 * `onclick` route is treated only as metadata and is rebuilt through JURO's
 * strict canonical URL function before it can enter the queue. */
export function discoverLexLanguageVariants(
  html: string,
  current: LexDiscoveredDocument,
): LexDiscoveredDocument[] {
  const variants = new Map<LegalCorpusLanguage, LexDiscoveredDocument>([[current.language, current]]);
  for (const tagMatch of html.matchAll(/<(?:a|div)\b[^>]*\bdocContentHeader__item-link\b[^>]*>/giu)) {
    const tag = tagMatch[0];
    const title = htmlAttribute(tag, "title");
    const onclick = htmlAttribute(tag, "onclick");
    const language = title ? languageFromTitle(title) : null;
    const route = onclick ? /openUrl\(\s*['"]([^'"]+)['"]\s*\)/iu.exec(onclick)?.[1] : null;
    const id = route ? /\/docs\/(-?\d+)/iu.exec(route)?.[1] : null;
    if (!language || !id) continue;
    const parsed = parseLexDocumentUrl(documentUrlFor(language, id));
    if (parsed) variants.set(language, parsed);
  }
  return [...variants.values()];
}

export function lexLanguageFamilyId(variants: readonly LexDiscoveredDocument[]): string {
  const ids = variants.map((variant) => Number(variant.canonicalDocumentId.replace(/^lexuz:/u, "")))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  if (ids.length === 0) throw new TypeError("LEX_LANGUAGE_FAMILY_REJECTED");
  return `lexuz-family:${Math.min(...ids)}`;
}
