# Staging 0067 — auditable deadline calculation

Date: 2026-08-04

Environment: protected staging only

Commit: `418a786`

Worker: `juro-platform-staging`

## Authorization and isolation

The owner explicitly authorized a private staging D1 backup, migration `0067`
and staging deploy. No production migration or production deploy was performed.
The working tree was clean and both GitHub validation jobs passed before the
remote mutation.

Preflight proved that `juro-staging`
(`bb716a96-b2fb-4823-90d6-6c228fed181a`) had exactly one pending migration,
`0067_deadline_calculation_evidence.sql`. The deadline evidence column was
absent, `foreign_key_check` returned no rows, and staging contained zero case
and task rows.

## Verified backup and restore

Private R2 prefix:

`juro-staging-backups/d1/juro-staging/20260804-094216-0067/`

| Object | SHA-256 |
|---|---|
| `juro-staging-full.sql` | `4C1C0154112CF256B3E576C0F3B543C30B87FAEEFB4B21FC76E6CE4A50C6D4DA` |
| `juro-staging-schema.sql` | `1E32A80E7591C922177C7CEFCDF0ED3B5B224C49736C8D8E5FBD0B87815C597F` |
| `juro-staging-data.sql` | `1A5DD975D199C2D4706D62D6D8029E764D4F9B714CAEF6FA43F4E1721888F61C` |

Each object was downloaded from private R2 and its hash matched the local
export. A disposable restore of the downloaded schema and data passed with:

- `quick_check=ok`;
- foreign-key violations: `0`;
- 171 tables, 345 indexes and 126 triggers;
- 67 pre-migration ledger rows;
- 3,969,024-byte restored SQLite database.

The remote backup was retained. The local restore is only disposable evidence
and is not an application database.

## Migration postflight

Wrangler applied only `0067_deadline_calculation_evidence.sql`, executing 17
commands. The remote ledger now records it as id `68`, applied at
`2026-08-04 04:44:36` UTC. A subsequent migration list reported no pending
migrations.

`action_plan_steps` and `tasks` contain the additive calculation input,
safe-date, calendar/source version, serialized evidence and confidence fields.
The defaults include `deadline_include_source_date=0`,
`deadline_roll_rule='none'` and `deadline_confidence='unverified'`.
`foreign_key_check` again returned no rows; case and task counts remained zero.

The Cloudflare remote `PRAGMA quick_check` preflight exceeded D1 request memory
with `SQLITE_NOMEM`. Integrity is therefore evidenced by the successful
round-trip disposable restore plus remote foreign-key checks, not by a claimed
remote quick-check result.

## Staging deploy and boundary smoke

The guarded repository command `npm run deploy:staging` rebuilt the Vinext
artifact, validated the staging configuration and deployed only
`juro-platform-staging`.

- version: `5e85ee33-f7ec-4e5d-a726-431c67ea46f0`;
- deployment: `6156d7fb-77e6-40c3-bfaf-bc4212721ccb`;
- traffic: 100%;
- deployed at: `2026-08-04T04:46:38.087718Z`;
- D1 binding: `juro-staging`;
- `APP_ENV`: `staging`.

The post-deploy repo-native validation was repeated explicitly with
`node scripts/platform-tasks.mjs artifact --environment staging` and passed.
The default `npm run validate:artifact` was not counted as a pass because it
correctly rejected the staging artifact while expecting a development target.

Anonymous requests to both `https://staging.app.juro.uz/` and
`/ru/individual/ai-lawyer/new` returned the expected Cloudflare Access `302`
with `private, no-store` caching. This proves the protected boundary, not an
authenticated UI journey. The production Worker `juro` remained unchanged at
version `91774ed4-72e9-47bb-b93a-a4208d490b24`; the production document-builder
URL returned its expected unauthenticated `307` login redirect rather than a
404.

## Open gates

- authenticated RU/UZ deadline preview/confirm browser journey in staging;
- keyboard, mobile, zoom and accessibility matrix for this flow;
- owner-approved authoritative Uzbekistan holiday calendar;
- reviewed legal-source verification and historical-law applicability.

Every result remains `preliminary`; user-supplied calendar or legal-basis text
is input evidence, not proof of law. Production remains unchanged and requires
its own explicit functional-deploy authorization.
