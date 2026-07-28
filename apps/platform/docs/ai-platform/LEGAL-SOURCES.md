# JURO legal-source foundation

Updated: 2026-07-28
Scope: local integration branch only. This document is not evidence of a
working crawler, synchronized legislation database, verified legal corpus, or
staging deployment.

## Implemented local boundary

Migration `0025_clean_harpoon.sql` additively expands the existing
`legal_sources` record and adds:

- `legal_source_versions`;
- `legal_source_sections`;
- `legal_source_chunks`;
- `source_sync_runs` and `source_sync_errors`;
- `legal_review_queue`.

Migration `0026_panoramic_toad_men.sql` adds the identifiers-only acquisition
request boundary:

- `legal_source_fetch_requests` with environment, exact source kind/locale,
  canonical public URL, idempotency key, bounded lifecycle, and result links;
- database guards for HTTPS canonical host/path shape, lifecycle evidence,
  immutable request identity, and immutable completed result evidence;
- one review item for each `(version, reason)` pair.

Existing rows are deliberately backfilled only by the new column default
`verification_state='draft'`. No legacy `status='verified'` value is promoted,
no content hash is invented, and no reviewer or verification time is inferred.

## Trust contract

A current source consumer accepts a Lex/Advice record only when all of these
are true:

1. the URL uses HTTPS without credentials or a nonstandard port;
2. the exact hostname is `lex.uz`, `www.lex.uz`, `advice.uz`, or
   `www.advice.uz`;
3. `source_type` matches the exact host family;
4. legacy `status` and the new `verification_state` are both `verified`;
5. `verified_at` is an explicit UTC timestamp;
6. `content_sha256` is a lowercase 64-character SHA-256 value.

Database guards also require `verified_by_user_id` for verified sources and
versions and prevent verified evidence from being rewritten while the record
remains verified. This is evidence integrity, not proof of legal accuracy or
reviewer authorization; the privileged review service is still required.

The trust filter is applied to current AI source context, stored conversation
sources, document-comparison legal analysis, global source search,
legislation monitoring, and verified-source counts.

## Fetch and sync safety contract

Sync records are environment- and source-scoped, have bounded state and
nonnegative counters, and require completion evidence for terminal states. A
partial unique index permits one `running` row per `lock_key`, preventing two
local database coordinators from claiming the same source family concurrently.

The local acquisition service is connected to the existing identifiers-only
outbox and `legal.sync` Queue consumer. It implements all of the following:

- exact HTTPS allowlist for `lex.uz`/`www.lex.uz` document pages and
  `advice.uz`/`www.advice.uz` question pages;
- no credentials, nonstandard ports, fragments, query strings, arbitrary
  paths, or cross-document redirects;
- manual redirects with a limit of two, and rejection of HTTPS downgrade,
  off-source redirects, and changed document identifiers;
- a stable identifying user agent, no credentials/cookies/referrer, and
  `no-store` fetch behavior;
- a fresh, bounded `robots.txt` check before the content request, with
  longest-match Allow/Disallow evaluation and fail-closed handling of missing,
  malformed, disallowed, or unsupported crawl-delay policy;
- a ten-second header/body inactivity timeout, two-MiB decoded-body cap,
  non-empty UTF-8-only HTML, and streaming reads rather than an unbounded
  `response.text()`;
- SHA-256 evidence and an immutable content-addressed object key under the
  existing private `BUCKET` binding;
- `legal_sources.verification_state='fetched'`, a
  `legal_source_versions.status='pending_review'` version, and a low-confidence
  review queue item; the service never writes `verified`, parsed sections,
  chunks, embeddings, or citations;
- idempotent request/outbox creation with actor/environment conflict fencing,
  replay-safe completed results, one active source-family lock, safe error
  codes without source body logging, and retryable/non-retryable failure
  evidence.

Each newly persisted pending-review version also receives one identifiers-only
`legal.parse` outbox job on the same legal-source Queue contract. The local
normalization consumer:

- re-reads the private raw R2 object and verifies its size, UTF-8 encoding, and
  exact acquisition SHA-256 before parsing;
- uses exact `parse5@8.0.1` with the deterministic
  `juro-legal-blocks-v1` profile and accepts only an explicit `main`, `article`,
  or `[role=main]` content surface—never the entire body;
