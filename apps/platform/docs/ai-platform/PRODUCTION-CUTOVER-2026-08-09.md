# JURO production cutover evidence — 2026-08-09

This is the authoritative release record for the 2026-08-09 production
cutover. It supersedes older staging-only readiness statements. It records
facts that were observed or command-verified; it is not a claim that every
product journey has passed a fresh production mutation test.

## Release identity

- Runtime source commit: `6da08ad68e1a7bbf5dfa9813071de540548b48fd`.
- Annotated release tag: `juro-production-2026-08-09.5` (published to origin,
  resolving to the runtime source commit above).
- GitHub Actions run: `31292015263`; platform validation succeeded in 6m02s
  and website validation succeeded in 40s for the runtime commit.
- Production Worker: `juro`.
- Active production deployment: `bc34a717-6738-4575-9848-712c5e4b8a33`.
- Active production version: `fb786f2f-b40a-4306-8e61-5238f87c7bde` at
  100% traffic.
- Previous verified production-bound rollback version:
  `20905936-0156-4f02-b58b-f2d77d1cb060`.
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
- Deployment: `fba1d311-a569-4c22-88e6-1d0262ccd0cd`.
- Version: `9f8b6d6f-51a5-476c-b770-46b3cec2d2bd` at 100% traffic.
- D1/R2/Queues/Vectorize remain `juro-staging`, `juro-staging-*`, and
  `staging-*`. No staging database, file, session, token, or secret was copied
  into production.

The environment differences are intentional. Production has
`PAYMENT_PRODUCTION_DEMO_ENABLED=true`, while
`PAYMENT_SANDBOX_ENABLED=false` and `PAYMENT_PRODUCTION_APPROVED=false` keep
real payment execution disabled. Direct legal retrieval is enabled in both;
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
Version `20905936-0156-4f02-b58b-f2d77d1cb060` was re-inspected after deployment:
`APP_ENV=production`, D1 `4cce509b-0e02-4ca9-a3ba-a5ce1327aeda`, production R2,
all `production-*` queues, and all `production-*` Vectorize indexes were present.
No later automatic Container deployment replaced it.

Two subsequent Git-connected Workers Builds exposed a second drift path:
versions `d9e44349-f1c1-4739-893d-9f461dbfb0c3` and
`f3bbbad4-5428-4dcc-8df7-873d82dd40ad` were built from merged pull requests
with the repository root set to `apps/platform`, but their deploy command was
the default-environment `npx vinext deploy`. Both therefore carried development
D1/R2/Queue/Vectorize bindings despite targeting the production Worker. Traffic
was immediately restored to production-bound version
`20905936-0156-4f02-b58b-f2d77d1cb060` by deployment
`b668d031-fa41-4ac1-b45e-f2d1336596cb`.

The repository connection in the Cloudflare Worker build settings was then
disconnected. GitHub Actions remains the code validation source, while Worker
deployment is now an explicit release action through the guarded production
entry point. This is reversible, but any future repository reconnection must
use `npm run deploy:production` (or an equivalent environment-explicit command),
never the top-level Vinext deploy command. The final `.5` production version was
re-inspected after upload and contains only production D1/R2/Queue/Vectorize
bindings.

## Database and backup point

- Production and staging report no pending migrations.
- Production and staging `d1_migrations` contain 112 applied migrations,
  through `0111_production_demo_payments.sql`.
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

Before migration `0111`, staging received a second private, download-verified
backup at
`juro-staging-backups/d1/releases/2026-08-09/pre-0111-6da08ad-93a4dd24.sql`.
Its SHA-256 is
`93a4dd2499763b793f8165524909d5492b4b877cfe7e162f08bb9e11e66ce28d`;
an isolated restore produced 222 tables, 494 indexes, 297 triggers, 111
migration rows, `quick_check=ok`, and zero foreign-key violations. All three
local plaintext/SQLite staging artifacts were deleted after the private R2
round-trip verification.

A new plaintext production export was not created for `0111`: the release used
Cloudflare D1 Time Travel bookmark
`0000023d-00000004-000050c2-069b9ebaa80c7eb41419892094383f7d` as the
pre-migration restore point. Migration `0111` executed 12 commands in staging
and production, recorded one new migration row, created both demo tables and
four integrity triggers, and left `PRAGMA foreign_key_check` clean. Production
aggregate counts for users, workspaces, documents, cases, analyses, and lawyer
profiles were unchanged by the migration.

Use `npm run verify:d1-backup -- --input <private-export.sql> --output
<isolated-restore.sqlite>` to repeat the restore check. The output target must
not already exist.

