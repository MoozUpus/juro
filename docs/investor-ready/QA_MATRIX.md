# QA matrix

This file is updated with evidence during release. `VERIFIED` means the named environment and mode were actually exercised. `PARTIAL` means a narrower check passed. `NOT TESTED` is intentional and is never upgraded from emulation.

## Browser and device policy

| Target | Status | Scope |
| --- | --- | --- |
| Chrome desktop | PENDING | Authenticated production role and flow QA after deployment |
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
| Guest | Public site, public lawyer directory/profile, auth redirects | PENDING |
| Client | Dashboard, AI, documents, marketplace, request, chat, consultation, demo billing | PENDING |
| Lawyer | Dedicated host, dashboard, request/client/matter access, tasks, knowledge, call, billing, profile | PENDING |
| Admin | Host handoff, lawyer controls, deletion request, fees, transaction/audit | PENDING |
| Cross-role | Foreign client, document, billing and admin route denial | PARTIAL — automated backend tests |

## Theme matrix

| Surface | Light | Dark | System |
| --- | --- | --- | --- |
| `juro.uz` | PENDING | PENDING | PENDING |
| `app.juro.uz` auth/dashboard | PENDING | PENDING | PENDING |
| `lawyer.juro.uz` dashboard/workspace | PENDING | PENDING | PENDING |
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
| D1 backup/restore and migrations | PENDING |
| Cloudflare Calls TURN secret | PENDING |
| Production deployment | PENDING |
| `/api/status` after deployment | PENDING |
| Authenticated Chrome QA | PENDING |
