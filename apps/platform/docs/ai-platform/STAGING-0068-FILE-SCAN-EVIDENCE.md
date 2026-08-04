# Staging 0068 — immutable file-scan evidence boundary

Date: 2026-08-04

Environment: protected staging only

Commit: `1d13aa9`

Worker: `juro-platform-staging`

## Authorization and isolation

The owner explicitly authorized a private staging D1 backup, migration `0068`
and a staging deploy. Commits `ef844fe`, `168da91`, `16d41c8` and `1d13aa9`
were pushed to `feature/juro-ai-platform` and draft PR #3 before the remote
checkpoint. GitHub Actions then passed both `validate (apps/platform)` and
`validate (apps/website)`. No production migration, production deployment or
public-site change was performed.

Preflight proved that `juro-staging`
(`bb716a96-b2fb-4823-90d6-6c228fed181a`) had exactly one pending migration:
`0068_file_scan_evidence.sql`. `file_scan_results` did not yet exist,
`foreign_key_check` returned no rows and the migration ledger contained 68
rows.

## Verified backup and restore

Private R2 prefix:

`juro-staging-backups/d1/juro-staging/20260804-080310-0068/`

| Object | Bytes | SHA-256 |
|---|---:|---|
| `juro-staging-full.sql` | 1,282,399 | `D4AB329DA17BF49A6D2192A91777C8A29417897C42BAFE89E37906AD76BA5E6B` |
| `juro-staging-schema.sql` | 258,604 | `06C1FF6212DFA5E28DE5694B840D48F9F25A9D05673FDD71FFC7C86D14F00A00` |
| `juro-staging-data.sql` | 1,023,827 | `530ECAC84ED2D6520B29EE374249C076A0DE3189C048D347C46925F41018C8D1` |

All three objects were downloaded independently from private R2. Every
downloaded SHA-256 matched its source export byte-for-byte. A disposable restore
from the downloaded schema and data passed with:

- `quick_check=ok`;
- foreign-key violations: `0`;
- 171 tables (170 application tables), 345 indexes and 126 triggers;
- 68 pre-migration ledger rows;
- 4,005,888-byte restored SQLite database.

The remote objects are retained. The local export and disposable database are
temporary verification artifacts, not application storage.

## Migration postflight

Wrangler applied only `0068_file_scan_evidence.sql`, executing seven commands.
The remote ledger records it as id `69`, applied at `2026-08-04 08:05:55` UTC.
A subsequent migration list reported no pending migrations.

Postflight confirmed:

- table `file_scan_results`;
- unique indexes `file_scan_results_analysis_uidx` and
  `file_scan_results_file_uidx`;
- tenant/time index `file_scan_results_workspace_created_idx`;
- source/tenant/state trigger `file_scan_result_source_guard`;
- immutable-update trigger `file_scan_result_immutable_update`;
- zero scan-evidence rows;
- an empty remote `foreign_key_check` result.

No synthetic clean verdict was inserted. The table is only an immutable,
tenant-bound evidence contract. A real scanner still has to verify the R2 source
hash and return a terminal clean or infected verdict before downstream analysis
can run.

## Staging deploy and boundary smoke

Before deploy, `npm run type-check`, `npm run lint` and `npm test` passed. The
complete test command included the bounded Vinext build and Cloudflare suite
(102/102). The guarded repository command `npm run deploy:staging` rebuilt and
validated the staging artifact, then deployed only `juro-platform-staging`.

- version: `030e3db0-6de5-455f-a90b-0350d346f5cf`;
- deployment: `b2de852d-18fd-4bef-a86e-9532537a2f1e`;
- traffic: 100%;
- deployed at: `2026-08-04T08:08:53.582346Z`;
- D1 binding: `juro-staging`;
- primary R2: `juro-staging-files`;
- backup R2: `juro-staging-backups`;
- quarantine R2: `juro-staging-quarantine`;
- `APP_ENV`: `staging`.

Anonymous requests to `https://staging.app.juro.uz/` and
`/ru/individual/ai-lawyer/new` returned the expected Cloudflare Access `302`.
This proves the protected boundary, not an authenticated product journey.

Production Worker `juro` remained unchanged at version
`91774ed4-72e9-47bb-b93a-a4208d490b24`, deployment
`54aee3c6-39eb-4a16-ae59-c74418ae599f`, 100% traffic. The production
document-builder URL returned its expected unauthenticated `307` login redirect
instead of a 404.

## Open gates

- attach and verify a real privacy-approved malware scanner;
- prove clean and EICAR/infected fixtures, retry, timeout, DLQ and operator
  review in protected staging;
- authenticated RU/UZ upload-to-analysis browser journey;
- 100 real document packages, at least 30 comparisons and human-reviewed quality
  gates;
- production migration and deployment, each under separate future approval.

Until those gates pass, new document-analysis uploads remain quarantined and
return `FILE_SCAN_UNAVAILABLE`; OCR and OpenAI/Anthropic document analysis do not
receive them. Production remains unchanged.
