# Decisions

## 2026-07-31 — consent-gated lawyer handoff

A lawyer receives only an anonymized request before a conflict check. A clear conflict result does not itself grant access to a case. A separate, explicit customer consent creates a durable grant; the customer may revoke it. This prevents accidental disclosure during lawyer selection and keeps the disclosure event auditable.

## 2026-07-31 — one durable grant per request

`lawyer_access_grants.lawyer_request_id` is unique. The current product policy does not re-open a revoked request: a new grant requires a new request and a new conflict check. This favors a clear audit chain over implicit reactivation.
## 2026-07-31 — mobile profile remains a first-class destination

The mobile shell uses the approved five destinations: dashboard, AI lawyer, cases, documents and profile. Secondary navigation remains in the accessible top-bar drawer. This preserves fast access to profile/security settings without overloading the bottom bar.

## 2026-07-31 — verified publication precedes legal-source embedding

Only a current, staff-approved, published and verified Lex/Advice version may enter the Vectorize pipeline. The queue carries only the version identifier; the consumer reloads lifecycle state, uses a deterministic vector id, and records index bookkeeping only after Vectorize accepts the upsert. Published legal text remains immutable: the narrow migration permits only this deterministic index bookkeeping while the version remains current and verified.

## D-095 — retain fail-closed document quarantine until a real scanner is entitled

Status: accepted and staging-enforced
Date: 2026-08-01

Cloudflare CLI verification for the owner staging account returned that Cloudflare Containers are unauthorized and require the Workers Paid plan. No installed scanner service or approved external scanner adapter is available. Therefore a document-upload finalization cannot mark a file `analysis_safe`, cannot enqueue it for OCR/analysis, and must persist `MALWARE_SCANNER_UNAVAILABLE` in the private quarantine flow.

This is a security boundary, not a temporary success status. It prevents R2 document bytes reaching OpenAI, Anthropic, or an extractor before an actual scanner passes the file. It will be replaced only after an entitled, privacy-approved scanner is wired to a tenant-scoped queue consumer and succeeds in staging with safe and malicious test samples.

## D-096 — legal-source corpus freshness requires a full corpus run

Status: accepted and staging-observed
Date: 2026-08-01

Single-source ingestion runs demonstrate bounded acquisition but do not prove that the legal corpus is current. Source-health therefore reports freshness only from successful `scheduled_corpus` or `manual_corpus` runs. The five-minute outbox scheduler is running successfully in staging; the first daily `0 19 * * *` corpus schedule is still pending its next UTC execution after deployment. The UI must show unknown rather than infer freshness from individual fetches.