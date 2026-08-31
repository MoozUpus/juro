# JURO QA Test Report

Status: **living evidence report, not full Definition of Done**

Evidence cutoff: **2026-08-31 06:37 UZT (2026-08-31 01:37 UTC)**

Scope in this report: platform Worker v188 and public Sites v95. Legislation database, legal corpus, Lex.uz/Advice.uz ingestion, vectors, and staging-capacity remediation are excluded by owner instruction.

## Automated release checks

| Area | Evidence | Result |
| --- | --- | --- |
| D1 dependency/scheduler regressions | 61 focused tests; changed-file rerun 50/50 | PASS |
| Platform core application | 1,138 tests | PASS |
| Worker/runtime and infrastructure | 217 tests | PASS |
| TypeScript | `type-check` | PASS |
| Lint | repository lint | PASS |
| Cloudflare configuration | environment matrix validation and generated types check | PASS |
| Production artifact | production artifact validation and budget checks | PASS |
| Dependency and licence policy | production dependency audit, website toolchain audit, licence enforcement | PASS |
| Pull request CI | PR #93 workflow `33347354764` | PASS |
| Post-merge CI | workflow `33347774965` on merge `f14c3d9bd6b0645f3d9ef5da3bca7ab412138aae` | PASS |
| Production deployment | workflow `33347775254` | PASS |

During the earlier v187 validation, one initial parallel local run hit a Windows build-directory collision. The suites were rerun sequentially and passed in full; this was not treated as a product failure or hidden as a green parallel run.

## Security review

- Security diff scan ID: `8df2d75d-b797-454c-aa67-c0d3734b6395`.
- Coverage: complete for the v188 production-source change set.
- Reviewed surfaces: 4.
- Findings: 0.
- Deferred items: 0.
- Scan usage: 8,682,293 total tokens; 8,648,255 input tokens; 8,444,800 cached input tokens; 34,038 output tokens.

The scan covers the four changed production surfaces for direct D1 probing, scheduler integration, health classification, and operator remediation. It is not evidence for the entire historical repository.

## Production Worker verification

- Active Worker: v188, ID `57387083-9f7f-4cd8-a9f2-84414f2604d6`, 100% traffic.
- Rollback: v187, ID `65ce3f7f-3469-4c43-854c-d073309befed`.
- Public `/api/status`: HTTP `200`, overall `degraded`, 6/8 components operational, 0 active incidents.
- Fresh D1 evidence: `operational`, `35 ms`, `evidenceKind: synthetic_probe`, checked at `2026-08-31T01:36:26.021Z`.
- Public provider codes are redacted to `PROVIDER_UNAVAILABLE`.
- Read-only D1 evidence records `PROVIDER_CREDIT_BALANCE_LOW` for OpenAI and Anthropic.
- Provider failure intervals after v187 were 10.36–15.82 minutes rather than the pre-release 3–6 minute cadence.
- Document-analysis evidence advanced after 26.2 minutes and recorded the routed provider failure instead of repeating every scheduler cycle.
- Chrome status-page smoke showed the same truthful state and the expanded D1 evidence. One unrelated CSP error blocks the cross-host `app.juro.uz/favicon.png`; this is recorded as a P2 follow-up rather than hidden as a clean console.

The Worker is deployed correctly, but AI and document analysis remain degraded until provider funding/workspace alignment yields fresh successful probes.

## Public Sites v95 verification

- Saved source: `855ba2161b716daabb96ac469456c101e5d3bb2c`.
- Deployment: `appgdep_6a94c1cfc364819190b65a5cb0a7e5ad`.
- `juro.uz`: `/`, RU, UZ, EN, `robots.txt`, and `sitemap.xml` return `200` and remain indexable.
- Provider hostname: the same entry and discovery routes return `200` with `X-Robots-Tag: noindex, nofollow, noarchive`.
- Sitemap crawl: 78/78 URLs returned `200`.
- Discoverable JURO-zone link crawl: 149/149 links returned `200` after redirects; 121 target `juro.uz` and 28 target `app.juro.uz`.
- Chrome smoke passed on both the custom domain and provider hostname with no console errors.
- Rollback: saved Sites v94.

## Artifact budgets for v188

| Artifact | Measured size |
| --- | ---: |
| Client CSS | 564.7 KiB |
| Initial browser JavaScript | 294.1 KiB |
| Largest lazy route increment | 212.1 KiB |
| Fonts | 453.6 KiB |
| Images | 564.4 KiB |
| Worker entry | 3,575.4 KiB |

These are build-budget measurements, not field Core Web Vitals.

## Still unproven

- authenticated Chrome journeys for Client, Business, Lawyer, Pending Lawyer, and Staff/Admin;
- full critical-scenario E2E with real authorized test sessions;
- manual keyboard accessibility for all critical flows;
- visual regression across every required viewport;
- field performance baselines and before/after Core Web Vitals for every production route;
- staging reliability, because the excluded staging D1 capacity blocker prevents fresh scheduler persistence;
- provider recovery, because both production probes still report low credit.
- a clean public status-page console, because the cross-host favicon currently violates `img-src 'self' data: blob:`.

The overall execution goal must remain active until these and the other Definition-of-Done gates are proven.
