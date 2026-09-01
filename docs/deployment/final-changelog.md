# JURO Execution Changelog

Status: **living changelog; the full execution goal remains active**

Evidence cutoff: **2026-09-02 UZT**

This file records verified production increments. It must not be read as a claim that every item in the execution brief is complete.

## v114 mainline performance candidate — not deployed

- Based directly on current `origin/main` rather than the superseded stacked v102-v113 chain.
- Defers initial public-page geometry measurement through two animation frames and publishes motion readiness only after layout reads complete.
- Replaces the site-header `scrollY` callback with an observer sentinel, removing the named 46 ms `SiteChrome` forced-reflow source from the repeat local trace.
- Uses content-sized mobile auth rows and reserves at least 72 CSS px through the nested Turnstile boundary.
- Passed 7/7 focused auth tests, 46/46 website tests, website/platform type-check and lint, website and platform production builds, platform artifact budgets, and local Chrome responsive/reveal/console checks.
- Local Chrome recorded LCP 1,334 ms, CLS 0.00, no top-level JURO forced-reflow function, and 83 ms of unattributed layout work with no estimated savings. This is local lab evidence, not a production or field claim.
- Performed no deployment, migration, DNS, binding, secret, provider-billing, or legislation/corpus operation. Exact-head CI, exact-head security review, and post-deploy Chrome QA remain required.

## v101 production release

- Merged PR #103 as `840f1144f3ba8562a7866cd4bda99525be392758` after exact-head CI and a 0-finding security diff scan.
- Activated website Worker `d6ff54c8-0bbc-4921-a54e-581027689a41` and platform Worker `9c434c4e-52af-41cd-b680-eb0730b87e37`.
- Verified 21/21 reveal sections across RU/UZ/EN and direct `/ru#start`, no horizontal overflow at 1440 × 900 and 390 × 844, and no console errors or warnings.
- Recorded warm LCP 519 ms / CLS 0.01 and cold LCP 2,717 ms / TTFB 1,769 ms; desktop Lighthouse scored Accessibility, Best Practices, SEO, and Agentic Browsing at 100 each.
- Retained truthful point-in-time production status evidence: operational, 8/8 components, 0 active incidents. Sustained provider health and authenticated role journeys remain separate gates.

## Platform Worker v189

- Merged PR #95 as `d133a470a49166875d9112b938ae3f7d765ee170`.
- Deployed Worker version ID `102dcb2d-f79f-4172-9a3a-19d55d51f6ed` at 100% traffic through workflow `33404885913`.
- Replaced cross-host status favicon metadata with absolute same-origin icon URLs selected from a Worker-owned, allowlisted status origin.
- Covered the status root rewrite, unlocalized `/status`, RU/UZ localized routes, production/staging status hosts, localhost development, and the app-host fallback.
- Preserved the existing CSP, DNS, bindings, secrets, databases, Sites release, authentication, and legislation/corpus scope.
- Verified five production routes in Chrome with no console errors or warnings; raw HTML and asset requests confirmed same-origin icons and `200 image/png` responses.
- Retained Worker v188 ID `57387083-9f7f-4cd8-a9f2-84414f2604d6` as rollback.

## Platform Worker v188

- Merged PR #93 as `f14c3d9bd6b0645f3d9ef5da3bca7ab412138aae`.
- Deployed Worker version ID `57387083-9f7f-4cd8-a9f2-84414f2604d6` at 100% traffic through workflow `33347775254`.
- Replaced the misleading whole-cron D1 latency with a direct `SELECT 1 AS ok` probe.
- Added a 2,000 ms high-latency threshold with safe public code `PROBE_LATENCY_HIGH`.
- Preserved content-free diagnostics and ensured observability persistence cannot fail completed product work.
- Verified fresh production D1 evidence: `35 ms`, `operational`, `synthetic_probe`.
- Preserved truthful overall `degraded` status while OpenAI, Anthropic, and document analysis remain unavailable.
- Retained Worker v187 ID `65ce3f7f-3469-4c43-854c-d073309befed` as rollback.

## Public Sites v95

- Published saved version 95 from source `855ba2161b716daabb96ac469456c101e5d3bb2c`.
- Restored the provider-host duplicate-indexing boundary with `X-Robots-Tag: noindex, nofollow, noarchive`.
- Preserved `index, follow` and self-canonical localized URLs on `juro.uz`.
- Verified 78/78 sitemap URLs and 149/149 discoverable JURO-zone links return `200`.
- Verified the custom domain and provider hostname in Chrome with no console errors.
- Retained saved Sites v94 as rollback.

## Platform Worker v187

- Merged PR #91 as `8213511b9dcc89125a283672290bc9bca60a6e3f`.
- Deployed Worker version ID `65ce3f7f-3469-4c43-854c-d073309befed`.
- Made degraded dependency evidence respect each probe's cooldown.
- Added a bounded real-provider document-analysis probe with OpenAI-to-Anthropic fallback.
- Removed the direct named-provider dependency from the document-analysis component health composition; the routed feature probe now represents the OR condition.
- Added regression tests for cooldown behavior, fallback bounds, and safe provider diagnostics.
- Verified provider evidence at 10.36–15.82 minute intervals and document-analysis evidence after 26.2 minutes instead of the previous 3–6 minute failure cadence.
- Preserved public redaction of provider-specific billing diagnostics.
- Retained Worker v186 ID `7b269272-4fc4-4911-97ab-8dfc28c260d0` as rollback.

## Latest validation summary

- 4/4 focused status-metadata tests passed.
- 1,142/1,142 platform core tests passed.
- 217/217 Worker/runtime tests passed.
- Lint, type-check, Cloudflare matrix, generated types, production artifact validation, dependency audits, and licence policy passed.
- PR, post-merge CI, and production deployment workflows passed.
- The security diff scan reported zero reportable findings and exposed functional/CSP coverage gaps in the initial patch; those gaps were corrected before merge and verified by focused tests plus live Chrome/HTTP checks.
- PR #95 exact-head CI `33352197361`, post-merge CI `33404886188`, and production workflow `33404885913` passed.
- Production `/api/status` returns HTTP `200`, remains truthfully `degraded`, reports 6/8 components operational, reports no active incidents, and publishes direct D1 evidence at 192 ms in the checked snapshot.

## Current limitations

- OpenAI and Anthropic public production probes still report `PROVIDER_UNAVAILABLE`; AI and document analysis remain degraded until fresh successful probes exist. The owner-reported Anthropic top-up had not yet produced a successful probe at the evidence cutoff.
- Authenticated role QA remains incomplete for Client, Business, Lawyer, Pending Lawyer, and Staff/Admin.
- Staging scheduler persistence remains blocked by the excluded staging D1 capacity issue.
- Legacy origin ownership/TLS risk and the full manual accessibility, responsive, performance, and E2E matrices remain open.
- All legislation-database, corpus, Lex.uz, Advice.uz, vector, and source-record work remains excluded from this increment.
