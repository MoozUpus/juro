# Legal corpus architecture

## Scope boundary

`apps/platform/lib/legal-corpus` is a JURO-owned Cloudflare/D1/R2 subsystem.
It is not a Huquq AI runtime and does not add FastAPI, SQLite authentication,
Gemini, a bundled Qdrant/Docker deployment, Huquq AI branding, screenshots, or
a legal corpus to Git. It contains a JURO-native Qdrant REST adapter that is
inert until a separate server-side feature flag and infrastructure are approved.

| Layer | Responsibility | Boundary |
| --- | --- | --- |
| Lex catalog discovery | Resume 11 allowlisted catalog classes in 4 official language modes | 44 D1 checkpoints; at most three robots-aware GET/POST pages per scheduler lease |
| Lex metadata monitor | Discover bounded official RSS metadata | Existing robots-aware monitor, no source text stored |
| Corpus job ledger | Idempotent queued/fetch/retry state | D1; identifiers and official URLs only |
| Ingestion | Fetch official Lex variants, validate HTML, parse articles and conservative document requisites from Lex's official `docHeader` | At most three catalog pages and five sequential jobs per staging tick; four preferred-primary slots plus one version slot, global retry-first, shared D1 host pacing and robots delay; ambiguous metadata remains `null` |
| Source storage | Immutable raw HTML and normalized snapshot | Private R2 only; no browser URL |
| Legal registry | Documents, language variants, versions, provisions, chunks | D1 immutable version/provision rows |
| Retrieval | Exportable D1 BM25 terms plus optional Qdrant dense+sparse candidates and RRF | Every vector ID is rehydrated from D1 under current-version/status/scope filters |
| Dense indexing | OpenAI 1,536-dimensional embeddings plus deterministic sparse term hashes | Dedicated corpus Worker only; Qdrant collection must already expose named `dense` and `sparse` vectors |
| Provider contract | Indexed Lex first, live Lex fallback only when needed | Typed source shape; no arbitrary URL tool |
| Citation validation | Filters model-proposed citations against source packets | No generated URLs, title/article/quote checks |
| Source UX | Server-owned cards and full-article modal | Type, number, adopting authority, language, live/indexed origin, available official variants and immutable version history are read from the validated corpus packet, never authored by the model |
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

Due retries retain priority. While fewer than nine queued pagers have a valid
public session, discovery advances the least-explored checkpoint page first, so
one large category-language catalogue cannot starve the remaining official
source families. At the nine-session cap, it renews the valid pager with the
earliest expiry. With three catalog pages every four minutes, that bound refreshes
each retained 15-minute ASP.NET session within twelve minutes. A legacy excess
is trimmed by clearing only volatile navigation fields and returning that
checkpoint to page zero; the immutable discovery ledger preserves already
discovered official document identifiers, so the restart is idempotent. This is
a fairness and session-safety control only: it does not increase the request
budget, add parallel source traffic, or bypass the shared Lex.uz host pacer.

Lex Uzbek Cyrillic is the unprefixed `/docs/:id` route; it is never silently
transliterated as an official text. Query normalization may create
transliterations, but citations always display the original stored language
and quotation.

## Controlled activation

All corpus flags are server-side and default to `false`. Production keeps every
corpus flag disabled. After explicit approval, verified D1 backup/restore and
the fail-closed release verifier were in place, staging alone enabled bounded
official-source acquisition, multilingual parsing, historical discovery and
shadow retrieval. Staging also has a private, route-free Qdrant Container and
embedding service binding, but dense Qdrant retrieval remains disabled and the
container remains dormant. The direct
request-scoped Lex flow continues to serve visible answers until the staging
evidence gate verifies indexed retrieval. When
enabled, chat searches indexed trusted chunks first and uses the validated
direct Lex path only for weak, stale or absent coverage. A validated live
document is queued idempotently for permanent ingestion when auto-ingest is
enabled. Shadow mode consults the index but preserves the existing visible
answer path.

The release verifier also enforces the pinned corpus floor from
`toxirerkinov70-commits/huquq-ai@1bce500c69b8213373d8ce0b40d56be7d83f6aec`:
at least 1,500 canonical documents, 22,000 unique provisions and 22,513 indexed
chunks. These are minimum acceptance counts, not reported JURO achievements;
all 44 category/language checkpoints must still independently prove
discovered/fetched/extracted/indexed-or-technically-unavailable completeness.

