# Test report — current evidence through 2026-08-28

## Public website automated accessibility candidate

| Gate | Result |
| --- | --- |
| Runner | PASS — pinned `@axe-core/playwright` 4.13.0 with `playwright-core` 1.62.1; only the installed Google Chrome channel is launched |
| Artifact boundary | PASS — the harness serves the exact verified `dist/client` assets and delegates documents to the built ESM Worker |
| Standards tags | WCAG 2.0 A/AA, WCAG 2.1 A/AA and WCAG 2.2 AA automated axe rules |
| Desktop light | PASS — RU/UZ/EN home, RU Trust and RU Lawyers |
| Desktop dark | PASS — RU home, RU Trust and RU Lawyers |
| Mobile light `390×844` | PASS — RU/UZ/EN home, RU Trust and RU Lawyers |
| Mobile dark `390×844` | PASS — RU home, RU Trust and RU Lawyers |
| Aggregate | PASS — 16/16 route/profile combinations, zero automated violations; every page retained two manual-review candidates |
| Corrected surfaces | Public-home labels and reduced-motion opacity; Trust navigation, summaries and muted copy; Lawyers filters and cards in dark theme; shared 44×44 px header/footer language targets; focusable main targets; one semantic mobile-menu close control |
| Skip-focus regression | PASS — every one of the 16 exact-built route/profile samples now activates the skip link and requires focus to land on `#main-content` |
| Manual Chrome sample | PASS locally on exact built assets — RU home, Trust and Lawyers at `1280×900` retained one H1, one main target, no horizontal overflow and working skip focus; homepage tablists handled Arrow/End with visible focus; the `390×844` modal wrapped focus, closed on Escape and returned focus to its trigger; the accessibility tree exposed one close control |
| GitHub Actions CI `33114696527` | PASS on exact focus-contract source commit `32947b37a15af1f2bd4c7ffecbfe3e260252ab37` — Website 1m27s and Platform 8m55s |
| Focus-contract source | PASS — commit `32947b37a15af1f2bd4c7ffecbfe3e260252ab37` |
| Saved Sites candidate | PASS — version 90 from exact Sites source commit `2510dfa9e5006d51d9c94d178f9bc58bfc449173`; canonical archive hash `sha256:66ec95e8b2ecbd1098b1c8559fab97807e661e61fad5fb6643bdf21e6ea02712`, 79 files; saved version 89 is superseded |
| Public deployment boundary | UNCHANGED — version 90 is saved only; successful public deployment `appgdep_6a9027658100819189e6e6bc1a20bf1d` still owns version 86 |

This is saved-candidate evidence, not deployed-Sites evidence and not a blanket
WCAG conformance statement. The named Chrome keyboard/accessibility-tree sample
is retained, but the remaining authenticated workflows and assistive-technology
behavior remain manual release checks.

## Lawyer catalogue performance and public-photo candidate

