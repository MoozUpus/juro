# JURO legal-source foundation

Updated: 2026-07-28
Scope: local integration branch only. This document is not evidence of a
working crawler, synchronized legislation database, or staging deployment.

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
crawler, or authenticated manual/admin route is attached. No live Lex or
Advice fetch, remote R2 object, or remote migration is claimed.

## Deliberately unimplemented

- bulk discovery, sitemap traversal, or scheduled crawling;
- remote robots-aware Lex acquisition evidence;
- Advice acquisition approval or activation;
- content parsing and normalized raw/parsed snapshot separation;
- Advice scenario/version/link models;
- RU/UZ historical version and effective-date diffing;
- privileged reviewer assignment, decision service, and editor UI;
- lexical search, multilingual embeddings, Vectorize indexing, metadata
  authorization, reranking, and retrieval evaluation;
- server-side citation existence/article/version verification;
- legally approved language-priority and freshness behavior;
- source health, daily schedule, alerts, and staging evidence.

Until those gates pass, JURO must not label an answer as verified against the
current legislation database merely because migration `0025` exists.

## Local evidence

The migration test applies `0000`–`0026` to an in-memory SQLite database,
asserts 104 non-internal tables and 141 foreign keys, verifies zero foreign-key
violations, proves legacy sources remain draft, rejects evidence-free
verification, protects verified hashes, rejects impossible sync/review states,
and rejects unsafe request scope/lifecycle changes. Source-fetch/acquisition
tests cover URL allowlisting, robots policy, redirect downgrade/off-domain/
cross-document rejection, byte/type/encoding/timeout bounds, policy-disabled
Advice, empty-content rejection, identifiers-only outbox creation, actor/
environment conflict fencing, private content-addressed storage, pending-
review persistence, replay idempotency, safe failures, and the `legal.sync`
consumer path. Source-trust tests exercise host/type/hash/
timestamp failures and evidence-backed acceptance.

Remote staging remains at `0000`–`0021`. No remote database, Worker, Queue,
Vectorize index content, R2 object, route, DNS record, secret, or production
resource was changed by this local checkpoint. The official sites were
inspected read-only; the application fetcher was not executed against them.
