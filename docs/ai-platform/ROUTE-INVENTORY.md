# Platform route inventory — 2026-08-27

The canonical cross-domain register is
[`docs/audit/domain-route-inventory.md`](../audit/domain-route-inventory.md).
This file records the Platform route families and their server boundaries.

The previous statement that `app.juro.uz` was staging is obsolete. Current
Cloudflare Worker-domain evidence maps `app.juro.uz`, `lawyer.juro.uz`,
`admin.juro.uz` and `status.juro.uz` to production Worker `juro`.
`staging.app.juro.uz` and `status.staging.juro.uz` map to
`juro-platform-staging`; `admin.staging.juro.uz` maps to
`juro-admin-staging`.

## Source scope

At commit `6503667cbf18f249656b29749040cda8b200fd47`, `apps/platform/app`
contains:

- 164 `page.tsx` declarations;
- 239 `route.ts` handlers;
- 195 `/api` handlers;
- 44 non-API RSC, compatibility or wrapper handlers.

These counts do not prove that every dynamic expansion is live or authorized.
The Worker host router, server permission checks, feature flags and live
deployment control the effective surface.

## Canonical route families

| Area | Canonical route | Access boundary | Current evidence | Status |
| --- | --- | --- | --- | --- |
| Authentication | `/:locale/auth/*`, `/login`, `/register`, `/onboarding` | OTP, Turnstile, session and safe `returnTo` | Production login redirects and automated auth suites pass | **PARTIAL** — live OTP journey not repeated in this inventory |
| Dashboard | `/:locale/:accountType/dashboard` | Session, account type and active workspace | Anonymous production deep link returns to exact login destination | **PARTIAL** — signed-in production route not repeated |
| AI Lawyer | `/:locale/:accountType/ai-chat`, `/ai-lawyer/new`, `/ai-lawyer/chat/:chatId`, `/ai-lawyer/voice` | Session, tenant, quotas, provider health and feature gates | Source/build/CI coverage plus prior signed-in evidence | **PARTIAL** — no paid production prompt sent during this inventory |
| Document Builder | `/:locale/:accountType/document-builder` and canonical create/id routes | Owner/collaborator authorization and autosave | Automated route, UUID and artifact tests pass | **PARTIAL** — live signed-in create/save/refresh not repeated |
| Review and comparison | `/:locale/:accountType/document-review` and private APIs | Tenant, file authorization, quarantine and scanner | Automated security and workflow suites pass | **PARTIAL** — no production upload performed |
| Cases, plans and calendar | `/:locale/:accountType/cases`, `/action-plan`, `/calendar` | Tenant membership and object-level authorization | Anonymous API fails closed with `401`; prior authenticated evidence exists | **PARTIAL** |
| Lawyer directory | `/:locale/:accountType/lawyers` | Session; only approved, publishable profiles | Source and prior production evidence | **PARTIAL** — current signed-in marketplace journey open |
| Professional Lawyer | Clean paths on `lawyer.juro.uz/:locale/lawyer/*` and `/api/platform/lawyer-profile` | Server-selected Lawyer host, role and workspace | Dedicated host/login boundary verified | **PARTIAL** |
| Admin | `/:locale/admin/*` | Staff capability and fresh MFA; isolated Admin service binding | Production handoff to the app console is protected | **PARTIAL** — current-MFA read/write matrix open |
| Public shares/invitations | Signed share and invitation routes | Signed token, expiry, scope, noindex/no-store | Automated fail-closed suites pass | **PARTIAL** — current production token lifecycle not replayed |
| Status | `/`, `/status`, `/api/status` on status hostnames | Explicit hostname fence; no application session/data | Status `200`, application route `404`, noindex, normalized fonts | **VERIFIED** |
| Legacy aliases | Explicit allowlist only | Safe redirect targets; arbitrary aliases fail closed | Rendered-route CI passes | **VERIFIED** at source/build level |

## Current production probes

| Probe | Result |
| --- | --- |
| `app.juro.uz/ru/individual/dashboard` | `307` to `/ru/auth/login` with exact encoded `returnTo` |
| `app.juro.uz/ru/individual/ai-chat` | `307` to `/ru/auth/login` with exact encoded `returnTo` |
| `app.juro.uz/api/platform/cases` | `401` without a session |
| `lawyer.juro.uz/ru/lawyer/dashboard` | `307` to the dedicated login with exact `returnTo` |
| `admin.juro.uz/ru/admin/console` | `303` protected handoff to the app admin console |
| `status.juro.uz/api/status` | `200`; operational at capture time |
| `status.juro.uz/ru/individual/dashboard` | `404`, proving the sampled hostname fence |

All private Platform HTML responses sampled here carry
`X-Robots-Tag: noindex, nofollow, noarchive` and private/no-store caching.
The status hosts are noindex and expose only the status surface.

## Production correction released

Worker version 147 (`ed0253e1-1c35-416e-9f2a-5bd8352c1936`) deployed commit
`6503667c` at 100% traffic. Production HTML now has zero `C:/Users/` and zero
`.vinext/fonts` matches, exposes 12 normalized `/assets/_vinext_fonts/...`
URLs, and sampled WOFF2 assets return `200 font/woff2`. Chrome rendered both
the status surface and the authenticated Client dashboard with loaded fonts,
no absolute build path and no warning/error log. Version 146 is the immediate
rollback.

Legacy routes remain only where the rendered-route suite asserts their
redirect or compatibility contract. No `document-builder-test` route is
revived.
