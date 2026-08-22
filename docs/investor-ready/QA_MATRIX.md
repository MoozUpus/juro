# QA matrix

This file is updated with evidence during release. `VERIFIED` means the named environment and mode were actually exercised. `PARTIAL` means a narrower check passed. `NOT TESTED` is intentional and is never upgraded from emulation.

## Browser and device policy

| Target | Status | Scope |
| --- | --- | --- |
| Chrome desktop | PARTIAL | Lawyer dashboard rendered at 1536×770 / DPR 1.25 with Manrope, no horizontal overflow and no console warnings; the session then expired and the Chrome extension disconnected before the full role suite |
| Chrome responsive 360/390/768/1366/1440 | PENDING | Light, Dark and System; overflow and critical navigation |
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
| Guest | Public site, public lawyer directory/profile, auth redirects | PARTIAL — production HTTP/redirect coverage; Chrome visual pass pending reconnection |
| Client | Dashboard, AI, documents, marketplace, request, chat, consultation, demo billing | PENDING |
| Lawyer | Dedicated host, dashboard, request/client/matter access, tasks, knowledge, call, billing, profile | PENDING |
| Admin | Host handoff, lawyer controls, deletion request, fees, transaction/audit | PENDING |
| Cross-role | Foreign client, document, billing and admin route denial | PARTIAL — automated backend tests |

## Theme matrix

| Surface | Light | Dark | System |
| --- | --- | --- | --- |
| `juro.uz` | PENDING | PENDING | PENDING |
| `app.juro.uz` auth/dashboard | PENDING | PENDING | PENDING |
| `lawyer.juro.uz` dashboard/workspace | PARTIAL | PENDING | PARTIAL |
| Documents/calendar/marketplace/profile | PENDING | PENDING | PENDING |
| Admin | PENDING | PENDING | PENDING |

Automated tests already enforce the shared-cookie precedence rule and cross-host scope. Visual status remains pending until Chrome verification.

## Release gates

| Gate | Status |
| --- | --- |
| Monorepo lint/type-check | VERIFIED locally |
| Website build/tests | VERIFIED locally |
| Platform focused regression tests | VERIFIED locally |
| Full platform suite | VERIFIED locally — core 1060/1060 and Cloudflare 201/201 |
| Production artifact | VERIFIED locally — production bindings/artifact and performance gates |
| D1 backup/restore and migrations | VERIFIED — pre/post private R2 backup readback hashes matched; post restore `quickCheck=ok`, zero FK violations; `0146`–`0151` applied with no pending migrations; bounded demo counts 3 accounts / 3 payments / 1 published lawyer |
| Cloudflare Calls TURN secret | VERIFIED — Realtime TURN application created and both production Worker secrets bound; secret values were never written to the repository or evidence |
| Production deployment | PARTIAL — platform Worker `873f178f-2b82-4793-ba6a-8a506f348d0d`; public Worker `b87fb3e5-65f3-45ea-9d73-c4ff31d57116`; Sites 70 live; Sites 72 saved and awaiting action-time publish approval |
| `/api/status` after deployment | VERIFIED — generated `2026-08-22T10:42:32.147Z`, overall operational, 8/8 components operational, 0 active incidents |
| Authenticated Chrome QA | PENDING |
