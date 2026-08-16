import type { LegalCorpusLanguage } from "./trust";

export type LexDiscoveredDocument = {
  canonicalDocumentId: string;
  language: LegalCorpusLanguage;
  sourceUrl: string;
};

export type LexDiscoveredRevision = LexDiscoveredDocument & {
  revisionDate: string;
};

export type LexDocumentEffectivity = {
  status: "active" | "repealed" | "unknown";
  validFrom: string | null;
  validTo: string | null;
};

export type LexDocumentMetadata = {
  documentType: string | null;
  documentNumber: string | null;
  adoptingAuthority: string | null;
  adoptionDate: string | null;
};

export type LexArchiveRepresentation = {
  sourceUrl: string;
  archiveId: string;
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
  if (!url || url.search) return null;
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

function lexDateToIso(value: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s\d{2})?$/u.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const result = `${year}-${month}-${day}`;
  const candidate = new Date(`${result}T00:00:00Z`);
  return Number.isFinite(candidate.getTime())
    && candidate.toISOString().slice(0, 10) === result ? result : null;
}

function revisionQuery(url: URL): { raw: string; iso: string } | null {
  if (url.hash || !url.search) return null;
  const entries = [...url.searchParams.entries()];
  if (entries.length !== 1 || entries[0]?.[0] !== "ONDATE") return null;
  const raw = entries[0][1];
  const iso = lexDateToIso(raw);
  return iso ? { raw, iso } : null;
}

export function parseLexRevisionUrl(
  value: string,
  baseUrl = LEX_ORIGIN,
): LexDiscoveredRevision | null {
  const url = officialLexUrl(value, baseUrl);
  if (!url) return null;
  const revision = revisionQuery(url);
  if (!revision) return null;
  const document = parseLexDocumentUrl(`${url.origin}${url.pathname}`);
  if (!document) return null;
  return {
    ...document,
    sourceUrl: `${document.sourceUrl}?ONDATE=${encodeURIComponent(revision.raw)}`,
    revisionDate: revision.iso,
  };
}

function visibleText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#160;", " ")
    .replaceAll("&amp;", "&")
    .replace(/\s+/gu, " ")
    .trim();
}

function dateAfter(text: string, labels: readonly string[]): string | null {
  for (const label of labels) {
    const match = new RegExp(`${label}\\s*(\\d{2}\\.\\d{2}\\.\\d{4})`, "iu").exec(text);
    const parsed = match?.[1] ? lexDateToIso(match[1]) : null;
    if (parsed) return parsed;
  }
  return null;
}

