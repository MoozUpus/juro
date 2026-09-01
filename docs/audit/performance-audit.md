# JURO Performance Audit

Status: **living evidence report; v114 candidate measured but not deployed**

Evidence cutoff: **2026-09-01**

Scope: Chrome-only lab measurements for the public RU landing page and the public platform login boundary, production artifact budgets, and the truthfulness of published dependency latency. Legislation database/corpus ingestion, Lex.uz/Advice.uz, vectors, and staging-capacity remediation are excluded by owner instruction.

## Executive result

- `https://juro.uz/ru` passed mobile Lighthouse Accessibility, Best Practices, SEO, and Agentic Browsing at **100/100/100/100**.
- The latest public-page production trace on Fast 4G with 4x CPU throttling recorded **LCP 1,667 ms**, **TTFB 130 ms**, **CLS 0.00**, and **759 ms** of forced reflow attributed primarily to the landing-page motion runtime.
- Current production login traces recorded **CLS 0.28** on `app.juro.uz` and **0.26** on `lawyer.juro.uz`. The mobile CSS Grid redistributed free height as the form and Turnstile loaded; Turnstile then added another late shift.
- The undeployed v114 candidate changes the mobile auth grid to content-sized rows, reserves the nested Turnstile boundary, and defers initial public-page geometry reads until after a paint. A cold production-code CSS injection probe reduced login CLS to **0.0661**, and a local v114 public-page trace no longer attributed forced reflow to a top-level JURO function. These are candidate lab results, not production or field evidence.
- The platform login Best Practices score was **92** because the strict application CSP blocks Cloudflare's injected Web Analytics beacon. SEO scored **66** because the private auth route is deliberately protected by both meta and response-header `noindex`; that SEO result is expected and must not be “fixed” by making private application pages indexable.
- Before v188, the public production status API published D1 `latencyMs: 51,446` with `evidenceKind: scheduled_job`. Source inspection proved that v187 timed the entire five-minute cron workload and mislabelled it as database latency. Worker v188 now uses a dedicated constant `SELECT 1` probe; the first accepted production record reported `35 ms`, `operational`, and `synthetic_probe`.
- Worker v189 makes status-page favicon metadata same-origin on every production status route while preserving the existing `img-src 'self' data: blob:` policy. Chrome reported no console errors or warnings on the five checked status routes.

This audit does not claim complete platform performance coverage. Authenticated role journeys, field data, INP, long-task interaction profiles, and every target viewport remain open.

## Chrome test method

| Setting | Value |
| --- | --- |
| Browser | Chrome through Chrome DevTools MCP |
| Viewport | 390 × 844 CSS px, DPR 3, mobile + touch |
| Network | Fast 4G emulation |
| CPU | 4x slowdown |
| Color mode | Light |
| Field data | Not available in the trace; lab results only |

No Edge, Firefox, Safari/WebKit, or physical mobile device was used.

## v114 production baseline and candidate evidence

All measurements in this section used the Chrome method above. The production rows measure the currently deployed Sites v95 and Worker v189. The candidate rows are either a local v114 production build or an explicitly labelled pre-paint CSS simulation against production; neither proves deployed v114 behavior.

| Surface | Revision / method | LCP | TTFB | Render delay | CLS | Layout evidence |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Public `/ru` | production Sites v95 | 1,667 ms | 130 ms | 1,538 ms | 0.00 | 759 ms forced reflow, primarily attributed to `CinematicLandingPage` / motion runtime |
| Public `/ru` | local v114 production build | 1,317 ms | 441 ms | 805 ms | 0.00 | no top-level function identified as causing forced reflow; 309 ms unattributed browser layout cost remained |
| App login | production Worker v189 | 1,345 ms | 103 ms | 1,242 ms | 0.28 | mobile grid row redistribution plus late Turnstile insertion |
| Lawyer login | production Worker v189 | 1,646 ms | 260 ms | 1,386 ms | 0.26 | same shared auth layout defect |
| App login | production page with v114 CSS injected before paint | not used for acceptance | not used for acceptance | not used for acceptance | 0.0661 | 0.0199 brand settling plus 0.0462 inaccessible Turnstile inner-node expansion |

