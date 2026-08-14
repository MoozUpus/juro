# Legal source contract

All new provider adapters must preserve at least this data, irrespective of runtime:

```ts
type LegalSourceRecord = {
  source_id: string; provider: "lex_uz" | "advice_uz" | "internal_juro" | "court_practice";
  jurisdiction: "UZ"; document_id: string; document_title: string; document_type: string;
  article_number: string | null; article_title: string | null; language: string;
  status: "active" | "repealed" | "historical" | "unknown";
  valid_from: string | null; valid_to: string | null; version_date: string | null;
  exact_quote: string; source_url: string; fetched_at: string; content_hash: string;
  confidence: number;
};
```

`LexUzIndexedProvider` returns only a technically validated, ready official D1
corpus version. Optional Qdrant results carry only chunk identifiers; the
provider rehydrates title, article, exact quote, status, version and URL from
D1 before returning this contract.
`LexUzLiveProvider` is a rate-limited, allow-listed fallback.
`AdviceUzProvider`, `InternalJuroMaterialsProvider` and `CourtPracticeProvider`
are interface names only until a source is legally available, verified and enabled. A
browser never receives the retrieval-service key.