| Gate | Result |
| --- | --- |
| Live v86 mobile traces | OBSERVED — three `390×844`, 4× CPU, Fast 4G reloads: LCP 2,818 / 1,154 / 1,380 ms; TTFB 1,856 / 240 / 198 ms; CLS 0.00 / 0.00 / 0.0004 |
| Live image delivery | FAIL in v86 — 419×419 PNG, 82,109 bytes, displayed at about 80×80; 81 kB estimated waste; response incorrectly `private, no-store` |
| Source correction | PASS locally — only fixed 128/288 px WebP variants are requested; the production Worker cache is enabled; only the exact approved public-photo route receives public cache policy; private photo/API routes remain excluded |
| Focused regression | PASS — platform photo-policy 4/4; website production contracts 24/24 after adding locale-aware year grammar |
| Static gates | PASS — Platform type-check/lint, generated Cloudflare types, three-environment matrix, rendered 35/35, full core 1094/1094, infrastructure 201/201 and production artifact budgets; Website type-check/lint, verified build/artifact and full 46/46 suite |
| GitHub Actions CI `33104695509` | PASS — Website 50s and Platform 8m40s, including tests, deployable artifacts, Cloudflare matrix, production-dependency audit and licence policy |
| Platform deployment | PASS — Worker 152 `47671380-a8fe-4d8c-95e2-bd7778541b0c`, deployment `61882723-0234-4614-bd66-c0ad2b862ba3`, 100%; Worker 151 is rollback |
| Live public-photo verification | PASS on Worker 152 — original 82,109-byte PNG is publicly cacheable; the approved 128 px WebP is 2,106 bytes (97.4% smaller) and changed from `MISS` to `HIT` on repeat; invalid variants retain the original; an unknown UUID is `404`, `no-store`, `BYPASS` |
| Production health | PASS at capture — 8/8 operational, zero active/recent incidents at `2026-08-27T18:55:37.826Z`; error-only tail stayed empty after photo and routing probes |
| Controlled Lighthouse | PASS — Accessibility 100, Best Practices 100, SEO 100, Agentic Browsing 100; 58 passed, 0 failed; reports in `docs/qa/artifacts/performance-sites-v86-lawyers/` |
| Accessibility snapshot | PASS for high-level semantics — one H1, labelled filters and named actions; it found the corrected RU grammar defect `4 лет` |
| Sites production status | PARTIAL — public Sites v86 still requests the original 82,109-byte PNG and still predates the RU grammar fix; a superseding Sites version remains required for end-user WebP delivery |

The first trace's server-latency outlier is retained. Two passing repeats do not
erase it or prove field performance. Worker 152 now provides the bounded WebP
and cache behavior, but the end-user catalogue remains on Sites v86 and will
request the smaller variant only after a superseding public Sites release.

## Worker 151 responsive Turnstile and Client target closure

| Gate | Result |
| --- | --- |
| Exact source | PASS — commits `6fa7835e`, `a6008f43` and final Turnstile commit `0bdfe7c04830752e06049ace7afc7575db267499` on Draft PR `#64` |
| Focused regression | PASS — 15/15 Turnstile and UI-resilience tests; the earlier Client target suite passed 10/10 |
| Local release gates | PASS — type-check, lint, full core 1090/1090, Cloudflare/infrastructure 201/201, production build/artifact and all emitted-asset budgets |
| GitHub Actions CI `33090467509` | PASS — Platform 8m29s and Website 41s |
| Production deployment | PASS — Worker 151 `8a9accf5-31e6-4947-ab34-e0317b26e61e`, deployment `a47ee184-655b-4ae5-af16-add701e1083a`, 100%; Worker 150 `ab61380a-4045-4283-80f0-d5bcc1144be8` is rollback |
| Production health | PASS at capture — `overallStatus=operational`, all eight components operational, zero active/recent incidents at `2026-08-27T16:06:24.644Z` |
| Client target replay | PASS for six affected authenticated routes — Cases, Action plan, History, Profile, Security and Notifications exposed no sub-44 px target after Worker 150/151. The remaining 21 px search input is nested in a 44 px label target |
| Desktop Chrome trace | PASS — login LCP 521 ms (TTFB 310 ms, render delay 211 ms), CLS 0.02, no horizontal overflow; render-blocking estimate was 0 ms for FCP/LCP |
| Mobile Chrome trace | PASS — emulated Chrome 320x800, LCP 248 ms (TTFB 92 ms, render delay 156 ms), CLS 0.00, document `320/320` with no horizontal overflow, 296 px card and 150 px compact Turnstile |
| Responsive breakpoint replay | PASS — changing the same live tab from 320 px to desktop caused `ResizeObserver` to replace compact with flexible Turnstile without page overflow |
| Lighthouse snapshot | PASS — Lighthouse 13.4.1: Accessibility 100, Best Practices 100, SEO 100, Agentic Browsing 100; 33 passed, 0 failed. Reports: `docs/qa/artifacts/lighthouse-worker151-login/` |
| Exact screenshot route | PASS — `lawyer.juro.uz/ru/individual/dashboard?qa=worker151` returns non-cacheable `307` to the exact `app.juro.uz` path; unauthenticated Client and Lawyer routes retain their own login destinations and Admin retains the protected `303` handoff |
| Protected-role boundary | PARTIAL — the preserved Lawyer and Admin Chrome tabs still require the user to establish the corresponding authenticated sessions before their current route loops can be replayed |

