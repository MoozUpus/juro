# JURO AI Cost Control

Status: **runtime controls implemented; post-go-live pricing is complete, while provider-billing reconciliation and a representative optimization baseline remain open**

## Implemented controls

- fast Legal Answers default to the balanced OpenAI chat model; deep mode is explicit rather than routine;
- provider calls are server-side and record bounded usage/cost metadata without prompts, answers, document text, filenames, or direct identity fields;
- immutable model price versions and cost events support reproducible accounting instead of hard-coded historical estimates;
- daily/failure circuit-breaker policies can stop guarded provider calls and produce content-free operational alerts;
- reserved usage is released when clarification, cancellation, timeout, or provider failure produces no chargeable answer;
- fallback records the actual provider/model and avoids double charging;
- document-analysis attempts and deadlines are bounded; quick analysis gets one attempt per provider by default;
- health probes use cooldowns so degraded providers are not called every scheduler cycle.

## Production evidence snapshot — 2026-09-01

The following evidence comes from read-only aggregate queries against production D1. No prompt, Legal Answer, document text, filename, identity value, legislation/corpus content, or vector data was selected, and every query reported `rows_written=0`.

### Dataset quality

| Dataset | Grain and coverage | Integrity result | Interpretation |
| --- | --- | --- | --- |
| `ai_provider_usage_events` | 65 provider attempts from `2026-08-07T17:50:00.391Z` through `2026-08-29T15:24:43.603Z`; 49 succeeded and 16 failed | 65/65 unique IDs; no invalid status/error pair, timestamp inversion, future row, negative usage, zero-usage success, or partial tenant scope | Structurally trustworthy for the recorded period, but stale for post-funding user traffic |
| `ai_runs` | 50 product runs from `2026-08-07T17:49:53.373Z` through `2026-08-29T15:24:40.801Z`; 46 completed and 4 failed | 50/50 unique IDs; no missing provider/model on completion, invalid token count, negative latency, failed row without an error, or missing tenant scope | Useful for historical routing/latency observation; not a current post-funding workload |
| `ai_cost_daily_aggregates` | Daily materialization of provider attempts | Every grouped request, failure, token, and estimated-cost total reconciled to the append-only event ledger | Internal aggregation is consistent; this is not reconciliation to provider invoices |

Price versions became effective at `2026-08-25T07:44:49.444Z`. All **5/5** successful attempts after that cutoff have a price version and estimated cost; there are **0** unpriced post-cutoff successes. All **44** successful attempts before the cutoff are unpriced because no applicable price version existed, so the missing historical cost is an explicit lack of backfill rather than an active price-lookup failure.

Recorded estimated cost is **113,652 micro-USD ($0.113652)**. This is only the five priced production successes and must not be presented as lifetime spend, an invoice total, or the current post-funding run rate.

### Small-sample cost and latency observations

| Workload | Observed sample | Recorded result |
| --- | --- | --- |
| Fast Legal Answer via OpenAI `gpt-5.6-terra` | 3 priced successful attempts | $0.032691 total; $0.010897 average per successful attempt |
| Deep Legal Answer via OpenAI `gpt-5.6-sol` | 2 priced successful attempts and 2 failed attempts | $0.080961 total; $0.0404805 average per successful attempt |
| Historical completed fast Legal Answer via `gpt-5.6-terra` | 38 completed runs | 7,451.9 ms mean, 6,028 ms p50, 20,292 ms p95 |
| Historical completed deep Legal Answer via `gpt-5.6-sol` | 3 completed runs | 27,017 ms mean, 25,155 ms p50, 45,966 ms p95 |
| Historical Anthropic Legal Answer fallback | 1 completed run | 17,166 ms; no post-price real-usage sample |

The observed priced average for Terra is about 73.1% below Sol, and the historical Terra latency is lower in this dataset. The samples are tiny, non-random, and not workload-equivalent, so they do **not** prove causal savings, quality equivalence, or a routing-policy win. Synthetic health probes are intentionally separate from customer usage and do not create cost rows.

At `2026-09-01T04:58:58.390Z` the public production snapshot was `operational` with 8/8 components operational and no active incident; the current OpenAI and Anthropic probes were operational at 3,467 ms and 7,198 ms respectively. This closes the provider-availability blocker for that checked window, not the cost or Legal Answer quality gates.

## Open cost gates

- reconcile JURO ledgers against current OpenAI and Anthropic billing exports;
- collect enough equivalent post-funding Legal Answer and document-analysis runs to publish a representative p50/p95 cost and latency baseline by feature, mode, provider, and outcome;
- validate price-version ownership and alert delivery in production;
- define reviewed budget thresholds from measured usage rather than invented targets;
- run a controlled primary-provider outage/fallback exercise and prove that one user run is not double charged;
- compare optimization results only on equivalent validated Legal Answer/document-analysis workloads.

Detailed implementation evidence is in [`COST-CONTROL.md`](../../apps/platform/docs/ai-platform/COST-CONTROL.md). Current provider recovery removes the availability blocker but does not close billing reconciliation.
