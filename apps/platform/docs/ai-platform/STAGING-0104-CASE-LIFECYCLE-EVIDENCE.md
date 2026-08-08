# Staging case-lifecycle D1 evidence (0104)

Date: 2026-08-06. Scope: protected staging only. Production was not changed.

## Root cause and remediation

An authenticated synthetic case could not move from `open` to `completed` even
after all plan steps and tasks were completed. The transaction safely failed
without changing the case. The root cause was the D1-incompatible exact
`GLOB replace(lower(hex(zeroblob(32))))` check in the immutable
`case_lifecycle_events` ledger.

Migration `0104_d1_case_lifecycle_hash_guard.sql` rebuilds only that evidence
table. It preserves its foreign keys, unique indexes, append-only guards,
projection trigger and lifecycle-transition guard. The hash constraint is now
the D1-supported equivalent: a 64-character lowercase hexadecimal value.

## Private backup and migration

Before migration, a full export of `juro-staging`
(`bb716a96-b2fb-4823-90d6-6c228fed181a`) was uploaded to the private
`juro-staging-backups` bucket:

| Private R2 object | Bytes | SHA-256 | Verification |
| --- | ---: | --- | --- |
| `d1/juro-staging/20260806T060312Z-pre-0104/pre-0104-full.sql` | 2,433,474 | `3a1fb19899053ae47a36ba45d2a51e90c2feae5e43ec2ceb48628fafc3df09e6` | remote R2 upload/download hash matched |

The first attempted round trip displayed Wrangler's local R2 mode. It was not
counted as a backup; that local-only object was deleted. The recorded object
above used explicit `--remote`. Temporary local plaintext export/download files
were removed after checksum verification. This checkpoint is a recovery input;
it does not claim a fresh full restore drill, because Cloudflare's portable
full-export table order is not a single-transaction SQLite restore.

Wrangler applied migration `0104` in 18 commands. It then reported no pending
migrations. `PRAGMA foreign_key_check` returned no rows, and D1 read-back
confirmed the new bounded hash constraint.

## Authenticated staging smoke

Only the pre-existing synthetic, no-PII case **QA lifecycle — возврат долга**
was used. It had four confirmed completed tasks and four completed plan steps.
The authenticated UI successfully executed this sequence:

1. `complete` — case became completed.
2. `archive` — case moved into the archive.
3. `restore` — archive became empty and the case returned completed.
4. `reopen` — case returned open.

The final D1 projection is `open`, with lifecycle revision `4`, no archive or
completion timestamp, and four immutable event rows. Each event has a
64-character lowercase hash; every `previous_hash` matches the preceding
`event_hash`, beginning with the zero genesis hash. Foreign-key violations are
zero.

The same browser session switched from `/ru/individual/cases/...` to the
corresponding `/uz/individual/cases/...` route, retained the same object and
rendered the open state plus action controls in Uzbek. The current-tab browser
console contained no errors after the sequence.

## Deployment and checks

- Commit: `f344686 fix(platform): make case lifecycle hash guard D1-compatible`.
- Protected Worker: `juro-platform-staging` version
  `598d327d-ac0b-4ac9-932e-627c0ab19fe4` at 100% staging traffic.
- Focused TypeScript tests: 65 passed, including lifecycle chain, idempotency,
  tenant denial, D1-safe hash constraints and migration foreign-key integrity.
- `npm run type-check`: passed.
- `npm run lint`: passed.
- `npm run test:cloudflare`: 128 passed.
- `npm run build:staging`: passed and validated the staging artifact.

## Rollback and limitations

Application-first rollback is the prior staging Worker version. The old
constraint must not be reintroduced; if the D1 schema itself must be restored,
first isolate and validate the private checkpoint above. This evidence covers
one authenticated synthetic lifecycle only. It does not close the broader
legal-quality, full document-evaluation, browser/device/accessibility matrix,
provider-delivery, backup-RTO, or production release gates.
