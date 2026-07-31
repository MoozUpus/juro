# Decisions

## 2026-07-31 — consent-gated lawyer handoff

A lawyer receives only an anonymized request before a conflict check. A clear conflict result does not itself grant access to a case. A separate, explicit customer consent creates a durable grant; the customer may revoke it. This prevents accidental disclosure during lawyer selection and keeps the disclosure event auditable.

## 2026-07-31 — one durable grant per request

`lawyer_access_grants.lawyer_request_id` is unique. The current product policy does not re-open a revoked request: a new grant requires a new request and a new conflict check. This favors a clear audit chain over implicit reactivation.
## 2026-07-31 — mobile profile remains a first-class destination

The mobile shell uses the approved five destinations: dashboard, AI lawyer, cases, documents and profile. Secondary navigation remains in the accessible top-bar drawer. This preserves fast access to profile/security settings without overloading the bottom bar.

## 2026-07-31 — verified publication precedes legal-source embedding

Only a current, staff-approved, published and verified Lex/Advice version may enter the Vectorize pipeline. The queue carries only the version identifier; the consumer reloads lifecycle state, uses a deterministic vector id, and records index bookkeeping only after Vectorize accepts the upsert. Published legal text remains immutable: the narrow migration permits only this deterministic index bookkeeping while the version remains current and verified.
