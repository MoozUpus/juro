# Production evidence — 2026-08-22

This is a current-state release record, not a blanket completion claim. Browser and device gaps remain governed by `QA_MATRIX.md`.

## Database and synthetic demo data

- Production D1 migrations `0146` through `0151` were applied sequentially; the production migration list reported no remaining migrations.
- Pre- and post-migration exports were restored locally. The post-migration restore returned `quickCheck=ok`, zero foreign-key violations, 150 migrations, 278 tables, 598 indexes and 369 triggers.
- Private R2 upload/readback SHA-256 checks matched for both exports. Verified local plaintext SQL/SQLite/readback copies were then removed.
- Bounded production checks returned exactly three active demo-account registry rows, three synthetic payment rows and one consent-published demo lawyer.

## Realtime and deployment

- Cloudflare Realtime was activated and a TURN application named `juro-production-webrtc` was created.
- `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_KEY_API_TOKEN` were transmitted directly to Worker `juro` as secrets. Values were not printed, written to disk or committed.
- Platform Worker production version: `e16811d5-4aef-406d-8977-0e62710f2e35`.
- Isolated admin Worker production version: `3cf862e1-a501-40e0-b122-2ff48fea224e`.
- Public routing Worker production version: `b87fb3e5-65f3-45ea-9d73-c4ff31d57116`.
- Sites version 72 is live. It contains the canonical unlocalized lawyer catalogue and profile redirects.

## Production URL smoke

| URL | Evidence |
| --- | --- |
| `https://juro.uz/` | 200 |
| `https://www.juro.uz/` | 308 to canonical `juro.uz`; path and query are retained |
| `https://juro.uz/lawyers` | 308 to `/ru/lawyers`, then 200 |
| `https://juro.uz/lawyers/{profileId}` | Sites 72: 308 to `/ru/lawyers/{profileId}` with the query string retained, then 200 |
| `https://app.juro.uz/` | 307 to localized authentication for an unauthenticated request |
| `https://lawyer.juro.uz/` | 200; protected professional routes enforce authentication |
| `https://admin.juro.uz/` | 303 to the isolated app admin handoff surface |
| `https://status.juro.uz/` | 200 |
| `https://staging.app.juro.uz/` | 302 to Cloudflare Access |
| `https://admin.staging.juro.uz/` | 302 to Cloudflare Access |
| `https://status.staging.juro.uz/` | 200 |

Repository-only or inactive names `staging.juro.uz`, `app.staging.juro.uz`, `lawyer.staging.juro.uz`, `api.juro.uz` and `local.juro.uz` have no live A/AAAA answer and are not represented as production surfaces.

## Health

At `2026-08-22T10:42:32.147Z`, `/api/status` returned `overallStatus=operational`, all eight published components operational and no active incidents. A request made during the immediate post-deploy probe refresh briefly observed stale evidence; the subsequent authoritative response was operational after the scheduled/synthetic probes completed.

A later read at `2026-08-22T11:01:37.131Z` again returned `overallStatus=operational`, all eight components operational and no incidents. The public sitemap smoke followed all 78 canonical URLs without a 4xx/5xx response.

After the final monitoring-layout deployment, a read at `2026-08-22T11:34:32.501Z` remained `overallStatus=operational`, with all eight components operational and no active incidents.

## Authenticated Chrome evidence

- Public Chrome evidence covered the RU home, catalogue, consent-published demo
  profile and Trust Center. Light, Dark and System modes and 360/390/768/1366/1440
  representative widths passed without page overflow or console warnings.
- Lawyer production routes verified without console warnings or page overflow: dashboard; requests, schedule, matters, clients, messages, documents and tasks; profile; calendar; security; billing; AI chat; document builder/review; monitoring; knowledge; settings; demo payments; and help.
- Lawyer Light, Dark and System modes switched visibly and returned the matching `aria-pressed` state. System was restored after the check.
- Chrome responsive evidence passed at 360, 390, 768, 1366 and 1440 pixels for representative lawyer dashboard, monitoring, AI, billing and profile surfaces.
- The live Lex.uz feed exposed a two-level intrinsic grid-width defect. Commits `49ceed62` and `9dc062fa` constrained the feed and cards; the post-deploy desktop measurement changed from 3013 pixels of document width to 1521/1536, while the 390-pixel viewport measured 375/390 with no overflow.
- The isolated admin console had passed authenticated desktop route smoke for overview, lawyers, reviews and legal corpus. Chrome then exposed Inter typography and a 390-pixel lawyer-table overflow. Admin Worker `3cf862e1-a501-40e0-b122-2ff48fea224e` self-hosts Manrope and contains tables; public `/health` and the immutable WOFF2 response are verified. A fresh-MFA after-state browser capture remains open.

## Validation

- Website: build and 41/41 tests passed; type-check and lint passed.
- Platform: production build/artifact and performance budgets passed; full test command, type-check and lint passed.
- Draft PR: [#64](https://github.com/MoozUpus/juro/pull/64).

## Remaining release evidence

- Establish a sequential client session and renew the short-lived admin MFA session for the remaining authenticated route suite.
- Complete client/admin responsive and theme checks, Chrome zoom, reduced-motion, call preflight/two-participant media and scripted investor rehearsal checks.
- Edge, Firefox, Safari/WebKit and physical iPhone/iPad/Android remain intentionally `NOT TESTED` by explicit user instruction.
