# JURO deferred and gated features

> Current checkpoint — 2026-08-04: closed one-time OpenAI and Anthropic staging
> probes and later completed-run metadata prove both provider transports; the
> probe flag is correctly disabled again. Authenticated RU/UZ browser/citation
> and legal-quality gates remain open. No malware scanner is attached, no
> approved rigged Jurobek source is present, and no authenticated browser runtime
> is available. None of these omissions is represented as completed capability.

Updated: 2026-07-30

This register distinguishes real implementation from planned scope. A database table, UI placeholder, binding, or feature flag is not counted as a working feature.

## Provider and legal-intelligence gates

- OpenAI legal chat, structured legal output, streaming/branching/memory, model routing, evaluated RU/UZ legal quality, cost thresholds/alerts and provider-billing reconciliation are not staging-ready. Local migration `0081` now covers actual-token embedding usage, immutable price versions and daily aggregates without content, but it is not deployed.
- Anthropic document analysis, OCR, comparison quality gates, redline/correction, and provider fallback are not staging-ready.
- Advice/Lex ingestion, version-aware hybrid retrieval, citation verification, daily sync, legal editor, and the 250-scenario human-reviewed legal evaluation remain gated.
- Remote development/staging user-document indexes remain empty at this checkpoint. The local `0080`–`0081` candidates implement immutable-version indexing, owner-scoped semantic search, superseded-vector deletion, account-purge deletion and actual-token cost accounting, but they are not active until a separately authorized migration/deploy, official price entry and protected staging evidence.

## File and communication gates

- The streaming private-R2 upload, SSRF-safe public URL import, strict ZIP/DOCX integrity gate, PDF structure/page-count preflight, deterministic ZIP package extraction, bounded per-member Workers AI conversion, provider prompt boundary, and adversarial document-input tests exist locally. A real fail-closed malware service, protected-staging URL/browser evidence, page coordinates and faithful DOCX pagination, over-budget streaming extraction, quarantine release evidence, and the full 100-package quality gate remain deferred.
- Realtime voice, avatar lip sync, original-audio retention automation, audio/video call provider, and call recording remain off. Text chat must not pretend these are live.
- The approved Jurobek 3D asset still requires source-asset verification, rig/material/facial review, optimization evidence, WebGL fallback, and device testing before integration.

## Background-job boundary

The staging Worker has enabled and locally covered consumers for document
analysis, OCR, document/report export, security email, legal acquisition,
normalization/indexing, and account-deletion cleanup. Each uses the durable
`job_runs` lease/idempotency boundary. This is not evidence of an end-to-end
provider, scanner, or delivery result: the queue/DLQ operational matrix still
needs controlled staging messages, logs, alert delivery, redrive, and ledger
reconciliation. `notification.dispatch` now has an outbox producer and a
tenant-safe, idempotent staging consumer; a controlled identifiers-only message
proved remote handler execution and was cleaned up. `malware.scan` remains
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

The local deletion slice covers D1/R2 operational content present in the current schema, cancellation, blockers, retry, tombstoning, retained evidence, queue/cron execution, RU/UZ settings UI, and the `0080` user-document Vectorize ledger. It submits idempotent vector deletion before D1 cascade and fails closed if indexed rows exist without a binding. This remains local evidence; provider-side AI retention deletion, guest purge, voice-audio purge, and legal-hold adjudication are still not claimed.

Staging behavior is not marked complete until migration `0030`–`0033`, exact Worker deployment, Access-protected synthetic end-to-end testing, logs, queue/DLQ, cron, and post-migration backup checks pass. Production remains unchanged.
