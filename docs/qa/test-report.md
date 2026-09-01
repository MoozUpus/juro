# JURO QA Test Report

Status: **living evidence report, not full Definition of Done**

Evidence cutoff: **2026-09-01 08:49 UZT (2026-09-01 03:49 UTC)**

Scope in this report: platform Worker v99 and public Sites v95. Legislation database, legal corpus, Lex.uz/Advice.uz ingestion, vectors, and staging-capacity remediation are excluded by owner instruction.

## Automated release checks

| Area | Evidence | Result |
| --- | --- | --- |
| v99 focused security/platform checks | 91 tests | PASS |
| Platform core application | 1,161 tests | PASS |
| Worker/runtime and infrastructure | 217 tests | PASS |
| Worker smoke | 33 tests | PASS |
| TypeScript | `type-check` | PASS |
| Lint | repository lint | PASS |
| Cloudflare configuration | environment matrix validation and generated types check | PASS |
| Production artifact | production artifact validation and budget checks | PASS |
| Dependency and licence policy | production dependency audit, website toolchain audit, licence enforcement | PASS |
| Pull request CI | Draft PR #101 workflow `33466544141` | PASS |
| Production deployment | controlled deployment `6c3c5410-c16a-46dd-ae78-6ee580baf641` | PASS |

During the earlier v187 validation, one initial parallel local run hit a Windows build-directory collision. The suites were rerun sequentially and passed in full; this was not treated as a product failure or hidden as a green parallel run.

## Security review

- Security scan ID: `3f683f24-c93d-469c-934e-4826a9122674`.
- Findings: 2 medium-severity, high-confidence findings; both fixed before production deployment.
- Fixed boundaries: pending invitation PII authorization/expiry and unbounded public JSON request bodies.

Independent post-patch review found a dispatch-order regression in the first request-body patch that would have placed the public 1 MiB gate before the protected internal 20 MiB upload. The order was corrected before release, the full suites were rerun, and the reviewer reported no remaining evidence-backed finding. The scan remains scoped evidence, not a clean bill of health for the historical repository.

## Production Worker verification

- Active Worker: v99, ID `0b35483c-9bf4-4a21-ba45-dadbde198f83`, 100% traffic.
- Rollback: v98, ID `b1b242f0-9033-40e3-bdf2-d9aee9ef5b48`.
- Public `/api/status` generated at `2026-09-01T03:49:05.435Z`: HTTP `200`, overall `operational`, 8/8 components operational, 0 active incidents.
- Five consecutive OpenAI probes passed at 2,844–3,591 ms.
- Five consecutive Anthropic probes passed at 6,288–7,875 ms.
- Five consecutive routed document-analysis probes passed at 3,743–5,735 ms.
- Live request-boundary proof returned `401` for ordinary small unauthenticated JSON and `413 PAYLOAD_TOO_LARGE` above 1 MiB.

The Worker and isolated provider contracts are operational in the checked window. This does not prove authenticated RU/UZ Legal Answer quality or provider fallback under a real primary outage.

## Public Sites v95 verification

- Saved source: `855ba2161b716daabb96ac469456c101e5d3bb2c`.
- Deployment: `appgdep_6a94c1cfc364819190b65a5cb0a7e5ad`.
- `juro.uz`: `/`, RU, UZ, EN, `robots.txt`, and `sitemap.xml` return `200` and remain indexable.
- Provider hostname: the same entry and discovery routes return `200` with `X-Robots-Tag: noindex, nofollow, noarchive`.
- Sitemap crawl: 78/78 URLs returned `200`.
- Discoverable JURO-zone link crawl: 149/149 links returned `200` after redirects; 121 target `juro.uz` and 28 target `app.juro.uz`.
- Chrome smoke passed on both the custom domain and provider hostname with no console errors.
- Rollback: saved Sites v94.

## Latest recorded artifact sizes

| Artifact | Measured size |
| --- | ---: |
| Client CSS | 564.7 KiB |
| Initial browser JavaScript | 294.1 KiB |
| Largest lazy route increment | 212.1 KiB |
| Fonts | 453.6 KiB |
| Images | 564.4 KiB |
| Worker entry | 3,576.8 KiB |

These v189 numeric measurements remain the latest recorded size snapshot. v99 passed the configured artifact budgets, but this documentation increment did not recapture exact byte totals. These are build measurements, not field Core Web Vitals.

## Still unproven

- authenticated Chrome journeys for Client, Business, Lawyer, Pending Lawyer, and Staff/Admin;
- full critical-scenario E2E with real authorized test sessions;
- manual keyboard accessibility for all critical flows;
- visual regression across every required viewport;
- field performance baselines and before/after Core Web Vitals for every production route;
- staging reliability, because the excluded staging D1 capacity blocker prevents fresh scheduler persistence;
- authenticated RU/UZ Legal Answer and deliberate provider-fallback production journeys, despite healthy isolated provider probes.

The overall execution goal must remain active until these and the other Definition-of-Done gates are proven.
