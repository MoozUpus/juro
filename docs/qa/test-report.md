# Test report — current evidence through 2026-08-27

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
rehearsed against user data. No Lighthouse/Chrome trace ran because the
`chrome-devtools` MCP was unavailable. Physical iOS/Android, Edge, Firefox,
Safari/WebKit and native page zoom remain intentionally not tested under the
current QA boundary.

Post-deploy public QA for Sites version 82 verified affected RU/UZ/EN legal,
lawyer and video DOM states, canonical/hreflang/Open Graph/Twitter metadata, no
horizontal overflow, an empty in-app browser log, 78/78 sitemap URLs passing
every checked SEO/social field, canonical `robots.txt`, public security headers, private
app/lawyer/admin no-store/noindex boundaries and an operational 8/8 status
response. CDP screenshot capture timed out and is not claimed as evidence.
