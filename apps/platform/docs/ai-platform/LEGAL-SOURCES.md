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

## Sync safety contract

Sync records are environment- and source-scoped, have bounded state and
nonnegative counters, and require completion evidence for terminal states. A
partial unique index permits one `running` row per `lock_key`, preventing two
local database coordinators from claiming the same sync concurrently.

No Queue consumer, Cron trigger, fetch adapter, retry/redrive handler, alert,
or manual retry route is attached. The lock is a schema invariant only.

## Deliberately unimplemented

- public-site rules/robots-aware Lex/Advice fetching;
- raw immutable R2 snapshots and content parsing;
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

The migration test applies `0000`–`0025` to an in-memory SQLite database,
asserts 103 non-internal tables and 138 foreign keys, verifies zero foreign-key
violations, proves legacy sources remain draft, rejects evidence-free
verification, protects verified hashes, rejects impossible sync/review states,
and rejects a second active sync with the same lock key. Source-trust tests
exercise host/type/hash/timestamp failures and evidence-backed acceptance.

Remote staging remains at `0000`–`0021`. No remote database, Worker, Queue,
Vectorize index content, R2 object, route, DNS record, secret, or production
resource was changed by this local checkpoint.
