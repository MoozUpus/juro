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

- OpenAI legal chat, structured legal output, streaming/branching/memory, model routing and evaluated RU/UZ legal quality are not staging-ready. Local migrations `0081`–`0082` cover actual-token usage, immutable price/policy versions, daily aggregates, server-checked provider circuits and identifiers-only operational-alert delivery without content, but they are not deployed. Official price/policy entry, a real staging alert/circuit rehearsal and provider-billing reconciliation remain gated.
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

- Complete AI chat, document-analysis, cases/plans/deadlines/calendar, lawyer handoff/conflict/access, entitlements, broad admin/analytics, and deletion across every future provider remain incomplete. A local operator-managed public status slice now exists through `0083`, but DNS/custom-domain attachment, protected admin browser QA, synthetic component probes and an incident rehearsal remain gated.
- Production backup/quarantine targets, operational RTO/RPO, scheduled backup
  automation, alert delivery and full incident rehearsal remain open. A local
  fresh-MFA Queue monitor and guarded same-job redrive UI now exists through
  `0085`, but it is not staging evidence and does not replace controlled
  Queue/DLQ delivery, alert and ledger-reconciliation rehearsals.
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

## Operational feature-control gate

The `0084` operational feature history, server guards and fresh-MFA RU/UZ console are local-only. They are not an active staging kill switch until a fresh private backup/restore, ordered migration, exact Worker deployment and authenticated disable/re-enable rehearsal prove that covered provider, usage, R2, queue and request writes remain absent while disabled. Production feature control remains unchanged.

## Operational job-redrive gate

Migration `0085`, `/:locale/admin/jobs` and `/api/platform/admin/jobs` are
local-only. Do not use direct D1 updates as a substitute. Staging activation
requires a new private export with isolated restore verification, ordered
`0079`–`0085` migration application, exact Worker deployment and a controlled
recoverable identifiers-only job. Evidence must prove one resulting effect,
unchanged idempotency, immutable redrive history, valid ledger reconciliation,
expected Queue/DLQ behavior and operator alerting. Production remains unchanged.

## Platform audit-log gate

Migration `0086`, `/:locale/admin/audit-log` and the POST-only
`/api/platform/admin/audit-log` endpoint are local-only. Staging activation
requires a fresh private D1 export with isolated restore verification, ordered
application through `0086`, exact Worker deployment and an authenticated
administrator rehearsal for query, filter and CSV export. Evidence must confirm
fresh-MFA denial, support-role denial, access-event chain integrity and absence
of user/provider content in responses and downloads. The console does not make
the older `workspace_audit_events` table globally tamper-evident; it only gives
tamper-evident evidence of who accessed the safe projection.
