# Staging 0040 analysis-export evidence

Date: 2026-07-31

Scope: protected staging only. Production deployment and production UI
replacement were not authorized and did not occur.

## Candidate identity

- Branch: `feature/juro-ai-platform`
- Commit: `1488be1` (`feat(platform): export completed analyses privately`)
- Draft PR: `https://github.com/MoozUpus/juro/pull/3`
- Worker: `juro-platform-staging`
- Deployed version: `6cf8434d-e94c-406a-9655-02bffdf0e2d2` at 100%
- Rollback version: `3bc029a3-8722-4edd-8c05-d615d5ce9a13`
- Production control: Worker `juro` remained
  `91774ed4-72e9-47bb-b93a-a4208d490b24` at 100%.

## Local release gates

The exact source candidate passed:

- `npm run type-check`;
- `npm run lint`;
- core tests: 323/323;
- Cloudflare tests: 84/84;
- rendered Worker/auth tests: 28/28;
- targeted analysis-export and migration tests: 56/56;
- `npm run build:staging`;
- `npm run validate:artifact -- --environment staging`;
- `npm run cf:types:check`;
- Cloudflare environment matrix validation;
- document-builder smoke: 34 scenarios plus DOCX/PDF/ZIP generation;
- document-comparison smoke with PDF and DOCX generation;
- current-diff/staging-artifact secret scan.

The first immediate pre-deploy artifact check correctly rejected a stale
production-profile artifact (`juro-platform-production`). No deployment was
attempted from it. A fresh bounded staging build produced
`juro-platform-staging`; artifact and generated-binding validation then passed.

## D1 preflight and recovery evidence

Database: `juro-staging`

Database ID: `bb716a96-b2fb-4823-90d6-6c228fed181a`

Preflight proved:

- `PRAGMA quick_check` = `ok`;
- `PRAGMA foreign_key_check` returned zero rows;
- 40 migration ledger rows through `0039_lame_killer_shrike.sql`;
- no `analysis_exports` table;
- exactly one pending migration: `0040_luxuriant_winter_soldier.sql`.

Pre-migration recovery inputs:

- Time Travel bookmark:
  `00000200-00000000-000050b9-a424c2364078007537608621517e16d6`;
- private R2 key:
  `d1/juro-staging/20260731-141719/pre-0040.sql` in
  `juro-staging-backups`;
- portable export size: 446,306 bytes;
- SHA-256:
  `e8230a91eb38472666b2333278038d5e75c57153a4f707da2b18b148cdb5fb2b`;
- independent R2 download produced the same SHA-256.

The first R2 upload attempt received a Cloudflare API `502 Bad Gateway`. The
migration had not started. Retrying the same backup key succeeded, and the exact
downloaded object matched the local export hash.

## Migration and postflight

Wrangler applied only `0040_luxuriant_winter_soldier.sql` and reported all nine
statements successful. Postflight proved:

- 41 migration ledger rows through `0040`;
- `PRAGMA quick_check` = `ok`;
- `PRAGMA foreign_key_check` returned zero rows;
- `analysis_exports` exists with 16 expected columns and zero rows;
- five explicit indexes plus the primary-key auto-index;
- two D1 trigger programs covering insert/source and update/state/artifact guards;
- no pending migration.

Post-migration recovery inputs:

- Time Travel bookmark:
  `00000201-00000006-000050b9-0cf0522bce80aeababd50a483ea35489`;
- private R2 key:
  `d1/juro-staging/20260731-141949/post-0040.sql` in
  `juro-staging-backups`;
- portable export size: 450,367 bytes;
- SHA-256:
  `42d0e9970ca0ef229c09f632d48b211c5135170adf877b5af0896ed1844f0460`;
- independent R2 download produced the same SHA-256.

## Worker, bindings, Queue, and Access read-back

Worker version `6cf8434d-e94c-406a-9655-02bffdf0e2d2` exposes `fetch`, `queue`,
and `scheduled` handlers. Read-back confirms:

- `APP_ENV=staging`;
- D1 `juro-staging` / ID above;
- private `juro-staging-files`, `juro-staging-backups`, and
  `juro-staging-quarantine` buckets;
- the four staging Vectorize indexes;
- `DOCUMENT_EXPORT_QUEUE=staging-document-export`;
- only secret names `IDENTITY_KEYRING`, `RESEND_API_KEY`, and
  `TURNSTILE_SECRET_KEY`; no value was read or recorded.

Queue evidence:

- primary queue ID: `9c7b4a34cf374905961bd0398fd5f13d`;
- DLQ ID: `127a145a49e840f39b55ea61b17030bf`;
- one producer and one consumer, both `juro-platform-staging`;
- consumer ID: `4cad4ecfd175445592697e528110d2f9`;
- batch size 1, max retries 3, max wait 5,000 ms, concurrency 1,
  retry delay 30 seconds, DLQ `staging-document-export-dlq`.

Anonymous requests to the staging root, export collection API, and export file
API all returned `302` to Cloudflare Access before reaching the Worker. No Access
token, signed redirect, or secret is retained in this evidence.

## Honest runtime boundary

Staging has zero `document_analyses`, zero `analysis_exports`, and zero
`document.export` outbox rows. `STAGING_SYNTHETIC_PROBES_ENABLED=false`, and
OpenAI/Anthropic secret names are absent. Therefore no completed provider result
or live staging R2 export was fabricated. The Queue/R2 lifecycle is proven by
local contract/integration tests and control-plane deployment, while authenticated
end-to-end staging export remains open until an authorized synthetic or real
completed analysis exists.

## Rollback

If the new Worker path causes runtime regression, restore staging traffic to
version `3bc029a3-8722-4edd-8c05-d615d5ce9a13` and detach or pause the export
consumer. Migration `0040` is additive and its empty table may remain unused.
Use the pre-migration Time Travel bookmark or verified private-R2 portable export
only for demonstrated D1 corruption. Production rollback is not applicable
because production did not change.
