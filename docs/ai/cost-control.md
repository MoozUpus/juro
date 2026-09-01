# JURO AI cost control

Status: **VERIFIED in source and automated tests; live policy state separate**

Evidence cutoff: **2026-09-01**

## Control layers

| Layer | Behavior | Source |
| --- | --- | --- |
| Product entitlement | checks plan and answer-cycle allowance before chargeable work | AI route and entitlement modules |
| Operational feature flags | independently enables AI chat, OpenAI primary, Anthropic fallback, Lex discovery, and secondary research | `lib/operations/operational-feature-flags.ts` |
| Provider circuit | rejects calls when a versioned environment/provider policy is open | `lib/ai/provider-cost-control.ts` |
| Request budget | bounds retrieval, provider attempts, fallback, and finalization | `lib/ai/execution-budget.ts` |
| Usage ledger | records provider/model/operation/token outcome idempotently | `lib/ai/provider-usage.ts` |
| Admin observability | exposes aggregate policy and usage data only through privileged staff routes | staff/admin API and console |

Provider usage telemetry is designed not to include prompts, answers, source excerpts, credentials, or raw provider response bodies. Failed telemetry persistence does not turn an otherwise validated durable result into a user-visible provider failure; reconciliation remains possible from the completed AI run.

## Open evidence

- Current production circuit and spend-policy rows were not read for v113.
- Provider billing dashboards and balances are external state and are not inferred from source.
- The current branch is not deployed, so its aggregate product-metrics console is not claimed live.

Detailed source: [`apps/platform/docs/ai-platform/COST-CONTROL.md`](../../apps/platform/docs/ai-platform/COST-CONTROL.md).
