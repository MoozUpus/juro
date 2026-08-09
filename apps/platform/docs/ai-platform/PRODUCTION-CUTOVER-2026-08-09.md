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

### Subsequent production accessibility recovery — `.6`

The core cutover above was followed by a deliberately small application-only
accessibility recovery. It is recorded separately so that the `.5` cutover
facts remain reproducible rather than being overwritten by a later asset-only
deployment.

- Runtime source commit: `293ef02a4e48f30c7919e235851ca44d892b852f`.
- Annotated tag: `juro-production-2026-08-09.6`.
- Production Worker version: `2459ac87-f2ff-4c71-a220-eb5d54feb3cd`.
- Staging Worker version: `dd5e09ab-39f7-4c05-91d2-0985a9deca46`.
- Scope: auth language links, consent labels, the remembered-device label and
  auth account links now each expose a 44 px minimum touch target. The release
  changed one CSS asset only; it introduced no D1 migration, R2 write, queue
  message, production data mutation, provider request or runtime flag change.
- Before release, platform type-check, lint and the complete platform suite
  passed (131/131). The production artifact was generated with the guarded
  production deployment entry point and its binding inventory confirmed
  `juro-production`, private production R2 buckets, `production-*` queues and
  production Vectorize indexes.

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

For the `.6` recovery, an owner-authenticated production Chrome session was
checked with an explicit 720×450 viewport (the 200%-reflow equivalent of a
1440×900 desktop): the dashboard had a single `h1`, a `main` landmark, and
`scrollWidth === clientWidth` (705 px). The same check at 360×800 found no
horizontal overflow (345 px). The live anonymous login HTML referenced the
new `index-ClDU7ffe.css` asset, which contains the 44 px rules for the language
links, consent labels and account links.

The browser controller cannot apply a fresh OS-level
`prefers-reduced-motion: reduce` override to the owner-authenticated production
tab. The `.6` patch adds no animation; the live CSS still disables the auth
spinner under that media query. This is strong regression evidence, but it is
not a substitute for a fresh reduced-motion device observation.

Release `.7` was deployed to Worker `juro` as version
`d6a541fa-019f-42e3-9349-4569e3ba8d26` and tagged
`juro-production-2026-08-09.7`. It corrects the isolated admin launcher label
so a production surface renders `JURO · ADMIN`, not `JURO · STAGING ADMIN`.
The Worker is attached to `admin.juro.uz` only. A read-only ownership check
also established that `app.juro.uz` is currently served by its separate Sites
project (version 20, source `40310786188eb545f224e906c2c9506c146a907c`), where
`/ru/admin/console` and the security/MFA API are not yet published. Deploying
Worker `juro` therefore cannot change that public application host; this must
be resolved by a deliberate, validated Sites release rather than by changing
DNS or attaching a second worker.

## Subsequent production releases: billing safety and application-domain cutover

This section supersedes the earlier Sites-ownership observation above for the
public application host.

- Release `.14` (`f0b62b2`) keeps the payment path fail-closed when the
  production provider or price catalogue is not approved. The authenticated UI
  now states that checkout is temporarily unavailable, identifies the only
  available path as `PROVIDER=DEMO · SIMULATION`, and offers a separately
  labelled demo which cannot create a card charge, subscription, or tariff
  change.
- Before the application-domain transition, the former Sites binding for
  `app.juro.uz` was recorded as rollback version
  `appgver_bf17f65464ec819185ea6bff77b38275` in Sites project
  `appgprj_6a5f404b623081919cbfa1e3c85d412a`. The only active custom-domain
  mapping was then removed from that project. No D1 or R2 data was modified.
- Release `.15` (`8acc53127e08c10ad5f2fc00e83294b7af4cb338`, tag
  `juro-production-2026-08-09.15`) makes Worker `juro` the sole runtime for
  both `app.juro.uz` and `admin.juro.uz`. Deployment
  `1c75e4bd-10a8-41a3-b122-8ff70803b6e1` published Worker version
  `48bc7241-468c-4440-824a-67d0154489d4` at 100% traffic.
