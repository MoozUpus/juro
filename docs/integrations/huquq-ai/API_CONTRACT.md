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

## Owner material promotion

`POST /api/internal/admin/legal-corpus` accepts `publish_owner_material` only
through the isolated admin service binding. Its body is strictly validated:

```ts
{
  action: "publish_owner_material";
  analysisId: string;
  workspaceId: string;
  title: string;
  language: "ru" | "uz-Latn" | "uz-Cyrl" | "en";
  rightsConfirmed: true;
  legalReviewConfirmed: true;
  reason: string;
}
```

The authenticated actor must be both `super_admin` and `legal_reviewer`, own
the analysis and have fresh MFA. The endpoint returns only bounded IDs/counts;
it never returns source text, the OCR derivative, R2 keys or credentials.

`withdraw_owner_material` accepts only the published corpus `documentId` and a
10–500 character reason. It remains available when ingestion flags are off,
requires the original publishing reviewer plus fresh MFA, appends an immutable
withdrawal event, and projects the document to `availability_status=disabled`.
