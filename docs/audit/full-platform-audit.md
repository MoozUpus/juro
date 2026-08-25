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

The prior hardened release is live and CI-green. The current release candidate
adds privacy-safe product measurement, explicit OpenAI non-storage, current
provider pricing support, and durable AI/source/design/audit documentation. It
remains a candidate until the full suite, database backup/config gate, deployment,
production browser checks, crawl and health verification complete.

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
| Public routes and SEO | PASS at baseline | 33/33 public crawl and metadata checks; repeat after Sites release. |
| Transport/security headers | PASS at baseline | HTTPS-first redirects, private no-store/noindex and restricted permissions policy tested. |
| Auth/RBAC/tenant isolation | PASS at baseline | Focused tests and Codex Security rescan; repeat full suite for candidate. |
| Signed public shares | PASS at baseline | Signed authorization and bounded transport deployed in the hardened release. |
| AI citations | PARTIAL by design | Direct Lex.uz fail-closed pipeline active; fresh current legal evaluation still required for a quality claim. |
| Full legal corpus/vector retrieval | NOT RELEASED | Separate 44/44 snapshot/evaluation gate open; production flags disabled. |
| Document/case/lawyer workflows | IMPLEMENTED | Authenticated post-deploy Chrome journey remains required for this candidate. |
| Payments | DEMO / NOT APPROVED | Production approval flag false; no live-payment claim. |
| Product analytics | RELEASE CANDIDATE | Exact content-free event contract implemented; production baseline does not exist yet. |
| AI costs | RELEASE CANDIDATE | Official price values documented; effective production price rows and post-write verification pending. |
| Artifact performance | PASS | CSS/JS/font/image/Worker budgets green; no Core Web Vitals claim. |
| Accessibility | PARTIAL | Static contracts present; no automated WCAG runner or completed deployed manual matrix. |
| Cloudflare continuity | RISK | Overdue billing, Full-not-Strict TLS and missing custom WAF/rate policies need owner/platform action. |

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
