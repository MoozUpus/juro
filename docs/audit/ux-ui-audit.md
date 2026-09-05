# JURO UX/UI Audit

Status: **living production audit, not a usability certification**

Evidence cutoff: **2026-09-02 04:19 UZT**

Scope: Chrome-only public, auth, and authenticated Individual surfaces through v116. Excluded: legal-data/corpus operations, unsupported browsers, physical devices, and unowned role sessions.

## Outcome

v116 resolves the two current production polish defects found during the v115 audit: tablet/desktop auth-heading overlap and sub-44-pixel public locale links. The checked public, auth, and Individual layouts now have zero horizontal overflow at 390, 768, 1024, and 1440 px.

## Surface review

| Surface | Observation | Evidence | Result |
| --- | --- | --- | --- |
| Public header | RU/UZ/EN are 44 × 44 when visible; mobile shows the active locale without crowding | live bounding boxes | RESOLVED |
| Public narrative | one visible H1 and main landmark; canonical/indexing intact | live DOM and HTTP | VERIFIED |
| Auth top row | theme and language controls no longer cover the form heading | overlap 0 px² at four viewports | RESOLVED |
| Turnstile | challenge reserves stable height and exposes localized status | 104 px live container; submit protected | VERIFIED |
| Individual shell | clear primary H1, responsive navigation, search/theme/locale/logout controls at least 44 px in the sample | live dashboard matrix | VERIFIED FOR SHELL |
| Persona routing | Individual cannot silently become Business, Lawyer, or Admin | redirect/reauth/admin-session boundaries | VERIFIED |

## Open UX gates

- Role-specific onboarding and empty/error/success states for Business, Lawyer, Pending Lawyer, and Admin.
- Full keyboard order, focus restoration, modal trapping, and screen-reader narration across feature workflows.
- Controlled real-data substitutes for uploads, document generation, comparison, payments, and destructive settings.
- Long-content and localization stress tests on every dense workspace page.

No claim is made that every platform page has been visually reviewed.
