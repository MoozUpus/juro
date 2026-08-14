# Legal corpus architecture

## Scope boundary

`apps/platform/lib/legal-corpus` is a JURO-owned Cloudflare/D1/R2 subsystem.
It is not a Huquq AI runtime and does not add FastAPI, SQLite authentication,
Gemini, Qdrant, Docker services, Huquq AI branding, screenshots, or a legal
corpus to Git.

| Layer | Responsibility | Boundary |
| --- | --- | --- |
| Lex metadata monitor | Discover bounded official RSS metadata | Existing robots-aware monitor, no source text stored |
| Corpus job ledger | Idempotent queued/fetch/retry state | D1; identifiers and official URLs only |
| Ingestion | Fetch one official Lex variant, validate HTML, parse articles | One job per outbox tick, robots/crawl delay respected |
| Source storage | Immutable raw HTML and normalized snapshot | Private R2 only; no browser URL |
| Legal registry | Documents, language variants, versions, provisions, chunks | D1 immutable version/provision rows |
| Retrieval | FTS5 BM25 sparse, optional dense provider, RRF | Current-version and tenant/user scope filters |
| Provider contract | Indexed Lex first, live Lex fallback only when needed | Typed source shape; no arbitrary URL tool |
| Citation validation | Filters model-proposed citations against source packets | No generated URLs, title/article/quote checks |

## Current-version invariant

`legal_corpus_variants.current_version_id` is the only pointer used by normal
retrieval. Version, provision and source artifacts are append-only. A new
version is fully written before that pointer changes. Therefore a partial D1
retry remains invisible to users; it can safely resume with the same IDs.

## Trust and tenant isolation

- Official Lex URLs must be HTTPS `lex.uz`/`www.lex.uz` document routes.
- Official records are automatically technically trusted; they never go
  through the legacy staff legal-review queue.
- Owner, tenant and user inputs have separate source classes and exact
  global/tenant/user access predicates. Private input has no public source
  URL and does not enter the official Lex provider.
- HTML, OCR and uploaded content are treated solely as data, never as model
  instructions.

## Languages

The stored language is one of `ru`, `uz-Latn`, `uz-Cyrl`, `en`. Lex's `/uzc`
route maps to `uz-Cyrl`; it is never silently transliterated as an official
text. Query normalization may create transliterations, but citations always
display the original stored language and quotation.

## Controlled activation

All corpus flags are server-side and default to `false` in every environment.
The direct request-scoped Lex flow continues to serve users until the staging
evidence gate specifically enables and verifies indexed retrieval. The daily
metadata cron may enqueue candidates only when the corpus flags are enabled;
the five-minute outbox cron processes one job at a time to keep the official
source crawl bounded.
