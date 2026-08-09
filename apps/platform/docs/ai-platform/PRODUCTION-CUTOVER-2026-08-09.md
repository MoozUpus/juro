# JURO production cutover evidence — 2026-08-09

This is the authoritative release record for the 2026-08-09 production
cutover. It supersedes older staging-only readiness statements. It records
facts that were observed or command-verified; it is not a claim that every
product journey has passed a fresh production mutation test.

## Release identity

- Runtime source commit: `f55724e1dd8283557d33e0a91b665fc69940dbbf`.
- Annotated release tag: `juro-production-2026-08-09.3` (published to origin,
  resolving to the runtime source commit above).
- GitHub Actions run: `31288999276`; platform and website validation jobs
  succeeded for the runtime commit.
- Production Worker: `juro`.
- Active production deployment: `900800ec-938e-4b46-8254-574577babdaa`.
- Active production version: `ff1e4105-a8a7-4ccd-b632-a9d69ad7cb38` at
  100% traffic.
- Previous verified production-bound rollback version:
  `dc629417-aa97-4906-921b-b153b4ad628e`.
- The deployed runtime includes the Cinematic Legal Intelligence application
  shell. AI-avatar work remains intentionally excluded.

## Production resources and separation

The production deployment uses the existing production resources:

- D1: `juro-production`
  (`4cce509b-0e02-4ca9-a3ba-a5ce1327aeda`).
- Private user-file R2: `juro-private-documents`.
- Backup R2: `juro-production-backups`.
- Quarantine R2: `juro-production-quarantine`.
- Production queues and DLQs use the `production-*` prefix.
- Vectorize: `production-lex-uz`, `production-advice-uz`,
  `production-internal-legal-materials`, and `production-user-documents`.
- Scanner container: `juro-production-malware-scanner`, using the pinned ClamAV
  image digest from `wrangler.jsonc`.
- Separate admin Worker: `juro-admin`; current version
  `abaa5f24-3fd9-4890-81f0-6c6ce07fe7cc`.

Only secret **names** were inventoried: `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`,
`IDENTITY_KEYRING`, `ADMIN_INTERNAL_TOKEN`, and `ADMIN_CONSOLE_TOKEN` where
applicable. No value was copied, logged, or committed.

The staging release was separately redeployed from the same source commit:

- Worker: `juro-platform-staging`.
- Deployment: `09590775-4625-4947-80a6-43ccfbdd8658`.
- Version: `8dee8fe6-00f2-4006-988e-03fffd0db282` at 100% traffic.
- D1/R2/Queues/Vectorize remain `juro-staging`, `juro-staging-*`, and
  `staging-*`. No staging database, file, session, token, or secret was copied
  into production.

The environment differences are intentional: staging enables the explicitly
labelled payment sandbox, while production has
`PAYMENT_SANDBOX_ENABLED=false` and
`PAYMENT_PRODUCTION_APPROVED=false`. Direct legal retrieval is enabled in both;
synthetic probes and legacy ingestion remain disabled.

## Binding-drift incident and permanent recovery

The prior production upload correctly created version
`dc629417-aa97-4906-921b-b153b4ad628e` with production bindings. Wrangler then
created a separate automatic Container rollout version whose bindings were
derived from the top-level development environment. That follow-up version
temporarily became active and caused public production APIs to read development
resources.

Recovery first restored 100% traffic to the verified production-bound upload.
Release `2026-08-09.3` then changed the production deployment entry point to use
`--containers-rollout none`; the pinned scanner Container is managed
independently. Contract tests now require this guard and require the
`app.juro.uz` router service binding to target the production `juro` Worker.
Version `ff1e4105-a8a7-4ccd-b632-a9d69ad7cb38` was re-inspected after deployment:
`APP_ENV=production`, D1 `4cce509b-0e02-4ca9-a3ba-a5ce1327aeda`, production R2,
all `production-*` queues, and all `production-*` Vectorize indexes were present.
No later automatic Container deployment replaced it.

## Database and backup point

- Production and staging report no pending migrations.
- Production `d1_migrations` contains 111 applied migrations, through `0110`.
- No destructive reset, staging seed, or whole-database copy was performed.
- Private production backup object:
  `d1/2026-08-09/fb8ad3c8641f8815d4bc79bdd5f1f4514aae7abe.sql` in
  `juro-production-backups`.
- R2 object size: `1,336,726` bytes.
- Downloaded export SHA-256:
  `6802a7060d8bb517229a5cf1197e19d28c4de4ee8f9d6b596f7e1ea84141315f`.
