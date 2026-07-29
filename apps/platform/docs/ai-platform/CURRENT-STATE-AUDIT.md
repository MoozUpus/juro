# JURO platform — current-state audit

Audit date: 2026-07-30
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
| GitHub draft PR #3, `feature/juro-ai-platform` | Pushed code checkpoint `a1261c3c68151f9c275187fd422bd58c67b673a8`; staging deployment evidence accompanies the next documentation commit | The draft PR tracks the same feature branch without rewriting shared history; isolated staging is through `0033`, while production remains unchanged. |

The original comparison found 116 files present only in the Sites source, 50 materially changed files, one GitHub-only file, and 179 identical files. The verified Sites source and Phase 0 audit were synchronized into the local `feature/juro-ai-platform` lineage in commit `c454d779e1ec91c6a1a1ad270c9d1b7b02afabb7`. On 2026-07-28 the five later `main` commits through `a1c572e` were merged in `702960e` without rebasing or discarding the existing work. Draft PR #3 contains the staging code checkpoint through `a1261c3`; this document records the subsequent protected staging evidence, while the documentation-only follow-up commit is tracked by Git.

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
- D1 `juro-staging` — `bb716a96-b2fb-4823-90d6-6c228fed181a`, EEUR, exact 34-entry `0000`–`0033` ledger, 114 non-internal tables, 70 triggers, and 198 indexes;
- private R2 `juro-private-documents`, legacy development stores, and six private EEUR Standard development/staging target buckets; ten verified D1 export/restore artifacts exist in `juro-staging-backups`, and no production binding was cut over;
- eight legacy development-only queues remain unbound; 28 development/staging v2 primary + DLQ queues exist with 86,400-second retention; staging email and data-retention have one reviewed consumer each, while the other five staging primaries remain producer-only;
- eight empty development/staging Vectorize v2 indexes exist at 1,536 dimensions/cosine;
- protected staging Worker `juro-platform-staging` serves deployment `a38d3cbc-7fd1-4829-be9d-97249f265882`, version `12a3abf3-af6d-41da-8726-b7abf03f5dbf` at 100% from commit `a1261c3`; staging bindings, two consumers and one cron are active behind owner-only Access, while legal ingestion/staff API remain disabled and production remains unchanged.

The production Worker currently binds only Assets, Images, production D1/R2, `EMAIL_FROM`, and secret `RESEND_API_KEY`. The Sites runtime inventory contains `APP_URL`, `EMAIL_FROM`, `PUBLIC_SITE_URL`, and secret `RESEND_API_KEY`. Required OpenAI, Anthropic, encryption/session, OTP pepper, Turnstile, TOTP, signed-URL, and Cron secrets are absent by name from the inspected production surfaces.

The local source exports `fetch`, `queue`, and `scheduled` and uses the exact v2 R2/Vectorize names plus seven Queue producer bindings. Development and production remain `ASYNC_RUNTIME_ENABLED=false` and consumer-free. The next staging candidate alone sets async execution true and attaches only `staging-email-notifications` to the implemented encrypted prior-address alert handler and its distinct DLQ; `legal.sync` remains implemented but unattached, Advice remains separately disabled, malware is unattached, legacy job kinds are blocked, and there is no schedule. The deployed staging Worker still has execution false and zero consumers. Control-plane inventory proves the isolated resources exist, but the new consumer, retry/DLQ path, and migration `0030` are not remote evidence until backup/restore, deploy, and staging delivery tests pass.

The Sites read-only connector unexpectedly returned a bypass bearer token in raw tool output. Its value was not quoted, stored, reused, or committed. It must be rotated/revoked through the Sites control plane before production work.

## Data and migrations

- Drizzle schema currently describes 80 application tables.
- Local application of migrations `0000`–`0030` to an empty in-memory SQLite database succeeded; `0030` is not remotely applied.
- The resulting local database had 108 application tables, 154 foreign keys, and zero foreign-key violations.
- The remote production and development D1 control plane reports 61 tables and migration ledgers `0000`–`0004`; migrations `0005`–`0029` are not applied to either database.
- The isolated staging D1 reports the exact ordered ledger `0000`–`0029`, 109 non-internal tables, and 58 triggers. A migration-specific pre-`0029` export/private-R2 round trip and restore-only adapter reproduced all 106 exported tables, all 74 rows, the ledger/trigger inventory, and zero foreign-key errors in a disposable remote EEUR D1 before deletion. The post-`0029` full/schema/data set passed private-R2 checksum round trips, and remote D1 again reports zero foreign-key violations. Remote D1 does not authorize the integrity pragma itself.
- No destructive `DROP` was found in the existing migrations.
- This local result does not prove compatibility with the actual production schema.
- Migration `0004` copies sensitive operational tables into `__backup_*` tables in the same D1. These are not independent backups and have no tested restore procedure.
- `migrations_dir` is committed in the environment-aware `wrangler.jsonc`; any further remote migration and every production migration remain prohibited until the normal portable backup/restore and inventory gates pass.