- excludes navigation, forms, scripts, hidden content, and other page chrome,
  and emits bounded semantic headings, paragraphs, list items, quotations,
  definitions, table cells, and preformatted blocks;
- stores deterministic normalized JSON under a private content-addressed
  `legal-sources/parsed/` key and records only its key/hash/count metadata on
  the pending version;
- verifies the parsed object size, SHA-256, strict schema, source identity, and
  raw-source hash on replay;
- creates an idempotent `normalization_failed` review item when the official
  page has no recognized primary structure or sufficient content;
- never creates verified sections/chunks, embeddings, citations, or an AI
  context and never changes a source/version to `verified`.

Every checked-in environment still has `ASYNC_RUNTIME_ENABLED=false`, no
Queue consumer attachment, and no Cron trigger. Therefore the connected
handler is locally executable/tested code but is not active remotely.

## Source policy status

Lex terms at <https://lex.uz/uz/axborot> describe the resource as protected and
include an exception for use of normative legal acts in other resources when a
Lex link is provided. The current contract consequently supports only one
explicit official act page at a time, still subject to its live `robots.txt`.
This is an engineering boundary, not a final legal opinion on every reuse or
redistribution scenario.

The public Advice usage page at <https://advice.uz/uz/page/how-it-works> did
not provide a sufficiently explicit broad ingestion authorization for this
release decision. `LEGAL_ADVICE_INGESTION_ENABLED=false` is therefore pinned
in development, staging, production, generated binding types, config tests,
and artifact validation. Advice request creation is rejected before network
or D1/R2 activity. Enabling it requires recorded owner/legal approval, a fresh
terms/robots review, staging evidence, and a separate reviewed config change.

No Queue consumer, Cron trigger, retry/redrive/DLQ attachment, alert, discovery
crawler, or authenticated manual/admin route is attached. A read-only local
Lex probe reached the fail-closed `robots.txt` gate and returned
`LEGAL_SOURCE_ROBOTS_UNAVAILABLE`; it did not request the act body or write R2
or D1. No successful live Lex/Advice acquisition, remote R2 object, or remote
migration is claimed.

## Deliberately unimplemented

- bulk discovery, sitemap traversal, or scheduled crawling;
- remote robots-aware Lex acquisition evidence;
- Advice acquisition approval or activation;
- Advice scenario/version/link models;
- RU/UZ historical version and effective-date diffing;
- staff reviewer/publisher UI, legal editor, and any reviewed remote activation
  of the locally present HTTP routes;
- replacement-version activation and current/historical version switching;
- lexical search, multilingual embeddings, Vectorize indexing, metadata
  authorization, reranking, and retrieval evaluation;
- server-side citation existence/article/version verification;
- legally approved language-priority and freshness behavior;
- source health, daily schedule, alerts, and staging evidence.

Until those gates pass, JURO must not label an answer as verified against the
current legislation database merely because migration `0025` exists.

## Privileged review evidence boundary

The local internal service can claim a `new_source_version` review only for a
dedicated legal reviewer whose existing platform-staff assignment is active
and whose local TOTP-backed MFA is at most 15 minutes old. It reloads the
private normalized R2 object and rechecks size, JSON schema, source identity,
raw SHA-256, and parsed SHA-256 before accepting a decision. The reviewer must
submit the exact expected raw and parsed hashes plus substantive notes.

Migration `0027` stores a canonical decision evidence JSON document and its
SHA-256. The JSON contains identifiers and verification metadata, not the
legal-source body. Database triggers cross-check it against the review,
version, hashes, reviewer, and decision fields, and make terminal evidence
immutable. Same-evidence replay by the same reviewer is safe; conflicting
evidence, a second assignee, stale MFA, a changed R2 object, or a mismatched
version fails closed.

An approval is not itself a verified publication. It leaves the source version
in `pending_review`, leaves the source in `fetched`, and creates no sections,
chunks, vectors, citations, or AI context. Rejection closes the untrusted
version atomically.

## Verified publication evidence boundary

The separate local publisher requires its own `legal.sources.publish`
capability, active TOTP, fresh MFA, and the exact approved review-evidence
SHA-256. It reloads and validates the normalized R2 snapshot again, then
deterministically creates bounded version-specific reading sections/chunks and
the canonical identifiers-only publication evidence in one D1 batch with the
source/version verified transition. The publication and published reading rows
are immutable and undeletable. Same-evidence replay verifies every stored row;
concurrent or conflicting publication fails closed.