The Lighthouse snapshot and two lab traces establish the named deployed login
state only. They do not supply field CrUX data, INP evidence, screen-reader
coverage or a blanket WCAG conformance result.

## Worker 148 Lawyer-host Client-link correction

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `b4c472332e49b9750ec696652281670efb89bb9b` |
| Focused host-routing tests | PASS — 6/6 |
| Rendered Worker tests | PASS — 35/35 |
| Local release gates | PASS — full test command, lint, type-check, three-environment Cloudflare matrix, production artifact budgets and 730-package licence policy |
| GitHub Actions CI `33071334033` | PASS — Website and Platform |
| Production dry-run | PASS — required secrets present, production resources isolated and Container rollout disabled |
| Production deployment | PASS — Worker 148 `28dd4ac8-1ae2-4582-9697-8aa28e109cb5`, deployment `76e6f966-d069-4565-a7f9-9b2103a8ea47`, 100%; Worker 147 is rollback |
| Exact screenshot route | PASS over HTTP — `lawyer.juro.uz/ru/individual/dashboard` returns non-cacheable `307` to the exact `app.juro.uz` path |
| Query and method fence | PASS — `HEAD` retains query; cross-host `POST` returns `404` without `Location` |
| Fail-closed Lawyer boundary | PASS — unknown path remains `404`; canonical Lawyer dashboard retains its Lawyer-host login destination |
| Production health | PASS at capture — 8/8 operational, no incident at `2026-08-27T12:35:10.086Z` |
| Error-only tail | OBSERVED — one deployment-time `MalwareScannerContainer` Durable Object reset caused by the code update; no route failure was observed and status remained operational |
| Exact Chrome replay | PASS — a fresh reload of the original failing URL followed the live redirect to the authenticated Client dashboard at `app.juro.uz`. At 1920×945 it rendered one localized H1 with loaded fonts, private noindex metadata, zero overflow, no role alert and an empty warning/error log |

## Authenticated Client route and responsive smoke

An existing production Individual session was used read-only in Chrome to visit
21 Client routes: dashboard, AI chat, document builder, document review, cases,
documents, document comparison, action plan, calendar, archive, history,
consultations, lawyers, monitoring, notifications, billing, profile, settings,
security settings, privacy settings and help.

| Gate | Result |
| --- | --- |
| Desktop route loop | PASS — 21/21 retained the authenticated application shell, rendered one H1 after asynchronous settling, loaded fonts, exposed no role alert and had no horizontal overflow |
| Mobile route loop | PASS — 21/21 at `390×844` retained one H1, loaded fonts, exposed no role alert or horizontal overflow, kept the closed navigation inert/hidden and showed the mobile menu control |
| Mobile keyboard menu | PASS — opening moved focus to the close control; Escape closed the menu and restored focus to the trigger |
| Private indexing boundary | PASS — all sampled application documents declared `noindex, nofollow, nocache` |
| Chrome warning/error log | PASS — zero warning/error entries across the desktop route loop |
| Lawyer boundary | PARTIAL — `/ru/lawyer/dashboard` reached the dedicated Lawyer login with the expected Lawyer account type and return path; authenticated route replay requires a signed-in Lawyer session |
| Admin boundary | PARTIAL — `/ru/admin/console` reached the protected fresh-session handoff; authenticated Admin replay requires a fresh protected session |

No form was submitted, no file was uploaded and no production record was
created or changed. This browser pass did not provide complete request-level
network error coverage, so it is not represented as full workflow or API
verification. Business routes and authenticated Lawyer/Admin routes remain
outside this checkpoint.