The same verifier requires a fresh, machine-captured `wrangler d1 info --json`
snapshot for the exact staging database. Its 8 GB release reserve leaves 20%
below Cloudflare's documented 10 GB paid-D1 database limit for continuing
bounded acquisition, immutable history and recovery. The snapshot is hashed
into the final release evidence; an unauthorised remote `PRAGMA` probe, a
manual size claim in release notes, or an older observation cannot satisfy the
operational release procedure. Retain the command-emitted JSON next to the
final evidence and capture it only immediately before the frozen evidence
build:

```powershell
npm run capture:legal-corpus:d1-capacity -- `
  --config wrangler.legal-corpus.jsonc `
  --output artifacts/legal-corpus/staging-d1-capacity.json
npm run build:legal-corpus:release-evidence -- `
  --application-commit <40-char-sha> `
  --corpus-snapshot-sha256 <64-char-sha> `
  --dashboard <dashboard.json> `
  --benchmark <benchmark.json> `
  --human-review <review.json> `
  --d1-capacity artifacts/legal-corpus/staging-d1-capacity.json `
  --output artifacts/legal-corpus/release-evidence.json
```

This is a staging-only safety gate. It does not authorise production storage,
feature flags, ingestion, a deployment, or a rollout.

When the corpus spans two or more numbered D1 shards, the v5 evidence remains
the mandatory nested base gate. The federated builder does not accept summed
counts or handwritten `verified: true` claims. It hashes the exact routing,
partition, snapshot and retrieval-verification artifacts; checks that all
artifacts and fresh `wrangler d1 info` captures describe the same database
names and UUIDs; reads sorted canonical-document and current-chunk ID files;
and rejects duplicate IDs before emitting evidence. The snapshot manifest is
also the `corpusSnapshotSha256` bound to the benchmark. Every shard must have a
verified export restore (`quickCheck: ok`, zero foreign-key violations), stay
below the existing 8 GB reserve, and the captured Lex stream must be frozen.

```powershell
npm run build:legal-corpus:federated-release-evidence -- `
  --base-evidence artifacts/legal-corpus/release-evidence.json `
  --routing-contract artifacts/legal-corpus/federation-routing.json `
  --partition-manifest artifacts/legal-corpus/federation-partitions.json `
  --snapshot-manifest artifacts/legal-corpus/federation-snapshots.json `
  --retrieval-verification artifacts/legal-corpus/federated-retrieval.json `
  --d1-capacity artifacts/legal-corpus/shard-1-capacity.json `
  --d1-capacity artifacts/legal-corpus/shard-2-capacity.json `
  --output artifacts/legal-corpus/federated-release-evidence.json
npm run validate:legal-corpus:federated-release -- `
  --evidence artifacts/legal-corpus/federated-release-evidence.json
```

The contract is fail-closed plumbing, not evidence that the current staging
queue is frozen or that cross-shard retrieval has passed. Those artifacts may
only be captured after sequential ingestion is actually complete.

### Staging D1 capacity shard

Cloudflare's per-database 10 GB limit is not increaseable. The original
`juro-staging-corpus-v2` database remains preserved and read-only at its hard
capacity boundary; it is not truncated or rebound. Staging continuation uses
the separate `juro-staging-corpus-shard-1` database and the dedicated
`wrangler.legal-corpus-shard.jsonc` configuration, which binds the same
route-free Worker to the shard while leaving every production binding absent.
The seed operation copies only the 44 completed discovery checkpoints, their
discovery metadata, active queued/retrying jobs (running jobs are reset to
queued), and the verified Lex.uz robots pacing row. It does not copy raw HTML,
provisions, chunks, user documents, secrets, or a legal corpus into Git.
Consequently, shard document/provision/chunk totals count only successfully
fetched and parsed official sources; discovery rows and queue rows are not
treated as indexed corpus. The shard has its own D1-backed lock and remains a
single sequential Lex.uz stream with the same 20-second delay. Release
evidence must name the exact database(s) and must not add v2 and shard counts
unless a separately tested federated retrieval/evidence contract is present.
The shard packs up to 20 sequential ingestion jobs into one staging lease (the
primary Worker remains at five); this changes only bounded batch packing and
never reduces the source delay or opens a second stream.

### Sparse-index capacity transition

Migration `0140_compressed_legal_corpus_sparse_postings` is additive and is
staging-only until separately approved. It introduces a term dictionary and a
numeric chunk-key dictionary, then stores BM25 frequencies as
`(term_id, chunk_key_id)` postings. This removes repeated long Lex document,
version, language and chunk identifiers from every posting without changing
source text, citations, ranking weights or tenant filtering.

