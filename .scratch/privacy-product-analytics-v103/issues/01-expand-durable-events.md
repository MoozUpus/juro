# Expand replay-safe durable product events

Status: resolved

## Scope

Instrument the three unambiguous post-commit milestones selected in the v103 specification, prove their replay ordering, and publish a stacked Draft PR after validation.

## Comments

- 2026-09-01: upload finalization already returns `replay: true` for a quarantined record, comparison processing returns early for a completed record, and access grant requires exactly one guarded insert. These are authoritative duplicate barriers.
- 2026-09-01: event rows reuse `product_event_v1`; no new dimension or identity field is added.
- 2026-09-01: upload concurrency now derives `created` and `replay` from the guarded analysis-state update returned by D1; a stale concurrent reader cannot emit a second event.
- 2026-09-01: validation passed: type-check, lint, generated Cloudflare types, the three-environment matrix, and 45 focused analytics/workflow tests.
