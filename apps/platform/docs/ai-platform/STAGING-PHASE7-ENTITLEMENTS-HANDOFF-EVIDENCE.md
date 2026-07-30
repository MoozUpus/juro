# Staging Phase 7 — entitlements and specialist handoff evidence

Date: 2026-07-30
Source commit: `021ee94`
Scope: owner-only `juro-platform-staging`. Production Worker `juro`, public Sites, production data, and `apps/website` were not changed.

## Implemented vertical slice

- A single server-side workspace entitlement service derives capability from current D1 subscription evidence instead of scattered client plan checks.
- Missing, unknown, inactive, past-due, expired, or malformed subscription evidence fails closed to `free`.
- Only current `active` or `trialing` `individual`, `business`, or `legal_team` evidence enables `lawyerHandoff`.
- `GET /api/platform/billing` and `GET /api/platform/consultations` return the same entitlement result for the authenticated workspace.
- Consultation creation rejects Free with typed `PLAN_LIMIT` before a booking or consent is written.
- Billing selection and consultation creation use strict, bounded Zod JSON contracts. Unknown fields, malformed UUIDs, false/missing consent, invalid locale/plan, and plan step without a case are rejected.
- Case/step and comparison context receive authoritative tenant checks. Inaccessible and nonexistent context share neutral `404 CONTEXT_UNAVAILABLE` behavior.
- A successful eligible request still creates the existing booking, immutable consent evidence, slot update, and workspace audit in one D1 batch. A contested slot returns `409` without reporting false success.
- RU/UZ UI exposes the Free plan boundary, links to the real billing route, disables unavailable actions, localizes booking states, and never pretends checkout or lawyer assignment succeeded.
- Billing remains fail closed: without a configured payment provider it returns `503`; without a provider adapter it returns `501`.

No migration, payment, lawyer assignment, slot, subscription, or synthetic booking was created by this slice.

## Local gates

- `npm run type-check` — passed.
- `npm run lint` — passed.
- `npm test` — passed; 304 core tests and 83 Cloudflare tests observed.
- `npm run build:staging` — passed.
- `npm run validate:artifact -- --environment staging` — passed.
- `npm run cf:types:check` — passed.
- `git diff --check` — passed before commit.

New tests cover Free default, active paid evidence, inactive/past-due/expired/unknown/malformed evidence, strict consultation context, mandatory consent, UUID boundaries, strict unknown-field rejection, and plan/locale selection.

## Staging deployment and postflight

- Worker: `juro-platform-staging`.
- Version: `5feeab28-f23e-4dd6-a95c-88963306bf2a` at 100% traffic.
- Deployment message: `Phase 7 entitlement handoff 021ee94`.
- D1: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`).
- `PRAGMA quick_check` = `ok`; foreign-key check returned zero rows; the read-only postflight wrote zero rows.
- Aggregated staging queries returned zero subscription groups, zero consultation-booking groups, and zero consultation-slot groups. A live paid handoff is therefore not claimed.
- Anonymous RU consultations and UZ billing requests both returned `302` to the Cloudflare Access login endpoint.
- Secret-name inventory remains limited to `IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY`; no value was read.

## Open gates

This slice does not yet implement subscription checkout/webhooks, add-on packs, idempotent handoff requests across different slots, lawyer profiles/directory, conflict-check state machine, scoped temporary grants/revocation, offers, lawyer messaging, reviews, or operator/admin management. Audio/video remain feature-off and are not simulated.

Authenticated browser traversal remains blocked by the previously recorded browser-control runtime failure. Access was not bypassed. Production deployment and production UI replacement still require separate owner approvals.
