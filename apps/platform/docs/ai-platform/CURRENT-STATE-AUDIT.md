# JURO platform — current-state audit

Audit date: 2026-07-28
Scope: `app.juro.uz`, `admin.juro.uz`, the Sites project, Cloudflare account resources, and the `apps/platform` lineage in `MoozUpus/juro`
Mode: read-only production inspection, scoped non-production control-plane provisioning, and local branch verification; no production data, schema, bindings, secrets, DNS, resources, traffic, or deployments were changed.

## Executive summary

JURO currently has a working Cloudflare-hosted MVP with:

- email OTP and cookie sessions backed by D1;
- private R2-backed document storage;
- a substantial document builder with drafts, templates, collaboration, invitations, comments, proposals, approvals, shares, signed-file flows, and exports;
- basic workspaces, cases, action plans, consultations, billing configuration, privacy requests, document review, deterministic document comparison, and monitoring preferences;
- RU/UZ application-shell content and canonical document-builder routes; the builder module itself is still Russian on its UZ URL.

The current implementation is not yet the target AI LegalTech platform described in the owner specification. Important screens are route shells, AI and document review are synchronous and incomplete, legal-source acquisition is only a disabled local single-page contract without parsing/retrieval, and several identity, tenant, file-security, and collaboration controls fail the staging gate.

Production was not modified during this audit.

## Source-of-truth finding

There are two materially different source states:

| Source | Verified revision | Finding |
|---|---:|---|
| Deployed Sites application for `app.juro.uz` | `40310786188eb545f224e906c2c9506c146a907c` (Sites v20) | Current public application source; deployment `appgdep_6a688f65590c81918af6b6ac14093d35` |
| GitHub `MoozUpus/juro` `main` | `a1c572e9c255fbb83ea481c2cdcd4f69ac2c3302` | Newer than the original Phase 0 GitHub snapshot but still behind the deployed Sites/product work |
| GitHub draft PR #3, `feature/juro-ai-platform` | Phase 3 trust checkpoint `84cbe0c`; the `0026` acquisition slice follows locally until its gates pass | The draft PR tracks the same feature branch; this checkpoint reconciles Sites, source migrations through `0026`, security foundations, and GitHub `main` without rewriting shared history. The isolated staging schema remains at `0021`; commit/push state must be read from Git rather than inferred from this audit snapshot. |

The original comparison found 116 files present only in the Sites source, 50 materially changed files, one GitHub-only file, and 179 identical files. The verified Sites source and Phase 0 audit were synchronized into the local `feature/juro-ai-platform` lineage in commit `c454d779e1ec91c6a1a1ad270c9d1b7b02afabb7`. On 2026-07-28 the five later `main` commits through `a1c572e` were merged locally in `702960e` without rebasing or discarding the existing work. Draft PR #3 points to the same feature branch name but does not yet contain the eight local commits or the current uncommitted audit edits.

GitHub `main` remains behind until PR #3 is reviewed and merged, so it is still not a safe deployment source. Production remains pinned to Sites v20 and has not been changed.

## Runtime and dependency baseline

The audited application root is the Sites checkout, corresponding to the platform application rather than the public marketing website.

Key versions:

- Next.js `16.2.12`;
- React `19.2.6`;
- TypeScript `5.9.3`;
- Vinext `0.0.50`;
- Vite `8.0.13`;
- Wrangler `4.92.0`.

No dependency downgrade is proposed.

## Verified production behavior

| Check | Result |
|---|---|
| `https://app.juro.uz/` | `307` to `/login` |
| `/ru/individual/document-builder` as guest | `307` to login with preserved `returnTo` |
| legacy `document-builder-test` route | `308` to canonical `document-builder` |
| `/api/platform/dashboard` without a session | `401` |
| `/api/document-builder/bootstrap` | reports live D1 and R2 bindings |
| `/uz/auth/login` | `404`; required target route is absent |
| `status.juro.uz` | `502`; no working public status page |
| security headers | CSP, HSTS, no-store, and noindex behavior present |
| authenticated `/ru/individual/document-builder` in Chrome | rendered with one `h1`, no console warning/error, no broken images, and no horizontal overflow at 320, 360, 390, 768, 1024, 1280, or 1440 px |
| authenticated `/uz/individual/document-builder` in Chrome | shell and `lang="uz"` are localized, but builder title, `h1`, descriptive text, cards, and categories remain Russian |
| builder landmarks | two nested `<main>` elements; existing accessibility defect |

The working document-builder route and legacy redirects are protected regression requirements.

## Cloudflare and Sites state

