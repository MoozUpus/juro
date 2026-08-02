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
## D-097 — lawyer reviews remain private until an MFA-gated moderation decision

Status: locally implemented; awaiting staging migration
Date: 2026-08-02

A completed service can create one private owner review. A `legal_reviewer` with a fresh local MFA session receives a separate `lawyer.reviews.moderate` capability. Each terminal decision is appended to `lawyer_review_moderation`, records a SHA-256 fingerprint of the original review text, and cannot be changed or deleted. A unique review fence prevents two decisions. Database-triggered status progression happens only after a decision record is inserted. Approval is not publication: no public lawyer profile consumes these reviews yet. A conservative contact-pattern screen prevents approving a review with a likely email, phone number, or PINFL-like value until a moderated text removes it.

## D-098 — AI cycles are a workspace entitlement, never a route constant

Status: accepted and locally verified
Date: 2026-08-02

The AI-chat route resolves the active, server-side workspace subscription before
reserving a chargeable answer cycle. Free workspaces retain the approved 20
cycles/month; verified active paid plans receive their explicit higher server policy
limits. The same resolved entitlement is returned in the private usage summary.
This prevents a paid workspace from being silently limited by a route-level free-plan
constant and prevents the browser from being the source of entitlement truth.

## D-099 — verified lexical retrieval includes official identifiers

Status: accepted and locally verified
Date: 2026-08-02

Verified legal retrieval continues to select only a current, published, staff-approved
and verified Lex/Advice source version. Its lexical candidate query now searches the
official act title and identifier, plus section canonical reference, article and
heading, before considering body text. Short numeric terms are retained only for
bounded act/article/clause identifiers (up to ten digits) and remain subject to the
existing source-lifecycle, jurisdiction, locale and citation-validation gates. This
improves direct official-reference queries without permitting an unverified source to
be cited as law.

## D-100 — legal lexical matching must not rely on SQLite ASCII case folding

Status: accepted and locally verified
Date: 2026-08-02

SQLite's built-in `lower()` and `NOCASE` behaviour do not provide dependable
Unicode case folding for Russian official text. Verified retrieval therefore binds
the bounded lower-case, title-case and upper-case variants of each legal keyword
to the existing official-metadata and section fields. This is a candidate-match
improvement only: source lifecycle, locale, verification, publication, current
activation and server-side citation checks remain mandatory.
