# Cost control

Status: local candidate through migration `0082`; staging remains through `0068`.

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

Migration `0082_provider_cost_circuit_breaker.sql` adds versioned, administrator-
entered guard policies, one circuit state per environment/provider, immutable
cost-control events and operational-alert delivery evidence. A policy can bound
either priced daily spend or a rolling provider-failure count. No monetary
threshold is hard-coded. The evaluator opens a circuit and creates the event,
alert job and identifiers-only `email.send` outbox row in one D1 batch. Repeated
evaluation of an already-open circuit cannot enqueue another alert for that
state transition.

The OpenAI/Anthropic chat and document-analysis transports check the circuit
immediately before a real provider call. A blocked primary may use the existing
explicit provider fallback, while a blocked or unavailable fallback ends with a
typed `PROVIDER_CIRCUIT_OPEN`/provider-unavailable result and no usage charge.
Completed and failed calls record the actual provider, model, request identifier
and provider-reported token counts where available. A successful user-visible
AI result is not finalized if its usage evidence cannot be persisted.

The protected cost console can create a new immutable policy version and
manually open or close a circuit. These writes retain the existing operations
capability, active-TOTP, fresh-MFA and same-origin/CSRF boundaries. Closing a
circuit is a deliberate operator action and is recorded as an immutable event;
the automatic evaluator never silently closes it.

Operational alert delivery reloads only the bounded event record from D1 and
uses `OPERATIONS_ALERT_EMAIL` from server runtime configuration. The email and
queue envelope contain no prompt, answer, document, user email or tenant name.
Delivery is idempotent and records provider response evidence or a bounded safe
error. `OPERATIONS_ALERT_EMAIL` is not a secret and is never persisted in the
cost tables.

Open gates after `0082`: authorized backup/migration/deploy, an official
effective price and reviewed threshold policy, a controlled threshold crossing
in staging, real Resend delivery plus retry evidence, provider-billing
reconciliation, and a documented open/close rehearsal. Provider calls outside
the integrated chat/document-analysis/embedding paths must adopt the same guard
before they can be counted as covered. Production remains unchanged.