The authenticated read-only inventory found two active production control planes:

- Sites project `appgprj_6a5f404b623081919cbfa1e3c85d412a` serves `app.juro.uz` from v20/commit `4031078`; v19 is the known Sites rollback version;
- Cloudflare Worker `juro` serves the separate legacy asset set on `admin.juro.uz` and its workers.dev hostname; active Worker version `91774ed4-72e9-47bb-b93a-a4208d490b24`, deployment `54aee3c6-39eb-4a16-ae59-c74418ae599f`;
- the Workers Domains API still associates both `app.juro.uz` and `admin.juro.uz` with `juro`, while Sites reports `app.juro.uz` on its provider Worker. This routing/control-plane ambiguity blocks staging or production cutover changes until reconciled;
- every Sites deployment is production and the project has no preview URL, so it is not an acceptable staging target.

Verified durable resources:

- D1 `juro-production` — `4cce509b-0e02-4ca9-a3ba-a5ce1327aeda`, 61 control-plane-reported tables;
- D1 `juro-development` — `d07670cf-f7bf-460c-a668-101671d4c330`, 61 control-plane-reported tables;
- D1 `juro-staging` — `bb716a96-b2fb-4823-90d6-6c228fed181a`, EEUR, bootstrapped through the exact 22-entry `0000`–`0021` migration ledger under the one-time verified-empty D-040 exception;
- private R2 `juro-private-documents`, legacy development stores, and six new empty private EEUR Standard development/staging target buckets; no object was copied and no binding was cut over;
- eight legacy development-only queues remain unbound; 28 new development/staging v2 primary + DLQ queues exist with 86,400-second retention and zero producers/consumers;
- eight empty development/staging Vectorize v2 indexes exist at 1,536 dimensions/cosine;
- no staging Worker/DNS, environment binding, Queue consumer/producer attachment, Cron trigger, AI Gateway, or Workers observability destination; production Queue/Vectorize and backup/quarantine resources remain absent.

The production Worker currently binds only Assets, Images, production D1/R2, `EMAIL_FROM`, and secret `RESEND_API_KEY`. The Sites runtime inventory contains `APP_URL`, `EMAIL_FROM`, `PUBLIC_SITE_URL`, and secret `RESEND_API_KEY`. Required OpenAI, Anthropic, encryption/session, OTP pepper, Turnstile, TOTP, signed-URL, and Cron secrets are absent by name from the inspected production surfaces.

The local Phase 1 source exports `fetch`, `queue`, and `scheduled` and uses the exact v2 R2/Vectorize names plus seven producer-only Queue bindings. `consumers` is empty, malware is unattached, legacy job kinds are blocked, and there is no trigger. A single `legal.sync` handler is now connected to the local request/outbox/fetch/R2/pending-review contract; every environment still has `ASYNC_RUNTIME_ENABLED=false`, and Advice has an additional `LEGAL_ADVICE_INGESTION_ENABLED=false` gate. Other handlers remain disabled. Control-plane inventory separately proves that empty non-production resources exist; neither source nor inventory proves a Worker attachment, consumer, retry/DLQ path, live legal ingestion, or runtime activation is safe.

The Sites read-only connector unexpectedly returned a bypass bearer token in raw tool output. Its value was not quoted, stored, reused, or committed. It must be rotated/revoked through the Sites control plane before production work.

## Data and migrations

- Drizzle schema currently describes 77 application tables.
- Local application of migrations `0000`–`0026` to an empty in-memory SQLite database succeeded.
- The resulting local database had 103 non-internal tables and zero foreign-key violations.
- The remote production and development D1 control plane reports 61 tables and migration ledgers `0000`–`0004`; migrations `0005`–`0026` are not applied to either database.
- The isolated staging D1 reports the exact ordered ledger `0000`–`0021`, `PRAGMA quick_check = ok`, zero foreign-key violations, 98 tables including `d1_migrations`, and 275 schema objects. The seven migration-0011 control tables are present. Source migrations `0022`–`0026` have not been applied remotely.
- No destructive `DROP` was found in the existing migrations.
- This local result does not prove compatibility with the actual production schema.
- Migration `0004` copies sensitive operational tables into `__backup_*` tables in the same D1. These are not independent backups and have no tested restore procedure.
- `migrations_dir` is committed in the environment-aware `wrangler.jsonc`; any further remote migration and every production migration remain prohibited until the normal portable backup/restore and inventory gates pass.

