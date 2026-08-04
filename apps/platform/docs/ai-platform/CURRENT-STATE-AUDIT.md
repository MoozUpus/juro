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
| GitHub draft PR #3, `feature/juro-ai-platform` | Pushed code checkpoint `cd24095c8307a4c3b145549f147a823000a438e3`; the evidence documentation is the next coherent commit | The draft PR tracks the same feature branch without rewriting shared history; isolated staging is through `0034`, while production remains unchanged. |

The original comparison found 116 files present only in the Sites source, 50 materially changed files, one GitHub-only file, and 179 identical files. The verified Sites source and Phase 0 audit were synchronized into the local `feature/juro-ai-platform` lineage in commit `c454d779e1ec91c6a1a1ad270c9d1b7b02afabb7`. On 2026-07-28 the five later `main` commits through `a1c572e` were merged in `702960e` without rebasing or discarding the existing work. Draft PR #3 contains the staging code checkpoint through `cd24095`; this document records the protected `0034` staging evidence, while the documentation-only follow-up commit is tracked by Git.

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
| `status.juro.uz` | production remains `502`/unattached; local migration `0083` and public RU/UZ status surface are not deployed |
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
- D1 `juro-staging` — `bb716a96-b2fb-4823-90d6-6c228fed181a`, EEUR, exact 35-entry `0000`–`0034` ledger, 113 application tables (114 including `d1_migrations`), 72 triggers, and 199 indexes;
- private R2 `juro-private-documents`, legacy development stores, and six private EEUR Standard development/staging target buckets; 26 checksum-verified D1 checkpoint artifacts exist in `juro-staging-backups`, and no production binding was cut over;
- eight legacy development-only queues remain unbound; 28 development/staging v2 primary + DLQ queues exist with 86,400-second retention; staging email and data-retention have one reviewed consumer each, while the other five staging primaries remain producer-only;
- eight empty development/staging Vectorize v2 indexes exist at 1,536 dimensions/cosine;
- protected staging Worker `juro-platform-staging` serves version `2ebc2ea8-6216-4f39-af96-d1b600973b74` at 100% from commit `cd24095`; seven Queue producer bindings, two consumers and one cron are active behind owner-only Access, while legal ingestion/staff API remain disabled and production remains unchanged.

The production Worker currently binds only Assets, Images, production D1/R2, `EMAIL_FROM`, and secret `RESEND_API_KEY`. The Sites runtime inventory contains `APP_URL`, `EMAIL_FROM`, `PUBLIC_SITE_URL`, and secret `RESEND_API_KEY`. Required OpenAI, Anthropic, encryption/session, OTP pepper, Turnstile, TOTP, signed-URL, and Cron secrets are absent by name from the inspected production surfaces.

The deployed staging source exports `fetch`, `queue`, and `scheduled` and uses the exact v2 R2/Vectorize names plus seven Queue producer bindings. Development and production remain `ASYNC_RUNTIME_ENABLED=false` and consumer-free. Staging alone enables async execution, attaches `staging-email-notifications` and `staging-data-retention-cleanup` to reviewed consumers with distinct DLQs, and runs the locked `*/5 * * * *` outbox cron. Legal-source ingestion, staff APIs, Advice, and malware execution remain disabled or unattached. Control-plane and protected browser evidence are recorded in `STAGING-0034-EVIDENCE.md`.

The Sites read-only connector unexpectedly returned a bypass bearer token in raw tool output. Its value was not quoted, stored, reused, or committed. It must be rotated/revoked through the Sites control plane before production work.

## Data and migrations

- The local schema and migration lineage is additive through `0034`; no destructive `DROP` was introduced by this checkpoint.
- Production and development remain at the exact `0000`–`0004` ledger and were not migrated.
- Isolated staging has the exact 35-entry `0000`–`0034` ledger, 113 application tables (114 including `d1_migrations`), 72 triggers, 199 non-internal indexes, `quick_check=ok`, zero foreign-key violations, and no pending migration.
- Before `0034`, a Time Travel bookmark plus full/schema/data/manifest exports were retained in private R2. Every object passed SHA-256 round-trip verification, and a deterministic local restore reproduced the source-equivalent topology and representative row counts with `quick_check=ok` and zero foreign-key violations.
- After `0034`, a second Time Travel bookmark and full/schema/data/manifest set passed private-R2 SHA-256 round trips. That post-set has not been separately restored, so no post-change RTO claim is made.
- Private `juro-staging-backups` now contains 26 checksum-verified artifacts across the recorded checkpoints. Exact hashes, object prefixes, bookmarks, and rollback order are in `STAGING-0034-EVIDENCE.md` and `BACKUP-RESTORE.md`.
- Migration `0004` copies sensitive operational tables into `__backup_*` tables in the same D1. Those are not independent backups; the portable/private-R2 checkpoints are the bounded staging recovery evidence.

No production snapshot, migration, binding, or traffic change was performed. Operational recovery time and production restore remain unverified.

## Existing feature truth table

