# Production evidence — 2026-08-22

This is a current-state release record, not a blanket completion claim. Browser and device gaps remain governed by `QA_MATRIX.md`.

## Database and synthetic demo data

- Production D1 migrations `0146` through `0154` were applied sequentially; a fresh production migration list reported no remaining migrations.
- Pre- and post-migration exports were restored locally. The latest post-migration restore returned `quickCheck=ok` and zero foreign-key violations. The live read-only schema inventory reports 153 migrations, 280 tables, 601 non-system indexes and 371 triggers, ending at `0154_monitoring_task_sources.sql`.
- Private R2 upload/readback SHA-256 checks matched for both exports. Verified local plaintext SQL/SQLite/readback copies were then removed.
- Bounded production checks returned exactly three active demo-account registry rows and one consent-published demo lawyer. A later Chrome rehearsal created one additional, explicitly simulated payment run; it is recorded below rather than represented as a real transaction.

## Realtime and deployment

- Cloudflare Realtime was activated and a TURN application named `juro-production-webrtc` was created.
- `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_KEY_API_TOKEN` were transmitted directly to Worker `juro` as secrets. Values were not printed, written to disk or committed.
- Platform Worker production version: `8a77ac8a-ea99-4455-9643-834ca683d67c`.
- Isolated admin Worker production version: `d7d732b5-acaa-4b82-b5c4-6c729a1ba511`.
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

After the monitoring-task, lawyer-layout, Turnstile-locale and audit-query deployments, a fresh read at `2026-08-22T14:14:22.408Z` remained `overallStatus=operational`, with all eight components operational and no active incidents.

After the final official-URL hardening and Admin localization deployment, a fresh read at `2026-08-22T14:37:45.993Z` again returned `overallStatus=operational`, all eight components operational and zero active incidents.

## Authenticated Chrome evidence

- Public Chrome evidence covered the RU home, catalogue, consent-published demo
  profile and Trust Center. Light, Dark and System modes and 360/390/768/1366/1440
  representative widths passed without page overflow or console warnings.
- Lawyer production routes verified without console warnings or page overflow: dashboard; requests, schedule, matters, clients, messages, documents and tasks; profile; calendar; security; billing; AI chat; document builder/review; monitoring; knowledge; settings; demo payments; and help.
- Lawyer Light, Dark and System modes switched visibly and returned the matching `aria-pressed` state. System was restored after the check.
- Chrome responsive evidence passed at 360, 390, 768, 1366 and 1440 pixels for representative lawyer dashboard, monitoring, AI, billing and profile surfaces.
- The live Lex.uz feed exposed a two-level intrinsic grid-width defect. Commits `49ceed62` and `9dc062fa` constrained the feed and cards; the post-deploy desktop measurement changed from 3013 pixels of document width to 1521/1536, while the 390-pixel viewport measured 375/390 with no overflow.
- The deployed monitoring action created a real tenant-scoped task from one live Lex.uz metadata event, retained the exact official source and exact case, and produced a client notification linking to that task. Both Client and Lawyer production Chrome views rendered the source safely.
- The Client production route replay covered dashboard, saved clarification-first AI history, populated synthetic document/preview, lawyer marketplace/profile, accepted request, active access grant, messages, confirmed consultation, case plan, calendar, billing/demo payments, notifications, profile, settings, security and monitoring. The desktop pages used Manrope, showed no page overflow, and the client was denied a foreign lawyer route without data exposure. Light, Dark and System theme controls passed and System was restored.
- The Lawyer rehearsal started and stopped a five-second billable timer, ran a one-result conflict check with the human-review warning, created a case-linked favourite knowledge note, and executed an isolated demo payment through `previewed → succeeded → refunded`. Read-only production D1 checks confirmed all four records; the payment remained `provider=demo`, `is_simulation=1`.
- A fresh UZ Lawyer login after Worker `fb5607d6-679b-46b6-92c0-e92c612dd240` produced an empty console log. The client now maps RU to Turnstile `ru` and UZ to `auto`, avoiding the unsupported-language fallback warning without weakening server verification.
- Admin Demo enrolled a new TOTP factor. The first diagnostic enrollment was replaced and is `disabled`; the second is `active`, with no failed verification attempts. A fresh-MFA handoff then created a separate, 15-minute host-only production Admin session.
- The fresh Admin session verified `admin.juro.uz` overview, lawyer profiles, review moderation and Legal Corpus in Chrome with Manrope and no desktop overflow. D1 append-only evidence records the issued/consumed handoff and each route view. The fresh-MFA fee matrix also loaded 1%, active 2%/5% rules, sandbox-only transactions and immutable configuration history with 1521/1521 layout width.
- Chrome found a production audit-log P1: D1 rejected the previous seven-term compound SELECT. The fix first shipped in Worker `073aac71-2aa2-4083-948e-1c4c12f1fd68` and is retained in current Worker `8a77ac8a-ea99-4455-9643-834ca683d67c`: bounded allowlisted per-source queries plus a safe top-N merge. Focused tests and all seven production D1 source queries succeeded read-only. The post-deploy visual API replay remains open because the local Chrome client subsequently blocked all `app.juro.uz/ru/admin/*` navigation with `ERR_BLOCKED_BY_CLIENT` before a request reached the Worker.

## Validation

- Website: build and 41/41 tests passed; type-check and lint passed.
- Platform: production build/artifact and performance budgets passed; rendered HTML 32/32, core 1061/1061, Cloudflare 201/201, the final focused set 28/28, type-check and lint passed.
- Isolated Admin: type-check and production dry-run passed; the current Worker localizes the remaining overview KPI label.
- Draft PR: [#64](https://github.com/MoozUpus/juro/pull/64).

## Remaining release evidence

- Re-run the deployed platform audit-log API in Chrome after clearing the local `ERR_BLOCKED_BY_CLIENT` condition; do not infer this browser pass from unit/D1 evidence.
- Complete client/admin responsive widths, Chrome zoom, reduced-motion, call preflight/two-participant media and the final scripted investor rehearsal.
- Edge, Firefox, Safari/WebKit and physical iPhone/iPad/Android remain intentionally `NOT TESTED` by explicit user instruction.
