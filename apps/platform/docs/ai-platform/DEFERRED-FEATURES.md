# JURO deferred and gated features

> Current checkpoint — 2026-08-02: staging configuration and static guards are
> deployed, but the external gates in this register remain real blockers unless
> replaced by new evidence. In particular, no live provider probe is enabled,
> no malware scanner is attached, no approved rigged Jurobek source is present,
> and no authenticated browser runtime is available. None of these omissions is
> represented in UI as a completed capability.

Updated: 2026-07-30

This register distinguishes real implementation from planned scope. A database table, UI placeholder, binding, or feature flag is not counted as a working feature.

## Provider and legal-intelligence gates

- OpenAI legal chat, structured legal output, streaming/branching/memory, model routing, cost controls, and evaluated RU/UZ legal quality are not staging-ready.
- Anthropic document analysis, OCR, comparison quality gates, redline/correction, and provider fallback are not staging-ready.
- Advice/Lex ingestion, version-aware hybrid retrieval, citation verification, daily sync, legal editor, and the 250-scenario human-reviewed legal evaluation remain gated.
- Existing Vectorize indexes are empty foundation resources. User-document indexing and deletion are disabled.

## File and communication gates

- Direct multipart R2 upload, fail-closed malware scanning, ZIP defenses, OCR bounding boxes, quarantine release, SSRF-safe URL ingestion, and adversarial prompt-injection tests remain deferred.
- Realtime voice, avatar lip sync, original-audio retention automation, audio/video call provider, and call recording remain off. Text chat must not pretend these are live.
- The approved Jurobek 3D asset still requires source-asset verification, rig/material/facial review, optimization evidence, WebGL fallback, and device testing before integration.

## Background-job boundary

The staging Worker has enabled and locally covered consumers for document
analysis, OCR, document/report export, security email, legal acquisition,
normalization/indexing, and account-deletion cleanup. Each uses the durable
`job_runs` lease/idempotency boundary. This is not evidence of an end-to-end
provider, scanner, or delivery result: the queue/DLQ operational matrix still
needs controlled staging messages, logs, alert delivery, redrive, and ledger
reconciliation. `notification.dispatch` has no producer/handler because task
reminders are durably inserted by the scheduled runtime; `malware.scan` remains
unattached and rejects fail-closed until a real scanner is approved.

## Product and operations gates

- Complete AI chat, document-analysis, cases/plans/deadlines/calendar, lawyer handoff/conflict/access, entitlements, admin/support/status/analytics, and deletion across every future provider remain incomplete.
- Production backup/quarantine targets, operational RTO/RPO, scheduled backup automation, alert delivery, DLQ redrive UI, and full incident rehearsal remain open.
- Policies are drafts until final RU/UZ legal approval. Production deployment and production UI replacement require separate owner confirmations.

### Lawyer-directory staging gate

The additive migrations `0058` and `0059`, the bilingual self-service
professional-profile UI, and the fresh-MFA staff moderation inbox are applied
to isolated staging after the recorded private backup and postflight checks.
Public profile publication and authenticated browser flow are still not claimed.
Advocate verification and formal credential checking remain deliberately
deferred; profiles can carry only a self-declared advocate state.

## Current account-deletion limitations

The local deletion slice covers D1/R2 operational content present in the current schema, cancellation, blockers, retry, tombstoning, retained evidence, queue/cron execution, and RU/UZ settings UI. It does not yet delete user-document Vectorize entries because tenant document indexing is not active. It also does not claim provider-side AI retention deletion, guest purge, voice-audio purge, or legal-hold adjudication.

Staging behavior is not marked complete until migration `0030`–`0033`, exact Worker deployment, Access-protected synthetic end-to-end testing, logs, queue/DLQ, cron, and post-migration backup checks pass. Production remains unchanged.
