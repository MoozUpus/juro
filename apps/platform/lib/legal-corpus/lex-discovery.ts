import type { LegalCorpusLanguage } from "./trust";

export type LexDiscoveredDocument = {
  canonicalDocumentId: string;
  language: LegalCorpusLanguage;
  sourceUrl: string;
};

const LEX_ORIGIN = "https://lex.uz";
const DOCUMENT_PATH = /^\/(?<locale>ru|uz|uzc)\/docs\/(?<id>-?\d+)(?:[/?#]|$)/iu;

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
    : value.toLocaleLowerCase() === "uzc"
      ? "uz-Cyrl"
      : "uz-Latn";
}

export function parseLexDocumentUrl(value: string, baseUrl = LEX_ORIGIN): LexDiscoveredDocument | null {
  const url = officialLexUrl(value, baseUrl);
  if (!url) return null;
  const match = DOCUMENT_PATH.exec(url.pathname);
  if (!match?.groups?.id || !match.groups.locale) return null;
  const canonicalDocumentId = "lexuz:" + match.groups.id.replace(/^-/, "");
  const locale = match.groups.locale.toLocaleLowerCase();
  return {
    canonicalDocumentId,
    language: languageForLocale(locale),
    sourceUrl: LEX_ORIGIN + "/" + locale + "/docs/" + match.groups.id,
  };
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