The local public build was served from localhost, so its TTFB and LCP are not a valid direct speed comparison with production. Its useful evidence is the code attribution: before the final nested-animation-frame change, the local trace attributed 531 ms of forced reflow to JURO runtime code; afterwards Chrome reported no top-level function responsible. The remaining 309 ms is not claimed as eliminated.

The auth simulation injected the exact candidate CSS before first paint in a new isolated Chrome context. It proves the proposed layout contract can bring this cold lab case below the 0.1 CLS threshold, but it is not a deployed revision measurement and cannot replace post-deploy QA.

## Historical public landing page evidence — `/ru`

| Run | LCP | TTFB | Render delay | CLS | Interpretation |
| --- | ---: | ---: | ---: | ---: | --- |
| Cold trace | 3,358 ms | 1,974 ms | 1,384 ms | 0.00 | TTFB dominated; initial document response exceeded the DevTools 600 ms diagnostic threshold |
| Repeat trace | 2,021 ms | 144 ms | 1,876 ms | 0.00 | Within the requested 2.5 s lab LCP target; rendering became the dominant portion |

Additional repeatable observations:

- LCP element: hero lead text, not a network-fetched image.
- DOM: 608 elements, maximum depth 11, maximum 11 children on `main`.
- Cold trace: 361 ms total forced-reflow time, primarily in `CinematicLandingPage` runtime frames.
- Longest cold critical request chain: 2,336 ms; no preconnect origins were present.
- Lighthouse mobile navigation: 58 passed, 0 failed; Accessibility 100, Best Practices 100, SEO 100, Agentic Browsing 100.

The cold/warm difference means one good repeat trace is not proof of stable field performance. v114 targets the attributed JURO forced reflow; render delay and field performance remain follow-up work.

## Historical platform login boundary — `/ru/auth/login`

| Metric | Result |
| --- | ---: |
| LCP | 1,387 ms |
| TTFB | 128 ms |
| Render delay | 1,259 ms |
| CLS | 0.0001 |
| Accessibility | 100 |
| Best Practices | 92 |
| SEO | 66 |
| Agentic Browsing | 100 |

The earlier accessibility-tree snapshot confirmed one localized login form, labelled email input, remember-device checkbox, visible Cloudflare Turnstile boundary, disabled submit during verification, RU/UZ locale controls, and light/dark theme controls. The later cold-load CLS traces supersede the earlier near-zero CLS result for release decisions because they captured the delayed Turnstile and mobile-grid movement.

The three Lighthouse failures have bounded explanations:

1. Cloudflare injects `https://static.cloudflareinsights.com/beacon.min.js`, while JURO CSP allows self and the Turnstile challenge origin only; Chrome therefore logs one CSP error and one DevTools CSP issue.
2. The route is intentionally blocked from indexing with `meta robots=noindex, nofollow, nocache` and `X-Robots-Tag: noindex, nofollow, noarchive`.
3. No change to CSP or indexing policy is included in this release. The CSP/Web Analytics conflict requires a separate decision between disabling the injected analytics beacon and explicitly allowing only the required Cloudflare analytics endpoints.

## Production status-latency defect and deployed fix

Production `/api/status` at `2026-08-31T01:19:26.010Z` reported:

- overall `degraded`;
- D1 `operational`;
- D1 `latencyMs: 51,446`;
- D1 `evidenceKind: scheduled_job`;
- OpenAI, Anthropic, and document analysis still degraded with public `PROVIDER_UNAVAILABLE`.

