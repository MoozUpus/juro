# Staging 0089–0090 — corpus alerts and legal applicability evidence

Date: 2026-08-05
Functional commit: `1aadfc69741542d3f5eb83f063603b7407926786`
Pull request: `MoozUpus/juro#3`
Staging Worker: `juro-platform-staging`
Staging Worker version: `81ba33a4-2f12-4672-a25a-d28cd31a2434`

## Delivered schema

- `0089_legal_corpus_alerts.sql` adds content-free, idempotent operational-alert
  evidence for failed or stale Lex/Advice corpus runs. It does not store legal
  text, source URLs, user content, tenant data or email recipients.
- `0090_legal_source_applicability.sql` adds immutable reviewer-bound evidence
  for the effective interval and legal status of a source version. It does not
  activate or publish an unreviewed version.
- The staging migration ledger records ids `90` and `91`; no migration remained
  pending after application. Production was not migrated.

## Backup and restore evidence

Before migration, Wrangler exported full, schema-only and data-only snapshots
from D1 `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`). The files were
uploaded to the private bucket `juro-staging-backups` under
`d1/juro-staging/20260805-102216/`, downloaded independently and compared by
SHA-256:

| Object | Bytes | SHA-256 |
| --- | ---: | --- |
| `full.sql` | 1,582,834 | `c506bf05c168cecde424a76cc134ddde711e5ee6388e144653477eb1d2a01ae2` |
| `schema.sql` | 375,441 | `3cd67add072f8d7b2dae67d83cdc8553cd0007d2e8358714b3c6ae9f8cf86c3a` |
| `data.sql` | 1,207,425 | `ac0754c631ef68b58b13374dd58a2d1c82f1504ff4f50cf1d7a5c7a8176efcdb` |

The downloaded full export restored into disposable SQLite with
`quick_check=ok`, zero foreign-key violations, 205 application tables, 442
indexes, 248 triggers and 89 migration rows. No signed URL or secret value is
recorded here.

## Migration and deploy postflight

- `0089` and then `0090` were applied to `juro-staging` in ledger order.
- Postflight returned `quick_check=ok`, zero foreign-key violations, 207
  application tables, 447 indexes, 256 triggers and 91 migration rows.
- The resulting schema export SHA-256 was
  `490c2a7617b83bd2776b2fcfc55d23f8c169ee4babc413d91f654ef68009b9f0`;
  the data export SHA-256 was
  `6226cb604b0c189fc79eb96facb5fd852ab734612f5b489d669a86b50269949f`.
- The exact commit was deployed to `juro-platform-staging`; Wrangler reported
  Worker version `81ba33a4-2f12-4672-a25a-d28cd31a2434` and 239 ms startup.
- Secret presence was checked by name only. Values were neither read nor
  logged. Required staging provider/identity secret names were present.
- GitHub Actions checks `validate (apps/platform)` and
  `validate (apps/website)` both completed successfully for PR #3.

## HTTP boundary evidence and limits

Anonymous requests to `/`, the AI-lawyer entry, the canonical document-builder
route, the legal-source review route and `/ru/status` all returned Cloudflare
Access `302` responses. This proves hostname routing and the protected Access
boundary; it does not prove an authenticated browser traversal.

No controlled failed/stale corpus event was generated, no Queue/DLQ delivery
log was captured and no test email receipt is claimed. The schema and matching
Worker are deployed, but operational email delivery remains a separate staging
gate. Production and its document-builder route were not deployed or migrated.

## Next local safeguard

Migration `0091_verified_corpus_freshness.sql` is a local, unapplied candidate.
It makes corpus freshness fail closed: a run may be `success` only when every
discovered item was fetched and still matches a staff-published, activated,
verified version. New or changed pending-review content produces `partial`, not
freshness evidence. It requires a new backup/migration/deploy authorization.
