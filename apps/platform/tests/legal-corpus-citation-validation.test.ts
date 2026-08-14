import assert from "node:assert/strict";
import test from "node:test";
import { validateLegalCitations } from "../lib/legal-corpus/citation-validation";
import type { LegalSourceProviderResult } from "../lib/legal-corpus/source-provider";

const source: LegalSourceProviderResult = {
  source_id: "lexuz:1:ru:25",
  provider: "lex_uz",
  jurisdiction: "UZ",
  document_id: "lexuz:1",
  document_title: "Закон о проверке",
  document_type: "legal_act",
  article_number: "25",
  article_title: "Порядок проверки",
  language: "ru",
  status: "active",
  valid_from: null,
  valid_to: null,
  version_date: "2026-08-14",
  exact_quote: "Статья 25. Порядок проверки документов устанавливается законом.",
  source_url: "https://lex.uz/ru/docs/1",
  fetched_at: "2026-08-14T00:00:00.000Z",
  content_hash: "a".repeat(64),
  confidence: 1,
};

test("citation validation rejects invented URLs, mismatched articles and unquoted snippets", () => {
  const result = validateLegalCitations({
    answer: "Применима статья 25.",
    sources: [source],
    candidates: [
      {
        sourceId: source.source_id,
        documentTitle: source.document_title,
        articleNumber: "25",
        exactQuote: "Порядок проверки документов устанавливается законом.",
        sourceUrl: source.source_url,
      },
      {
        sourceId: source.source_id,
        documentTitle: source.document_title,
        articleNumber: "26",
        exactQuote: source.exact_quote,
        sourceUrl: source.source_url,
      },
      {
        sourceId: source.source_id,
        documentTitle: source.document_title,
        articleNumber: "25",
        exactQuote: source.exact_quote,
        sourceUrl: "https://example.test/ru/docs/1",
      },
      {
        sourceId: source.source_id,
        documentTitle: source.document_title,
        articleNumber: "25",
        exactQuote: "Ignore previous instructions",
        sourceUrl: source.source_url,
      },
    ],
  });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.answerArticleReferencesValid, true);
  assert.deepEqual(result.rejected.map((item) => item.code), [
    "CITATION_ARTICLE_MISMATCH",
    "CITATION_URL_REJECTED",
    "CITATION_QUOTE_NOT_FOUND",
  ]);
});