The scheduled Worker keeps this additive migration backfill behind the explicit
`LEGAL_CORPUS_SPARSE_COMPRESSION_ENABLED` flag, which is currently `false` in
all environments. Legacy sparse postings remain the authoritative fallback and
retrieval reads the union of both representations. Enabling the backfill
requires a fresh capacity probe and a separate bounded migration approval so
it cannot consume the remaining staging D1 reserve during the legal crawl.

The application first detects the additive tables at runtime. Before the
migration it continues to write and query the legacy exportable sparse table.
Afterward it writes new chunks only to the compressed tables while retrieval
and Qdrant loading read a union of both representations. The corpus Worker
moves at most 64 legacy chunks in one D1 transaction after each bounded
ingestion run: it inserts replacement dictionary/posting rows, clears only the
non-authoritative duplicate JSON field, and deletes the legacy rows last. A
failed transaction leaves the legacy posting readable. Release evidence must
include a fresh D1 capacity capture before applying this migration, during the
backfill, and before the frozen corpus snapshot; capacity growth remains a
hard stop rather than a reason to cap discovered official documents.

The route-free `juro-legal-corpus-*` Worker owns corpus scheduling. Its
`5 19 * * *` UTC seed slot runs five minutes after the existing bounded Lex
metadata monitor. The staging-only four-minute processing slot also idempotently
creates missing catalog checkpoints before claiming work, so a fresh environment
does not depend on a manual admin form. Production retains its five-minute
processing slot. The Worker then holds the single
`legal-corpus-worker` D1 lease for the whole batch. A batch processes at most
three catalog pages and five ingestion jobs sequentially. A normal batch
therefore makes no more than eight bounded Lex.uz source requests; if catalog
discovery has no eligible page, unused discovery capacity can be reclaimed by
ingestion only within the same pace and start fence. Every real Lex request,
including `robots.txt`, first claims a host-wide D1 time window; the observed
`Crawl-delay` is cached for the Worker run and persisted for later runs. The
fifteen-minute lease prevents the next staging processing cron from starting a
second crawler while a paced batch is still active, including bounded D1/index
maintenance after the final Lex request. The previous seven-minute lease was
shown to expire during a healthy eight-minute staging run; this longer lease is
still bounded by the durable lock and does not widen the Lex request budget.
Production retains its 195,000 ms ingestion start fence. Staging uses a
twelve-minute fence with the fifteen-minute lease, leaving three minutes for
bounded sparse-index and D1 finalization while allowing more already-queued
jobs in the same sequential invocation. The robots policy and 20-second
host-wide pacer remain authoritative for every source request.
The first four ingestion
slots prefer already-discovered `court_acts`, `laws`, `court_practice`,
`oliy_majlis` or `president` catalogue jobs while rotating exact source
languages through Uzbek Cyrillic, Russian, Uzbek Latin and English. The fifth
slot offers reserved capacity for version work; when that work is absent, each
slot safely falls back through verified core-code work and FIFO. Due retries
remain globally first. This bounded share brings primary legislation into the
corpus earlier without starving other official categories or increasing crawl
traffic. A preferred slot first selects its matching official locale; if that
catalogue has no ready job in the target locale, it falls back only within the
same preferred catalogue families before ordinary FIFO work is considered.

The daily seed also creates maintenance jobs without performing network I/O.
Daily work prioritizes stale codes and the Constitution while the normal
metadata/catalog flow discovers new documents. Every Monday in Tashkent it
queues variants not checked during the previous week and safely reopens only
completed catalog checkpoints. On the first local day of each month it queues
every official variant for a full content-hash verification. These jobs use the
same sequential process cron, lock and host pacer; old versions are never
deleted. The ordinary platform Worker neither imports nor invokes discovery or
ingestion. Development and production keep both acquisition flags `false`.
Staging alone enables acquisition.

`LEGAL_CORPUS_DENSE_ENABLED` is an additional independent deny-by-default
switch. When enabled, the dedicated Worker checks that the configured Qdrant
collection is `dense(1536, Cosine) + sparse`; it creates only that exact
environment-scoped collection when absent and refuses to replace an
incompatible collection. It embeds only global official
chunks, writes both named vectors and marks the prior version non-current. When
Lex acquisition is frozen, the same process schedule performs a bounded,
resumable backfill of missing current chunks. Persisted deterministic vector IDs
are the progress cursor, so an interrupted run continues without re-embedding
completed chunks; each scheduled invocation is capped to four 64-chunk batches.
Interactive retrieval queries Qdrant dense and sparse ranks, but accepts only
chunk IDs that D1 rehydrates under the same official/current/point-in-time and
tenant predicates as BM25. Provider calls are blocked by JURO's existing cost
circuit before network access and recorded in the system usage ledger. JURO
does not delete an existing collection or expose Qdrant publicly; staging
container provisioning remains explicit in the environment configuration.
The platform Worker owns the pinned staging container and exposes it only through
the `QDRANT_SERVICE` binding. The corpus Worker reaches OpenAI embeddings only
through `LEGAL_CORPUS_EMBEDDING_SERVICE`; it has no OpenAI secret of its own.
Production declares neither private binding and remains fail-closed.

