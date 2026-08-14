import { detectArticleNumbers } from "../legal/legal-language";
import type { LegalSourceProviderResult } from "./source-provider";

export type CitationCandidate = {
  sourceId: string;
  documentTitle: string;
  articleNumber: string;
  exactQuote: string;
  sourceUrl: string;
};

export type CitationValidationResult = {
  accepted: CitationCandidate[];
  rejected: Array<{ sourceId: string; code: string }>;
  answerArticleReferencesValid: boolean;
};

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function officialLexUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username && !url.password && !url.port
      && (url.hostname === "lex.uz" || url.hostname === "www.lex.uz")
      && /^\/(?:ru|uz|uzc)\/docs\/-?\d+$/u.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * Retains only citations backed by the current retrieval packet. URLs are
 * compared by value, so a model cannot invent, redirect or swap a source.
 */
export function validateLegalCitations(input: {
  answer: string;
  candidates: readonly CitationCandidate[];
  sources: readonly LegalSourceProviderResult[];
  historicalQuery?: boolean;
}): CitationValidationResult {
  const accepted: CitationCandidate[] = [];
  const rejected: CitationValidationResult["rejected"] = [];
  const known = new Map(input.sources.map((source) => [source.source_id, source]));
  for (const candidate of input.candidates) {
    const source = known.get(candidate.sourceId);
    if (!source) {
      rejected.push({ sourceId: candidate.sourceId, code: "CITATION_SOURCE_NOT_RETRIEVED" });
      continue;
    }
    if (candidate.documentTitle !== source.document_title) {
      rejected.push({ sourceId: candidate.sourceId, code: "CITATION_DOCUMENT_MISMATCH" });
      continue;
    }
    if (candidate.articleNumber !== source.article_number) {
      rejected.push({ sourceId: candidate.sourceId, code: "CITATION_ARTICLE_MISMATCH" });
      continue;
    }
    if (candidate.sourceUrl !== source.source_url || !officialLexUrl(candidate.sourceUrl)) {
      rejected.push({ sourceId: candidate.sourceId, code: "CITATION_URL_REJECTED" });
      continue;
    }
    if (!candidate.exactQuote || !normalized(source.exact_quote).includes(normalized(candidate.exactQuote))) {
      rejected.push({ sourceId: candidate.sourceId, code: "CITATION_QUOTE_NOT_FOUND" });
      continue;
    }
    if (!input.historicalQuery && source.status !== "active") {
      rejected.push({ sourceId: candidate.sourceId, code: "CITATION_NOT_CURRENT" });
      continue;
    }
    accepted.push(candidate);
  }
  const answerArticles = detectArticleNumbers(input.answer);
  const citedArticles = new Set(accepted.map((citation) => citation.articleNumber).filter(Boolean));
  return {
    accepted,
    rejected,
    answerArticleReferencesValid: answerArticles.every((article) => citedArticles.has(article)),
  };
}
