# Staging Phase 6 — case, deadline, and builder context evidence

Date: 2026-07-30  
Source commit: `ce09d0e2dca84ed916f1ebd532f282f91c96edc5`  
Scope: owner-only `juro-platform-staging`. Production Worker `juro`, the public Sites deployment at `app.juro.uz`, production data, and `apps/website` were not changed.

## Implemented vertical slice

- `caseId` and `stepId` now survive the route from an action-plan step through the document library, category selection, template selection, builder back navigation, and RU/UZ locale switching.
- Context query values are propagated only when the case and step are syntactically valid UUIDs. A step is never propagated without a valid case.
- The builder still performs the authoritative tenant/case/step check before a configured draft is created; query validation is not treated as authorization.
- A plan step now exposes a labelled calendar-date control and every persisted step status in RU/UZ.
- `PATCH /api/platform/cases/:caseId/steps/:stepId` accepts only strict JSON up to 2 KiB, a positive revision, an allowlisted status, and a real `YYYY-MM-DD` calendar date or `null`.
- An inaccessible case or step returns the same neutral `404` boundary and does not disclose cross-tenant existence.
- The existing optimistic revision fence remains active. After an accepted update, plan progress and `cases.next_deadline_at` are recalculated, and the content-free case event records the step, status, and date.
- The UI serializes writes per step, exposes an accessible expanded state, keeps 44 px document actions, and has a responsive date/status layout with reduced-motion handling.

No D1 migration or new Cloudflare resource was required for this slice.

## Local gates

The following commands completed successfully against `apps/platform`:

- `npm run type-check`;
- `npm run lint`;
- `npm test` — exit 0, including 302 core tests and 83 Cloudflare tests;
- `npm run build:staging`;
- `npm run validate:artifact -- --environment staging`;
- `npm run cf:types:check`;
- `git diff --check`.

New tests prove valid context propagation, rejection of malformed/partial context, valid leap-safe calendar parsing, rejection of impossible or timestamp dates, status allowlisting, positive revisions, and strict unknown-field rejection.

The first post-build artifact command was accidentally invoked with its default development selector against a staging artifact and correctly failed on the Worker-name mismatch. It was rerun with `--environment staging` and passed. This is an environment-selection error, not an application failure, and no deployment was performed from the failed invocation.

## Staging deployment and postflight

- Worker: `juro-platform-staging`.
- Version: `39050d54-2ad8-4145-9779-1c06e5fe8e47` at 100% traffic.
- Deployment message: `Phase 6 case plan context ce09d0e`.
- Deployment preserved dashboard variables with `--keep-vars` and used `--strict`.
- D1: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`).
- D1 postflight: `PRAGMA quick_check` = `ok`; `PRAGMA foreign_key_check` returned zero rows; migration ledger count/latest = `38`/`38`; read-only check wrote zero rows.
- Anonymous `GET /ru/individual/action-plan` returned `302` to the Cloudflare Access login endpoint.
- Anonymous `GET /ru/individual/document-builder` returned `302` to the Cloudflare Access login endpoint.
- The exact staging secret-name inventory remains `IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY`; values were not read. AI provider secrets are still absent.
- Production Worker `juro` remains on version `91774ed4-72e9-47bb-b93a-a4208d490b24`, created 2026-07-26; no production deployment was made.

## Open verification gate

Authenticated interactive RU/UZ UI traversal is not claimed. The approved browser-control attempt failed before browser discovery because its generated runtime was interpreted as ESM and terminated on `require is not defined in ES module scope`. Access was not bypassed and no alternative credential extraction was attempted. Static contracts, the full local suite, staging artifact, control plane, D1 integrity, and anonymous Access boundary are verified; the authenticated click-through remains a staging QA item.

This checkpoint does not authorize either production functional deployment or replacement of the production UI.
