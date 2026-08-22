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
- Platform Worker production version: `873f178f-2b82-4793-ba6a-8a506f348d0d`.
- Public routing Worker production version: `b87fb3e5-65f3-45ea-9d73-c4ff31d57116`.
- Sites version 70 is live. Sites version 72 contains the canonical unlocalized lawyer-profile route and is saved but not yet published.

## Production URL smoke

| URL | Evidence |
| --- | --- |
| `https://juro.uz/` | 200 |
| `https://www.juro.uz/` | 308 to canonical `juro.uz`; path and query are retained |
| `https://juro.uz/lawyers` | 308 to `/ru/lawyers`, then 200 |
| `https://juro.uz/lawyers/{profileId}` | 404 on Sites 70; fixed and validated in saved Sites 72, public verification pending |
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

## Validation

- Website: build and 41/41 tests passed; type-check and lint passed.
- Platform: production build/artifact and performance budgets passed; full test command, type-check and lint passed.
- Draft PR: [#64](https://github.com/MoozUpus/juro/pull/64).

## Remaining release evidence

- Publish Sites version 72 and verify the unlocalized public lawyer profile in production.
- Reconnect the user-approved Chrome extension and establish fresh client, lawyer and admin sessions for the authenticated role suite.
- Complete responsive, theme, zoom, reduced-motion, call preflight/two-participant media and scripted investor rehearsal checks in Chrome.
- Edge, Firefox, Safari/WebKit and physical iPhone/iPad/Android remain intentionally `NOT TESTED` by explicit user instruction.
