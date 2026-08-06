# Staging document-analysis persistence evidence (0101–0103)

Date: 2026-08-06. Scope: protected staging only. Production was not changed.

## Purpose

The synthetic `receipt-ru.docx` smoke uncovered two Cloudflare D1 trigger
patterns that were valid SQLite expressions in concept but exceeded D1's GLOB
pattern complexity limit. The affected analysis was never falsely reported as
successful: each failed transaction remained recoverable through the existing
outbox and idempotency boundaries.

## Applied migrations

| Migration | Change | Safety property |
| --- | --- | --- |
| `0101_document_index_persisting_schedule.sql` | Allows the durable `document.index` intent to be recorded while an analysis is atomically moving through `persisting`. | The consumer still loads only `completed` analyses. |
| `0102_d1_redrive_hash_check.sql` | Rebuilds the immutable operational-redrive event guard with a bounded hexadecimal check supported by D1. | Hash chain, foreign keys, immutability and redrive projection remain enforced. |
| `0103_d1_completed_result_hash_guard.sql` | Replaces the completed-analysis SHA-256 GLOB expression with the equivalent bounded D1-safe check. | Completed results must still be valid JSON with a 64-character lowercase SHA-256 digest and remain immutable. |

Each migration was applied in order to `juro-staging`; Wrangler then reported no
pending migrations.

## Backups

The pre-migration full exports were written to private `juro-staging-backups`.
Their R2 upload/download SHA-256 round trips matched:

| Before | Private object prefix | SHA-256 | Bytes |
| --- | --- | --- | ---: |
| `0101` | `d1/juro-staging/20260806T051000Z-pre-0101/` | `7233bbed90ecfb7b91e5333048fef4f61d84ad981e04263bfcc85a34877f2a96` | 2,393,449 |
| `0102` | `d1/juro-staging/20260806T051200Z-pre-0102/` | `09ce8c075b9cbe9738958cd7b5fc1141c9f97441b313e8f585c672a7638b5fb2` | 2,401,875 |
| `0103` | `d1/juro-staging/20260806T052300Z-pre-0103/` | `18aacf8b040f79950a603bc62aa04c17f54477fe1396a699a6213320d20e92da` | 2,405,002 |

The D1 portable full-export parser did not load the export as one isolated
SQLite transaction because the Cloudflare-generated table order referenced
`user_profiles` before its definition. This is documented as a restore-tooling
limitation; this evidence does **not** claim a fresh isolated restore passed.
The verified private exports remain the recovery inputs.

## End-to-end staging smoke

Only the repository's synthetic `receipt-ru.docx` template was uploaded under
an authenticated staging session. No production or customer file was used.

1. Malware scanner `juro-private-clamav` marked the file safe.
2. Anthropic was unavailable for this attempt; the documented OpenAI fallback
   completed without double charging or exposing provider credentials.
3. `document_analyses` reached `completed` with a result digest and one AI run
   plus one usage-ledger entry.
4. The locked five-minute outbox Cron dispatched `document.index` at
   `2026-08-06T05:35:18.207Z`.
5. The Vectorize job completed on its first attempt at
   `2026-08-06T05:35:27.565Z`; it submitted three tenant-scoped chunks under
   mutation `de68aae1-ceb4-4788-a0cd-105eea5c7774`.
6. Authenticated RU document-review UI rendered the completed summary, risks,
   questions and proposed revisions. The browser log contained two historical
   navigation/extension errors, so this run does not claim a clean-console
   gate.

## Verification

Focused migration and operational tests passed, followed by platform
type-check, lint, staging build and Cloudflare test suite (`127/127`). The
deployed Worker is `juro-platform-staging` version
`66cb9ae1-1a21-4fb2-bbe8-5fe219d1dca0`.

Rollback is application-first: roll staging Worker traffic back to the prior
version or disable asynchronous runtime, then investigate from the immutable
outbox/redrive records. Do not drop any evidence table as part of rollback.
