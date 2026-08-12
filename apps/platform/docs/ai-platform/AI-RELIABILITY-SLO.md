# Interactive AI reliability and status evidence

Status: **staging deployed; statistical SLO and dependency-health gates remain open**.
Updated: 2026-08-12

This document describes the contracts introduced with migrations `0112` and
`0113`, plus the evidence actually observed for their 2026-08-12 staging
checkpoint. It does not claim production deployment, a healthy provider fleet,
or measured p50/p95 performance.

## Staging checkpoint — 2026-08-12

The following facts are verified for **staging only**. Production was not part
of this rollout.

- The private `juro-staging-backups` R2 bucket contains pre- and post-change D1
  exports at `d1/releases/20260812T122912Z/pre-0112-0113.sql` and
  `d1/releases/20260812T122912Z/post-0112-0113.sql`. Both were read back and
  checked by SHA-256.
- `0112_dependency_health_checks.sql` and then
  `0113_ai_slo_telemetry.sql` were applied to `juro-staging`. A remote
  `foreign_key_check` returned no rows. The verified isolated post-change
  restore reported `quick_check=ok` and zero foreign-key violations. The
  managed D1 endpoint returned `SQLITE_NOMEM` for remote `quick_check`, so this
  document does **not** describe that endpoint check as passed.
- Staging Worker `juro-platform-staging` was first deployed as version
  `d11cd7cd-022c-4501-84ed-ed73befa3959`, then updated as version
  `f79f560a-bc9d-449f-aa7c-a421e2af2d9e`. Its staging-only rolling provider
  probe flag is enabled; no production probe flag or production artifact was
  changed.
- One authenticated OpenAI legal-chat telemetry record completed with
  `first_useful_latency_ms=148` and `end_to_end_ms=7455`, both inside the
  5-second/30-second targets. The browser observed the corresponding honest
  clarification state within roughly 4.5 seconds; browser polling is not a
  TTFT measurement.
- A newer post-deploy OpenAI probe completed with a `3063 ms` first useful
  event and `4510 ms` end-to-end result. These individual results are not a
  percentile. The telemetry summary remains **insufficient** until at least its
  configured 20 representative samples are available, and it must not be
  reported as p50/p95 compliance.
- Earlier Anthropic rolling probes recorded `PROVIDER_TIMEOUT` at about five
  seconds, correctly making the former projection degraded. The subsequent
  `f79f560a-bc9d-449f-aa7c-a421e2af2d9e` deployment produced a post-deploy
  Anthropic completion with a `6301 ms` provider stage and `6448 ms` end to
  end; the Anthropic dependency-health evidence is now operational. This
  supersedes the prior timeout for current health, but not the sample-count
  requirement or a fleet/SLO certification.

## Interactive legal-chat contract

- Registered and guest interactive legal-chat paths use one monotonic,
  request-scoped **30-second absolute deadline**. Authentication/context,
  verified retrieval, primary provider, eligible fallback, validation and
  persistence all consume that same deadline.
- A fallback receives only the remaining time after a bounded reserve for
  validation/persistence; it never starts another 30-second window. A result
  that cannot be durably finalized within the deadline is failed and its usage
  reservation is released rather than charged as a late success.
- Interactive retrieval has a 2.25-second stage limit and reads only reviewed,
  locally persisted D1 legal evidence. Live Lex/Advice fetches are not on the
  user-answer path. A timeout or unavailable verified corpus produces the
  existing fail-closed clarification boundary, not an unverified legal claim.
- On the SSE path, the server sends a real, source-bound preliminary event after
  the bounded retrieval: either a verified excerpt with canonical metadata or
  an explicit clarification-required state. It is not model text and does not
  bypass the final Zod, source-boundary, usage or persistence checks. A regular
  JSON request has no early-result claim.
- The complete response remains the only durable, chargeable result and is
  emitted after strict schema validation, verified-source enforcement and the
  final persistence batch.

## SLO telemetry

The operational targets are **first useful SSE result within 5 seconds** and
**durably completed response within 30 seconds**. They are targets, not a
performance assertion.

Migration `0113_ai_slo_telemetry.sql` adds the append-only,
content-free `ai_slo_telemetry_events` ledger. It records only an opaque
correlation hash, environment/mode/provider/model/outcome/fallback and bounded
stage timings (including first useful result, provider TTFT where available,
validation and persistence). It must never contain a prompt, answer, document,
URL, account identifier, provider payload or credential.

The summary code reports sample sufficiency before interpreting p50/p95. It
must show **insufficient** rather than a passing SLO until its configured
minimum sample exists. OpenAI TTFT is based on the first actual non-empty SSE
delta. Anthropic's current non-streaming path leaves provider TTFT `null`; it
does not invent a token-level measurement. Telemetry is best-effort after a
durable user result, so telemetry persistence cannot convert a valid legal
answer into an error. Conversely, a staging probe that cannot persist its own
technical SLO evidence is marked failed and cannot create a green provider
signal.

## Dependency health is evidence-based

Migration `0112_dependency_health_checks.sql` adds an append-only,
environment-scoped, content-free dependency ledger. It covers D1, private R2,
queues/DLQ, scanner, OpenAI, Anthropic, Resend, legal-source sync, document
analysis, document builder and lawyer area. Update/delete triggers preserve the
evidence trail.

Status starts at **unknown**. A component becomes operational only when every
required dependency has fresh operational evidence in the same environment.
Missing evidence remains unknown; aged operational/unknown evidence becomes
stale; an explicit failure remains degraded/partial-outage/outage. An active
operator incident may make the public projection more severe, but cannot turn
missing evidence green. See [system status](./ARCHITECTURE.md#operational-status)
for the architectural boundary.

## Staging probes and flags

`STAGING_SYNTHETIC_PROBES_ENABLED` is accepted only when `APP_ENV=staging`.
It is enabled in the 2026-08-12 staging artifact named above. The five-minute
scheduler may therefore run rolling provider/lifecycle diagnostics. The v27
probe uses a single
shared 30-second budget, covers the configured providers, rotates RU/UZ
coverage, persists technical evidence only, and removes its synthetic tenant
rows. It has no HTTP endpoint and is inert in development and production.

This flag is separate from `MALWARE_SCANNER_PROBE_ENABLED` and
`STAGING_DOCUMENT_ANALYSIS_PROBE_ENABLED`; turning on provider probes does not
enable a scanner or document-analysis execution. `LEGAL_DIRECT_RETRIEVAL_ENABLED`
continues to govern staff/health tooling and does not permit live retrieval in
interactive chat. The exact probe contract is in
[STAGING-PROVIDER-PROBE.md](./STAGING-PROVIDER-PROBE.md).

## Repeat rollout and rollback

The checkpoint above followed the required private backup, isolated-restore,
ordered migration and staging-only deployment sequence. Repeat that sequence
before any future migration or recovery operation; do not infer evidence from
secret presence, a successful build, or a flag value.

For an incident, first disable `STAGING_SYNTHETIC_PROBES_ENABLED` or restore the
prior staging Worker. Both migrations are additive and append-only, so leave
their tables and evidence intact. Restore D1 only for demonstrated corruption
from an independently verified private backup. Production remains outside this
rollout and needs separate approval. See [ROLLBACK.md](./ROLLBACK.md).

## Open gates

- Sufficient, representative staging samples are required before reporting
  p50/p95 or claiming either SLO is met.
- The post-deploy Anthropic recovery is one fresh operational observation, not
  enough data to certify its tail behavior or the end-to-end SLO.
- Browser, accessibility, legal-quality, scanner and document-analysis gates
  are independent; no provider probe satisfies them.