function effectivityMetadataHtml(html: string): string {
  const header = /<div\b[^>]*class\s*=\s*["'][^"']*\bdocHeader\b[^"']*["'][^>]*>/iu.exec(html);
  if (header?.index === undefined) return html;
  const suffix = html.slice(header.index);
  const boundary = /<div\b[^>]*class\s*=\s*["'][^"']*\bdocBody-container\b[^"']*["'][^>]*>/iu.exec(suffix);
  return boundary?.index === undefined ? suffix : suffix.slice(0, boundary.index);
}

/** Extracts document-level effectivity only from visible official page text.
 * It deliberately does not infer a legal date from fetch time. */
export function parseLexDocumentEffectivity(html: string): LexDocumentEffectivity {
  // Legal text frequently repeals a different act. Only Lex's document
  // metadata header may determine whether the current source itself is in
  // force; otherwise a clause such as "the previous decision is repealed"
  // would poison the current version status.
  const text = visibleText(effectivityMetadataHtml(html));
  const validFrom = dateAfter(text, [
    "Дата вступления в силу", "Кучга кириш санаси", "Kuchga kirish sanasi", "Effective date",
  ]);
  const validTo = dateAfter(text, [
    "Акт утратил силу", "Дата прекращения действия", "Амал қилишни тўхтатиш санаси",
    "Amal qilishni tugatish sanasi", "Repealed on", "Expiry date",
  ]);
  const repealed = /Акт\s+утратил\s+силу|ўз\s+кучини\s+йўқот|o['‘’]?z\s+kuchini\s+yo['‘’]?qot|repealed/iu.test(text);
  const notYetEffective = /Акт\s+еще\s+не\s+вступил\s+в\s+силу|ҳали\s+кучга\s+кирмаган|hali\s+kuchga\s+kirmagan|not\s+yet\s+in\s+force/iu.test(text);
  return {
    status: repealed ? "repealed" : notYetEffective || !validFrom ? "unknown" : "active",
    validFrom,
    validTo,
  };
}

const DOCUMENT_TYPE_PATTERN = /(?<!\p{L})(?:конституционный\s+закон|закон|кодекс|указ|постановление|распоряжение|приказ|решение|низом|қонун|кодекс|фармон|қарор|буйруқ|qonun|kodeks|farmon|qaror|buyruq|decision|decree|resolution|order|law|code)(?!\p{L})/iu;
const AUTHORITY_PATTERN = /(?:президент|кабинет\s+министров|министерств|комитет|комисси|верховн\p{L}*\s+суд|сенат|законодательн\p{L}*\s+палат|prezident|vazirlar\s+mahkamasi|vazirlik|qo['‘’]?mita|komissiya|oliy\s+sud|senat|qonunchilik\s+palatasi|президент|вазирлар\s+маҳкамаси|вазирлик|қўмита|комиссия|олий\s+суд|сенат|қонунчилик\s+палатаси|president|cabinet|ministry|committee|commission|supreme\s+court|senate|legislative\s+chamber)/iu;

/** Reads the official document-card label from Lex's own metadata header.
 * Missing or ambiguous fields stay null; neither fetch time nor body text is
 * used to invent document requisites. */
export function parseLexDocumentMetadata(html: string): LexDocumentMetadata {
  const text = visibleText(effectivityMetadataHtml(html));
  const numbered = /^(?<descriptor>.{2,600}?)(?:,|\s)+(?:от|dated|санали|даги|dagi)?\s*(?<date>\d{2}\.\d{2}\.\d{4})(?:\s*(?:г\.|й\.|y\.)?)?\s*(?:№|N(?:o\.?|º)?)\s*(?<number>[\p{L}\d][\p{L}\d./\-–—]*)/iu.exec(text);
  if (!numbered?.groups) {
    return { documentType: null, documentNumber: null, adoptingAuthority: null, adoptionDate: null };
  }
  const descriptor = numbered.groups.descriptor.replace(/\s+/gu, " ").trim();
  const typeMatch = DOCUMENT_TYPE_PATTERN.exec(descriptor);
  const documentType = typeMatch?.[0]?.replace(/\s+/gu, " ").trim() ?? null;
  const remainder = documentType
    ? `${descriptor.slice(0, typeMatch?.index ?? 0)} ${descriptor.slice((typeMatch?.index ?? 0) + (typeMatch?.[0].length ?? 0))}`
      .replace(/^[\s,.:;–—-]+|[\s,.:;–—-]+$/gu, "")
      .replace(/\s+/gu, " ")
      .trim()
    : "";
  return {
    documentType,
    documentNumber: numbered.groups.number.trim(),
    adoptingAuthority: remainder && AUTHORITY_PATTERN.test(remainder) ? remainder : null,
    adoptionDate: lexDateToIso(numbered.groups.date),
  };
}

/** Reads only Lex's own revision controls and rebuilds every URL through the
 * strict ONDATE parser. Compare links and arbitrary script URLs are ignored. */
export function discoverLexRevisionHistory(
  html: string,
  current: LexDiscoveredDocument,
): { currentRevisionDate: string | null; revisions: LexDiscoveredRevision[] } {
  let currentRevisionDate: string | null = null;
  for (const match of html.matchAll(/<[^>]*\blx_date_selected\b[^>]*>([\s\S]*?)<\/[^>]+>/giu)) {
    currentRevisionDate = lexDateToIso(visibleText(match[1] ?? ""));
    if (currentRevisionDate) break;
  }

  const revisions = new Map<string, LexDiscoveredRevision>();
  for (const tag of html.matchAll(/<[^>]*\blx_date_link\b[^>]*>/giu)) {
    const onclick = htmlAttribute(tag[0], "onclick");
    const route = onclick ? /lxOpenUrl\(\s*['"]([^'"]+)['"]\s*\)/iu.exec(onclick)?.[1] : null;
    if (!route || route.includes("ONDATE2=") || route.includes("action=compare")) continue;
    const revision = parseLexRevisionUrl(route, current.sourceUrl);
    if (!revision
      || revision.canonicalDocumentId !== current.canonicalDocumentId
      || revision.language !== current.language) continue;
    revisions.set(revision.revisionDate, revision);
  }
  return {
    currentRevisionDate,
    revisions: [...revisions.values()].sort((left, right) =>
      right.revisionDate.localeCompare(left.revisionDate)),
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

/**
 * Finds the immutable ZIP representation linked by a canonical Lex document
 * page. The page is source data, not an instruction: only one exact HTTPS
 * `/files/<number>.zip` URL on the Lex allowlist can leave this parser. Lex
 * may render that link below a known locale prefix; those links are
 * normalized to the immutable root path before fetching.
 */
export function discoverLexArchiveRepresentation(
  html: string,
  baseUrl = LEX_ORIGIN,
): LexArchiveRepresentation | null {
  const representations = new Map<string, LexArchiveRepresentation>();
  const href = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/giu;
  for (const match of html.matchAll(href)) {
    const candidate = (match[1] ?? match[2] ?? match[3])?.replaceAll("&amp;", "&");
    if (!candidate) continue;
    const url = officialLexUrl(candidate, baseUrl);
    if (!url || url.search || url.hash) continue;
    const archive = /^\/(?:ru\/|uz\/|uzc\/|en\/)?files\/(?<id>\d+)\.zip$/iu.exec(url.pathname);
    if (!archive?.groups?.id) continue;
    const sourceUrl = `${LEX_ORIGIN}/files/${archive.groups.id}.zip`;
    representations.set(sourceUrl, { sourceUrl, archiveId: archive.groups.id });
  }
  if (representations.size > 1) {
    throw new TypeError("LEGAL_CORPUS_ATTACHMENT_CONFLICT");
  }
  return [...representations.values()][0] ?? null;
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