## Worker 147 font-path correction

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `6503667cbf18f249656b29749040cda8b200fd47` |
| Focused normalizer tests | PASS — 3/3 |
| Local static gates | PASS — lint, type-check, production build, artifact validation and performance budgets |
| GitHub Actions CI `33063995387` | PASS — Website and Platform |
| Production dry-run | PASS — production bindings isolated; required secrets present; Container rollout disabled |
| Artifact path regression | PASS — zero `C:/Users/` and zero `.vinext/fonts` matches |
| Production deployment | PASS — Worker 147 `ed0253e1-1c35-416e-9f2a-5bd8352c1936`, deployment `6f536ee9-9666-41bb-b0f3-6f174019692b`, 100% |
| Production HTML and fonts | PASS — zero absolute path matches, 12 normalized font URLs, three sampled WOFF2 files `200 font/woff2` |
| Host/access smoke | PASS — expected Client `307`, API `401`, Lawyer `200/307`, Admin `303`, Status `200`, fenced application path `404` |
| Production health | PASS at capture — 8/8 operational, zero active incidents at `2026-08-27T11:02:55Z` |
| Chrome Status | PASS — complete DOM, fonts loaded, no absolute path, no warning/error log |
| Chrome authenticated Client dashboard | PASS — primary UI rendered, fonts loaded, no absolute path, no warning/error log |
| Worker error tail | PASS for smoke window — no error event observed |

The immediate Worker rollback is version 146
`c3237f9e-a258-42eb-8b94-62f5045b7b03`. Rollback would restore service code
but also restore the disclosed font path, so it is an incident-only fallback.

## 2026-08-25 release baseline

## Automated gates

| Gate | Result |
| --- | --- |
| Development deployable build | PASS |
| Rendered Worker/HTML suite | 34 passed, 0 failed |
| Core platform suite | 1083 passed, 0 failed |
| Cloudflare/config/queue suite | 201 passed, 0 failed |
| TypeScript type-check | PASS |
| ESLint | PASS |
| Migration safety and isolated restore | PASS; all migrations through 0159 apply, FK clean |
| Production artifact | PASS |
| Git diff whitespace check | PASS |
| GitHub Actions CI `32816221498` | PASS; Website and Platform |
| Website dependency hardening | PASS; 42/42 tests, type-check, lint, licence policy, artifact validation and 0 production audit vulnerabilities |
| Standard repository security scan `df6f1247-116c-42b8-b233-a693efb52263` | PASS within stated boundary; immutable `e4f407a8`, 1,898 tracked files, 8/8 planned surfaces, 0 reportable findings, PARTIAL coverage |
| Hardening diff scan `a2cb0d4a-7512-4b0a-aa5e-362681007619` | PASS; complete changed-source coverage for `e4f407a8..81aaf408`, 0 reportable findings |
| GitHub Actions CI `32829635485` | PASS on exact website source commit `81aaf408`; Website and Platform successful |
| Website metadata closure | PASS; 43/43 tests, type-check, lint, licence policy, artifact validation and 0 production audit vulnerabilities |
| Metadata diff scan `fa1b3e34-235b-48e6-8fb4-41e9f731f210` | PASS; complete changed-source coverage for `33d7f8e3..ee0687af`, 0 reportable findings |
| GitHub Actions CI `32836146215` | PASS on exact public source commit `ee0687af`; Website and Platform successful |
| Social-preview diff scan `1985bd83-d685-4ae3-8978-60f4f469d1e7` | PASS; complete changed-source coverage for `3f2bf72e..d0310b90`, 0 reportable findings |
| GitHub Actions CI `32838994132` | PASS on exact public source commit `d0310b90`; Website and Platform successful |

