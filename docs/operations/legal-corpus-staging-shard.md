# Staging legal-corpus D1 shard

## Purpose

`juro-staging-corpus-v2` reached Cloudflare's non-increaseable 10 GB
per-database limit. The staging-only continuation database
`juro-staging-corpus-shard-1` (`e09e0682-0c2e-4458-a8f3-be9de28117e3`) let the
bounded Lex.uz ingestion continue without deleting or rewriting the v2 corpus.
On 2026-08-25 its continuation state was atomically handed to
`juro-staging-corpus-shard-2` (`36fa1cfe-6d00-47b7-a980-864020028d86`). On
2026-08-28, after shard-2 crossed the documented D1 rollover reserve, its
continuation queue was atomically handed to
`juro-staging-corpus-shard-3` (`ccf1f18e-66cf-4358-a7aa-f1d725b7653c`). Shard 1
and shard 2 are durably frozen; shard 3 is now the only active acquisition
database.

## Isolation

- Worker: `juro-legal-corpus-shard-staging`.
- Config: `apps/platform/wrangler.legal-corpus-shard.jsonc`.
- Binding: `DB` points only to `juro-staging-corpus-shard-3` in the staging
  environment.
- There is no production environment in the shard config.
- `LEGAL_CORPUS_DENSE_ENABLED=false`; the private Qdrant and embedding
  bindings are dormant until the queue is frozen and the separate benchmark
  gate is approved.
- The primary legal-corpus Worker still points to v2; its capacity guard fails
  closed before source work. It does not share a crawl stream with the shard.

The shard Worker is currently deployed against shard 3 with Qdrant collection
suffix `juro_legal_staging_shard_3`. Shard 2 remains a read-only historical
source of corpus text; activating cross-shard retrieval requires the separate
federation/deduplication release gate.

## Seed contract

`scripts/seed-staging-corpus-shard.mjs` is an idempotent staging utility. It
reads v2 sequentially and writes to the shard only:

1. 44 completed discovery checkpoints;
2. discovery URLs and provider IDs;
3. queued/retrying/running ingestion jobs, with running jobs reset to queued;
4. the Lex.uz robots/crawl-delay row, with the next request window reset.

It never exports raw HTML, R2 objects, provisions, chunks, user documents,
credentials, or production rows. The generated SQL file is temporary and is
removed after the D1 import. Re-running the utility is safe because inserts
are idempotent.

## Verification sequence

```powershell
npx wrangler d1 migrations apply juro-staging-corpus-shard-2 --remote `
  --config wrangler.legal-corpus-shard.jsonc --env staging
npx wrangler deploy --dry-run --config wrangler.legal-corpus-shard.jsonc `
  --env staging --outdir dist/legal-corpus-shard
npx wrangler deploy --config wrangler.legal-corpus-shard.jsonc --env staging
```

Monitor the shard with sequential read-only queries. A release gate remains
closed while any active queue exists, while D1 capacity evidence is stale, or
until shard snapshot/restore, indexed evaluation, Qdrant benchmark/restore and
CI evidence are complete. Human legal review remains an independent
MFA-bound legal-reviewer decision and cannot be inferred from shard ingestion.

## Durable rollover fence

Migration `0142_legal_corpus_shard_handoffs` and the corpus Worker implement the
database side of a later sequential rollover. Every corpus database has one
`legal_corpus_shard_control` row. It starts `active`, so applying the additive
migration does not pause ingestion. A handoff utility may change it to
`handoff_prepared` only while there is no live scheduler lock, running
scheduled run, or running ingestion job. Worker lock acquisition and scheduled
run creation both recheck the `active` state in the same D1 batch; once the
barrier changes, a later cron cannot race into a second Lex stream.
The migration also guards the corpus scheduler lock, scheduled-run start and
ingestion-job reactivation directly in D1. Those guards keep the fence closed
even if the Worker is rolled back to code that predates the control-row check.

Transferred source jobs are not merely hidden by a new query predicate. They
become immutable `completed` tombstones with
`LEGAL_CORPUS_SHARD_HANDOFF`, while their original queued/retrying state and
hash are retained in an append-only handoff ledger. This means a rollback to an
older Worker that does not know the new columns still cannot claim the source
rows. The target receives ordinary claimable copies plus the same ledger. A
partial handoff tuple, mutation, or deletion is rejected by D1 triggers.
The handoff also requires zero active jobs whose canonical document already
exists on the source. Such document-affinity work must finish on its owning
shard; moving it would duplicate a canonical document and invalidate the
disjoint partition manifest. D1 rechecks and records this zero in the immutable
handoff ledger.

`scripts/rollover-staging-legal-corpus-shard.ts` implements a resumable
two-phase `prepare`/`activate` operation. `prepare` accepts only the exact next
`juro-staging-corpus-shard-N+1`, proves that the currently deployed 100% Worker
version is still bound to the source D1 UUID, closes both barriers, copies and
hash-verifies the continuation state, creates immutable source tombstones, and
leaves the target prepared. `activate` requires the printed handoff UUID and
proves through Cloudflare deployment metadata that the current 100% Worker
version is bound to the target D1 UUID and was deployed after the handoff was
created. Split deployments and stale/source bindings fail closed.

