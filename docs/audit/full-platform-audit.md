# Full platform audit

**Audit date:** 2026-08-25  
**Branch:** `codex/investor-ready-ecosystem`  
**Production baseline at start:** Worker version
`357d0438-1a5f-4b29-ba81-869cbc130c0a`, status 8/8 operational.

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
| Public routes and SEO | PASS in production | Sites version 82 is live; all 78 sitemap URLs returned 2xx with exact canonical, complete RU/UZ/EN hreflang, Open Graph/Twitter preview metadata, single H1, valid present JSON-LD and expected indexability. `robots.txt` points to the canonical sitemap. |
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
| Accessibility | PARTIAL | Static contracts present; no automated WCAG runner or completed deployed manual matrix. |
| Cloudflare continuity | PARTIAL | Scoped public-analytics rate limiting is active, the 31-rule Free Managed Ruleset is always active, and zone origin TLS is `Full (strict)` with production/staging smoke. Overdue billing and unavailable real CWV tracing remain explicit risks. |

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

- GitHub CI `32822786084` passed at exact commit `f42c48fcd67c8b24f3e27369401d3ae8b6c1be8a`:
  Website 42/42; Platform rendered HTML 34/34, core 1086/1086 and Cloudflare
  201/201, plus lint, type-check, artifact, environment, dependency and licence
  gates.
- Worker `c3237f9e-a258-42eb-8b94-62f5045b7b03` (version 146) receives 100%
  production traffic; `357d0438-1a5f-4b29-ba81-869cbc130c0a` is rollback.
- Sites version 82 deployed the exact 121-file `apps/website` source from
  `d0310b90`; Git tree `f35a8f36db9240a281e204f7d7e8b3675d2a18e7`
  matched before save. Sites version 81 is rollback.
- GitHub CI `32838994132` passed Website and Platform on `d0310b90`. The
  hardening diff scan `a2cb0d4a-7512-4b0a-aa5e-362681007619` retained zero
  findings; metadata diff scan `fa1b3e34-235b-48e6-8fb4-41e9f731f210` also
  retained zero findings with complete changed-source coverage. Social-preview
  diff scan `1985bd83-d685-4ae3-8978-60f4f469d1e7` closed its seven changed
  source files with zero findings. The broader immutable Standard scan remains
  explicitly PARTIAL.
- The live telemetry route returned exact `204/403/403/400/413` for valid,
  foreign-origin, missing-fetch-metadata, invalid-pair and oversized requests.
- `status.juro.uz/api/status`, generated at `2026-08-25T10:58:57.247Z`, was
  operational for all eight published components with no incident.
- The price backup gate is complete in private R2, but the exact local plaintext
  staging directory could not be deleted because the execution policy blocked
  the removal operation. This remains an explicit local cleanup item.