The v187 production value did not measure a D1 query. The scheduler captured its start before reminders, legal-source health, outbox dispatch, queue/DLQ reconciliation, retention, R2 reconciliation, malware/document/provider probes, and then wrote the total duration as D1 health. Worker v188 now:

- runs `SELECT 1 AS ok` directly against the bound D1 instance;
- measures only that awaited query;
- records `synthetic_probe` evidence;
- publishes operational evidence at or below 2,000 ms;
- publishes degraded `PROBE_LATENCY_HIGH` above 2,000 ms;
- publishes degraded `DEPENDENCY_UNAVAILABLE` for an invalid result or exception;
- preserves content-free logging and the existing fail-safe rule that observability persistence cannot fail completed product work.

No migration, DNS change, Sites change, legal-corpus action, or authentication change is required.

## Release verification

| Gate | Result |
| --- | --- |
| Focused status-metadata tests | 4/4 PASS |
| Rendered routes | 33/33 PASS |
| Core tests | 1,142/1,142 PASS |
| Worker/runtime and migrations | 217/217 PASS |
| TypeScript | PASS |
| Lint | PASS, 0 warnings after cleanup |
| Generated Cloudflare types | PASS after regeneration check; no content diff remained |
| Cloudflare development/staging/production matrix | PASS |
| Production artifact and size budgets | PASS |
| Licence policy | PASS, 802 locked packages |
| Security diff scan | Scan `97f3ebca-264a-4d1d-aff6-2eec9448ec0c`, 0 reportable findings; its functional/CSP coverage gaps were corrected before merge |
| Pull request | PR #95, exact-head CI `33352197361` PASS |
| Merge and post-merge CI | Merge `d133a470a49166875d9112b938ae3f7d765ee170`; CI `33404886188` PASS |
| Production deployment | Workflow `33404885913` PASS; Worker v189 ID `102dcb2d-f79f-4172-9a3a-19d55d51f6ed` at 100% traffic |

Artifact sizes remain within the existing release budgets: client CSS 564.7 KiB, initial browser JavaScript 294.1 KiB, largest lazy-route increment 212.1 KiB, fonts 453.6 KiB, images 564.4 KiB, and Worker entry 3,576.8 KiB. These are raw build artifact sizes, not transfer sizes or Core Web Vitals.

## Production acceptance

The five-minute production schedule generated a fresh public status snapshot at `2026-08-31T01:36:34.129Z`. It proved that:

1. D1 has `evidenceKind: synthetic_probe`;
2. the dedicated-query latency is `35 ms`, rather than the former 50+ second cron duration;
3. D1 is correctly `operational` below the 2,000 ms threshold;
4. overall status remains truthfully `degraded` because OpenAI, Anthropic, and document analysis still report public `PROVIDER_UNAVAILABLE`;
5. Chrome renders the same component state and exposes the D1 evidence in the expanded technical checks.

A later recovery checkpoint at `2026-09-01T15:33:22.376Z` returned HTTP `200`, overall `operational`, and 8/8 operational components. The direct D1 probe remained `operational` at `35 ms`; OpenAI and Anthropic were both fresh and operational at `4,506 ms` and `7,047 ms`. This supersedes the earlier provider-degraded state as the latest point-in-time snapshot, while the prior measurements remain valid historical evidence and sustained provider availability remains unproven.

Worker v189 separately closed the status favicon CSP defect. Chrome rendered `https://status.juro.uz/`, `/status`, `/ru/status`, `/uz/status`, and `https://app.juro.uz/ru/status` with no console errors or warnings. Raw production responses returned absolute same-origin `favicon.png` and `apple-touch-icon.png` links on both hosts; all four image assets returned `200` with `image/png`. Every checked page retained the existing CSP, including `img-src 'self' data: blob:`. The Chrome integration injects a local data-URL badge over ordinary favicon links, so raw HTML was used to verify the server-authored favicon URLs while Chrome verified rendering and console behavior.

The full execution goal remains active after this increment.
