# Decisions

## 2026-07-31 — consent-gated lawyer handoff

A lawyer receives only an anonymized request before a conflict check. A clear conflict result does not itself grant access to a case. A separate, explicit customer consent creates a durable grant; the customer may revoke it. This prevents accidental disclosure during lawyer selection and keeps the disclosure event auditable.

## 2026-07-31 — one durable grant per request

`lawyer_access_grants.lawyer_request_id` is unique. The current product policy does not re-open a revoked request: a new grant requires a new request and a new conflict check. This favors a clear audit chain over implicit reactivation.
## 2026-07-31 — mobile profile remains a first-class destination

The mobile shell uses the approved five destinations: dashboard, AI lawyer, cases, documents and profile. Secondary navigation remains in the accessible top-bar drawer. This preserves fast access to profile/security settings without overloading the bottom bar.
