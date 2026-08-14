import { normalizeArticleNumber } from "../legal/legal-language";
import type { LegalCorpusLanguage } from "./trust";

export type ParsedLegalProvision = {
  articleNumber: string | null;
  articleNumberNormalized: string | null;
  title: string | null;
  text: string;
  sequence: number;
};

const ARTICLE_HEADING = /^(?:(?:статья|article)\s+|)(\d+(?:[-.]\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?(?:\s+prim(?:a|b|v)?)?)\s*(?:[-–—.]?\s*)(.*)$/iu;
const UZBEK_ARTICLE_HEADING = /^(\d+(?:[-.]\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?(?:\s+prim(?:a|b|v)?)?)\s*-\s*modda\.?\s*(.*)$/iu;

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
  const starts: Array<{ line: number; number: string; title: string | null }> = [];
  for (const [line, value] of lines.entries()) {
    const parsed = heading(value);
    if (parsed) starts.push({ line, ...parsed });
  }
  if (starts.length === 0) {
    const fallback = text.trim();
    return fallback ? [{
      articleNumber: null,
      articleNumberNormalized: null,
      title: null,
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
