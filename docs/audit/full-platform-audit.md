# Full platform audit

**Audit date:** 2026-08-28
**Branch:** `codex/investor-ready-ecosystem`
**Current production checkpoint:** Worker 162
`d2146684-bd77-4a33-a2a2-8d47042e473e`, deployment
`0c8ec9f3-cd7f-4a0c-9e99-e0b1d91fc998`, 100% traffic; both public status APIs
agreed on 8/8 operational at `2026-08-28T06:49:05.922Z`.

## Current production recovery

Worker 161 safely classified the repeated Anthropic HTTP 400 as
`PROBE_PROVIDER_HTTP_400_INVALID_REQUEST_ERROR_CREDIT_BALANCE_LOW`. The raw
provider message, prompts and secrets were not logged. After the account balance
was restored, fresh production probes recorded Anthropic operational at
`2026-08-28T06:47:17.754Z`; AI and document analysis are operational and the
exception is closed by current 8/8 evidence rather than by the balance action
alone.

The same recovery window exposed a separate P1 operational defect: Lex RSS
delivery-time churn had generated repeated metadata changes and 222,329
historical `legislation_monitor` notifications. Worker 162 uses a stable
title/URL fingerprint, deterministic event and notification IDs, one atomic
per-recipient digest per run and a bounded dashboard count. Its first retry
processed 40/40 entries with `changed=0`, `error=0`; the notification count did
not grow. Authenticated Chrome shows `99+` with the accessible label `Более 99
новых событий`. Historical rows and user read state were not deleted or edited.

The original screenshot route is not part of the outage. A fresh raw probe
returned private/no-store `307` from
`lawyer.juro.uz/ru/individual/dashboard` to the exact app path, and isolated
Chrome rendered the localized Client login instead of plaintext `Not Found`.
No migration, manual D1 cleanup, DNS or Sites release was made. Sites v86
remains live, saved v94 remains unpublished, and Worker 161 is the immediate
application rollback. That rollback would reintroduce the notification fan-out
defect, so it is reserved for a more severe Worker 162 regression.

## Executive outcome

JURO is a real multi-tenant product spanning public acquisition, citizen and
business workspaces, lawyer operations, administration, legal-source retrieval,
documents, cases and AI. The audit did not treat successful builds or polished
screens as proof. Security, database, source, pricing, deployment and browser
evidence are separate gates.

The hardened release, analytics/cost follow-up and public dependency-hardening
follow-up are live and CI-green.
Commit `f42c48fc` adds privacy-safe product measurement, explicit OpenAI
non-storage, current provider pricing support, and durable
AI/source/design/audit documentation. Its full suite, database backup/config
gate, Worker and Sites deployment, production boundary checks, crawl and health
verification completed. The remaining limitations below are not silently
upgraded into a blanket ecosystem Definition of Done.

## Ecosystem inventory

| Surface | Purpose | Runtime boundary |
| --- | --- | --- |
| `juro.uz`, `www.juro.uz` | Public RU/UZ/EN acquisition, trust, knowledge, lawyers | Sites-hosted public artifact; no private product data. |
| `app.juro.uz` | Citizen/business product and APIs | Production Worker, D1/R2/Queues and authenticated tenant scope. |
| `lawyer.juro.uz` | Dedicated lawyer persona | Same hardened runtime; server-enforced role/destination. |
| `admin.juro.uz` | Operations, AI quality, costs, sources, audit | Capability and recent-MFA boundaries. |
| `status.juro.uz` | Public health | Status-only host; application routes denied. |
| staging equivalents | Controlled testing/evaluation | Separate D1/R2/queues/config; not production evidence. |
| GitHub `MoozUpus/juro` | Source, CI and review | Draft PR, protected evidence and artifact checks. |

The detailed route and domain evidence is in `domain-route-inventory.md` and
`broken-links-report.md`.

## Release-gate matrix

