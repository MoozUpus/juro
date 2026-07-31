# Phase 7 — lawyer handoff

Status: implemented locally and validated in the staging build artifact; not deployed.

## Implemented boundary

- `lawyer_profiles`, `lawyer_requests`, `conflict_checks`, and `lawyer_access_grants` are additive D1 tables in migrations `0045_loud_lady_ursula` and `0046_nice_raider`.
- A customer can create an anonymized, case-scoped request only when the workspace has the `lawyerHandoff` entitlement.
- Before a selected lawyer completes a conflict check, the lawyer-facing endpoint exposes only the anonymized summary. It does not return case content, documents, chats, or user profile data.
- A conflict check is limited to the selected, publicly approved lawyer profile.
- Case access requires a second, explicit consent after a clear conflict check. The grant and its revocation are recorded in `workspace_audit_events` and `consents`.
- A unique D1 index prevents more than one access grant for the same request, including concurrent submissions.
- The existing consultations route now includes a real customer handoff form. It creates an unassigned request when no verified public lawyer profile has been selected; the UI does not pretend that a lawyer has been appointed.

## Routes

- `GET|POST /api/platform/lawyer-requests`
- `GET|POST /api/platform/lawyer-requests/:requestId/conflict-check`
- `POST|DELETE /api/platform/lawyer-requests/:requestId/access-grant`
- `GET /api/platform/lawyer-requests/assigned` — case metadata is returned only while an active grant exists.
- Customer surface: `/:locale/:accountType/consultations` and the equivalent business workspace route.

## Validation

- `npm run type-check` — passed.
- `npm run lint` — passed.
- `node --import tsx --test tests/platform-core.test.ts` — 43/43 passed.
- `node --import tsx --test tests/migration-safety.test.ts` — 54/54 passed.
- `npm run build:staging` — passed.
- `CLOUDFLARE_ENV=staging npm run validate:artifact` — passed.

## Staging constraint

The new migration is not applied and the worker is not deployed. Staging has a still-pending, independently scoped Phase 6 migration (`0044_cheerful_ultragirl`). Applying D1 migrations would apply it first. Do not deploy this handoff surface until the owner allows the combined pending migration rollout or explicitly authorizes Phase 6 completion.

## Known limitations

This slice does not yet provide a public lawyer directory, staff assignment UI, lawyer case workspace, offers, reviews, payments, calls, or support ticketing. Those functions must not be advertised as available.