# Legal corpus architecture

## Scope boundary

`apps/platform/lib/legal-corpus` is a JURO-owned Cloudflare/D1/R2 subsystem.
It is not a Huquq AI runtime and does not add FastAPI, SQLite authentication,
Gemini, a bundled Qdrant/Docker deployment, Huquq AI branding, screenshots, or
a legal corpus to Git. It contains a JURO-native Qdrant REST adapter that is
inert until a separate server-side feature flag and infrastructure are approved.

| Layer | Responsibility | Boundary |
| --- | --- | --- |
| Lex catalog discovery | Resume 11 allowlisted catalog classes in 4 official language modes | 44 D1 checkpoints; one robots-aware GET/POST page per scheduler lease |
| Lex metadata monitor | Discover bounded official RSS metadata | Existing robots-aware monitor, no source text stored |
| Corpus job ledger | Idempotent queued/fetch/retry state | D1; identifiers and official URLs only |
| Ingestion | Fetch one official Lex variant, validate HTML, parse articles | One job per dedicated corpus tick, robots/crawl delay respected |
| Source storage | Immutable raw HTML and normalized snapshot | Private R2 only; no browser URL |
| Legal registry | Documents, language variants, versions, provisions, chunks | D1 immutable version/provision rows |
| Retrieval | Exportable D1 BM25 terms plus optional Qdrant dense+sparse candidates and RRF | Every vector ID is rehydrated from D1 under current-version/status/scope filters |
| Dense indexing | OpenAI 1,536-dimensional embeddings plus deterministic sparse term hashes | Dedicated corpus Worker only; Qdrant collection must already expose named `dense` and `sparse` vectors |
| Provider contract | Indexed Lex first, live Lex fallback only when needed | Typed source shape; no arbitrary URL tool |
| Citation validation | Filters model-proposed citations against source packets | No generated URLs, title/article/quote checks |
| Admin control | Metrics, coverage proof, bounded seed/retry and immutable audit | Isolated `apps/admin` Worker, host-only admin cookie, service binding and fresh source MFA |

## Current-version invariant

`legal_corpus_variants.current_version_id` is the only pointer used by normal
retrieval. Version, provision and source artifacts are append-only. A new
version is fully written before that pointer changes. Therefore a partial D1
retry remains invisible to users; it can safely resume with the same IDs.

Lex revision controls are parsed only as exact same-document `ONDATE` links.
Historical jobs are queued newest-to-oldest, allowing every immutable older
version to receive a half-open `[valid_from, valid_to)` interval from the
already stored next revision. Fetch time is never used as a legal effective
date. An explicit point-in-time chat request searches only the matching stored
interval; if none exists, JURO fails closed instead of substituting the current
live page.

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

The route-free `juro-legal-corpus-*` Worker owns corpus scheduling. Its
`5 19 * * *` UTC seed slot runs five minutes after the existing bounded Lex
metadata monitor, and its five-minute processing slot holds the single
`legal-corpus-worker` D1 lease before running at most one catalog page and one
document ingestion job sequentially. The ordinary platform Worker neither
imports nor invokes discovery or ingestion. Both corpus flags are `false` in
development, staging and production configuration, so deploying the isolated
runtime alone cannot begin a crawl. This keeps official-source acquisition
bounded and prevents parallel mass crawling.

`LEGAL_CORPUS_DENSE_ENABLED` is an additional independent deny-by-default
switch. When enabled, the dedicated Worker checks that the configured Qdrant
collection is `dense(1536, Cosine) + sparse`, embeds only global official
chunks, writes both named vectors and marks the prior version non-current.
Interactive retrieval queries Qdrant dense and sparse ranks, but accepts only
chunk IDs that D1 rehydrates under the same official/current/point-in-time and
tenant predicates as BM25. Provider calls are blocked by JURO's existing cost
circuit before network access and recorded in the system usage ledger. JURO
does not create, delete or expose a Qdrant deployment automatically.

Owner materials enter through an explicit promotion path, not a second upload
surface. The actor must own an already completed document analysis whose file
is `analysis_safe` and whose OCR derivative passes the existing R2 byte-count
and SHA-256 checks. The same actor must hold active administrator and
`legal_reviewer` assignments with MFA no older than 15 minutes, and must check
separate rights-to-publish and human-legal-review confirmations. The normalized
text is copied to an immutable private R2 key, then article-first chunks and an
exportable sparse index are written before the current-version pointer changes.
`legal_corpus_owner_publications` stores no document text: it is append-only
evidence linking hashes, roles, MFA, reason and the resulting version.
An owner can issue a separate immutable withdrawal through the same dual-role,
fresh-MFA boundary even while ingestion flags are off. The withdrawal changes
only the mutable availability projection to `disabled`; retrieval excludes it
immediately, while hashes and prior versions remain for audit. Publication
evidence uses opaque identifiers without foreign keys to private analysis rows,
so normal document/account retention is not blocked.

Owner materials never become official Lex evidence. `LexUzIndexedProvider`
continues to request `officialOnly`; therefore owner text cannot supply a legal
citation or freshness claim. A separate non-official materials consumer may
use it only after its own product and evaluation gate.

`/legal-corpus` lives on the isolated admin Worker rather than the ordinary
platform UI. It reads through the private `PLATFORM_ADMIN_API` service binding.
Only `super_admin` can view or operate it; the 15-minute host-only session is
revalidated against the originating TOTP/MFA and current administrator
assignment on every request. Writes additionally require same-origin CSRF,
both server-side corpus flags, a 10–500 character technical reason and a valid
append-only SHA-256 event chain. There is intentionally no legal approval
queue. A catalog row is marked complete only when every expected document is
indexed or has an explicit `technically_unavailable` result.

Production's D1 `migrations_pattern` includes `0121` and production-safe
`0124–0128` while structurally excluding staging-only evidence migrations
`0122–0123`. Staging retains the complete migration ledger.
