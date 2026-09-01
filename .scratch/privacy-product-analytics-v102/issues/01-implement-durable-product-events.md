# Implement durable product events

Status: resolved

## Scope

Create the strict Analytics Engine writer, wire an initial set of authoritative server-side lifecycle events, add privacy/failure-isolation tests, and publish an isolated Draft PR from the production v99 baseline.

## Comments

- 2026-09-01: the existing platform Analytics Engine binding is used by support and background-job telemetry, while the public website helper is not called anywhere. A separate fixed-schema product dataset is required to prevent semantic drift.
- 2026-09-01: no stable user or workspace key will be written; return-rate and user-level funnel metrics remain unavailable until a separately reviewed cohort-safe aggregate design exists.
- 2026-09-01: validation passed: type-check, lint, generated Cloudflare types, the three-environment Cloudflare matrix, 17 focused tests, and the full platform suite (1,415 tests; 0 failures).
