# JURO QA Test Report

Status: **living evidence report, not full Definition of Done**

Evidence cutoff: **2026-09-01**

Scope in this report: the undeployed stacked v113 and v114 candidates plus the latest retained production evidence for platform Worker v189 and public Sites v95. Legislation database, legal corpus, Lex.uz/Advice.uz ingestion, vectors, and staging-capacity remediation are excluded by owner instruction.

## v114 performance candidate validation

| Area | Evidence | Result |
| --- | --- | --- |
| Auth layout regression | 7 focused Turnstile/auth CSS tests | PASS |
| Public landing regression | 19 focused source tests; 50/50 complete website tests | PASS |
| TypeScript and lint | website and platform type-check; website and platform lint | PASS |
| Production builds | website build; platform build and artifact validation | PASS |
| Platform artifact budgets | CSS 570.4 KiB, initial JS 294.4 KiB, largest lazy increment 212.1 KiB, fonts 453.6 KiB, images 564.4 KiB, Worker entry 3,680.2 KiB | PASS |
| Full platform aggregate test command | reached its 300,000 ms wrapper limit while `legal-corpus-catalog-discovery.test.ts` was still running | TIMEOUT IN EXCLUDED CORPUS SCOPE |
| Chrome public candidate | local production build: LCP 1,317 ms, CLS 0.00, no top-level JURO function identified as causing forced reflow | PASS AS LOCAL LAB EVIDENCE |
| Chrome auth candidate | exact v114 CSS injected before production first paint: cold CLS 0.0661 versus production traces at 0.28 app / 0.26 lawyer | PASS AS SIMULATION ONLY |
| Exact-head CI and security | required after the v114 commit | PENDING |
| Deployment and post-deploy Chrome QA | no v114 deployment | NOT RUN |

The aggregate platform command is not reported as green: it terminated at its five-minute runner limit in `legal-corpus-catalog-discovery.test.ts` after other tests had passed. That file belongs to the owner-excluded corpus scope, so v114 did not change or operate the corpus. Exact GitHub CI on the committed head remains mandatory. The local and injected Chrome results are diagnostic evidence only and do not establish production Core Web Vitals.

## v113 candidate validation

| Area | Evidence | Result |
| --- | --- | --- |
| Security remediations | 26 focused OTP, challenge-evidence, request-body, and signed-share tests | PASS |
| Platform core application | 1,181 tests | PASS |
| Worker/runtime and infrastructure | 217 tests | PASS |
| Public website regression | 49 tests | PASS |
| TypeScript | `type-check` | PASS |
| Lint | repository lint | PASS |
| Cloudflare configuration | full development/staging/production matrix and generated-types check | PASS |
| Production artifact | production artifact validation and emitted-size budgets | PASS |
| Pull request CI | exact Draft PR #115 head, run `33526782010`; website and platform jobs | PASS |
| Security diff scan | exact head `729f2e231dc49fb36f626e2fd6eb7c19cf3c0c1c`, scan `4ad0e326-65ee-4eb8-bed2-f1f96d7cafba` | PASS, 0 FINDINGS |
| Deployment and browser QA | no v113 deployment; server-side candidate cannot be verified through production Chrome | NOT RUN |

The full platform suite initially stopped on one stale source-string assertion after the authentication runtime helper was renamed. The assertion was updated, its 78/78 focused file passed, and the complete platform suite was rerun to 1,180/1,180. The key-version compatibility closure then added one regression test, and the current exact worktree passed 1,181/1,181. The first generated-types check reported an out-of-date file; the standard generator produced the same Git blob, and a clean sequential recheck passed. Neither event is hidden as an uninterrupted green run.

The v113 Standard security scan (`fb8621fe-664a-4364-86df-e357d586a2b3`) reviewed 68 of 1,594 scoped files at base revision `beae3e05d7552b999c0fb7bcba14ee615c04906a`. It reported one high and three medium findings; v113 contains focused candidate fixes for all four. A separate exact-head diff scan is a mandatory PR receipt and must be repeated after any commit change. This remains partial source-review evidence, not a complete security certificate or production verification. See [`../audit/security-audit.md`](../audit/security-audit.md).

## Latest deployed release checks (v189)

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
- Public `/api/status` generated at `2026-09-01T15:33:22.376Z`: HTTP `200`, overall `operational`, 8/8 components operational, 0 active incidents.
- Fresh D1 evidence: `operational`, `35 ms`, `evidenceKind: synthetic_probe`, checked at `2026-09-01T15:31:47.271Z`.
- Fresh OpenAI and Anthropic evidence: both `operational`, checked at `2026-09-01T15:27:22.684Z` and `2026-09-01T15:27:29.818Z`; this supersedes the earlier 6/8 provider-degraded snapshot without deleting it as historical evidence.
- When provider failures occur, the public status surface redacts provider-specific causes to `PROVIDER_UNAVAILABLE`; the successful recovery snapshot exposes no provider error code.
- Earlier read-only D1 evidence recorded `PROVIDER_CREDIT_BALANCE_LOW` for OpenAI and Anthropic; that pre-top-up detail is retained as historical evidence, not asserted as the current Anthropic account state.
- Provider failure intervals after v187 were 10.36–15.82 minutes rather than the pre-release 3–6 minute cadence.
- Document-analysis evidence advanced after 26.2 minutes and recorded the routed provider failure instead of repeating every scheduler cycle.
- Chrome rendered the status root, unlocalized status route, RU and UZ localized status routes, and the app-host RU status route with no console errors or warnings. Raw response HTML confirmed that status-host icons resolve to `status.juro.uz` and app-host icons remain on `app.juro.uz`; the existing CSP was unchanged.

The Worker is deployed correctly and provider probes recovered in the latest point-in-time snapshot. Authenticated AI answer-quality, completed document-analysis, and sustained provider-health evidence remain open.

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
- sustained provider recovery, because the latest public checkpoint recovered to 8/8 with fresh successful OpenAI and Anthropic probes but one point-in-time result does not prove continued availability or authenticated answer quality.

The overall execution goal must remain active until these and the other Definition-of-Done gates are proven.
