# JURO deferred and gated features

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

## Product and operations gates

- Complete AI chat, document-analysis, cases/plans/deadlines/calendar, lawyer handoff/conflict/access, entitlements, admin/support/status/analytics, and deletion across every future provider remain incomplete.
- Production backup/quarantine targets, operational RTO/RPO, scheduled backup automation, alert delivery, DLQ redrive UI, and full incident rehearsal remain open.
- Policies are drafts until final RU/UZ legal approval. Production deployment and production UI replacement require separate owner confirmations.

### Lawyer-directory staging gate

The additive migrations `0058` and `0059`, the bilingual self-service
professional-profile UI, and the fresh-MFA staff moderation inbox are locally
implemented and tested. No staging D1 change, Worker deployment, public profile
publication, or browser flow is claimed until a new private backup and an
explicit authorization for both migrations are executed. Advocate verification
and formal credential checking remain deliberately deferred; profiles can carry
only a self-declared advocate state.

## Current account-deletion limitations

The local deletion slice covers D1/R2 operational content present in the current schema, cancellation, blockers, retry, tombstoning, retained evidence, queue/cron execution, and RU/UZ settings UI. It does not yet delete user-document Vectorize entries because tenant document indexing is not active. It also does not claim provider-side AI retention deletion, guest purge, voice-audio purge, or legal-hold adjudication.

Staging behavior is not marked complete until migration `0030`–`0033`, exact Worker deployment, Access-protected synthetic end-to-end testing, logs, queue/DLQ, cron, and post-migration backup checks pass. Production remains unchanged.