The first live staging handoff completed with ID
`3ccc2e81-403d-4f2a-a7b8-0a91f269ea95` and manifest SHA-256
`1a91230051c9d889a7e4885d4aacac5f61377d11ddc7dfe95d3f4896e71999e1`.
It transferred 44 checkpoints, 27,900 discovery rows and 27,649 active jobs
with zero failure rows. Source verification found 27,649 immutable tombstones
and zero remaining active jobs; target verification found the same number of
ready jobs and handoff ledger rows before activation. The 100% target Worker
deployment was created after the handoff and bound `DB` to the exact shard-2
UUID. These facts prove the continuation handoff, not corpus completion or any
release gate.

## Reusable rollover runbook

Run from `apps/platform`. Every D1 operation is staging-only and sequential.
Capture one reproducible read-only quality row only after the source run and
distributed lock have closed:

```powershell
npm run capture:legal-corpus:shard-quality
```

The command preflights the latest run and `scheduled_locks`, rejects an active
lease, and requires at least 45 seconds before the first `*/4` cron boundary
after that run finished. The boundary is the nominal UTC minute-aligned
`*/4` slot, not the seconds component of `ScheduledController.scheduledTime`:
Cloudflare may deliver the controller later within the minute. It then passes
the checked-in SQL to Wrangler as one `--command` argument. The final query is
also guarded by the empty-lock predicate and accepts sparse coverage from
either the legacy or compressed representation. A second lightweight
postflight must observe the same completed run ID, an empty lock, and the same
still-future cron boundary; a cron that starts during the aggregate or an
aggregate that crosses that boundary invalidates the capture. This avoids
loading D1 inside an imminent ingestion window, mixing counters from different
runs, and Wrangler's summary-only output for remote `--file` execution.

First, while the checked-in shard config still binds `DB` to the source, apply
the additive fence migration and deploy the barrier-aware Worker to the source:

```powershell
npx wrangler d1 migrations apply juro-staging-corpus-shard-2 --remote `
  --config wrangler.legal-corpus-shard.jsonc --env staging
npx wrangler deploy --dry-run --config wrangler.legal-corpus-shard.jsonc `
  --env staging --outdir dist/legal-corpus-shard-rollover-fence
npx wrangler deploy --config wrangler.legal-corpus-shard.jsonc --env staging
```

Create only the exact next shard, record the returned UUID, and apply the full
migration chain before attempting a handoff:

```powershell
npx wrangler d1 create juro-staging-corpus-shard-3
npm run rollover:legal-corpus:staging-shard -- `
  --phase initialize `
  --source juro-staging-corpus-shard-2 `
  --target juro-staging-corpus-shard-3
```

The checked-in config intentionally binds only the active source. Wrangler
therefore cannot address a newly created target by name through that config.
The `initialize` phase resolves the exact target UUID from the account, writes
a same-directory temporary config with only the staging `DB` binding changed,
applies the full migration chain, verifies an `active` empty shard-control row
and removes the temporary config. `prepare` and `activate` derive equivalent
temporary source/target configs so both databases remain addressable before
and after the checked-in binding switch. No temporary config is deployed.

Wait for the current source run/lease and all active jobs belonging to already
materialized source documents to finish, then prepare. The command is safe to
repeat with the same source and target; it resumes the immutable handoff or
fails on any mismatch or non-zero document-affinity backlog.

```powershell
npm run rollover:legal-corpus:staging-shard -- `
  --phase prepare `
  --source juro-staging-corpus-shard-2 `
  --target juro-staging-corpus-shard-3
```

Keep the printed `handoffId` and `manifestSha256`. Only after `prepare` reports
`prepared` or `already_prepared`, update the staging `DB.database_name` and
`DB.database_id` in `wrangler.legal-corpus-shard.jsonc` to shard 3 and its
returned UUID. Also advance the dormant staging `QDRANT_COLLECTION` suffix so
future dense evidence cannot collide with shard 2. Dry-run and deploy while the
target remains `handoff_prepared`; crons cannot acquire it yet.

```powershell
npx wrangler deploy --dry-run --config wrangler.legal-corpus-shard.jsonc `
  --env staging --outdir dist/legal-corpus-shard-3
npx wrangler deploy --config wrangler.legal-corpus-shard.jsonc --env staging
npm run rollover:legal-corpus:staging-shard -- `
  --phase activate `
  --source juro-staging-corpus-shard-2 `
  --target juro-staging-corpus-shard-3 `
  --confirm-handoff-id <handoffId-from-prepare>
```

Do not activate from a mixed-percentage deployment. Do not rebind the Worker
back to shard 2 after source commit: its active jobs are durable tombstones.
The safe post-commit containment action is to disable the staging Worker/cron
while retaining both D1 databases and their evidence.

## Rollback

Do not delete v2 or the shard as a rollback action. Disable the shard Worker
staging deployment or remove its staging trigger, retain its D1 snapshot and
evidence, and keep production flags and bindings unchanged. The typed
federated evidence builder now exists, but it deliberately cannot prove a live
rollover or retrieval path by itself: it requires disjoint sorted ID manifests,
per-shard capacity and restored-snapshot evidence, a frozen single Lex stream,
point-in-time and sparse/dense packet-parity verification, and a new release
approval. Until those inputs exist and the nested v5 gate passes, cross-shard
totals and retrieval remain unapproved.
