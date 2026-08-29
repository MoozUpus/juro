# Cost control

Status: local candidate includes migrations `0162` and `0163`; production remains unchanged.

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

Migration `0162_scoped_ai_cost_budgets.sql` adds a second, independent control
layer for a technical user or an allowlisted feature. Each immutable policy
version has operator-entered daily and monthly micro-USD limits and one action:
alert only, disable Deep calls, or block all provider calls in that scope. The
protected Admin console shows current UTC day/month spend, price completeness,
events and alert-delivery state. No threshold is seeded or inferred.

The integrated scopes are authenticated and guest chat, document analysis, and
private-document indexing/search. Internal legal-corpus ingestion is excluded
by the current release boundary. Scoped budget errors do not initiate a paid
provider fallback. Unpriced successful usage creates identifiers-only daily
warning evidence but is not given fake cost and does not prove that a monetary
limit has been reached.

Events, alert jobs and `email.send` outbox rows are created idempotently. The
recipient comes from `OPERATIONS_ALERT_EMAIL` only at delivery; the budget
tables keep no address or user content. The evaluator is a D1 request-boundary
guard, not a provider billing hard cap: concurrent in-flight calls may overshoot
a threshold, and provider/D1 reconciliation remains an operator responsibility.

Migration 0162 is local-only and excluded from the production
`migrations_pattern`. Release still requires a verified backup/restore, ordered
migration and exact-Worker rehearsal, reviewed operator thresholds, controlled
daily/monthly crossings, real delivery/retry evidence, and authenticated Admin
verification. The 30% cost-reduction target remains unverified.

Migration `0163_anthropic_prompt_cache_accounting.sql` adds content-free
cache-write token counters to immutable provider events and daily aggregates.
The Anthropic transport marks only its static system-instruction block with an
explicit five-minute cache breakpoint; user messages, history, retrieved
sources and documents remain outside it. Because Anthropic reports uncached,
cache-read and cache-write input separately, JURO normalizes total input and
prices five-minute writes at the documented 1.25x ordinary input rate using
integer arithmetic. Admin shows write-token volume separately from hit rate and
read-token share. The migration and matching Worker are local-only; real cache
hit, latency and cost-reduction evidence still require an authorized release and
comparable sample.
