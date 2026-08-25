# Test report — a3f22f87 / production 357d0438

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
- Public sitemap crawl: 33/33 canonical URLs ended in 2xx, with no unexpected
  redirect or broken URL.

## Coverage boundaries

The Codex Security scan was sealed as partial by risk-surface coverage and
found two medium/high-confidence signed-share issues; both are remediated in
this release. It is not represented as an exhaustive repository security
proof.

No live share existed in production, so the fifth-failure 429 path was not
rehearsed against user data. No Lighthouse/Chrome trace ran because the
`chrome-devtools` MCP was unavailable. Physical iOS/Android, Edge, Firefox,
Safari/WebKit and native page zoom remain intentionally not tested under the
current QA boundary.