| Area | State | Evidence / remaining gate |
| --- | --- | --- |
| Public routes and SEO | PASS in production | Sites version 86 is live; all 78 sitemap URLs returned `200` with exact canonical, complete RU/UZ/EN hreflang, Open Graph/Twitter preview metadata, single H1, valid present JSON-LD and expected indexability. `robots.txt` points to the canonical sitemap, while the provider-generated direct host is response-level `noindex`. |
| Transport/security headers | PASS in production | HTTPS-first Worker redirects, private no-store/noindex and restricted permissions policy tested; public Sites uses Cloudflare canonical redirects. |
| Auth/RBAC/tenant isolation | PASS for this delta | The exact commit passed the complete 1086-test core and 201-test Cloudflare suites; the 26/26-file security diff scan found no tenant/privacy issue. Historical authenticated journey coverage remains scoped in the QA matrix. |
| Signed public shares | PASS at baseline | Signed authorization and bounded transport deployed in the hardened release. |
| AI citations | PARTIAL by design | Direct Lex.uz fail-closed pipeline active; fresh current legal evaluation still required for a quality claim. |
| Full legal corpus/vector retrieval | NOT RELEASED | Separate 44/44 snapshot/evaluation gate open; production flags disabled. |
| Document/case/lawyer workflows | PASS from prior authenticated release evidence; PARTIAL for this delta | The analytics delta is covered by server-side success-boundary tests. Fresh in-app browser checks proved guest, Client login, dedicated Lawyer login, Admin re-auth and status boundaries; no new OTP-authenticated mutable workflow was submitted for this delta. |
| Payments | DEMO / NOT APPROVED | Production approval flag false; no live-payment claim. |
| Product analytics | DEPLOYED | Exact 21-event content-free contract, optional public consent and bounded route are live. A scoped Cloudflare rule rate-limits only the public ingestion route. No conversion baseline is invented before an observation window exists. |
| AI costs | ACTIVE CONFIGURATION | Four official, effective-dated production price rows passed pre/post D1 export, isolated restore, FK, private R2 and SHA-256 readback gates. No post-effective AI event exists yet, so no measured runtime cost baseline is claimed. |
| Artifact performance | PASS | CSS/JS/font/image/Worker budgets green; no Core Web Vitals claim. |
| Accessibility | PARTIAL | The exact public source passed the pinned Chrome/axe 56/56 RU/UZ/EN desktop/mobile light/dark matrix with zero automated violations and no visible text below the project 12 px floor, plus retained keyboard and visual samples. Worker 156 closes the confirmed Client comparison target defect; Worker 157 extends the 44 px contract to confirmed Lawyer professional controls; Worker 158 extends it to confirmed non-corpus Admin retry, Knowledge Base and cost-checkbox controls. The exact production CSS contains both role-specific contracts. Lawyer/Admin anonymous boundaries remain fail-closed and their re-authentication surfaces have one H1/main and no overflow, but no signed-in Lawyer/Admin, real OTP/MFA error, screen reader or physical mobile device was used. Protected authenticated rendering, live auth-error assistive-technology replay and the deployed-Sites replay remain open, so this is not a WCAG conformance claim. |
| Cloudflare continuity | PARTIAL | Scoped public-analytics rate limiting is active, the 31-rule Free Managed Ruleset is always active, and zone origin TLS is `Full (strict)` with production/staging smoke. Anthropic and document analysis recovered to operational after API credit restoration. Overdue infrastructure billing and unavailable real CWV tracing remain explicit risks. |

## Definition of done for this candidate

1. Platform full tests, type check, lint, production build/artifact budgets and
   public Sites build all pass from the exact commit.
2. Current prices are inserted as effective-dated configuration only after a D1
   export, local integrity/FK check, private R2 backup and SHA-256 readback.
3. CI passes for the pushed commit; the Draft PR remains reviewable.
4. Worker and Sites exact artifacts deploy with rollback identifiers recorded.
5. Chrome/in-app production checks cover anonymous, citizen/business, lawyer and
   admin boundaries without using real personal/legal data.
6. Public crawl, redirects, headers, status and post-deploy cost/source telemetry
   are rechecked.
7. Remaining external risks are reported plainly and no green release is called
   overall healthy if service health is degraded.

## Candidate completion checkpoint

- CI `33148425519` passed exact Worker 162 source
  `75064bee61909baa0e1a05dabdedc6268f86ed29` (Website 2m15s, Platform
  6m57s), including rendered 35/35, core 1101/1101 and
  Cloudflare/infrastructure 202/202. Worker 162 receives 100% production
  traffic. The first new-runtime metadata retry processed 40/40 with no change,
  error or notification growth; authenticated Chrome shows the bounded `99+`
  count. Both status APIs agreed on 8/8 operational. Worker 161 is rollback;
  no migration or manual D1 cleanup occurred, notification history/read state
  was preserved, and DNS/Sites were unchanged.
- CI `33136790049` passed exact runtime source
  `93bb6abf48478af8de5bb86bbc38df3e6dcdbe15` (Website 2m15s, Platform
  6m32s). Local gates passed lint, type-check, production build, artifact
  budgets, rendered Worker 35/35, core 1098/1098 and Cloudflare/infrastructure
  201/201.
