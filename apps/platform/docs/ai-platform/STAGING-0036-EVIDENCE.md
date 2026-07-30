# Staging 0036 legal-source evidence

Date: 2026-07-30  
Scope: owner-only juro-platform-staging. Production and apps/website were not changed.

## Exact code and schema

- Migration 0036_current_lex_url_guard.sql replaces only the legal source fetch-request insert guard. It accepts current positive Lex document IDs, retains legacy negative IDs, requires an exact canonical URL/ID match, and keeps Advice acquisition disabled.
- Commits 9ab6113, 70b733f, and 00319ec contain the schema guard, HTTP negotiation, robots-policy, and parser corrections.
- Staging D1 juro-staging has ID bb716a96-b2fb-4823-90d6-6c228fed181a and 37 migration ledger rows through 0036.
- Post-apply bookmark: 00000123-00000004-000050b8-28ee8cf7dac3562a1a9652f4c371d3e4.
- Post-probe bookmark: 00000132-00000000-000050b8-5322bcabc623a793a84c98f8d6290f3d.
- quick_check returned ok and foreign_key_check returned no rows.

## Backup and restore

The pre-0036 portable checkpoint is stored under private R2 prefix juro-staging-backups/d1/juro-staging/20260730T155000Z/. Its full, schema, data, and deterministic parent-first restore inputs were downloaded byte-for-byte and the restore was proven in a disposable remote EEUR D1.

The post-0036/probe checkpoint is stored under private R2 prefix juro-staging-backups/d1/juro-staging/20260730T170300Z/:

| Artifact | Bytes | SHA-256 | Private R2 round trip |
| --- | ---: | --- | --- |
| post-0036-full.sql | 324427 | dc7c903e7d7812ed23368b667f3b9b03cb30fb449a3680508a54c8c5f51c0992 | exact |
| post-0036-schema.sql | 168075 | 75316e8113a2cc5c62147d966efa109bf20f4430ca5a09fe78bf36c51b706572 | exact |
| post-0036-data.sql | 156384 | 6fa3d2b2c027e598780ec9498d7af726c4d4473e797355b22e0b28c1f8b444e5 | exact |
| post-0036-restore-parent-first.sql | 324427 | d10dd54badf995ff4f4420b7ef46870962febfe699f3c8d40eae8f407005c522 | exact |

The parent-first artifact was generated from the actual foreign-key graph. It restored 753 queries into disposable D1 a4959a8e-a93b-435a-a9d2-4412ee651f89 in EEUR. The restored checkpoint has 115 application tables, 37 migrations, 295 indexes, 78 triggers, the same non-empty row counts as the export, quick_check=ok, and zero foreign-key violations. The disposable database was deleted after verification; the recovery inputs remain in private R2.

## Worker deployment

- Access-protected Worker: juro-platform-staging.
- Version: d65ad586-98ef-47bc-95e2-158e4dfd45cf at 100% traffic.
- Deployment message binds the version to commit 00319ec.
- Handlers: fetch, queue, scheduled.
- Cron: every five minutes.
- legal source queue consumer: max concurrency 1 with its dedicated DLQ.
- LEGAL_ADVICE_INGESTION_ENABLED=false, LEGAL_SOURCE_STAFF_API_ENABLED=false, and STAGING_SYNTHETIC_PROBES_ENABLED=false.
- Anonymous staging request returned Cloudflare Access 302 before application content.
- Version inspection exposed only secret names, never values. The current version lists IDENTITY_KEYRING, RESEND_API_KEY, and TURNSTILE_SECRET_KEY; Phase 4 must independently prove any AI-provider secret binding before a live provider call.

## Live Lex probe sequence

The public canonical document URL https://lex.uz/ru/docs/8282675 was used only as a staging acquisition probe.

- Probe A failed closed with LEGAL_SOURCE_ROBOTS_UNAVAILABLE because the previous Accept header produced HTTP 406.
- Probe B failed closed with LEGAL_SOURCE_ROBOTS_RATE_POLICY because the runtime rejected the official Crawl-delay directive.
- Probe C succeeded after exact fixes. The runtime accepted text/plain robots negotiation, honored Crawl-delay: 20, and then fetched the document.
- legal.sync outbox: one row, one dispatch, one completed run.
- legal.parse outbox: one row, one dispatch, one completed run.
- request: one completed row, one attempt, no error.
- source: fetched, not verified.
- version: pending_review, not verified or published.
- review: one low-confidence pending new_source_version item.
- sections and chunks: zero. No publication or Vectorize indexing occurred.
- An additional cron cycle left one sync outbox/run, one parse outbox/run, one version, and one review, proving replay suppression for this probe.

Private raw object evidence:

- 258651 bytes.
- SHA-256 a005b42017f55a3c2b0afd75c76bec435f4c5c929c372067aed7fbd2192cbb5a.

Private normalized object evidence:

- 223283 bytes.
- SHA-256 919828169f256782e2ce3baa55eb2859fc08fa8ea51fa8971c25cc8c9abcb026.
- parse5 profile juro-legal-blocks-v1.
- one official heading, 231 normalized blocks, and 59536 plain-text characters.
- canonical source ID 8282675 and raw hash match the acquired evidence.

No source body is committed or copied into this repository.

## Verification commands

The completed gate includes targeted source fetch/parser tests, full npm test, staging build, staging artifact validation, TypeScript type-check, ESLint, Cloudflare binding type check, diff check, remote D1 integrity queries, private R2 hash round trips, remote restore, Worker version/deployment re-read, and anonymous Access denial.

One procedural artifact invocation initially validated the staging build as development and failed with the expected environment-name mismatch. The corrected command explicitly selected staging and passed. A Time Travel info invocation initially included an obsolete remote flag; the corrected current Wrangler form passed. Neither failure changed application or database state.

## Remaining gate

A human legal reviewer must inspect and explicitly approve or reject the pending source evidence before publication. Authenticated browser traversal, the full legal corpus, Advice ingestion, hybrid retrieval, citation verification, Vectorize publication, and the 250-scenario legal evaluation remain open. This checkpoint does not authorize production deployment or production UI replacement.