- Isolated restore verification succeeded: 222 tables, 494 indexes, 297
  triggers, 111 migration rows, SQLite `quick_check=ok`, and zero foreign-key
  violations.
- The temporary plaintext export and restored SQLite file were deleted from
  the local workspace immediately after verification. The private R2 backup is
  the recoverable copy.

Use `npm run verify:d1-backup -- --input <private-export.sql> --output
<isolated-restore.sqlite>` to repeat the restore check. The output target must
not already exist.

## Accidental synthetic production analysis cleanup

Owner-approved cleanup for analysis
`f32fd17d-8826-4d24-9fad-fdb17218ed4c` was verified as follows:

- `document_analyses`: zero matching rows;
- `juro-private-documents`: zero matching object keys in the complete bucket
  listing;
- `job_outbox`: zero matching pending, leased, or retrying rows;
- `job_runs`: zero matching non-terminal rows.

Three completed scanner/analyse/index job-run records remain as immutable audit
evidence. They are terminal records, not pending work, and were intentionally
not deleted.

## Public HTTP smoke

Unauthenticated checks on 2026-08-09 produced:

| URL | Result |
| --- | --- |
| `https://app.juro.uz/api/status` | `200`, operational status JSON |
| `https://app.juro.uz/api/public/lawyers?locale=ru` | `200`, public projection only |
| `https://app.juro.uz/api/platform/cases` | `401`, private session boundary |
| `https://app.juro.uz/api/platform/admin/jobs` | `401 LOCAL_SESSION_REQUIRED`; the former unauthenticated `500` is fixed |
| `https://app.juro.uz/ru/auth/login` | `200` |
| `https://app.juro.uz/ru/individual/document-builder` | `307` to the localized login route with the original `returnTo` and `private, no-store` |
| `https://app.juro.uz/ru/individual/dashboard` | `307` to the localized login route with the original `returnTo` and `private, no-store` |
| `https://admin.juro.uz/` | `200` after redirect to the admin-host login route |
| `https://juro.uz/ru/lawyers` | `200` without redirect |
| `https://staging.app.juro.uz/` | Cloudflare Access login, confirming the staging access boundary remains active |

These checks prove routing and unauthenticated protection, not a fresh signed-in
end-to-end transaction.

## Production data observations

Read-only counts after cleanup showed five user profiles, three conversations,
six AI runs, three comparison records, one lawyer profile, and no document,
analysis, case, action-plan, task, lawyer-request, offer, payment, approved public
lawyer, or active staff-assignment records. Those zero rows are not failures of
the schema, but they prevent a truthful claim that the complete production
mutation journey has been freshly demonstrated.

## Open release gates

The following remain unverified in production and must not be described as
complete:

1. A fresh authenticated owner journey from AI question and direct official
   sources through structured answer, safe document analysis, plan, case,
   task/deadline, lawyer request, offer, and labelled demo payment.
2. Admin mandatory-TOTP and role checks with an active production staff
   assignment. Production currently has no active assignment to test.
3. Marketplace request/proposal flow with a real approved production lawyer.
   Production currently has no approved public lawyer.
4. Demo-payment presentation in production. The foundation is deployed, but
   both production approval and sandbox flags are false, and no payment row
   exists. No real payment provider or card collection is active.
5. Fresh authenticated desktop/mobile/keyboard/reduced-motion/accessibility
   browser evidence after the exact runtime deployment.

Do not create synthetic production profiles, cases, files, requests, or payment
records merely to close these gates. Use a real owner-controlled journey, or
obtain an explicit, narrowly scoped authorization for a labelled disposable
production smoke and clean it up with audit evidence.

## Rollback

For an application regression, restore Worker traffic to
`dc629417-aa97-4906-921b-b153b4ad628e` first and disable the affected
server-side feature flag or queue producer/consumer. The migrations are
additive and may remain in place when the prior Worker can ignore them. Restore
D1 only for demonstrated data corruption, using the verified private backup
after preserving incident evidence. Never replace or delete
`juro-private-documents` as an application rollback.

Rollback triggers include auth outage, tenant exposure, document-builder
regression, corrupt upload/delete behaviour, uncontrolled provider cost,
persistent queue replay, or a critical accessibility regression.

## Authorization record

The owner supplied separate authorization for functional production deployment
and for activation of the Cinematic Legal Intelligence production UI. No
additional production approval was required for this cutover. This authorization
does not permit fabricated evidence or synthetic production data outside an
explicitly scoped smoke test.
