# Staging 0053 — scheduled legal-corpus synchronization

Date: 2026-08-01 (Asia/Tashkent)

## Deployed boundary

- Worker: `juro-platform-staging` only.
- Worker version: `29c02046-45a5-4b13-a040-9863ec6debac` (version number 74).
- D1: `juro-staging` / `bb716a96-b2fb-4823-90d6-6c228fed181a`.
- No production worker, database, bucket, or route was changed.

## Verified configuration

Cloudflare deployment output and `wrangler versions view` confirm a Worker with `fetch`, `queue`, and `scheduled` handlers, enabled staging async/runtime flags, the private staging R2 bindings, the legal-source queue, and the OpenAI/Anthropic secret bindings (values were not read).

The two staging triggers are:

- `*/5 * * * *` — outbox dispatch and terminal scheduled-run reconciliation;
- `0 19 * * *` — 00:00 Asia/Tashkent daily legal-corpus coordinator (Tashkent is UTC+5).

The coordinator enumerates only already-known allowlisted Lex/Advice records, creates idempotent identifier-only `legal.sync` requests, and records a `scheduled_corpus` run. It never discovers arbitrary URLs and never publishes a source. A missing corpus is persisted as `LEGAL_SOURCE_CORPUS_EMPTY`, not reported as a successful fresh legal database.

## Checks performed

- `npm run type-check` — passed.
- `npm run lint` — passed.
- `npm run build:staging` — passed.
- `node scripts/platform-tasks.mjs artifact --environment staging` — passed.
- `npx tsx --test tests/legal-scheduled-corpus-sync.test.ts` — passed.
- Existing platform suite — 85/85 passed before this deployment.
- Remote D1 query for `source_sync_runs` with `run_type='scheduled_corpus'` returned zero rows immediately after deployment, as expected before the first 00:00 Asia/Tashkent trigger.

## Remaining evidence boundary

The midnight trigger has been attached but had not yet occurred when this record was written. The first live run must be inspected in Worker logs and `source_sync_runs`; until then this is deployment/configuration evidence, not an assertion that corpus fetching has completed. Legal publication and answer eligibility remain staff-reviewed and fail closed.
