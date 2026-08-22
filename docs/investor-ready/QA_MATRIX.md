# QA matrix

This file is updated with evidence during release. `VERIFIED` means the named environment and mode were actually exercised. `PARTIAL` means a narrower check passed. `NOT TESTED` is intentional and is never upgraded from emulation.

## Browser and device policy

| Target | Status | Scope |
| --- | --- | --- |
| Chrome desktop | PARTIAL | Public, full non-call Client and full non-call Lawyer route suites rendered at desktop sizes with Manrope and no new console warnings. Fresh-MFA Admin overview/routes, fee matrix, the final localized overview polish and the post-`0155` platform audit-log replay passed. Two authenticated Chrome profiles completed device preflight and a two-party TURN-ready WebRTC call; zoom/reduced-motion, selected-source screen sharing and forced reconnect remain open |
| Chrome responsive 320/360/375/390/430/768/820/1024/1280/1366/1440/1728/1920 | PARTIAL | The public lawyer catalogue, authenticated Client dashboard and final isolated Admin overview passed every listed width without horizontal overflow. Below the wide breakpoints, the observed content width was the requested width minus the 15-pixel vertical scrollbar. Representative Lawyer dashboard/monitoring/AI/billing/profile coverage passed at 360/390/768/1366/1440; full all-route coverage at every width is not claimed |
| Chrome zoom 125% / 200% | PENDING | Key client/lawyer/admin screens; native browser zoom has not yet been verified |
| Windows scale 125% | VERIFIED | Live Chrome reported `devicePixelRatio=1.25`; this is host evidence, not a browser-zoom substitute |
| Windows scale 150% | PENDING | Not changed or inferred from the 125% host setting |
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
| Admin | Host handoff, lawyer controls, deletion request, fees, transaction/audit | PARTIAL — TOTP enrollment and fresh-MFA host handoff passed; isolated overview/lawyers/reviews/legal-corpus plus fee matrix, sandbox transactions and configuration audit passed. Production D1 confirms one active synthetic trial and one pending synthetic profile-deletion request. The D1 compound-query P1 and hash-constraint fault were fixed, and the final fresh-MFA Chrome audit-log replay plus immutable access events passed. The platform trial/deletion screen still needs a final visual replay because local Chrome navigation to `/ru/admin/lawyer-profiles` returns `ERR_BLOCKED_BY_CLIENT` before the Worker is reached |
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
| Full platform suite | VERIFIED locally and in GitHub CI run `32587993713` — rendered HTML 33/33, core 1064/1064 and Cloudflare 201/201; branch commit `adb69605` passed both Platform and Website jobs |
| Production artifact | VERIFIED locally — production bindings/artifact and performance gates |
| D1 backup/restore and migrations | VERIFIED — earlier `0146`–`0154` and corrective `0155` are applied with no pending migrations. The `0155` pre/post full exports and manifests were uploaded to private R2 and downloaded with exact SHA-256 matches; isolated restores returned `quickCheck=ok` and zero FK violations, and the live remote `foreign_key_check` is empty. Remote `quick_check` hit the documented D1 `SQLITE_NOMEM` ceiling and is not misreported as a remote pass |
| Cloudflare Calls TURN secret | VERIFIED — production TURN key rotated, both Worker secrets rebound without printing or persisting their values, and both participants received `relayAvailable=true`; the production room recorded `provider=cloudflare_realtime_turn` |
| Production deployment | VERIFIED — platform Worker `727eacbe-7fb6-4012-87a9-3e290edd525b`; isolated admin Worker `9cdbf8b1-ae02-4c32-9941-85d593064038`; public Worker `b87fb3e5-65f3-45ea-9d73-c4ff31d57116`; Sites 74 live; canonical catalogue/profile redirects and neutral auto-publication labels verified in Chrome |
| `/api/status` after deployment | VERIFIED — after the immediate no-incident stale probe aged out, the scheduled production probe returned operational. The final pre-commit read generated `2026-08-22T17:59:06.166Z`: overall operational, 8/8 components operational, no stale/degraded component and zero incident |
| Authenticated Chrome QA | PARTIAL — Client and Lawyer non-call desktop suites complete; the Client dashboard and latest Admin overview passed all 13 requested widths, while representative Lawyer widths passed; live grounded Client AI and direct Lex.uz source passed; camera/microphone preflight, synchronized two-party WebRTC, mute/camera controls and simultaneous clean end-call passed. The post-`0155` fresh-MFA audit-log replay and immutable D1 access events passed. Native zoom/reduced-motion, screen-share source selection, forced reconnect and the platform trial/deletion visual replay remain open |
