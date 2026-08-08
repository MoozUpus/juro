# Staging 0041 analysis-report export evidence

Date: 2026-07-31 UTC

## Scope

This checkpoint adds real human-readable PDF and DOCX reports for a completed,
tenant-owned document analysis. It does not change `apps/website`, production
routes, production data, or the production Worker.

- exact application commit: `c8873d36c8ea356aae4ac4a35dc070963c8492db`;
- protected staging Worker: `juro-platform-staging`;
- current staging version: `ffbfe9df-40f8-4442-8080-7eaf1e63fe40` at 100%;
- application rollback: `c985f6a3-d7b8-408d-a2dd-8952ece98e47`;
- staging D1: `juro-staging`, ID `bb716a96-b2fb-4823-90d6-6c228fed181a`;
- production Worker remains `juro` version
  `91774ed4-72e9-47bb-b93a-a4208d490b24`.

## Implemented boundary

- strict and backward-compatible `json | pdf | docx` export selection;
- one additive `analysis_report_exports` lifecycle table;
- existing identifiers-only `job_outbox` and `staging-document-export` Queue;
- actual JURO PDF and DOCX generators and bundled font/template/footer assets;
- schema-validated RU/UZ report composition from normalized analysis output;
- immutable private R2 keys, conditional create, exact size, and SHA-256 checks;
- tenant/owner checks for list, request, download, and delete;
- R2-first terminal deletion, replay evidence, and account-deletion continuity;
- mobile 44 px delete target and RU/UZ processing/retry/delete states.

Highlighted/clean/redline documents, comparison tables, case bundles, and live
provider-generated staging artifacts are not claimed.

## Local release gate

The exact candidate passed:

- `npm run type-check`;
- `npm run lint`;
- `npm test`: 29 rendered route/security, 324 core, and 84 Cloudflare tests;
- PDF/DOCX report contract tests: 4/4, including a real Queue execution;
- `npm run build:staging`;
- staging artifact validation;
- generated Cloudflare binding type check;
- document-builder smoke: 34 scenarios, DOCX 22,600 bytes, PDF 66,550 bytes,
  ZIP 73,503 bytes;
- comparison smoke: three material changes, PDF 38,364 bytes, DOCX 19,013 bytes;
- `git diff --check`;
- staged scope: 23 files, all under `apps/platform`;
- staged high-confidence secret scan: 0 forbidden names and 0 matches.

Tests create a real `%PDF` artifact and a valid OOXML ZIP containing the expected
`word/document.xml`. They cover tenant isolation, idempotency, Queue ack/retry,
private-object verification, deletion/replay, migration source mismatch, invalid
completion, and account-deletion purge ordering.

## Pre-migration state and recovery point

Read-only preflight proved:

- Worker staging version `c985f6a3-d7b8-408d-a2dd-8952ece98e47` at 100%;
- 41 D1 migrations through `0040_luxuriant_winter_soldier.sql`;
- exactly one pending migration: `0041_analysis_report_exports.sql`;
- `quick_check=ok`, zero foreign-key violations;
- no report-export table, zero JSON export rows, and zero document-export outbox rows.

Pre-migration Time Travel bookmark:

`00000213-00000000-000050b9-d3188759cc17b15922cc19e3067e435e`

The 458,765-byte portable export was uploaded privately as
`d1/juro-staging/20260731-104422/pre-0041.sql` in
`juro-staging-backups`, downloaded independently, and matched SHA-256:

`aeafeb5e83aef30a3a3f2af2b4e5a63f0474f6c069696edf3407ef633785aafe`

## Migration result

Wrangler 4.92.0 applied only `0041_analysis_report_exports.sql` and reported nine
successful SQL commands. Postflight proved:

- 42 migration rows through `0041`;
- 16 report-table columns;
- five explicit indexes and two trigger programs;
- zero report rows;
- `quick_check=ok` and zero foreign-key violations;
- no pending migrations.

Post-migration Time Travel bookmark:

`00000213-00000002-000050b9-98618a5881cf0c076ff24687e4bae749`

The 463,690-byte portable export was uploaded privately as
`d1/juro-staging/20260731-104422/post-0041.sql`, downloaded independently,
and matched SHA-256:

`99f0357fc665338f53e4a0c6062134ac267cb5fc04dde34f2da12302a5b1d51f`

## Deployment and read-back

The exact commit was deployed with `--keep-vars --strict` only as
`juro-platform-staging`. Read-back proves:

- version `ffbfe9df-40f8-4442-8080-7eaf1e63fe40` serves 100%;
- `fetch`, `queue`, and `scheduled` handlers remain deployed;
- the five-minute cron and five reviewed consumers remain attached;
- all existing D1, three private R2, four Vectorize, seven Queue producer,
  Analytics Engine, Images, and Assets bindings remain present;
- secret names remain only `IDENTITY_KEYRING`, `RESEND_API_KEY`, and
  `TURNSTILE_SECRET_KEY`; no value was read;
- Queue `staging-document-export`, ID
  `9c7b4a34cf374905961bd0398fd5f13d`, has exactly one producer and one consumer,
  both `juro-platform-staging`;
- D1 remains integral at 42 migrations with zero report/outbox rows;
- anonymous staging root, DELETE, and file requests each return Access `302`;
- the production document-builder URL returns canonical/auth routing `307`;
- production Worker `juro` remains on its prior version.

Staging has no completed analysis and no OpenAI or Anthropic secret name. A live
provider report was therefore not fabricated. The local real-generator and Queue
proof is strong implementation evidence but does not replace an authenticated
provider-generated staging flow.

## Rollback

For an application regression, restore protected-staging traffic to
`c985f6a3-d7b8-408d-a2dd-8952ece98e47`. Migration `0041` is additive and its empty
table may remain unused. Use the recorded pre-migration bookmark only for proven
D1 corruption; routine application rollback does not require a destructive D1
restore. Production deployment remains unauthorized.
