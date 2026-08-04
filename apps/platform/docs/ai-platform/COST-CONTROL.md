# Cost control

Status: local candidate through migration `0081`; staging remains through `0068`.

Provider and queue actions are server-side and record bounded technical/cost
metadata where implemented. Synthetic provider probes are one-time, staging-only,
non-legal requests behind an explicit disabled-by-default flag; they are not retry
loops. Document analysis cannot start before scanner approval, preventing provider
cost from quarantined uploads.

Migration `0081_provider_cost_observability.sql` adds three narrowly scoped
structures:

- immutable provider usage events with environment, tenant identifiers, feature,
  operation, actual provider/model, request ID, token/item counts, status and safe
  error code;
- immutable administrator-entered price versions, effective-dated and bound to an
  official OpenAI or Anthropic HTTPS source;
- mutable daily aggregates updated in the same atomic D1 batch as the immutable
  event.

Embedding calls use the provider response's `usage.prompt_tokens` and
`usage.total_tokens`; token counts are not inferred from document length. The
price unit is integer micro-USD per one million tokens. Cost arithmetic uses
integer `BigInt` math and rounds each request up to one micro-USD. No price is
seeded in code or migration. Until an administrator records an effective price,
the call is retained as `unpriced` instead of receiving a stale fabricated cost.

`/:locale/admin/costs` and `/api/platform/admin/costs` expose the bounded
dashboard and immutable price-entry flow only to `staff.operations.manage`, with
active TOTP and MFA verified within 15 minutes. Writes also require the existing
same-origin/CSRF boundary. Support and legal-reviewer roles cannot access it.

The cost domain stores no prompt, answer, document text, filename, email, phone
or provider secret. Tenant identifiers are retained as opaque accounting evidence
and intentionally do not use account-deletion cascades. This preserves the
required financial history without retaining user content.

Open gates: migration/deploy, official price entry, remote embedding probes,
provider-billing reconciliation, cost thresholds, alert delivery and emergency
circuit-breaker rehearsal. A provider response followed by D1 unavailability can
still require operator reconciliation because provider billing and D1 cannot form
one distributed transaction. Production operational alerts remain release work.
Model configuration stays server-side and must not be inferred from client code.
