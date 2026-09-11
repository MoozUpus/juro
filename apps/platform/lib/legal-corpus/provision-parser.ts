import { normalizeArticleNumber } from "../legal/legal-language";
import type { LegalCorpusLanguage } from "./trust";

export type ParsedLegalProvision = {
  articleNumber: string | null;
  articleNumberNormalized: string | null;
  title: string | null;
  section: string | null;
  chapter: string | null;
  part: string | null;
  structuralPath: string;
  text: string;
  sequence: number;
};

const ARTICLE_HEADING = /^(?:(?:статья|article)\s+|)(\d+(?:[-.]\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?(?:\s+prim(?:a|b|v)?)?)\s*(?:[-–—.]?\s*)(.*)$/iu;
const UZBEK_ARTICLE_HEADING = /^(\d+(?:[-.]\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?(?:\s+prim(?:a|b|v)?)?)\s*-\s*modda\.?\s*(.*)$/iu;
const SECTION_HEADING = /^(?:раздел|bo['‘’]?lim|бўлим)\s+[\p{L}\dIVXLC.\-]+(?:\s*[.:–—-]\s*.*)?$/iu;
const CHAPTER_HEADING = /^(?:глава|bob)\s+[\p{L}\dIVXLC.\-]+(?:\s*[.:–—-]\s*.*)?$/iu;
const PARAGRAPH_HEADING = /^(?:§\s*\d+[\p{L}\d.\-]*|paragraf\s+\d+[\p{L}\d.\-]*|параграф\s+\d+[\p{L}\d.\-]*)(?:\s*[.:–—-]\s*.*)?$/iu;

function heading(line: string): { number: string; title: string | null } | null {
  const trimmed = line.trim();
  const match = UZBEK_ARTICLE_HEADING.exec(trimmed)
    ?? ARTICLE_HEADING.exec(trimmed);
  if (!match?.[1]) return null;
  const number = normalizeArticleNumber(match[1]);
  if (!number) return null;
  const title = (match[2] ?? "").replace(/^[.:-]\s*/u, "").trim() || null;
  return { number, title };
}

/**
 * Extracts legal provisions from a normalized text layer. The parser never
 * executes or follows source text: source text stays a quotation payload.
 */
export function parseLegalProvisions(
  text: string,
  language: LegalCorpusLanguage,
): ParsedLegalProvision[] {
  // Kept in the contract for language-specific heading rules as Lex formats
  // evolve; current patterns safely cover the four supported languages.
  void language;
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const starts: Array<{
    line: number; number: string; title: string | null;
    section: string | null; chapter: string | null; part: string | null;
  }> = [];
  let section: string | null = null;
  let chapter: string | null = null;
  let part: string | null = null;
  for (const [line, value] of lines.entries()) {
    const structural = value.trim().replace(/\s+/gu, " ");
    if (SECTION_HEADING.test(structural)) {
      section = structural;
      chapter = null;
      part = null;
      continue;
    }
    if (CHAPTER_HEADING.test(structural)) {
      chapter = structural;
      part = null;
      continue;
    }
    if (PARAGRAPH_HEADING.test(structural)) {
      part = structural;
      continue;
    }
    const parsed = heading(value);
    if (parsed) starts.push({ line, ...parsed, section, chapter, part });
  }
  if (starts.length === 0) {
    const fallback = text.trim();
    return fallback ? [{
      articleNumber: null,
      articleNumberNormalized: null,
      title: null,
      section: null,
      chapter: null,
      part: null,
      structuralPath: "НПА",
      text: fallback,
      sequence: 0,
    }] : [];
  }
  return starts.map((start, index) => {
    const end = starts[index + 1]?.line ?? lines.length;
    const body = lines.slice(start.line, end).join("\n").trim();
    return {
      articleNumber: start.number,
      articleNumberNormalized: start.number,
      title: start.title,
      section: start.section,
      chapter: start.chapter,
      part: start.part,
      structuralPath: [start.section, start.chapter, start.part, `Статья ${start.number}`]
        .filter((segment): segment is string => Boolean(segment)).join(" > "),
      text: body,
      sequence: index,
    };
  }).filter((provision) => provision.text.length > 0);
}

/**
 * Article-first chunking: one provision remains one chunk unless it genuinely
 * exceeds the configured size, in which case it is split only on paragraphs.
 */
export function chunkLegalProvision(
  provision: ParsedLegalProvision,
  maxChars = 8_000,
): string[] {
  if (provision.text.length <= maxChars) return [provision.text];
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of provision.text.split(/\n{2,}/u)) {
    const next = current ? current + "\n\n" + paragraph : paragraph;
    if (current && next.length > maxChars) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