No production snapshot or migration was performed. On the initially empty EEUR staging database, the Time Travel restore/undo drill passed and the D1 export job reached `complete`; however the signed SQL artifact could not be retrieved, `juro-staging-backups` remains empty, and no SQL bytes, SHA-256, protected backup object, isolated import database, or RTO evidence exists. D-040 permitted exactly one reproducible bootstrap of that verified-empty staging database: pre-bookmark `00000016-00000000-000050b6-d17b2ef8af450f78e2ba993d4272fe26` advanced to post-bookmark `00000016-00000036-000050b6-48eec1201b71eda52af14c1ba998f030`; the exception is now consumed and is not a production or populated-database precedent.

## Existing feature truth table

| Area | Status | Evidence / limitation |
|---|---|---|
| Email OTP | Local hardening, not staged | atomic request/verification claims, strict inputs, independent `5/email/hour` and `20/IP/hour` controls, a 15-minute lock after the fifth failed verification, and server/client Turnstile integration are covered locally; migration `0023`, live Turnstile, live Resend, and full-HTTP remote D1 evidence remain unverified |
| Sessions | Local hardening, not staged | device-aware sessions, a 24-hour standard absolute lifetime, a 30-day remember-me lifetime, cookie/persisted-expiry alignment, seven-day idle cap, one/other/all revoke, and chained security events exist locally; rotation/fixation, region alerts, security email, and remote evidence remain absent |
| Onboarding | Local hardening, not staged | canonical `/:locale/onboarding`, Uzbek-default entry routing, required structured names/phone/persona/goal, exact current policy-digest evidence, and deterministic personal workspace creation are implemented locally under additive migration `0024`; remote migration, provider-backed registration, browser E2E, policy approval, and `/dashboard` migration remain open |
| Workspaces | Partial | migration `0022` and the local acceptance service provide a one-winner immutable invitation claim, membership upsert without owner-role downgrade, default-workspace switch, and audit rollback in one D1 batch; workspace switching no longer rewrites the persistent profile persona; the migration is not remote, the redirect still omits `workspaceId`, and broader tenant/audit gaps remain |
| Document builder | Substantial | connected D1/R2 implementation; invitation pre-accept denial and active-workspace isolation are fixed locally and regression-tested, but not staged |
| Cases / plans | Partial | D1 records exist; object routes render a shared/general client rather than a complete case workspace |
| AI lawyer | Prototype | synchronous OpenAI intake; no streaming, structured Zod contract, legal retrieval, fallback, memory, or usage ledger |
| Document analysis | Prototype | synchronous OpenAI request with a 10 MB form upload; no Claude, scan, OCR, queue, or rich result schema |
| Comparison | Partial | deterministic comparison and export; not semantic Claude comparison |
| Legal knowledge | Disabled local acquisition foundation only | migration `0025` adds fail-closed source/version/section/chunk/sync/review records; `0026` adds a robots/URL/redirect/size/timeout guarded single-page request and identifiers-only `legal.sync` path that stores only raw private R2 plus pending review; consumers require exact verification evidence; Advice is policy-disabled and no live fetch, parser, hybrid retrieval, citation validator, indexing, reviewer route, Cron, or editor exists |
| Lawyer marketplace | Not implemented | consultation records are not the required directory/conflict/access-grant workflow |
| Billing | Adapter-ready only | configuration and records exist; checkout explicitly returns `PAYMENT_ADAPTER_REQUIRED` |
| Monitoring | Preferences only | displayed sources are restricted to exact LexUZ/AdviceUZ HTTPS hosts; source ingestion and exact citation/version verification remain absent |
| Admin / support / status | Not implemented | no protected admin suite, support workflow, or operational status site |
| Voice / realtime calls | Not implemented | must remain feature-flagged, without simulated completion |

## Configuration and documentation drift

- The Sites production inventory returned only `APP_URL`, `EMAIL_FROM`, `PUBLIC_SITE_URL`, and secret `RESEND_API_KEY` by name.
- Required OpenAI, Anthropic, session/encryption, OTP pepper, Cron, Turnstile secret/site-key, TOTP, signed-URL, and model variables are not present in the inspected Sites or Worker environment inventory. `TURNSTILE_SECRET_KEY` is server-only; `TURNSTILE_SITE_KEY` is public environment configuration used to render the client widget, not a secret.
- The deployed Sites checkout does not contain the permanent `wrangler.jsonc`; the draft PR now contains and validates it, but that source configuration is not deployed.
- `docs/production-runbook.md` claims environment setup that could not be verified.
- App policy copy still contains visible `{OPERATOR_LEGAL_NAME}`, `{OPERATOR_EMAIL}`, and `{OPERATOR_ADDRESS}` placeholders.
- The repository and platform READMEs were stale (Linux-only starter claims and no `wrangler.jsonc`); the local branch now documents the shell-neutral platform launcher and real Cloudflare contract, but that correction is not yet pushed or deployed.

