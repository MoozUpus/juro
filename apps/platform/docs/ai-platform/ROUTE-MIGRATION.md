# JURO route migration register

Updated: 2026-07-29
Status: integration-branch evidence only; production routes are unchanged.

| Current URL | Target URL | Treatment | Code | Inbound links | Test result |
|---|---|---|---:|---|---|
| `/main` | saved-locale/persona `/:locale/:accountType/dashboard` | keep compatibility entry | 307 after auth resolution | legacy bookmarks and app entry | type-check, full suite, staging build pass |
| `/:locale/:accountType/main` | `/:locale/:accountType/dashboard` | permanent method-preserving redirect | 308 | prior dashboard links, auth return paths, invitations | rendered Worker covers RU individual and UZ business |
| `/dashboard` | `/:locale/:accountType/dashboard` | keep compatibility entry | 307 | public/app links without locale | rendered Worker verifies locale/account type preservation |
| `/:locale/:accountType/dashboard` | same for personal personas | canonical personal route | — | shell navigation, OTP/MFA, onboarding | dashboard module classifier and full suite pass |
| `/:locale/business/:workspaceId/**` | same | canonical business workspace route | — | workspace switch, invitation acceptance, shell and builder navigation | membership-isolation tests, route build and full suite pass |
| `/:locale/business/{reserved-root}/**` | active `/:locale/business/:workspaceId/{reserved-root}/**` | authenticated compatibility adapter | 307 after tenant resolution; `main` remains 308 to dashboard | legacy business bookmarks and return paths | rendered Worker and source/tenant tests pass |
| `/document-builder-test/**` | `/document-builder/**` | retain permanent redirect | 308 | old inbound links | existing rendered regression passes |
| `/document-builder/**` | `/:locale/:accountType/document-builder/**` | retain compatibility redirect | 307/308 by existing handler | public links and saved bookmarks | existing route/security tests pass |
| `/ru/individual/document-builder` | same | preserve canonical builder route | — | required production contract | protected staging browser regression passed for RU/UZ library, category, template and documents navigation; production unchanged |

## Invariants

1. Locale and account persona are preserved.
2. No confidential value is added to a URL.
3. Legacy `main` stays a redirect and is no longer an accepted platform
   module.
4. A business workspace ID is accepted only after server-side active-
   membership verification. URL shape is never treated as authorization, and an
   inaccessible identifier receives neutral not-found behavior.
5. Production deployment is separately gated.

## Protected staging evidence — 2026-07-29

- Builder links now derive from `/:locale/:accountType`; legacy unlocalized
  paths remain only as inbound compatibility redirects.
- Browser traversal passed for RU library → UZ library → UZ category → UZ
  generic template → UZ documents, with one `main`, no horizontal overflow,
  no client link beginning with legacy `/document-builder`, and no console
  entries.
- The UZ documents route is canonical, but its existing document-management
  copy is still predominantly Russian; this is tracked as an open i18n defect.
