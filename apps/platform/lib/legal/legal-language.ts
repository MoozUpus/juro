/**
 * JURO-owned legal-query normalization for Russian and Uzbek (Latin/Cyrillic).
 *
 * This is a clean TypeScript implementation of a behavioural need identified
 * during the Huquq AI audit. It contains no upstream corpus or copied code.
 */

export type LegalDocumentAlias =
  | "constitution"
  | "civil_code"
  | "labor_code"
  | "criminal_code"
  | "tax_code"
  | "family_code"
  | "administrative_code";

const APOSTROPHES = /[’‘ʼ`´ʻ]/gu;
const CYRILLIC_UZBEK = new Map<string, string>([
  ["а", "a"], ["б", "b"], ["в", "v"], ["г", "g"], ["д", "d"], ["е", "e"],
  ["ё", "yo"], ["ж", "j"], ["з", "z"], ["и", "i"], ["й", "y"], ["к", "k"],
  ["л", "l"], ["м", "m"], ["н", "n"], ["о", "o"], ["п", "p"], ["р", "r"],
  ["с", "s"], ["т", "t"], ["у", "u"], ["ф", "f"], ["х", "x"], ["ц", "ts"],
  ["ч", "ch"], ["ш", "sh"], ["щ", "sh"], ["ъ", ""], ["ь", ""], ["э", "e"],
  ["ю", "yu"], ["я", "ya"], ["ў", "oʻ"], ["қ", "q"], ["ғ", "gʻ"], ["ҳ", "h"],
]);

const DOCUMENT_ALIASES: ReadonlyArray<readonly [LegalDocumentAlias, RegExp]> = [
  ["constitution", /(?:конституц|konstitutsiya)/iu],
  ["civil_code", /(?:гражданск\p{L}*\s+кодекс|fuqarolik\s+kodeksi|\bгк\b|\bfk\b)/iu],
  ["labor_code", /(?:трудов\p{L}*\s+кодекс|mehnat\s+kodeksi|\bтк\b|\bmk\b)/iu],
  ["criminal_code", /(?:уголовн\p{L}*\s+кодекс|jinoyat\s+kodeksi|\bук\b|\bjk\b)/iu],
  ["tax_code", /(?:налогов\p{L}*\s+кодекс|soliq\s+kodeksi|\bнк\b|\bsk\b)/iu],
  ["family_code", /(?:семейн\p{L}*\s+кодекс|oila\s+kodeksi|\bск\b|\bok\b)/iu],
  ["administrative_code", /(?:административн\p{L}*\s+кодекс|ma.muriy\s+javobgarlik|\bмжк\b|\bmjk\b)/iu],
];

const ARTICLE_PREFIX = /(?:стать(?:я|и|ю|е)|ст\.?|модда(?:си|нинг)?|modda(?:si|ning)?|article)\s*[№#]?\s*(\d+(?:[.-]\d+)?)/giu;
const ARTICLE_SUFFIX = /(\d+(?:[.-]\d+)?)\s*(?:-?\s*)?(?:модда(?:си|нинг)?|modda(?:si|ning)?)/giu;

function normalized(value: string): string {
  return value.normalize("NFKC").replace(APOSTROPHES, "ʻ").replace(/[‐‑–—]/gu, "-");
}

/** Normalizes apostrophes and Unicode form without translating official Latin text. */
export function normalizeUzbekLatin(value: string): string {
  return normalized(value);
}

/** Normalizes the Uzbek Cyrillic alphabet without translating it. */
export function normalizeUzbekCyrillic(value: string): string {
  return normalized(value)
    .replace(/[ЎҚҒҲ]/gu, (character) => character.toLocaleLowerCase("uz"))
    .replace(/[Ё]/gu, "ё");
}

/** Transliteration is query-only; it must never replace the displayed official source. */
export function transliterateUzbek(value: string): string {
  return normalizeUzbekCyrillic(value).replace(/[\p{Script=Cyrillic}]/gu, (character) =>
    CYRILLIC_UZBEK.get(character.toLocaleLowerCase("uz")) ?? character,
  );
}

export function normalizeLegalReference(value: string, locale: "ru" | "uz" = "uz"): string {
  const normalizedValue = locale === "uz" ? transliterateUzbek(value) : normalized(value);
  return normalizedValue
    .replace(/\b(?:ст\.?|статья)\s*№?\s*(\d+)/giu, "статья $1")
    .replace(/\b(\d+)\s*-\s*(?:модда|modda)/giu, "$1-modda")
    .replace(/\s+/gu, " ")
    .trim();
}

/** All explicit references are returned in first-mention order and never invented. */
export function detectArticleNumbers(value: string): string[] {
  const found: string[] = [];
  for (const normalizedValue of [
    normalizeLegalReference(value, "ru"),
    normalizeLegalReference(value, "uz"),
  ]) {
    for (const pattern of [ARTICLE_PREFIX, ARTICLE_SUFFIX]) {
      pattern.lastIndex = 0;
      for (const match of normalizedValue.matchAll(pattern)) {
        const number = match[1];
        if (number && !found.includes(number)) found.push(number);
      }
    }
  }
  return found;
}

export function detectDocumentAliases(value: string): LegalDocumentAlias[] {
  const found: LegalDocumentAlias[] = [];
  for (const normalizedValue of [
    normalizeLegalReference(value, "ru"),
    normalizeLegalReference(value, "uz"),
  ]) {
    for (const [alias, pattern] of DOCUMENT_ALIASES) {
      if (pattern.test(normalizedValue) && !found.includes(alias)) found.push(alias);
    }
  }
  return found;
}

/**
 * Candidate retrieval uses this normalized query. UI and citations keep their
 * original source language and text unchanged.
 */
export function normalizeLegalSearchQuery(value: string, locale: "ru" | "uz"): string {
  return normalizeLegalReference(value, locale).toLocaleLowerCase(locale === "ru" ? "ru" : "uz");
}
