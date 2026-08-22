# QA matrix

This file is updated with evidence during release. `VERIFIED` means the named environment and mode were actually exercised. `PARTIAL` means a narrower check passed. `NOT TESTED` is intentional and is never upgraded from emulation.

## Browser and device policy

| Target | Status | Scope |
| --- | --- | --- |
| Chrome desktop | PARTIAL | Public, full non-call Client and full non-call Lawyer route suites rendered at desktop sizes with Manrope and no new console warnings. Fresh-MFA Admin overview/routes and fee matrix passed. Two authenticated Chrome profiles completed device preflight and a two-party TURN-ready WebRTC call; the latest Admin polish and post-fix platform audit-log replay still need a new fresh-MFA session |
| Chrome responsive 360/390/768/1366/1440 | PARTIAL | Public home/catalogue/profile/trust, authenticated Client dashboard and authenticated Lawyer dashboard/monitoring/AI/billing/profile verified across the five named widths with no page overflow or console warnings. Admin console widths remain open |
| Chrome zoom 125% | PENDING | Key client/lawyer/admin screens |
| Reduced motion | PENDING | Key animated states in Chrome |
| Edge | NOT TESTED | Explicitly excluded by the user |
| Firefox | NOT TESTED | Explicitly excluded by the user |
| Safari/WebKit | NOT TESTED | Explicitly excluded by the user |
| Physical iPhone/iPad | NOT TESTED | Explicitly excluded by the user |
| Physical Android | NOT TESTED | Explicitly excluded by the user |

## Role flows

| Role | Flow | Status |
| --- | --- | --- |
| Guest | Public site, public lawyer directory/profile, auth redirects | VERIFIED — production HTTP/redirect plus Chrome home, catalogue, demo profile and trust surfaces; Light/Dark/System and representative responsive widths passed |
| Client | Dashboard, AI, documents, marketplace, request, chat, consultation, demo billing | PARTIAL — production replay covered every named non-call surface, exact case/access-grant/messages/consultation state, source-linked task notification, themes, responsive dashboard widths and foreign Lawyer-route denial. Client Demo completed device preflight, a live two-party call and a terminal grounded AI answer whose direct official Lex.uz source was opened in Chrome. Screen-share source selection and forced reconnect remain open |
| Lawyer | Dedicated host, dashboard, request/client/matter access, tasks, knowledge, call, billing, profile | PARTIAL — all non-call routes, Light/Dark/System and five responsive widths verified in authenticated Chrome; timer, conflict, knowledge and simulated-payment records were confirmed in production D1. Lawyer Demo completed device preflight, two-party media and clean end-call state |
| Admin | Host handoff, lawyer controls, deletion request, fees, transaction/audit | PARTIAL — TOTP enrollment and fresh-MFA host handoff passed; isolated overview/lawyers/reviews/legal-corpus plus fee matrix, sandbox transactions and configuration audit passed. A discovered D1 compound-query audit-log P1 is fixed/deployed, but post-fix visual replay is blocked locally by Chrome `ERR_BLOCKED_BY_CLIENT` |
| Cross-role | Foreign client, document, billing and admin route denial | PARTIAL — automated backend tests plus production Client denial of a Lawyer route without data exposure |

## Theme matrix

| Surface | Light | Dark | System |
| --- | --- | --- | --- |
| `juro.uz` | VERIFIED | VERIFIED | VERIFIED |
| `app.juro.uz` auth/dashboard | VERIFIED | VERIFIED | VERIFIED |
| `lawyer.juro.uz` dashboard/workspace | VERIFIED | VERIFIED | VERIFIED |
| Documents/calendar/marketplace/profile | PARTIAL | PARTIAL | VERIFIED — desktop Client suite rendered under restored System; explicit Light/Dark screenshots are dashboard-scoped |
| Admin | VERIFIED — fixed-light fresh-MFA overview and billing surfaces | NOT SUPPORTED — the isolated console has no theme control | NOT SUPPORTED — the isolated console has no theme control |

Automated tests already enforce the shared-cookie precedence rule and cross-host scope. The isolated Admin console intentionally exposes a fixed-light operational surface rather than a user theme selector.

## Release gates

| Gate | Status |
| --- | --- |
| Monorepo lint/type-check | VERIFIED locally |
| Website build/tests | VERIFIED locally |
| Platform focused regression tests | VERIFIED locally |
| Full platform suite | VERIFIED locally — rendered HTML 32/32, core 1061/1061 and Cloudflare 201/201 |
| Production artifact | VERIFIED locally — production bindings/artifact and performance gates |
| D1 backup/restore and migrations | VERIFIED — pre/post private R2 backup readback hashes matched; latest post restore `quickCheck=ok`, zero FK violations; `0146`–`0154` applied with no pending migrations; live inventory 153 migrations / 280 tables / 601 indexes / 371 triggers |
| Cloudflare Calls TURN secret | VERIFIED — production TURN key rotated, both Worker secrets rebound without printing or persisting their values, and both participants received `relayAvailable=true`; the production room recorded `provider=cloudflare_realtime_turn` |
| Production deployment | VERIFIED — platform Worker `727eacbe-7fb6-4012-87a9-3e290edd525b`; isolated admin Worker `7f939eb7-7c5b-4bde-9435-24031f2e3c72`; public Worker `b87fb3e5-65f3-45ea-9d73-c4ff31d57116`; Sites 74 live; canonical catalogue/profile redirects and neutral auto-publication labels verified in Chrome |
| `/api/status` after deployment | VERIFIED — after the immediate no-incident stale probe aged out, the scheduled production probe generated `2026-08-22T16:40:54.780Z`: overall operational, 8/8 components operational, no stale dependencies and no active incidents |
| Authenticated Chrome QA | PARTIAL — Client and Lawyer non-call desktop suites complete; both named responsive suites complete; live grounded Client AI and direct Lex.uz source passed; Admin fresh MFA and fee matrix passed before the latest polish; camera/microphone preflight, synchronized two-party WebRTC, mute/camera controls and simultaneous clean end-call passed. Audit-log/latest-Admin replay, Admin responsive, zoom/reduced-motion, screen-share source selection and forced reconnect remain open |
