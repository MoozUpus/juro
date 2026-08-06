# Staging Builder canonical-route evidence

Date: 2026-08-06  
Environment: `staging` only  
Application: `https://staging.app.juro.uz`  
Code: `d006e62` (`fix(platform): retain configured Builder document route`)

## Purpose

The configured Builder start route previously created a document but could leave the user at the template-introduction route after a reload. This made the document reachable through “My documents”, but did not preserve the direct work context.

The fix redirects immediately after `ensureDocument()` resolves with `router.replace(paths.document(document.id))`. It does not place a document identifier or any document data in a query string.

## Authenticated staging smoke

Only a synthetic staging document was created.

1. Opened the real configured template start route:
   `/ru/individual/document-builder/work/0201001`.
2. Selected **«Создать документ»**.
3. The application created document `f195dc96-dee9-42b5-9f8b-55d93c541406` and navigated to:
   `/ru/individual/documents/f195dc96-dee9-42b5-9f8b-55d93c541406`.
4. Reloaded that URL. The Builder loaded the same configured template, exposed the version-history surface, and did not return to the introduction route.
5. Evaluated the rendered page: the pathname remained canonical and there was no horizontal overflow.

## Regression protection

- `npm test` — passed locally after the related Builder recovery contract was updated to require a semantic native dialog instead of the removed blocking `window.confirm` path.
- `npm run test:cloudflare` — passed locally: 129 passed, 0 failed.
- Existing Builder version recovery smoke remains recorded in `STAGING-0105-BUILDER-VERSION-RECOVERY-EVIDENCE.md`.

## Limits

- This is a focused authenticated desktop staging smoke, not the full mobile, keyboard, screen-reader, visual-regression, or 100-document release matrix.
- The synthetic document remains in staging as QA data and must not be treated as legal content or release evidence beyond this navigation contract.
- Production is unchanged and remains separately approval-gated.
