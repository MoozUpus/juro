# Staging legal-corpus D1 shard

## Purpose

`juro-staging-corpus-v2` reached Cloudflare's non-increaseable 10 GB
per-database limit. The staging-only continuation database
`juro-staging-corpus-shard-1` (`e09e0682-0c2e-4458-a8f3-be9de28117e3`) lets the
bounded Lex.uz ingestion finish without deleting or rewriting the v2 corpus.

## Isolation

- Worker: `juro-legal-corpus-shard-staging`.
- Config: `apps/platform/wrangler.legal-corpus-shard.jsonc`.
- Binding: `DB` points only to `juro-staging-corpus-shard-1` in the staging
  environment.
- There is no production environment in the shard config.
- `LEGAL_CORPUS_DENSE_ENABLED=false`; the private Qdrant and embedding
  bindings are dormant until the queue is frozen and the separate benchmark
  gate is approved.
- The primary legal-corpus Worker still points to v2; its capacity guard fails
  closed before source work. It does not share a crawl stream with the shard.

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
npx wrangler d1 migrations apply juro-staging-corpus-shard-1 --remote `
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
