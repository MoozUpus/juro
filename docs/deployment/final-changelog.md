# JURO Execution Changelog

Status: **living changelog; the full execution goal remains active**

Evidence cutoff: **2026-08-31 04:56 UZT (2026-08-30 23:56 UTC)**

This file records verified production increments. It must not be read as a claim that every item in the execution brief is complete.

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

## Validation summary

- 25/25 focused provider/document-analysis tests passed.
- 1,138/1,138 platform core tests passed.
- 216/216 Worker/runtime tests passed.
- Lint, type-check, Cloudflare matrix, generated types, production artifact validation, dependency audits, and licence policy passed.
- PR, post-merge CI, and production deployment workflows passed.
- Complete security diff coverage reported zero findings and zero deferred items.
- Production `/api/status` returns HTTP `200`, remains truthfully `degraded`, reports 6/8 components operational, and reports no active incidents.

## Current limitations

- OpenAI and Anthropic production probes still report `PROVIDER_CREDIT_BALANCE_LOW`; AI and document analysis remain degraded until fresh successful probes exist.
- Authenticated role QA remains incomplete for Client, Business, Lawyer, Pending Lawyer, and Staff/Admin.
- Staging scheduler persistence remains blocked by the excluded staging D1 capacity issue.
- Legacy origin ownership/TLS risk and the full manual accessibility, responsive, performance, and E2E matrices remain open.
- All legislation-database, corpus, Lex.uz, Advice.uz, vector, and source-record work remains excluded from this increment.
