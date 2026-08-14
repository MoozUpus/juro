# Legal corpus architecture

## Scope boundary

`apps/platform/lib/legal-corpus` is a JURO-owned Cloudflare/D1/R2 subsystem.
It is not a Huquq AI runtime and does not add FastAPI, SQLite authentication,
Gemini, Qdrant, Docker services, Huquq AI branding, screenshots, or a legal
corpus to Git.

| Layer | Responsibility | Boundary |
| --- | --- | --- |
| Lex catalog discovery | Resume 11 allowlisted catalog classes in 4 official language modes | 44 D1 checkpoints; one robots-aware GET/POST page per scheduler lease |
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

## Catalog and languages

The stored language is one of `ru`, `uz-Latn`, `uz-Cyrl`, `en`. The public Lex
routes observed during the 2026-08-15 audit are `/ru/docs/:id`,
`/uz/docs/-:id`, `/docs/:id`, and `/en/docs/:id` respectively. Language
variants can have different provider IDs. `legal_corpus_source_aliases` links
their URLs and provider IDs to one deterministic canonical family without
counting a translation as another canonical document.

Catalog result pages keep the URL stable while numbered pagination performs
an ASP.NET `__doPostBack`. Each checkpoint therefore persists only the
allowlisted catalog/language key, page number, bounded ViewState and next event
target. A stale lease can be reclaimed; the next page must match the expected
sequence before any discovered URL is queued. Raw catalog navigation is never
presented to a model.

Lex Uzbek Cyrillic is the unprefixed `/docs/:id` route; it is never silently
transliterated as an official text. Query normalization may create
transliterations, but citations always display the original stored language
and quotation.

## Controlled activation

All corpus flags are server-side and default to `false` in every environment.
The direct request-scoped Lex flow continues to serve users until the staging
evidence gate specifically enables and verifies indexed retrieval. When
enabled, chat searches indexed trusted chunks first and uses the validated
direct Lex path only for weak, stale or absent coverage. A validated live
document is queued idempotently for permanent ingestion when auto-ingest is
enabled. Shadow mode consults the index but preserves the existing visible
answer path.

The daily metadata cron seeds the 44 checkpoints only when the corpus flags
are enabled. The five-minute scheduler holds a distributed D1 lease and runs
at most one catalog page and one document ingestion job sequentially. This
keeps the official source crawl bounded and prevents parallel mass crawling.
