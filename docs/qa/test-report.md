# JURO QA Test Report

Status: **living evidence report, not full Definition of Done**

Evidence cutoff: **2026-08-31 04:56 UZT (2026-08-30 23:56 UTC)**

Scope in this report: platform Worker v187 and public Sites v95. Legislation database, legal corpus, Lex.uz/Advice.uz ingestion, vectors, and staging-capacity remediation are excluded by owner instruction.

## Automated release checks

| Area | Evidence | Result |
| --- | --- | --- |
| Provider/document-analysis regressions | 25 focused tests | PASS |
| Platform core application | 1,138 tests | PASS |
| Worker/runtime and infrastructure | 216 tests | PASS |
| TypeScript | `type-check` | PASS |
| Lint | repository lint | PASS |
| Cloudflare configuration | environment matrix validation and generated types check | PASS |
| Production artifact | production artifact validation and budget checks | PASS |
| Dependency and licence policy | production dependency audit, website toolchain audit, licence enforcement | PASS |
| Pull request CI | PR #91 workflow `33341146144` | PASS |
| Post-merge CI | workflow `33341512900` | PASS |
| Production deployment | workflow `33341511530` | PASS |

One initial parallel local run hit a Windows build-directory collision. The suites were rerun sequentially and passed in full; this was not treated as a product failure or hidden as a green parallel run.

## Security review

- Security diff scan ID: `a1895c55-bad5-42c3-9569-0de3e2f1dcb1`.
- Coverage: complete for the v187 change set.
- Reviewed surfaces: 4.
- Findings: 0.
- Deferred items: 0.
- Scan usage: 5,127,105 total tokens; 5,114,642 input tokens; 4,998,784 cached input tokens.

The scan covers the changed provider-probe, document-analysis fallback, health composition, and regression-test surfaces. It is not evidence for the entire historical repository.

## Production Worker verification

- Active Worker: v187, ID `65ce3f7f-3469-4c43-854c-d073309befed`.
- Rollback: v186, ID `7b269272-4fc4-4911-97ab-8dfc28c260d0`.
- Public `/api/status`: HTTP `200`, overall `degraded`, 6/8 components operational, 0 active incidents.
- Public provider codes are redacted to `PROVIDER_UNAVAILABLE`.
- Read-only D1 evidence records `PROVIDER_CREDIT_BALANCE_LOW` for OpenAI and Anthropic.
- Provider failure intervals after v187 were 10.36–15.82 minutes rather than the pre-release 3–6 minute cadence.
- Document-analysis evidence advanced after 26.2 minutes and recorded the routed provider failure instead of repeating every scheduler cycle.
- Chrome status-page smoke passed with no console errors.

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

## Artifact budgets for v187

| Artifact | Measured size |
| --- | ---: |
| Client CSS | 564.7 KiB |
| Initial browser JavaScript | 294.1 KiB |
| Largest lazy route increment | 212.1 KiB |
| Fonts | 453.6 KiB |
| Images | 564.4 KiB |
| Worker entry | 3,575.6 KiB |

These are build-budget measurements, not field Core Web Vitals.

## Still unproven

- authenticated Chrome journeys for Client, Business, Lawyer, Pending Lawyer, and Staff/Admin;
- full critical-scenario E2E with real authorized test sessions;
- manual keyboard accessibility for all critical flows;
- visual regression across every required viewport;
- field performance baselines and before/after Core Web Vitals for every production route;
- staging reliability, because the excluded staging D1 capacity blocker prevents fresh scheduler persistence;
- provider recovery, because both production probes still report low credit.

The overall execution goal must remain active until these and the other Definition-of-Done gates are proven.
