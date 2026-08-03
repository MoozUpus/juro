# Staging 0086 — canonical case routes

Date: 2026-08-04
Functional commit: `33ff471`
Staging Worker version: `166f25f3-caa2-4312-b577-beabdfd1f37c`

## Delivered slice

- Personal and explicit business workspaces now expose URL-backed case sections at `/:locale/:accountType/cases/:caseId/:section` and `/:locale/business/:workspaceId/cases/:caseId/:section`.
- The validated section vocabulary is: `chat`, `documents`, `analyses`, `plan`, `calendar`, `sources`, `participants`, `lawyer`, `activity`, and `access`; the case root remains the overview.
- The legacy business route preserves the same section through the existing workspace-selection redirect rather than creating an ambiguous second business data surface.
- One authenticated API first resolves the active workspace and verifies case ownership. Every returned private domain is then independently scoped by workspace and case; user-owned conversations, comparisons and lawyer requests additionally bind the authenticated user.
- The UI uses persisted conversations, documents, document comparisons, plan steps/tasks, official sources, workspace memberships, lawyer requests/access grants and case events. Empty states are explicit and do not fabricate analyses, participants, sources or lawyer activity.
- Official source links render only for HTTPS `lex.uz` or `advice.uz` hostnames. No provider response, legal conclusion or upload state is invented by this slice.

## Verification

- focused case route/security tests: 4/4;
- `npm run lint`: pass, no warnings;
- `npm run type-check`: pass;
- `npm test`: pass;
- `npm run test:cloudflare`: pass;
- `npm run cf:types:check`: pass;
- `npm run build:staging`: pass; route manifest contains personal, explicit-business and legacy-business `cases/:caseId/:section` routes;
- `npm run validate:artifact -- --environment staging`: pass;
- document-builder smoke: pass, 34 scenarios;
- document-comparison smoke: pass, 3 persisted changes plus PDF/DOCX exports;
- `git diff --check` and changed-diff secret-pattern scan: pass.

The first smoke attempt used `vinext start`, which failed before serving because local Node did not load the `cloudflare:` ESM scheme. The same built code was then exercised successfully through the supported Vite/Cloudflare development runtime. This local tool limitation is not reported as an application failure.

## Staging proof

`npm run deploy:staging` rebuilt and validated the staging artifact, uploaded the Worker, preserved isolated D1/R2/Queue/Vectorize bindings, and reported Worker startup time 167 ms. Migration `0066` was already applied and remained the latest schema revision; this routing slice has no schema change, so no migration was repeated or invented.

Anonymous HEAD checks for RU `chat`, RU `access`, UZ `sources`, and the critical RU document-builder route returned Cloudflare Access `302` responses with `no-store` cache policy and the exact original path in `redirect_url`. Authenticated case-data, keyboard, responsive, axe and human RU/UZ browser QA remain open because the local browser-control runtime cannot establish a session behind Access.

Production was not deployed or changed.
