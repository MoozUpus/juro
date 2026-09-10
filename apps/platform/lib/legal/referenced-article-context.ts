import type { LegalSourceContext } from "../ai/provider";
import { detectArticleNumbers } from "./legal-language";

function articleNumber(value: string | null | undefined): string | undefined {
  return value ? detectArticleNumbers(value)[0] ?? (/^\d+(?:[.-]\d+)?$/u.test(value) ? value : undefined) : undefined;
}

/** Follow only explicit references to this same instrument, not citations to
 * other codes that happen to share an article number. These are discovery
 * candidates; separately fetched text still goes through answer grounding. */
export function referencedArticleContextRequests(sources: readonly LegalSourceContext[]) {
  const requests = new Map<string, { url: string; article: string }>();
  for (const source of sources) {
    if (source.sourceType !== "lex" || source.applicabilityStatus === "historical") continue;
    const url = new URL(source.officialUrl);
    url.hash = "";
    const text = (source.spans ?? []).map(span => span.text).join("\n") || source.excerpt || "";
    const own = articleNumber(source.article);
    const references = new Set<string>();
    if (own && /:\s*$/u.test(text)) references.add(own);
    for (const pattern of [
      /(?:стать(?:[её]й|[яеию])|article)\s+\d+(?:[.-]\d+)?\s+(?:(?:настоящего|этого)\s+(?:Кодекса|Закона)|of\s+this\s+(?:Code|Act|Law))/giu,
      /(?:ushbu|мазкур)\s+(?:kodeks|qonun|Кодекс|Қонун)[^.;\n]{0,45}?\d+\s*[-–]?\s*(?:modda|модда)[^\s,;.]*/giu,
    ]) for (const match of text.matchAll(pattern)) {
      for (const number of detectArticleNumbers(match[0])) references.add(number);
    }
    for (const article of references) {
      const covered = sources.some(other => other.actTitle === source.actTitle
        && articleNumber(other.article) === article
        && !/:\s*$/u.test((other.spans ?? []).map(span => span.text).join("\n") || other.excerpt || ""));
      if (!covered) requests.set(`${url.href}#${article}`, { url: url.href, article });
    }
  }
  return [...requests.values()].slice(0, 3);
}

export function selectReferencedArticleContext(source: LegalSourceContext, article: string): LegalSourceContext | null {
  if (source.sourceType !== "lex" || source.verificationState !== "direct_validated"
    || source.applicabilityStatus !== "current") return null;
  const spans = (source.spans ?? []).filter(span => articleNumber(span.article) === article);
  if (!spans.some(span => span.text.trim().length > 40 && !/:\s*$/u.test(span.text))) return null;
  return { ...source, id: `${source.id}:article:${article}`, article, spans,
    excerpt: spans.map(span => span.text).join(" ").slice(0, 1200) };
}
