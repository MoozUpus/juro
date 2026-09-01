# JURO Execution Changelog

Status: **living changelog; the full execution goal remains active**

Evidence cutoff: **2026-09-01 08:49 UZT (2026-09-01 03:49 UTC)**

This file records verified production increments. It must not be read as a claim that every item in the execution brief is complete.

## Platform Worker v99

- Published commit `7935d560b29705f1886fa34f7bb61eb1b3af2c11` from Draft PR #101.
- Deployed Worker version ID `0b35483c-9bf4-4a21-ba45-dadbde198f83` at 100% traffic in deployment `6c3c5410-c16a-46dd-ae78-6ee580baf641`.
- Restricted decrypted pending invitation email data to workspace owners/admins and excluded accepted, revoked, and expired invitations.
- Added actual-byte limits for public structured API requests, including missing/chunked and understated `Content-Length`, while preserving explicit binary/multipart and protected internal upload controls.
- Passed 91 focused checks, 1,161 platform tests, 217 Cloudflare tests, 33 Worker smoke tests, lint, type-check, artifact/config/dependency checks, and PR CI `33466544141`.
- Verified live `401` for an ordinary small unauthorized JSON request and `413 PAYLOAD_TOO_LARGE` above 1 MiB.
- Retained immediate prior Worker version `b1b242f0-9033-40e3-bdf2-d9aee9ef5b48` as rollback.
- After the owner funded both providers, repeated production records show OpenAI, Anthropic, and routed document analysis operational; the checked public status is 8/8 operational with no active incident.

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

- 91/91 focused v99 security/platform tests passed.
- 1,161/1,161 platform core tests passed.
- 217/217 Worker/runtime tests passed.
- 33/33 Worker smoke tests passed.
- Lint, type-check, Cloudflare matrix, generated types, production artifact validation, dependency audits, and licence policy passed.
- Draft PR #101 exact-head CI `33466544141` and controlled production deployment passed.
- The v99 security scan found two scoped issues; both were corrected, independently reviewed, retested, and deployed.
- Production `/api/status` returns HTTP `200`, reports 8/8 components operational and no active incidents in the checked snapshot; repeated D1 records support provider recovery.

## Current limitations

- OpenAI, Anthropic, and routed document analysis are operational in repeated isolated probes; authenticated RU/UZ Legal Answer quality and a deliberate live fallback journey remain unproven.
- Authenticated role QA remains incomplete for Client, Business, Lawyer, Pending Lawyer, and Staff/Admin.
- Staging scheduler persistence remains blocked by the excluded staging D1 capacity issue.
- Legacy origin ownership/TLS risk and the full manual accessibility, responsive, performance, and E2E matrices remain open.
- All legislation-database, corpus, Lex.uz, Advice.uz, vector, and source-record work remains excluded from this increment.