Cloudflare Container disk is ephemeral, so a persisted D1 vector ID is never
accepted as proof that the point still exists. Dense backfill is structurally
blocked while Lex acquisition is enabled. After acquisition is frozen and one
entire cron invocation starts with no missing vectors or pending jobs, the
corpus Worker creates a Qdrant collection snapshot, streams it to the private
`BACKUP_BUCKET` with Qdrant's SHA-256 as the R2 write checksum, verifies the R2
head and stores a hashed manifest in `legal_corpus_snapshots`. A later cold
Container start may restore only that environment/collection-matched manifest.
If D1 records vector IDs but no valid snapshot exists, JURO fails closed instead
of creating an empty collection. IDs written after the snapshot cutoff are
cleared after restore and rebuilt deterministically; source text is never placed
in a public artifact or log.

Owner materials enter by promoting an already completed document analysis; the
existing private upload, quarantine, malware scan and OCR pipeline remains the
only file-ingress surface. The actor must own the analysis, the file must be
`analysis_safe`, and the OCR derivative must pass R2 byte-count and SHA-256
checks. The same actor must hold a current `administrator` or `legal_reviewer`
assignment with MFA no older than 15 minutes and explicitly confirm publication
rights. No human legal-review confirmation or approval queue exists. The
normalized text is copied to an immutable private R2 key, then article-first
chunks and an exportable sparse index are written before the current-version
pointer changes. `legal_corpus_owner_ingestions` stores no document text: it is
append-only technical auto-trust evidence linking hashes, assignment, MFA,
reason and the resulting version. A publisher can issue a separate immutable
withdrawal even while ingestion flags are off. The withdrawal changes only the
mutable availability projection to `disabled`; retrieval excludes it
immediately, while hashes and prior versions remain for audit. Ingestion
evidence uses opaque identifiers without foreign keys to private analysis rows,
so normal document/account retention is not blocked. Legacy 0128 publication
tables remain immutable for provenance but receive no new writes.

Owner materials never become official Lex evidence. `LexUzIndexedProvider`
continues to request `officialOnly`; therefore owner text cannot supply a legal
citation or freshness claim. A separate non-official materials consumer may
use it only after its own product and evaluation gate.

Completed user analyses use a separate private retrieval path. Scheduling the
initial normalized version, reindexing a corrected version, and searching the
private Vectorize namespace all fail closed unless
`LEGAL_CORPUS_USER_UPLOAD_AUTO_TRUST=true`. Every candidate vector is
rehydrated through the D1 owner/workspace ledger before private R2 text is
returned. This technical auto-trust never promotes a user upload into the
global corpus and never makes it legal citation evidence.

`/legal-corpus` lives on the isolated admin Worker rather than the ordinary
platform UI. It reads through the private `PLATFORM_ADMIN_API` service binding.
Only `super_admin` can view or operate it; the 15-minute host-only session is
revalidated against the originating TOTP/MFA and current administrator
assignment on every request. Owner ingestion independently accepts that
administrator assignment (or a current legal-reviewer assignment) as the
publisher evidence. Writes additionally require same-origin CSRF, both
server-side corpus flags, a 10–500 character technical reason and a valid
append-only SHA-256 event chain. The automatic initial seed is not a manual
write and therefore presents no reason field; reason remains mandatory for
staff retries and owner-material actions. There is intentionally no legal
approval queue. A catalog row is marked complete only when every expected
document is indexed or has an explicit `technically_unavailable` result.

For scheduled ingestion, the official HTML fetch has a hard 12 MiB byte
ceiling. A former terminal `LEGAL_SOURCE_PARSE_TOO_COMPLEX` or
`LEGAL_SOURCE_TOO_LARGE` row receives one deployment-corrective recheck. The
former may use an official Lex PDF/ZIP representation; a source which still
exceeds the byte ceiling is retained as `technically_unavailable` with its URL,
attempt history and error code. This preserves an auditable coverage gap without
unbounded Worker memory or retry loops.

Production's D1 `migrations_pattern` in both platform and corpus Worker
configs includes `0121` and production-safe `0124–0128` while structurally
excluding staging-only evidence migrations `0122–0123` and every later
corpus-only migration, including `0140`. Staging retains the complete
migration ledger.
