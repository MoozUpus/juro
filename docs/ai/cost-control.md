# JURO AI Cost Control

Status: **runtime controls implemented; provider-billing reconciliation and a current optimization baseline remain open**

## Implemented controls

- fast Legal Answers default to the balanced OpenAI chat model; deep mode is explicit rather than routine;
- provider calls are server-side and record bounded usage/cost metadata without prompts, answers, document text, filenames, or direct identity fields;
- immutable model price versions and cost events support reproducible accounting instead of hard-coded historical estimates;
- daily/failure circuit-breaker policies can stop guarded provider calls and produce content-free operational alerts;
- reserved usage is released when clarification, cancellation, timeout, or provider failure produces no chargeable answer;
- fallback records the actual provider/model and avoids double charging;
- document-analysis attempts and deadlines are bounded; quick analysis gets one attempt per provider by default;
- health probes use cooldowns so degraded providers are not called every scheduler cycle.

## Open cost gates

- reconcile JURO ledgers against current OpenAI and Anthropic billing exports;
- record a release-specific p50/p95 cost and latency baseline by feature, mode, provider, and outcome;
- validate price-version ownership and alert delivery in production;
- define reviewed budget thresholds from measured usage rather than invented targets;
- compare optimization results only on equivalent validated Legal Answer/document-analysis workloads.

Detailed implementation evidence is in [`COST-CONTROL.md`](../../apps/platform/docs/ai-platform/COST-CONTROL.md). Current provider recovery removes the availability blocker but does not close billing reconciliation.
