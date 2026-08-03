# Staging 0087 — canonical case creation

Date: 2026-08-04
Functional commit: `e355163`
Staging Worker version: `06028d89-322c-42d4-95f2-41d89da8461e`

## Delivered slice

- Personal routes expose `/:locale/:accountType/cases/new`; explicit business workspaces expose `/:locale/business/:workspaceId/cases/new`; the legacy business route resolves the active workspace before redirecting.
- The cases list and empty state link to the canonical create route. The action-plan view uses the same scenario catalog, removing client/server scenario drift.
- The RU/UZ form posts to authenticated `POST /api/platform/cases` with same-origin CSRF evidence. On success it opens the persisted canonical case workspace; there is no client-only success state.
- Input is strict and bounded: 180-character title, optional 2,000-character description, exact RU/UZ locale, exact account type and an allowlisted legal scenario. Personal/business scenario compatibility is checked by the schema and repeated after server-side workspace resolution.
- The API ignores client tenant locators, resolves the active workspace from the authenticated user, and creates the case, plan, four scenario steps, immutable plan version and case event in one D1 batch.
- The pre-existing action-plan insert was corrected so `title`, `status`, timestamps and bind parameters align with the declared D1 columns.

## Verification

- focused case creation/section tests: 8/8;
- `npm run type-check`: pass;
- `npm run lint`: pass, no warnings;
- `npm test`: pass;
- `npm run test:cloudflare`: pass;
- `npm run cf:types:check`: pass;
- `npm run build:staging`: pass; the route manifest contains all three create routes;
- `npm run validate:artifact -- --environment staging`: pass;
- document-builder smoke: pass, 34 scenarios;
- document-comparison smoke: pass, three persisted changes plus PDF/DOCX exports;
- `npm run smoke:case-create`: pass against the Vite/Cloudflare development runtime and a fully migrated local D1; the response contained persisted case and plan UUIDs and the follow-up read returned four steps;
- `git diff --check` and changed-diff secret-pattern scan: pass.

The first case smoke run exposed that the local development D1 had stopped at migration `0037`. Local-only migrations `0038`–`0066` were applied, after which the real HTTP/D1 create/read flow passed. This did not modify remote development, staging, or production resources.

## Staging proof

`npm run deploy:staging` rebuilt and validated the staging artifact and deployed it to `juro-platform-staging`. Wrangler reported Worker startup time 165 ms, the existing seven Queue consumers, and only isolated staging D1, R2, Queue, Vectorize and analytics bindings. There was no schema change; staging already had migration `0066`, so no migration was repeated.

Anonymous HTTP checks for `https://staging.app.juro.uz/ru/individual/cases/new` and the critical staging document-builder route returned Cloudflare Access `302`, `no-store`, and the exact original `redirect_url`. The production document-builder route still returns its existing authenticated `307` and was not deployed.

An authenticated Access browser traversal and a remote staging D1 create/read transaction remain open. The local E2E proves the application and D1 mutation contract; the anonymous staging checks prove deployment and the Access boundary, not authenticated feature completion.

The available browser-control runtime exited before page discovery because its temporary Node kernel was loaded as ESM while using CommonJS `require`. No application URL or authenticated state was reached, so this tooling failure is not counted as a staging application result.

Production was not deployed or changed.