The production artifact stayed inside the checked-in regression budgets:
591.9 KiB CSS (600 KiB limit), 295.3 KiB initial browser JavaScript (320 KiB),
208.1 KiB largest lazy-route increment (240 KiB), 453.6 KiB fonts (512 KiB),
564.4 KiB images (640 KiB) and 3771.3 KiB Worker entry (6144 KiB).
These are emitted raw-byte budgets, not transfer sizes or Core Web Vitals.

## Production checks

- Four POST HTTP probes returned exact 308 HTTPS redirects with no-store.
- Client and Lawyer HTTPS login returned 200 with HSTS/noindex/no-store.
- Admin returned the expected 303 protected-session handoff.
- Status returned 200 and `overallStatus=operational` with eight operational
  components and no incidents.
- Unknown signed-share verification returned 410 `LINK_EXPIRED`, no-store and
  no session cookie.
- In-app browser DOM snapshots verified RU Client, UZ Client and the dedicated
  RU Lawyer login persona with labelled controls.
- Public sitemap crawl: 78/78 canonical URLs ended in 2xx, with no unexpected
  redirect or broken URL; every route also had exact canonical, complete
  RU/UZ/EN hreflang, explicit Open Graph title and expected indexability.

## Coverage boundaries

The earlier Codex Security scan was sealed as partial by risk-surface coverage
and found two medium/high-confidence signed-share issues; both are remediated
in this release. The later whole-repository Standard scan targeted immutable
`e4f407a8`, closed 8/8 planned surfaces and retained zero reportable findings.
It is still classified PARTIAL because independent delegated review, TAC and
destructive production testing were unavailable. Neither scan is represented
as an exhaustive proof that no vulnerability exists.

No live share existed in production, so the fifth-failure 429 path was not
rehearsed against user data. Worker 151 now has a Lighthouse snapshot plus
desktop and 320 px Chrome traces for the login surface, but that bounded lab
evidence does not cover field CrUX, INP, every application route or
screen-reader behavior. Physical iOS/Android, Edge, Firefox, Safari/WebKit and
native page zoom remain intentionally not tested under the current QA boundary.

Post-deploy public QA for Sites version 82 verified affected RU/UZ/EN legal,
lawyer and video DOM states, canonical/hreflang/Open Graph/Twitter metadata, no
horizontal overflow, an empty in-app browser log, 78/78 sitemap URLs passing
every checked SEO/social field, canonical `robots.txt`, public security headers, private
app/lawyer/admin no-store/noindex boundaries and an operational 8/8 status
response. CDP screenshot capture timed out and is not claimed as evidence.

## 2026-08-27 public Sites performance expansion

Live Sites v86 RU-home Chrome evidence passed the goal thresholds under a
`390×844` mobile/touch, 4× CPU and Fast 4G profile: LCP 1,956 ms, TTFB 234 ms
and CLS 0.0001. A separate 16-second observer recorded CLS 0.0012. Controlled
Lighthouse 13.4.1 scored 100 Accessibility, 100 Best Practices, 100 SEO and
100 Agentic Browsing, with 59 passed and 0 failed. The raw JSON/HTML reports
and hashes are in `docs/qa/artifacts/performance-sites-v86/`.

Production v86 also revealed conditional revalidation on every fingerprinted
static asset. Commit `5d543218` fixes both current `/_next/static/*` and newer
`/assets/*` output while leaving HTML non-cacheable. Local website type-check,
lint, production build, artifact validation and 44/44 tests passed. GitHub CI
`33095467495` passed Website in 51 seconds and Platform in 7 minutes 34
seconds. Sites v87 was saved from exact runtime commit `a60df03f` but is not
represented as live until the required public-deployment approval and
post-deploy checks complete.

## 2026-08-27 local plaintext backup cleanup

The two price-configuration SQL exports and two manifests were downloaded again
from private R2 prefix
`d1/juro-production/20260825T074158Z-price-config-f42c48fc/`. Each file matched
its recorded byte size and SHA-256 value. The exact local source directory and
temporary verification directory were deleted after that proof; both
`Test-Path` checks returned false and exact parent-directory match counts were
zero. The private R2 objects remain the recovery source.
