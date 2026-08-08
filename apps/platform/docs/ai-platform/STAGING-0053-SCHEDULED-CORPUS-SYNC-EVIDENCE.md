# Staging 0053 — scheduled legal-corpus synchronization

Date: 2026-08-01 (Asia/Tashkent)

## Deployed boundary

- Worker: `juro-platform-staging` only.
- Worker version: `7717d55d-43ea-47db-8475-1df8402b29d0` (latest verified deployment).
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

## Lifecycle correction deployment — 2026-08-01

Worker version `0ef5444a-e5c2-4ca5-a8c2-b339cb49cd44` deployed to
`juro-platform-staging` after the scheduled-corpus lifecycle correction.
Wrangler confirmed only the staging bindings during deployment: `juro-staging`,
`juro-staging-files`, the staging backup/quarantine buckets, four staging
Vectorize indexes, and staging queues. The two configured triggers remained
`*/5 * * * *` and `0 19 * * *`; production was not deployed.

Validation before deploy:

- `npx tsx --test tests/legal-scheduled-corpus-lifecycle.test.ts` — pass;
- `npm run type-check` — pass;
- `npm run lint` — pass;
- `npm test` — pass;
- `npm run build:staging` — pass, including staging artifact validation.

The new regression executes against the full local D1 migration set. It proves
two queued Lex fetches attached to one `scheduled_corpus` correlation stay under
the shared run until reconciliation. It does not claim a future midnight cron
execution has already run; the production-equivalent staging trigger is left at
its specified schedule rather than modified for a test.