| Area | Status | Evidence / limitation |
|---|---|---|
| Email OTP | Schema/runtime staged, provider flow incomplete | atomic request/verification claims, strict limits, 15-minute lock, and server/client Turnstile integration are covered locally; migration `0023` and bindings are active in isolated staging, while live Turnstile correlation, controlled Resend mailbox delivery, enumeration parity, and full-HTTP concurrency remain unverified |
| Sessions | Schema/runtime staged, HTTP security matrix incomplete | device-aware sessions, bounded rotation/replay handling, continuity evidence, security-email jobs, 24-hour/30-day lifetimes, revoke paths, and chained security events pass locally; migrations `0030`–`0032`, email consumer/DLQ, and cron are active in protected staging, while exact cookie/replay, regional classification, cross-account, and real security-email delivery remain open |
| Onboarding | Local hardening, schema staged | canonical `/:locale/onboarding`, Uzbek-default entry routing, required structured names/phone/persona/goal, exact current policy-digest evidence, deterministic personal workspace creation, and canonical `/dashboard` entry are implemented locally; migration `0024` is applied to isolated staging, while provider-backed registration, browser E2E, and policy approval remain open |
| Workspaces | Partial, protected staging slice verified | migrations `0022` and `0034` provide guarded invitation acceptance and idempotent business-workspace creation with creator/request evidence; a synthetic staging workspace, owner membership, append-only creation audit, default switch, and RU/UZ canonical business route were verified. Broader tenant/IDOR, invitation HTTP, and multi-account matrices remain open. |
| Document builder | Substantial | connected D1/R2 implementation; personal and business canonical routes preserve account context after workspace switching, and protected RU/UZ responsive route smokes passed. The full builder workflow and nested-`main` production defect remain open. |
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

Executed on Windows against pushed code checkpoint `cd24095c8307a4c3b145549f147a823000a438e3` and its generated staging build output:

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

The latest successful local full suite contains 391 tests: 27 rendered-route/security, 284 core/auth/document, and 80 Cloudflare/migration/job tests. It includes migration `0034`, durable account-deletion purge, Queue/Cron contracts, identity/session hardening, business-workspace idempotency, account-context route isolation, localized builder metadata, document regression, and the fail-closed legal-source foundation. Authenticated protected staging browser evidence now covers the RU personal and RU/UZ business builder routes at desktop, tablet, and mobile widths. Live-provider evidence and the clean network-install path remain unverified because actual `npm ci` was deliberately not run.

The online npm audit was not run because the execution policy rejected sending dependency metadata to the npm registry; the offline result is not presented as equivalent to a fresh registry audit. The existing suite is a baseline, not evidence that the target Definition of Done is met.

## Phase 0 gate

Source reconciliation, control-plane inventory, threat/model audits, and the reproducible local baseline are complete. Commit `cd24095c8307a4c3b145549f147a823000a438e3` is pushed to draft PR #3. Time Travel plus portable/private-R2 checkpoints protect staging before and after migration `0034`. Authenticated browser evidence covers the exact protected staging version and canonical RU personal plus RU/UZ business builder routes; Access was not bypassed.

The complete Phase 0 gate remains open for live provider/cookie/replay flows and the remaining accessibility matrix: 200% zoom, focus landing semantics after skip-link activation, reduced motion, axe, Lighthouse, real iOS/Android behavior, and broader critical-route screenshots. Keyboard skip-link reachability and activation were verified. The pre-`0034` logical restore gate is complete for its captured topology, but no operational RTO is claimed.

The isolated staging D1 is through `0034` with 35 ledger rows, 113 application tables (114 including `d1_migrations`), 72 triggers, 199 indexes, `quick_check=ok`, and zero foreign-key violations. Protected Worker `juro-platform-staging` serves version `2ebc2ea8-6216-4f39-af96-d1b600973b74` from commit `cd24095`. Exactly two staging consumers and one five-minute cron are active. A controlled Cron/Queue rerun after the owner re-entered staging secrets again failed closed with `STAGING_SYNTHETIC_PROBE_IDENTITY_FAILED` before fixture creation. The final Worker version has the probe flag disabled; no deletion request, profile, file, lifecycle, purge-evidence, or R2 object was created. Owner-only Access remains in front of the single custom domain. Legal-source ingestion and staff APIs remain disabled. Sites v20 and legacy Worker `juro` remain unchanged.

## 2026-07-30 account-deletion protected-staging delta

The branch contains a real account-deletion vertical slice: immediate/recoverable modes, cancellation, blocker remediation/retry, dedicated purge execution across private R2 and D1, an irreversible fence, immutable profile tombstone, append-only lifecycle and purge evidence, scheduled outbox dispatch, and RU/UZ settings UI.

Migrations `0030`–`0033` are applied only to `juro-staging`. The initial migration run safely applied `0030`–`0032` and atomically rejected `0033` for a concatenated Drizzle statement breakpoint; read-only verification proved rollback of the entire `0033` body. Commit `a1261c3` corrected the separator, 64/64 targeted tests passed, and the retry applied only `0033`.

The current staging artifact passed type-check, lint, 391 tests, generated binding check, staging build/artifact validation, builder/comparison smokes, and source/bundle secret checks. Control-plane re-read proves the protected domain, Access policy, version, staging-only bindings, three names-only secrets, two consumers/DLQs, one cron, and unchanged production Worker. Anonymous requests remain Access-gated. Authenticated protected browser smokes passed the RU personal and RU/UZ business builder routes without horizontal overflow or console errors across the tested widths. Post-`0034` full/schema/data/manifest exports passed private-R2 SHA-256 round trip.

Still open: owner correction and protected recovery-copy verification of the malformed staging `IDENTITY_KEYRING`, then a successful synthetic D1/R2 purge; authenticated deletion over HTTP/UI; live Resend evidence; operator DLQ/redrive; cookie/replay and cross-account verification; and the broader accessibility/performance/real-device matrix. Production is unchanged and not authorized.