## Baseline verification

Executed on Windows against checkpoint base `8ab1693` plus the current Phase 2 worktree and generated build output:

```text
npm run cf:types:check  PASS
npm run type-check      PASS
npm run lint            PASS
npm run install:ci -- --validate-only
  PASS; project lock/toolchain verified; npm ci and network were not invoked
npm test                PASS
  bounded development build and artifact validation: PASS
  rendered route/security tests: 25 PASS
  core/auth/document tests: 225 PASS
  Cloudflare/migration/job tests: 63 PASS
  total: 313 PASS
npm run build:staging   PASS
  staging artifact validation: PASS
npm run validate:cloudflare:matrix
  development/staging/production build + artifact + Wrangler dry-run: PASS
npm audit --offline --omit=dev --audit-level=high
  0 vulnerabilities in the locally cached advisory set
strict high-confidence secret scan
  tracked source: 0; built bundle: 0; git history: 0
```

The latest recorded successful local full suite is the 313-test run above: 25 rendered-route, 225 core, and 63 Cloudflare tests. It includes local coverage for migrations `0022`–`0026`, workspace-invitation one-winner/rollback behavior, independent OTP rate limits, the verification lock, Turnstile contract behavior, 24-hour/30-day session persistence, structured onboarding, canonical localized auth routes, persona-preserving workspace switches, and the fail-closed legal-source lifecycle, acquisition, and untrusted normalization contracts. This is not staging or live-provider evidence. The clean network-install path remains unverified because actual `npm ci` was deliberately not run.

The online npm audit was not run because the execution policy rejected sending dependency metadata to the npm registry; the offline result is not presented as equivalent to a fresh registry audit. The existing suite is a baseline, not evidence that the target Definition of Done is met.

## Phase 0 gate

Source reconciliation, control-plane inventory, threat/model audits, and the reproducible local baseline are complete locally; the current documentation edits are not yet committed or pushed to draft PR #3. The initially empty staging Time Travel restore/undo drill passed and returned clean, and the one-time D-040 staging bootstrap subsequently applied the exact `0000`–`0021` ledger with passing integrity checks. The Browser runtime was recovered with a session-local temporary `{ "type": "commonjs" }` package scope; neither JURO nor the user-home package was changed. Authenticated Chrome evidence now covers the canonical builder, RU/UZ route behavior, console, broken images, landmarks, and horizontal overflow at 320, 360, 390, 768, 1024, 1280, and 1440 px. A PII-free mobile screenshot is stored outside the repository in the task visualization workspace.

The complete Phase 0 gate is still open because portable SQL export/import and protected-backup evidence, a production routing decision, and the remaining browser/accessibility matrix (200% zoom, keyboard/focus, reduced motion, axe, Lighthouse, real iOS/Android behavior, and broader critical-route screenshots) are not yet verified. The Chrome client blocked the direct legacy `document-builder-test` navigation, so the browser attempt is not counted as redirect evidence; the existing HTTP/source regression evidence remains the recorded basis for that `308` contract.

The disabled Phase 1 source foundation passes the current local gates. The isolated staging D1 is schema-bootstrapped through `0021`; source migrations `0022`–`0026` remain unapplied there. Empty dev/staging R2 targets, 28 unbound primary/DLQ queues, and eight empty Vectorize indexes also exist, but no staging Worker, route, DNS, runtime binding, secret, or deployment exists. No consumer is declared or attached. The staging source and flattened artifact explicitly set `workers_dev: false`, `preview_urls: false`, `routes: []`, `ASYNC_RUNTIME_ENABLED=false`, and `LEGAL_ADVICE_INGESTION_ENABLED=false`; validation also rejects `ALLOW_PLATFORM_AUTH_HEADERS`, consumers, and schedules. This permits only an inactive first Worker upload after explicit owner approval for official local Wrangler authentication. A public staging hostname remains prohibited until Cloudflare Access is configured and unauthenticated denial is proved. Activation remains blocked until portable backup/restore evidence, remote migrations `0022`–`0026`, live Turnstile/Resend configuration and verification, consumer/DLQ policy, live Lex robots/fetch/R2 evidence, quarantine scanning, alerts, redrive, ledger reconciliation, per-kind flags, provider idempotency, and side-effect fencing are implemented. Advice additionally requires owner/legal approval. Production remains unchanged.