This first publisher slice intentionally rejects a source that already has a
verified version. A replacement-version activation model, historical/current
version switching, retrieval, citations, Vectorize, remote activation, and UI
remain separate gates. Published reading rows have no vector ID or indexed-at
marker and are not available to AI merely because publication succeeded.

## Protected staff HTTP boundary

The integration branch exposes one GET and three POST handlers in the built
route table:

- `GET /api/platform/legal-sources/reviews`;
- `/api/platform/legal-sources/reviews/:reviewId/claim`;
- `/api/platform/legal-sources/reviews/:reviewId/decision`;
- `/api/platform/legal-sources/reviews/:reviewId/publication`.

Every handler checks the exact `LEGAL_SOURCE_STAFF_API_ENABLED=true` flag
before resolving a session or touching D1/R2. The checked-in development,
staging, and production values are all `false`, and the artifact validator and
generated binding types enforce that state. A disabled request receives a
neutral RU/UZ `404` and does not resolve a session.

When dependency-injected in tests, the enabled boundary requires a custom
same-origin read header for GET or canonical same-origin and CSRF proof for
mutations, then a local session, active staff assignment, active TOTP, and MFA
no more than 15 minutes old before it parses bounded filters, cursor, path, or
JSON. The list returns only bounded metadata, exact-host validates its official
URLs, and uses a keyset cursor; it does not expose R2 keys or source content.
Claim responses return normalized blocks and evidence hashes but omit the
duplicated full `plainText` value. This is locally verified route/service code,
not a deployed or owner-approved staff feature.

The corresponding `/:locale/admin/legal-sources/reviews` staff page is also
behind the exact false flag and repeats server-side role/TOTP/fresh-MFA checks.
It is not linked from customer navigation. It connects the real list, claim,
decision, and publication endpoints in RU/UZ, but remains unreachable until a
separate reviewed staging activation.

## Local evidence

The migration test applies `0000`–`0028` to an in-memory SQLite database,
asserts 105 non-internal tables and 146 foreign keys, verifies zero foreign-key
violations, proves legacy sources remain draft, rejects evidence-free
verification, protects verified hashes, rejects impossible sync/review states,
and rejects unsafe request scope/lifecycle changes. Source-fetch/acquisition
tests cover URL allowlisting, robots policy, redirect downgrade/off-domain/
cross-document rejection, byte/type/encoding/timeout bounds, policy-disabled
Advice, empty-content rejection, identifiers-only outbox creation, actor/
environment conflict fencing, private content-addressed storage, pending-
review persistence, replay idempotency, safe failures, and the `legal.sync`
consumer path. Parser/normalization tests cover deterministic semantic block
extraction, chrome/script/hidden-content exclusion, no-body-fallback behavior,
raw and parsed SHA mismatch rejection, unrecognized-structure review routing,
absence of trusted sections/chunks, and the `legal.parse` consumer path.
Legal-review tests cover dedicated-role/fresh-MFA enforcement, one-assignee
claim, exact evidence hashes, idempotent replay, conflicting evidence and R2
tamper rejection, immutable terminal records, non-publishing approval, and
atomic rejection. Publisher tests cover separate capability/fresh-MFA
enforcement, approved-review and R2 revalidation, exact reading-row creation,
one-winner concurrency, idempotent replay, tamper and pre-existing-data
rejection, immutable publication evidence, and immutable reading rows.
HTTP-boundary tests additionally prove disabled no-session list and mutation
paths, authorization before malformed query/body parsing, bounded metadata
pagination and assignment isolation, and the real claim/approve/publish/
idempotent-replay D1/R2 flow.
Source-trust tests exercise host/type/hash/timestamp failures and
evidence-backed acceptance.

Remote staging is at `0000`–`0028`; this establishes schema only. No legal
source row, fetch request, normalized/raw evidence object, publication,
Vectorize content, Worker, Queue attachment, route, DNS record, runtime secret,
or production resource was created or changed by this checkpoint. The three
private R2 objects in `juro-staging-backups` are D1 migration exports, not
legal-source evidence.
