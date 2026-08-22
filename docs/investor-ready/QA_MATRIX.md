# QA matrix

This file is updated with evidence during release. `VERIFIED` means the named environment and mode were actually exercised. `PARTIAL` means a narrower check passed. `NOT TESTED` is intentional and is never upgraded from emulation.

## Browser and device policy

| Target | Status | Scope |
| --- | --- | --- |
| Chrome desktop | PARTIAL | Public home, client dashboard baseline and authenticated lawyer workspace rendered at desktop sizes with Manrope and no console warnings. Client full route suite and fresh-admin retest remain open |
| Chrome responsive 360/390/768/1366/1440 | PARTIAL | Public home/catalogue/profile/trust and authenticated lawyer dashboard/monitoring/AI/billing/profile verified across the five named widths with no page overflow or console warnings. Client/admin widths remain open |
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
| Client | Dashboard, AI, documents, marketplace, request, chat, consultation, demo billing | PENDING |
| Lawyer | Dedicated host, dashboard, request/client/matter access, tasks, knowledge, call, billing, profile | PARTIAL — all non-call routes, Light/Dark/System and five responsive widths verified in authenticated Chrome; media call remains open |
| Admin | Host handoff, lawyer controls, deletion request, fees, transaction/audit | PARTIAL — authenticated overview/lawyers/reviews/legal-corpus desktop smoke passed; live Chrome found and triggered a deployed Manrope/mobile-table fix, but fresh-MFA after-state and platform fee/audit routes remain open |
| Cross-role | Foreign client, document, billing and admin route denial | PARTIAL — automated backend tests |

## Theme matrix

| Surface | Light | Dark | System |
| --- | --- | --- | --- |
| `juro.uz` | VERIFIED | VERIFIED | VERIFIED |
| `app.juro.uz` auth/dashboard | PENDING | PENDING | PENDING |
| `lawyer.juro.uz` dashboard/workspace | VERIFIED | VERIFIED | VERIFIED |
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
| Production deployment | VERIFIED — platform Worker `e16811d5-4aef-406d-8977-0e62710f2e35`; isolated admin Worker `3cf862e1-a501-40e0-b122-2ff48fea224e`; public Worker `b87fb3e5-65f3-45ea-9d73-c4ff31d57116`; Sites 72 live; canonical catalogue/profile redirects verified with retained query strings |
| `/api/status` after deployment | VERIFIED — generated `2026-08-22T11:34:32.501Z`, overall operational, 8/8 components operational, no active incidents |
| Authenticated Chrome QA | PARTIAL — lawyer suite complete except call media; client and fresh-MFA admin suites remain open |
