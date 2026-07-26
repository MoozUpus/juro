# JURO AI platform decision log

This log records material implementation decisions. Status values are `accepted`, `pending approval`, or `superseded`.

## D-001 — implementation baseline

Status: accepted  
Date: 2026-07-26

Use the Sites source revision `86843ca` as the implementation baseline because it is materially ahead of GitHub `main`. Synchronize it into `feature/juro-ai-platform` before relying on GitHub CI or deployment.

Consequence: GitHub `main` must not be deployed over the current application.

## D-002 — production freeze

Status: accepted  
Date: 2026-07-26

Do not modify production schema, resources, secrets, or deployment during phases 0–9. Production requires a separate explicit approval after staging gates.

## D-003 — migration strategy

Status: accepted  
Date: 2026-07-26

Use additive expand-contract migrations:

```text
add → dual read/write if necessary → backfill → verify → switch → remove later
```

An in-D1 table copy is not accepted as a backup. Every remote migration requires an external verified export and isolated restore rehearsal.

## D-004 — external collaboration scope

Status: accepted  
Date: 2026-07-26

An invitation in `invited` state grants no document access. Accepted external collaboration is modeled separately from active-workspace membership, displayed in an explicit shared scope, and always constrained by the more restrictive rule.

## D-005 — asynchronous infrastructure order

Status: accepted  
Date: 2026-07-26

Implement and test queue consumers, idempotency, DLQ behavior, scheduled locks, and run records before binding live queues or Cron triggers. Do not attach resources to placeholder handlers.

## D-006 — Vectorize metadata strategy

Status: accepted  
Date: 2026-07-26

Store all required user-document metadata but create at most ten indexed metadata properties per index. Because each environment has a physically separate index, `environment` is stored but does not consume a filter index. Authorization remains a D1/server check before and after vector search.

## D-007 — legal source authority

Status: accepted  
Date: 2026-07-26

LexUZ is the normative source of truth; AdviceUZ supplies practical scenarios; internal JURO materials are always labeled non-official. A citation is not confirmed solely by vector similarity. Exact server-side source/version verification is mandatory.

The rule governing RU/UZ text divergence remains `pending approval` and must live in protected configuration rather than an editable prompt.

## D-008 — AI provider configuration

Status: accepted  
Date: 2026-07-26

Provider calls are server-only. Model names are versioned server configuration, not secrets. Structured output is validated with Zod, with bounded repair/retry. Actual provider/model, instruction hash, source index version, and legal database version are recorded for each run.

## D-009 — personal AI Gateway logging

Status: accepted  
Date: 2026-07-26

If Cloudflare AI Gateway is used, personal requests disable payload collection while retaining safe cost/latency/error metadata. Semantic cache is disabled for user content. Public non-personal legal-source operations may be cached only after an explicit privacy review.

## D-010 — deferred provider features

Status: accepted  
Date: 2026-07-26

Realtime audio/video calls and payments use adapter interfaces and disabled feature flags until providers are selected and tested. UI must say “Скоро” and must not simulate calls, charges, or completion.