No production snapshot or migration was performed. On the initially empty EEUR staging database, the Time Travel restore/undo drill passed. Ten verified artifacts are now retained in private `juro-staging-backups`: three earlier checkpoints plus the four-file pre-`0029` restore set and the three-file post-`0029` set. Every object passed a byte-for-byte round trip; the pre-`0029` restore adapter reproduced source counts in a disposable remote D1 that was deleted after schema/ledger/FK agreement. This establishes bounded staging logical recoverability, not production protection or an operational RTO. D-040 permitted exactly one reproducible bootstrap of the originally verified-empty staging database: pre-bookmark `00000016-00000000-000050b6-d17b2ef8af450f78e2ba993d4272fe26` advanced to post-bookmark `00000016-00000036-000050b6-48eec1201b71eda52af14c1ba998f030`; the exception is consumed and is not a production or populated-database precedent.

## Existing feature truth table

| Area | Status | Evidence / limitation |
|---|---|---|
| Email OTP | Local hardening, not staged | atomic request/verification claims, strict inputs, independent `5/email/hour` and `20/IP/hour` controls, a 15-minute lock after the fifth failed verification, and server/client Turnstile integration are covered locally; migration `0023`, live Turnstile, live Resend, and full-HTTP remote D1 evidence remain unverified |
| Sessions | Local hardening, latest slices not staged | device-aware sessions, bounded token rotation/replay handling, a non-authenticating opaque continuity cookie, conservative comparable-region detection, encrypted new-device/new-region notification jobs, 24-hour/30-day absolute lifetimes, seven-day idle cap, one/other/all revoke, and chained security events pass locally; migrations `0030`–`0032`, protected HTTP/cookie evidence, active consumer/DLQ, and real security-email delivery remain absent |
| Onboarding | Local hardening, schema staged | canonical `/:locale/onboarding`, Uzbek-default entry routing, required structured names/phone/persona/goal, exact current policy-digest evidence, deterministic personal workspace creation, and canonical `/dashboard` entry are implemented locally; migration `0024` is applied to isolated staging, while provider-backed registration, browser E2E, and policy approval remain open |
| Workspaces | Partial, schema staged | migration `0022` and the local acceptance service provide a one-winner immutable invitation claim, membership upsert without owner-role downgrade, default-workspace switch, and audit rollback in one D1 batch; workspace switching no longer rewrites the persistent profile persona; full HTTP behavior is not staged, the business redirect still omits `workspaceId`, and broader tenant/audit gaps remain |
| Document builder | Substantial | connected D1/R2 implementation; invitation pre-accept denial and active-workspace isolation are fixed locally and regression-tested, but not staged |
| Cases / plans | Partial | D1 records exist; object routes render a shared/general client rather than a complete case workspace |
| AI lawyer | Prototype | synchronous OpenAI intake; no streaming, structured Zod contract, legal retrieval, fallback, memory, or usage ledger |
| Document analysis | Prototype | synchronous OpenAI request with a 10 MB form upload; no Claude, scan, OCR, queue, or rich result schema |
| Comparison | Partial | deterministic comparison and export; not semantic Claude comparison |
| Legal knowledge | Disabled local acquisition, review, and first-version publication foundation only | migration `0025` adds fail-closed source/version/section/chunk/sync/review records; `0026` adds guarded single-page acquisition; normalization stores only an untrusted private parsed snapshot; `0027` adds dedicated-role/fresh-MFA immutable review decisions; `0028` adds a separate fresh-MFA publisher with R2/evidence revalidation, atomic verified-state transition, and immutable reading/publication evidence; protected claim/decision/publication HTTP routes exist locally but are pinned off by `LEGAL_SOURCE_STAFF_API_ENABLED=false`; consumers require exact verification evidence; Advice is policy-disabled and no successful live fetch, staff UI, reviewed remote activation, replacement-version activation, hybrid retrieval, citation validator, indexing, Cron, or editor exists |
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

Executed on Windows against checkpoint base `6178266` plus the current canonical business-workspace routing worktree and generated build output:

```text
npm run cf:types:check  PASS
npm run type-check      PASS
npm run lint            PASS
npm run install:ci -- --validate-only
  PASS; project lock/toolchain verified; npm ci and network were not invoked
npm test                PASS
  bounded development build and artifact validation: PASS
  rendered route/security tests: 27 PASS
  core/auth/document tests: 246 PASS
  Cloudflare/migration/job tests: 68 PASS
  total: 341 PASS
npm run build:staging   PASS
  staging artifact validation: PASS
npm run validate:cloudflare:matrix
  development/staging/production build + artifact + Wrangler dry-run: PASS
npm audit --offline --omit=dev --audit-level=high
  0 vulnerabilities in the locally cached advisory set
strict high-confidence secret scan
  tracked source: 0; built bundle: 0; git history: 0
```

The latest recorded successful local full suite contains 380 tests: 27 rendered-route/security, 274 core/auth/document, and 79 Cloudflare/migration/job tests. It includes migrations through `0033`, durable account-deletion purge, Queue/Cron contracts, identity/session hardening, workspace isolation, document regression, and the fail-closed legal-source foundation. This is strong local evidence, but not authenticated current-version staging UI or live-provider evidence. The clean network-install path remains unverified because actual `npm ci` was deliberately not run.

The online npm audit was not run because the execution policy rejected sending dependency metadata to the npm registry; the offline result is not presented as equivalent to a fresh registry audit. The existing suite is a baseline, not evidence that the target Definition of Done is met.

## Phase 0 gate

Source reconciliation, control-plane inventory, threat/model audits, and the reproducible local baseline are complete. Commit `a1261c3c68151f9c275187fd422bd58c67b673a8` is pushed to draft PR #3. Time Travel plus portable/private-R2 checkpoints protect staging before and after migrations `0030`–`0033`. Earlier authenticated Chrome evidence covers canonical builder behavior on a prior protected version. The exact current Worker version has control-plane and anonymous Access evidence only because the browser runtime exits before tab connection; Access was not bypassed.

The complete Phase 0 gate remains open for the authenticated current-version browser/cookie/provider flow and the remaining accessibility matrix: 200% zoom, keyboard/focus, reduced motion, axe, Lighthouse, real iOS/Android behavior, and broader critical-route screenshots. The disposable remote-D1 logical import gate is complete for its captured topology, but no operational RTO is claimed.

The isolated staging D1 is through `0033` with 34 ledger rows, 114 tables, 70 triggers, 198 indexes, `quick_check=ok`, and zero foreign-key violations. Protected deployment `bafea8e2-d061-4180-827b-1c047858fb36` serves version `afde477b-db83-498f-aaf8-1a2e5aa9ab44` from commit `401c8b3`. Exactly two staging consumers and one five-minute cron are active. Two real cron dispatches reached the cleanup consumer and failed closed at malformed identity-key validation before fixture creation; the final probe flag is disabled. Owner-only Access remains in front of the single custom domain. Legal-source ingestion and staff APIs remain disabled. Sites v20 and legacy Worker `juro` remain unchanged.

## 2026-07-30 account-deletion protected-staging delta

The branch contains a real account-deletion vertical slice: immediate/recoverable modes, cancellation, blocker remediation/retry, dedicated purge execution across private R2 and D1, an irreversible fence, immutable profile tombstone, append-only lifecycle and purge evidence, scheduled outbox dispatch, and RU/UZ settings UI.

Migrations `0030`–`0033` are applied only to `juro-staging`. The initial migration run safely applied `0030`–`0032` and atomically rejected `0033` for a concatenated Drizzle statement breakpoint; read-only verification proved rollback of the entire `0033` body. Commit `a1261c3` corrected the separator, 64/64 targeted tests passed, and the retry applied only `0033`.

The exact staging artifact passed type-check, lint, 380 tests, generated binding check, staging build/artifact validation, all-environment dry-run matrix, builder/comparison smokes, and secret scan. Control-plane re-read proves the protected domain, Access policy, version/deployment, staging-only bindings, three names-only secrets, two consumers/DLQs, one cron, and unchanged production Worker. Anonymous root, builder, and deletion API requests receive Access 302 plus `no-store`. The first durable cron run completed successfully. Post-`0033` full/schema/data/manifest exports passed private-R2 SHA-256 round trip.

Still open: owner-managed replacement and protected recovery of the malformed staging `IDENTITY_KEYRING`, rerun of the full synthetic D1/R2 purge, authenticated deletion over HTTP/UI, live Resend evidence, operator DLQ/redrive, current-version browser/cookie/replay verification, and the broader accessibility/performance/mobile matrix. Production is unchanged and not authorized.
