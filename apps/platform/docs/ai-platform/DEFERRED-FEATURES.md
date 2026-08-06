# JURO deferred and gated features

> **Authoritative remote state — 2026-08-06.** Protected staging is Worker
> `juro-platform-staging` version `9fe76749-0d69-41a8-aa3d-cf16d67e40a6` at
> 100% traffic (read back with `wrangler deployments list --env staging`);
> `juro-staging` has D1 migration ledger row 106
> (`0105_d1_builder_version_hash_guards.sql`). Older local-only and earlier
> staging checkpoint labels below are historical and do not reopen a feature
> or downgrade the active schema. Migrations `0084` through `0092` are also
> present in the remote ledger (rows 85 through 93). The remaining items in
> this register remain
> release gates until their stated evidence exists.

> **Migration-ledger clarification — 2026-08-06.** A direct read-only query
> of `juro-staging` confirmed that ledger rows 80–100 apply migrations
> `0079_lawyer_review_replies.sql` through
> `0099_staging_email_delivery_probe.sql`. Consequently, any lower historical
> sentence saying one of those migrations was “local-only”, “unapplied” or
> “not deployed” must not be used to describe the active staging schema. It
> remains valid only as time-stamped implementation history. Applying a schema
> migration is not, by itself, evidence of an authenticated user journey,
> provider operation, scanner verdict, legal-quality result, queue rehearsal or
> human review; those release gates remain open unless separately evidenced.

> Current checkpoint — 2026-08-06: protected staging provider evidence now
> proves the current OpenAI and Anthropic transports with fixed, content-free
> input; one separately gated, content-free Resend probe now also has an API
> acceptance receipt. Each temporary probe flag was restored to `false` at 100%
> traffic. This does not substitute for authenticated RU/UZ journeys, actual
> mailbox delivery, citations, legal quality, a scanner-approved analysis, or
> human review. No avatar work is in the currently authorised scope.

Updated: 2026-08-06

This register distinguishes real implementation from planned scope. A database table, UI placeholder, binding, or feature flag is not counted as a working feature.

## Provider and legal-intelligence gates

- OpenAI staging transport now has a completed synthetic RU/UZ lifecycle with
  structured output, idempotent persistence and cleanup. It is not a legal
  quality score or an authenticated user journey. Official price entry, a real
  alert/circuit rehearsal and provider-billing reconciliation remain gated.
- Anthropic staging transport has a completed content-free structured-output
  probe on the configured model. Document analysis, OCR, comparison quality,
  redline/correction and scanner-approved analysis remain gated.
- Resend accepted one fixed staging-only technical email and its immutable
  content-free receipt is deployed. Real deadline notification delivery,
  sender-domain verification, Queue/DLQ recovery and inbox-placement evidence
  remain gated.
- Exact Lex/Advice acquisition, review-only normalization, citation-boundary
  verification and a daily revisit scheduler exist. A bounded recent Lex RU/UZ
  RSS discovery path is now a local candidate, but it is not deployed. Broad
  historical priority-area backfill, Advice discovery activation, human
  publication at corpus scale, version-aware hybrid retrieval and the
  314-scenario human-reviewed legal evaluation remains gated. A local
  persisted-run/review evidence exporter prevents self-declared JSON from
  satisfying the gate, but it has not been deployed or populated with real
  staging evaluation runs.
- Migrations `0089` and `0091` and their exact Workers are deployed to protected staging after
  a verified private backup/restore. A controlled failed/stale run, Queue/DLQ
  log and real Resend receipt are still required. `0091` fail-closes freshness
  against unreviewed versions, but a controlled corpus run and named legal
  review remain gated.
- A synthetic staging document-analysis smoke has persisted three tenant-scoped
  user-document index chunks after a scanner-approved file and provider fallback
  completed. This is not corpus scale, a cross-tenant search evaluation, official
  price reconciliation, or an account-purge exercise; those gates remain open.

## File and communication gates

- The streaming private-R2 upload, SSRF-safe public URL import, strict ZIP/DOCX integrity gate, PDF structure/page-count preflight, deterministic ZIP package extraction, bounded per-member Workers AI conversion, provider prompt boundary, adversarial document-input tests, and private fail-closed ClamAV scanner exist in protected staging. The scanner has passed a synthetic infected-file EICAR path and a separate synthetic clean DOCX analysis smoke. Protected-staging clean-file OCR/provider evidence at corpus quality, page coordinates and faithful DOCX pagination, over-budget streaming extraction, quarantine promotion evidence, and the full 100-package quality gate remain deferred.
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
proved remote handler execution and was cleaned up. `malware.scan` is attached
only in staging to the private ClamAV service and its dedicated Queue/DLQ.
Development and production remain unattached and fail closed.

## Product and operations gates

- Complete AI chat, document-analysis, cases/plans/deadlines/calendar, lawyer handoff/conflict/access, entitlements, broad admin/analytics, and deletion across every future provider remain incomplete. One authenticated synthetic case has passed complete → archive → restore → reopen in staging with an immutable D1 hash chain; this is not a substitute for the full case/product matrix. The public operator-managed status slice is deployed on the staging-only hostname `status.staging.juro.uz`, with a narrow route fence and `noindex` header verified by HTTPS smoke checks. Protected admin browser QA, synthetic component probes, an incident rehearsal and any production hostname remain gated.
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

The `0084` operational feature history, server guards and fresh-MFA RU/UZ console are deployed to protected staging. They are not yet counted as an active staging kill switch: an authenticated disable/re-enable rehearsal must prove that covered provider, usage, R2, queue and request writes remain absent while disabled. Production feature control remains unchanged.

## Operational job-redrive gate

Migration `0085`, `/:locale/admin/jobs` and `/api/platform/admin/jobs` are
deployed to protected staging. Do not use direct D1 updates as a substitute.
The release gate still requires a controlled recoverable identifiers-only job.
Evidence must prove one resulting effect, unchanged idempotency, immutable
redrive history, valid ledger reconciliation, expected Queue/DLQ behavior and
operator alerting. Production remains unchanged.

## Platform audit-log gate

Migration `0086`, `/:locale/admin/audit-log` and the POST-only
`/api/platform/admin/audit-log` endpoint are deployed to protected staging. An
authenticated administrator rehearsal for query, filter and CSV export remains
required. Evidence must confirm fresh-MFA denial, support-role denial,
access-event chain integrity and absence of user/provider content in responses
and downloads. The console does not make the older `workspace_audit_events`
table globally tamper-evident; it only gives tamper-evident evidence of who
accessed the safe projection.

## AI quality-review staging gate

Migration `0087`, `/:locale/admin/ai-quality` and its POST-only API are deployed
to protected staging. An authenticated legal-reviewer rehearsal of query,
explicit content view and versioned resolve remains required. Negative evidence
must cover administrator/support denial, expired MFA, stale feedback, chain
tampering and absence of question/answer text from queue responses. Human legal
validation of golden answers remains a product process; the presence of a stored
review is not a legal-quality metric by itself.

## Document evaluation staging gate

Migration `0092` and `POST /api/platform/admin/document-evaluation` are
deployed to protected staging. Authenticated legal-reviewer probes remain
required. The actual gate additionally requires all 100 materialized packages,
30 comparisons, real OCR and provider runs, named review and threshold
remediation. Until then no document quality metric is claimed and the feature
remains outside production readiness.
