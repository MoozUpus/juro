# Staging 0089–0090 checkpoint

Date: 2026-08-05
Commit: `1aadfc69741542d3f5eb83f063603b7407926786`
PR: `MoozUpus/juro#3`
Worker: `juro-platform-staging`
Worker version: `81ba33a4-2f12-4672-a25a-d28cd31a2434`

## Private backup

Before migration, full, schema-only and data-only exports of D1
`juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`) were uploaded to the
private bucket `juro-staging-backups` under
`d1/juro-staging/20260805-102216/`. Independent download hashes matched:

| Export | Bytes | SHA-256 |
| --- | ---: | --- |
| full | 1,582,834 | `c506bf05c168cecde424a76cc134ddde711e5ee6388e144653477eb1d2a01ae2` |
| schema | 375,441 | `3cd67add072f8d7b2dae67d83cdc8553cd0007d2e8358714b3c6ae9f8cf86c3a` |
| data | 1,207,425 | `ac0754c631ef68b58b13374dd58a2d1c82f1504ff4f50cf1d7a5c7a8176efcdb` |

The downloaded full export restored into disposable SQLite with
`quick_check=ok`, zero foreign-key violations, 205 application tables, 442
indexes, 248 triggers and 89 migration rows.

## Ordered migration and postflight

- Wrangler applied `0089_legal_corpus_alerts.sql` and then
  `0090_legal_source_applicability.sql`; the remote ledger records ids 90 and
  91 and has no pending migration.
- Postflight returned `quick_check=ok`, zero foreign-key violations, 207
  application tables, 447 indexes and 256 triggers.
- Post-migration schema SHA-256:
  `490c2a7617b83bd2776b2fcfc55d23f8c169ee4babc413d91f654ef68009b9f0`.
- Post-migration data SHA-256:
  `6226cb604b0c189fc79eb96facb5fd852ab734612f5b489d669a86b50269949f`.

## Exact deployment and checks

- The exact commit was deployed as Worker version
  `81ba33a4-2f12-4672-a25a-d28cd31a2434`; startup time was 239 ms.
- PR #3 CI checks `validate (apps/platform)` and `validate (apps/website)`
  succeeded.
- Staging secret presence was checked by name only; no value was read or
  recorded.
- Anonymous probes for `/`, AI lawyer, the canonical document builder, legal
  source review and status returned Cloudflare Access `302`. This proves routing
  and Access protection, not authenticated UI behavior.

No controlled corpus failure/staleness event, Queue/DLQ delivery log or received
test email is claimed. Production was not migrated or deployed. Local migration
`0091` is the next fail-closed candidate and requires a separate authorization.