## Accidental synthetic production analysis cleanup

Owner-approved cleanup for analysis
`f32fd17d-8826-4d24-9fad-fdb17218ed4c` was verified as follows:

- `document_analyses`: zero matching rows;
- linked `document_files` row `3ca04758-018d-4f79-8283-e162b0713d72`: zero
  matching rows;
- `juro-private-documents`: its complete active prefix tree contains no object
  with the analysis UUID;
- `juro-production-quarantine`: `0 B` and no objects;
- `job_outbox`: zero matching pending rows;
- `production-user-documents`: all three remaining vectors were verified by
  metadata as belonging to this analysis, deleted through mutation
  `663c318d-b797-4d02-b3d5-6d77e630e91a`, and the index then reported
  `totalCount=0`.

Three completed scanner/analyse/index job-run records remain as immutable audit
evidence. They are terminal records, not pending work, and were intentionally
not deleted.

The immutable records also provide bounded functional evidence for the deleted
synthetic document pipeline:

- `production-malware-scan` / `malware.scan` completed on attempt 1 without an
  error code;
- `production-document-analysis` / `document.analyze` completed on attempt 1
  without a job error;
- the primary Anthropic `claude-sonnet-4-6` provider attempt is recorded as
  failed with `FALLBACK_USED`;
- the configured OpenAI fallback `gpt-5.6-sol` then succeeded with provider
  response `resp_030ad9e98b6224f9006a779f68af44819a8ed5c0f86e57ea54`;
- `document.index` completed on attempt 1, and the OpenAI
  `text-embedding-3-large` usage record reports three indexed items and a
  successful provider request.

This proves the production upload/scan/analysis/indexing path completed through
the designed provider fallback. It does not prove a successful primary Claude
analysis. The user-facing analysis, source R2 object, D1 projection, pending
outbox row, and three temporary vectors were removed under the owner's explicit
cleanup authorization; only immutable operational evidence remains.

## Public HTTP smoke

Unauthenticated checks on 2026-08-09 produced:

| URL | Result |
| --- | --- |
| `https://app.juro.uz/api/status` | `200`, operational status JSON |
| `https://app.juro.uz/` | `307` to `/uz/auth/login`, preserving the Uzbek-first root rule |
| `https://app.juro.uz/api/public/lawyers?locale=ru` | `200`, public projection only |
| `https://app.juro.uz/api/platform/demo-payments` | `401`, private session boundary |
| `https://app.juro.uz/api/platform/cases` | `401`, private session boundary |
| `https://app.juro.uz/api/platform/admin/jobs` | `401 LOCAL_SESSION_REQUIRED`; the former unauthenticated `500` is fixed |
| `https://app.juro.uz/ru/auth/login` | `200` |
| `https://app.juro.uz/ru/individual/document-builder` | `307` to the localized login route with the original `returnTo` and `private, no-store` |
| `https://app.juro.uz/ru/individual/dashboard` | `307` to the localized login route with the original `returnTo` and `private, no-store` |
| `https://admin.juro.uz/` | `303` to the app-host admin-session boundary |
| `https://juro.uz/ru/lawyers` | `200` without redirect |
| `https://staging.app.juro.uz/` | Cloudflare Access login, confirming the staging access boundary remains active |

These checks prove routing and unauthenticated protection, not a fresh signed-in
end-to-end transaction.

## Authenticated browser and mobile accessibility QA

An existing owner-controlled lawyer session was used for route QA, a labelled
AI/case smoke, and one explicitly labelled demo-payment mutation. The QA case
was completed and archived through the product UI after verification. No file,
document, analysis, consultation request, offer, real payment, subscription,
entitlement, settlement, or payable was created. The exact `2026-08-09.5`
runtime was checked in Chrome after deployment.

- Desktop routes previously covered the dashboard, AI chat, document review,
  document builder, cases, consultations, and security surfaces in RU, with a
  single logical `h1`, no horizontal overflow, and no console warnings/errors.
- Fresh `.5` authenticated route checks covered AI chat, document review,
  document builder, cases, action plan, calendar, lawyers, consultations, and
  billing; all nine resolved to their intended localized route with an `h1`,
  no Not Found state, and no browser console messages.
- The first labelled AI question deliberately requested a conclusion that the
  two directly retrieved Advice.uz pages did not support. JURO refused to
  fabricate the requested legal basis, separated the assumption, and did not
  charge the limit. A second narrowly scoped question about official
  Advice.uz document `2920` completed successfully in conversation
  `d8dbecab-72ed-4b72-ab9f-e9a7a6174156`: the UI rendered a structured answer,
  linked `https://advice.uz/ru/document/2920`, identified the direct fetch date,
  and labelled the source-supported findings. The conversation contains four
  messages. The general `conversation_sources` projection remains empty, so
  the link observation is browser evidence rather than a claim about that
  projection table.
