# JURO UX and UI audit

Status: **PARTIAL**

Evidence cutoff: **2026-09-01**

## Result

The platform has a unified shell, locale-aware routes, explicit empty/loading/error states, responsive staff metrics, and established design tokens. The strongest detailed review remains [`PRODUCT-UX-AUDIT-2026-08-19.md`](../ai-platform/PRODUCT-UX-AUDIT-2026-08-19.md); this canonical path records the current evidence boundary rather than repeating that historical snapshot.

| Surface | Current evidence | Remaining gate |
| --- | --- | --- |
| Public site | RU/UZ/EN entry routes and public crawl are recorded | Full visual regression after the next Sites release |
| Client/Business shell | Shared navigation, route context, responsive layout, and focused tests | Complete authenticated journey matrix on one deployed revision |
| Lawyer shell | Dedicated host/persona routing and public entry are preserved | Authenticated Lawyer and Pending Lawyer workflow QA |
| Admin/staff | Product-metrics and operations consoles follow staff shell patterns | Fresh-MFA Chrome QA for every privileged action |
| State handling | Components expose loading, empty, failure, retry, and disabled states | Complete slow-network and recovery pass |

## Source anchors

- `apps/platform/app/_platform/PlatformShell.tsx`
- `apps/platform/app/_platform/WorkspaceShellLayout.tsx`
- `apps/platform/app/_staff/ProductMetricsConsole.tsx`
- `apps/platform/app/_auth/`
- `apps/platform/app/_theme/`
- [`../design/design-system.md`](../design/design-system.md)
- [`mobile-audit.md`](./mobile-audit.md)

## Open issues

- No single exact-revision recording covers Client, Business, Lawyer, Pending Lawyer, and Admin end to end.
- Automated rendered HTML checks cannot establish cognitive clarity, real task success, or assistive-technology behavior.
- Production provider degradation can change the AI journey even when the UI renders correctly.
