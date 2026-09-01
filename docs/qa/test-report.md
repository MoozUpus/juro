# JURO QA Test Report

Status: **living evidence report, not full Definition of Done**

Evidence cutoff: **2026-09-02 UZT**

Scope in this report: the deployed v101 release and the undeployed mainline v114 performance candidate. Older v189/v95 evidence below is retained as history. Legislation database, legal corpus, Lex.uz/Advice.uz ingestion, vectors, and staging-capacity remediation are excluded by owner instruction.

## v114 mainline candidate validation

| Area | Evidence | Result |
| --- | --- | --- |
| Auth layout regression | 7 focused Turnstile/auth CSS tests | PASS |
| Public website regression | complete website suite | 46/46 PASS |
| Website static gates | type-check and lint | PASS |
| Platform static gates | type-check and lint | PASS |
| Production artifacts | website build and platform production build/validation | PASS |
| Platform artifact budgets | CSS 564.8 KiB; initial JS 294.1 KiB; largest lazy increment 212.1 KiB; fonts 453.6 KiB; images 564.4 KiB; Worker 3,640.6 KiB | PASS |
| Chrome performance | local LCP 1,334 ms; CLS 0.00; no top-level JURO forced-reflow function; 83 ms unattributed | PASS AS LOCAL LAB EVIDENCE |
| Chrome responsive/reveal matrix | RU/UZ/EN desktop and RU mobile 21/21; `/ru#start` 21/21; zero overflow; clean console | PASS |
| Local auth layout | 1440 × 900 and 390 × 844; zero overflow; sampled mobile controls at least 44 CSS px | PASS WITH PROVIDER CHALLENGE UNAVAILABLE LOCALLY |
| Exact-head CI and security | required after the candidate is committed and pushed | PENDING |
| Deployment and post-deploy Chrome QA | v114 is not deployed | NOT RUN |

The first ad-hoc Node invocations used unsupported paths and failed before loading product tests; the exact project test commands were then used and passed. The local production server cannot load `cloudflare:` modules without the project loader, so auth visual QA used the supported Vite/Cloudflare development server after the production artifact itself had already passed validation. These harness corrections are not product failures and are not hidden as uninterrupted green runs.

## v101 release verification

- PR #103 merged as `840f1144f3ba8562a7866cd4bda99525be392758`; the exact reviewed head was `e14532c12a9200bc335f8a506fa452a788069efd`.
- Website Worker `d6ff54c8-0bbc-4921-a54e-581027689a41` and platform Worker `9c434c4e-52af-41cd-b680-eb0730b87e37` became active after successful release workflows.
- Production Chrome verified 21/21 reveals on RU/UZ/EN and direct `/ru#start`, zero overflow at 1440 × 900 and 390 × 844, and a clean console.
- Warm LCP was 519 ms with CLS 0.01; cold LCP was 2,717 ms with TTFB 1,769 ms. Desktop Lighthouse scored Accessibility, Best Practices, SEO, and Agentic Browsing at 100 each.
- Exact-head security diff scan `e4263939-7125-4a85-b1e7-3e77985fb307` reported 0 findings.
- Production status recovered to operational, 8/8 components and 0 active incidents at the retained checkpoint. This point-in-time result does not prove sustained provider health.

## Automated release checks

| Area | Evidence | Result |
| --- | --- | --- |
| Status metadata regressions | 4 focused tests | PASS |
| Platform core application | 1,142 tests | PASS |
| Worker/runtime and infrastructure | 217 tests | PASS |
| TypeScript | `type-check` | PASS |
| Lint | repository lint | PASS |
| Cloudflare configuration | environment matrix validation and generated types check | PASS |
| Production artifact | production artifact validation and budget checks | PASS |
| Dependency and licence policy | production dependency audit, website toolchain audit, licence enforcement | PASS |
| Pull request CI | PR #95 workflow `33352197361` | PASS |
| Post-merge CI | workflow `33404886188` on merge `d133a470a49166875d9112b938ae3f7d765ee170` | PASS |
| Production deployment | workflow `33404885913` | PASS |

During the earlier v187 validation, one initial parallel local run hit a Windows build-directory collision. The suites were rerun sequentially and passed in full; this was not treated as a product failure or hidden as a green parallel run.

## Security review

- Security diff scan ID: `97f3ebca-264a-4d1d-aff6-2eec9448ec0c`.
- Findings: 0 reportable security findings.
- Coverage: partial for the initial patch because it did not yet cover every status route/host or live edge behavior.
- Scan usage: 5,883,477 total tokens; 5,850,397 input tokens; 5,589,504 cached input tokens; 33,080 output tokens; 10,553 reasoning tokens.

The scan identified release-blocking functional and CSP coverage gaps in the initial status-metadata patch even though it found no reportable vulnerability. Before merge, the implementation was changed to use a Worker-owned origin header, validate the allowed status hosts, cover both localized and root status routes, and preserve the existing CSP. Focused tests and live Chrome/HTTP verification cover the final release behavior; the scan is not evidence for the entire historical repository.

## Production Worker verification

- Active Worker: v189, ID `102dcb2d-f79f-4172-9a3a-19d55d51f6ed`, 100% traffic.
- Rollback: v188, ID `57387083-9f7f-4cd8-a9f2-84414f2604d6`.
- Public `/api/status` generated at `2026-08-31T15:07:12.161Z`: HTTP `200`, overall `degraded`, 6/8 components operational, 0 active incidents.
- Fresh D1 evidence: `operational`, `192 ms`, `evidenceKind: synthetic_probe`, checked at `2026-08-31T15:05:19.870Z`.
- Public provider codes are redacted to `PROVIDER_UNAVAILABLE`.
- Earlier read-only D1 evidence recorded `PROVIDER_CREDIT_BALANCE_LOW` for OpenAI and Anthropic; that pre-top-up detail is retained as historical evidence, not asserted as the current Anthropic account state.
- Provider failure intervals after v187 were 10.36–15.82 minutes rather than the pre-release 3–6 minute cadence.
- Document-analysis evidence advanced after 26.2 minutes and recorded the routed provider failure instead of repeating every scheduler cycle.
- Chrome rendered the status root, unlocalized status route, RU and UZ localized status routes, and the app-host RU status route with no console errors or warnings. Raw response HTML confirmed that status-host icons resolve to `status.juro.uz` and app-host icons remain on `app.juro.uz`; the existing CSP was unchanged.

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

## Artifact budgets for v189

| Artifact | Measured size |
| --- | ---: |
| Client CSS | 564.7 KiB |
| Initial browser JavaScript | 294.1 KiB |
| Largest lazy route increment | 212.1 KiB |
| Fonts | 453.6 KiB |
| Images | 564.4 KiB |
| Worker entry | 3,576.8 KiB |

These are build-budget measurements, not field Core Web Vitals.

## Still unproven

- authenticated Chrome journeys for Client, Business, Lawyer, Pending Lawyer, and Staff/Admin;
- full critical-scenario E2E with real authorized test sessions;
- manual keyboard accessibility for all critical flows;
- visual regression across every required viewport;
- field performance baselines and before/after Core Web Vitals for every production route;
- staging reliability, because the excluded staging D1 capacity blocker prevents fresh scheduler persistence;
- provider recovery, because both public production probes still report `PROVIDER_UNAVAILABLE`; the reported Anthropic top-up has not yet produced a successful probe.

The overall execution goal must remain active until these and the other Definition-of-Done gates are proven.
