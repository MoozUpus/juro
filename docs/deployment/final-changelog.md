# JURO Execution Changelog

Status: **living changelog; the full execution goal remains active**

Evidence cutoff: **2026-09-01**

This file records verified production increments and separately labelled release candidates. It must not be read as a claim that every item in the execution brief is complete.

## v113 security and evidence candidate — not deployed

- Added the canonical full-platform, completion, UX/UI, mobile, accessibility, security, design-system, component, AI, and source-boundary evidence documents required by the execution brief.
- Kept legislation-database, local-corpus, Advice.uz ingestion, vector, embedding, and staging-capacity work explicitly excluded rather than counting it as delivered.
- Changed new login OTP evidence to a key-versioned, domain-separated HMAC without a usable retained raw SHA verifier; legacy rows retain only their bounded ten-minute compatibility window.
- Removed the email-wide OTP replacement lock while preserving resend cooldowns and issuance budgets.
- Applied the common streaming request limiter at exactly 2 MiB to lawyer profile-photo uploads.
- Changed new signed-PDF access codes to a key-versioned, domain-separated HMAC with constant-time verification; legacy rows retain only their existing maximum 24-hour share lifetime.
- Preserved mixed-case key-version compatibility between the shared keyring parser and the signed-share verifier envelope.
- Passed 26/26 focused remediation tests, 1,181/1,181 platform tests, 217/217 Worker/runtime tests, 49/49 website tests, type-check, lint, the full Cloudflare environment matrix, generated-types consistency, production artifact validation, and emitted-size budgets.
- Retained the Standard security scan as partial evidence: one high and three medium findings at base revision `beae3e05d7552b999c0fb7bcba14ee615c04906a`, with 68/1,594 scoped files fully reviewed.
- Made exact-head CI and a sealed exact-head diff scan mandatory per-head Draft PR evidence; neither receipt is treated as production verification.
- Performed no database migration, production or staging deployment, DNS change, binding change, secret change, provider billing mutation, or legislation/corpus operation. Chrome candidate QA remains not applicable until the exact server revision is deployed.

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
- Production `/api/status` returned HTTP `200`, `operational`, 8/8 components operational, and no active incidents at `2026-09-01T15:33:22.376Z`; D1 reported `35 ms`, and fresh OpenAI and Anthropic probes were operational. The earlier 6/8 degraded snapshot remains historical evidence.

## Current limitations

- OpenAI and Anthropic public production probes recovered after the reported funding changes. This is point-in-time health evidence only; authenticated answer quality, completed document analysis, and sustained provider availability remain open.
- Authenticated role QA remains incomplete for Client, Business, Lawyer, Pending Lawyer, and Staff/Admin.
- Staging scheduler persistence remains blocked by the excluded staging D1 capacity issue.
- Legacy origin ownership/TLS risk and the full manual accessibility, responsive, performance, and E2E matrices remain open.
- All legislation-database, corpus, Lex.uz, Advice.uz, vector, and source-record work remains excluded from this increment.