- The active Worker binding record confirms `APP_ENV=production`, D1
  `juro-production` (`4cce509b-0e02-4ca9-a3ba-a5ce1327aeda`), private R2
  `juro-private-documents`, the production queue/vector bindings, and the
  isolated `juro-admin` service. No staging D1, R2, queue, Vectorize binding,
  or runtime secret is attached to this production version.
- The isolated `juro-admin` production Worker is version
  `deab8f1b-7033-4b3c-a475-94fcbeb32361` at 100% traffic. Its only service
  binding is production Worker `juro`, its `PLATFORM_ORIGIN` is
  `https://app.juro.uz`, and it contains no D1 or R2 binding of its own.
- Independent staging remains active as Worker `juro-platform-staging`, version
  `d3df39cd-3390-480a-8153-bbe7a1592f2b` at 100% traffic. Its binding inventory
  is correctly isolated to `juro-staging`, `juro-staging-files`, staging queues
  and staging Vectorize indexes. It was not copied into production.
- The promotion lineage is explicit: the production `.15` commit differs from
  the already verified application source only by the production custom-domain
  attachment for `app.juro.uz` and the artifact assertion that prevents either
  application domain from being omitted. It changes no application route,
  database migration, user data, static asset, AI contract, or staging runtime
  configuration. This is why the production Worker can safely be newer than
  the still-independent staging Worker while serving the same verified product
  artifact with production environment bindings.
- Post-cutover HTTP smoke: `https://app.juro.uz/api/status` returned `200`;
  `/` and the document-builder route returned the intended localized login
  redirects; `https://admin.juro.uz/` returned the intended handoff redirect
  to the app's admin session boundary. An unauthenticated direct request to
  `/ru/admin/console` returns `404` by design to avoid exposing the protected
  admin surface.
- An owner-authenticated browser session rendered the full Worker-backed
  billing route, localized navigation, and the explicit safe payment state
  after this domain transition. The browser was unable to make a direct admin
  request because Chrome locally produced `ERR_BLOCKED_BY_CLIENT` before a
  server request; this is not treated as an admin MFA pass or failure.
- Production marketplace smoke is positive and non-mutating: both
  `https://juro.uz/ru/lawyers` and `https://juro.uz/uz/lawyers` returned the
  localized public catalogue, while `https://app.juro.uz/api/public/lawyers`
  returned one owner-provided `public_approved` profile with
  `canReceiveRequests=true`. The public response schema contains no phone or
  email field. No consultation request or review was created by this check.

Rollback for an application-domain regression is two-part and does not reset
data: first return Worker `juro` to the verified pre-cutover version
`cb09acab-d990-45cb-936a-7f226b020852`, then restore the recorded Sites custom
domain only if the former static application host is required. Validate the
domain owner before reattaching it; do not operate both runtimes for the same
host simultaneously.

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
2. Admin mandatory-TOTP and role checks through the live public application.
   The owner-controlled account now has an active, verified production TOTP
   credential and active `administrator` and `legal_reviewer` assignments.
   Moderation is still intentionally unperformed: the published Sites app does
   not yet contain the MFA-gated admin handoff route, and Chrome currently
   blocks that route before DOM interaction. Do not bypass this gate with a D1
   write.
3. Marketplace request/proposal flow with the real owner-controlled lawyer
   profile. The profile has been completed with approved owner-provided public
   details and photo, but remains `pending_review` until the MFA-gated admin
   moderation decision. It is therefore not publicly listed or selectable
   before the protected approval path is tested.
4. A literal fresh 200% browser-zoom observation and an OS-level
   `prefers-reduced-motion` observation on the `.6` runtime. Equivalent
   production reflow and active CSS checks are recorded above; they must not
   be relabelled as the missing OS-level reduced-motion observation.
5. **Completed in release `.15`:** `app.juro.uz` is now served only by the
   verified production Worker with production D1/R2 bindings. The former Sites
   mapping is retained only as a documented rollback reference and has no live
   `app.juro.uz` custom-domain mapping.

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