- Labelled case `245bd342-0902-47d3-bcd2-a0e159499b16` exercised plan and task
  persistence. Confirming revision 1 created exactly four tenant-scoped tasks
  and one idempotent `tasks_created` event. Updating the first step to
  `in_progress` advanced the plan to revision 2, synchronized the matching task,
  and added `plan_changes_confirmed`. The case workspace rendered all four
  steps and tasks without an error. No real deadline was assigned, deliberately
  avoiding a future reminder to the production email address. The case was then
  completed and archived through the UI at
  `2026-08-09T04:26:49.933Z`; it is absent from active work lists and retained
  only as clearly labelled archived audit evidence.
- The production lawyer directory correctly exposed only approved profiles.
  With zero approved profiles it rendered the empty state and did not expose a
  selectable recipient. The authenticated session belongs to a lawyer profile,
  so its localized `consultations` route correctly shows assigned requests and
  does not expose the individual handoff form.
- The payment demo rendered in RU and UZ with `provider=demo` and
  `isSimulation=true`. Run `demo_eb4dc7be25dd405eb01015b022a7d4b3` completed
  `previewed -> succeeded -> refunded` with three append-only events. Production
  `payments`, `payment_attempts`, `payment_provider_events`, `subscriptions`,
  `subscription_entitlements`, `settlement_allocations`, and `lawyer_payables`
  all remained at zero before and after the demo.
- Mobile checks covered 390x844 and 360x800; tablet checks covered 768x1024;
  RU and UZ language routing and `lang` attributes were correct and no
  horizontal overflow or console warnings/errors were observed.
- A real mobile accessibility defect was found in `2026-08-09.3`: the visually
  closed off-canvas navigation remained exposed to sequential focus and its
  close control was 42x42 CSS pixels.
- `2026-08-09.4` gives the closed mobile sidebar both `inert` and
  `aria-hidden=true`; opening removes both restrictions, Escape closes it and
  restores focus to the menu trigger, and the close control measures 44x44 CSS
  pixels. These behaviours were rechecked at 390x844 RU and 768x1024 UZ.

The available browser controller did not provide a faithful fresh 200% browser
zoom or `prefers-reduced-motion` emulation. Automated CSS/accessibility contracts
cover text scaling and reduced-motion rules, but this record does not substitute
those contracts for the missing fresh manual/emulated observations.

## Production data observations

Read-only counts after the labelled smoke showed four conversations, eight AI
runs, zero documents, zero document analyses, one archived case, zero active
cases, one action plan, four tasks, zero lawyer requests, zero offers, zero
approved public lawyers, and zero active staff assignments. One clearly
labelled demo-payment run and one clearly labelled archived case exist solely
as cutover evidence. These zero rows are not failures of the schema; they are
consistent with the owner-approved cleanup of the synthetic document result.
The immutable job/provider records prove the analysis fallback path, while the
marketplace/admin positive paths remain open rather than being simulated through
privileged database writes.

## Open release gates

The following remain unverified in production and must not be described as
complete:

1. The AI question, direct official-source rendering, structured answer,
   production malware scan, document analysis through the configured OpenAI
   fallback, document indexing, plan, case, four tasks, synchronized task
   status, archive lifecycle, and labelled demo payment are proven. A successful
   primary Anthropic/Claude production analysis is not proven: that attempt
   failed safely and the fallback completed the job.
2. Admin mandatory-TOTP and role checks with an active production staff
   assignment. Production currently has no active assignment to test.
3. Marketplace request/proposal flow with a real approved production lawyer.
   Production currently has no approved public lawyer. The empty state and
   public-projection restriction are proven; request and offer mutations are
   not.
4. Fresh 200% browser zoom and `prefers-reduced-motion` observations on the
   exact runtime. Authenticated desktop/mobile/tablet, RU/UZ, keyboard focus
   restoration, overflow, and console checks are recorded above.

Do not create synthetic production profiles, cases, files, requests, or payment
records merely to close these gates. Use a real owner-controlled journey, or
obtain an explicit, narrowly scoped authorization for a labelled disposable
production smoke and clean it up with audit evidence.

## Rollback

For an application regression, restore Worker traffic to
`20905936-0156-4f02-b58b-f2d77d1cb060` first and disable the affected
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