- Worker 158 receives 100% production traffic. The exact production CSS asset
  contains the Lawyer workspace/consultation contracts and the non-corpus Admin
  retry, Knowledge Base and cost-checkbox 44 px contract. Anonymous Admin
  console and costs requests return protected `303` handoffs; isolated Chrome
  reached the re-authentication surface with one H1/main, no overflow, no
  console warnings/errors and no staff-data disclosure. Signed-in Lawyer and
  Admin workflow rendering remains open. Worker 157 is the immediate
  rollback. Production D1, DNS and Sites were unchanged.
- Both status endpoints reported all eight components operational and no active
  or recent incident at `2026-08-28T02:53:33.522Z`.
- CI `33132278871` passed exact runtime source
  `7123fb4b842c0d006f82a83b0e72263a0088020c` (Website 2m29s, Platform
  8m35s). Local gates passed type-check, lint, production build, artifact
  budgets, rendered Worker 35/35, core 1096/1096, Cloudflare/infrastructure
  201/201 and the end-to-end document-comparison smoke.
- Worker 156 receives 100% production traffic. Chrome verified the comparison
  refresh action at exactly 44×44 px at 320 and 390 px, with no horizontal
  overflow or console errors. Worker 155 is the immediate rollback. Production
  D1, DNS and Sites were unchanged; Sites v86 remains live and saved v94 remains
  unpublished.
- Both status endpoints reported all eight components operational and no active
  or recent incident at `2026-08-28T01:26:35.918Z`.
- CI `33129369444` passed exact commit `fcdb9e6f` (Website 2m30s,
  Platform 6m48s). The same source passed local rendered HTML 35/35, core
  1095/1095, Cloudflare/infrastructure 201/201, type-check, lint and artifact
  budgets before Worker 155 received 100% production traffic.
- Worker 155 keeps status icon metadata on each allow-listed first-party host
  without weakening CSP. Production Chrome verified the bare UZ and explicit
  RU status pages with correct `html`/`main` language, localized title/H1,
  loaded fonts, private noindex, same-origin icons, no overflow and an empty
  warning/error/issue log. Worker 154 is the immediate rollback.
- The original Lawyer-host Client URL still reaches the exact Client surface
  instead of `Not Found`; a clean session correctly lands on localized Client
  login. No form, OTP, MFA, file upload or data mutation was performed.

- GitHub CI `33071334033` passed at exact commit `b4c472332e49b9750ec696652281670efb89bb9b`:
  Website 42/42; Platform rendered HTML 34/34, core 1086/1086 and Cloudflare
  201/201, plus lint, type-check, artifact, environment, dependency and licence
  gates.
- Worker `28dd4ac8-1ae2-4582-9697-8aa28e109cb5` (version 148) receives 100%
  production traffic; `ed0253e1-1c35-416e-9f2a-5bd8352c1936` (version 147) is
  rollback. Version 148 retains the font-path privacy correction and routes
  known misplaced Client links from the Lawyer host to the fixed Client origin
  for read methods while keeping writes and unknown paths fail closed.
- Fresh production Chrome reloaded the exact original failing URL and followed
  the live redirect to the authenticated Client dashboard. The 1920×945 render
  had one localized H1, loaded fonts, private noindex metadata, zero overflow,
  no role alert and an empty warning/error log. Lawyer and Admin retained their
  separate re-authentication and fresh-session boundaries.
- Sites version 86 deployed runtime commit `286c8cec`; deployment
  `appgdep_6a9027658100819189e6e6bc1a20bf1d`. Sites version 85 is rollback.
- GitHub CI `33071334033` passed Website and Platform on the Client-link
  correction `b4c47233`; v86 source CI `33067543449` also passed both jobs. The earlier
  hardening diff scan `a2cb0d4a-7512-4b0a-aa5e-362681007619` retained zero
  findings; metadata diff scan `fa1b3e34-235b-48e6-8fb4-41e9f731f210` also
  retained zero findings with complete changed-source coverage. Social-preview
  diff scan `1985bd83-d685-4ae3-8978-60f4f469d1e7` closed its seven changed
  source files with zero findings. The broader immutable Standard scan remains
  explicitly PARTIAL.
- The live telemetry route returned exact `204/403/403/400/413` for valid,
  foreign-origin, missing-fetch-metadata, invalid-pair and oversized requests.
- `status.juro.uz/api/status`, generated at `2026-08-28T00:30:50.972Z`, was
  operational for all eight published components with no incident.
- The price backup gate is complete in private R2. On 2026-08-27, a fresh
  four-object download matched every recorded byte size and SHA-256 value; the
  exact plaintext source and verification directories were then deleted and
  both absence checks passed.
