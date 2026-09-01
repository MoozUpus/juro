# JURO Model Evaluation

Status: **contract and synthetic evaluation assets exist; full current release evaluation is not claimed here**

## Evaluation layers

| Layer | Purpose | Evidence |
| --- | --- | --- |
| schema/transport | reject malformed, truncated, refused, or provider-incompatible output | provider and structured-output tests |
| source boundary | prevent unsupported claims/citations from surviving normalization | legal-source trust and citation tests |
| routing/failure | bounded retry, fallback, timeout, cancellation, idempotency, no double charge | AI gateway, provider, SLO, and cost-control tests |
| RU/UZ synthetic cases | adversarial prompts, false citations/articles, injection, follow-up, source absence | 314-case evaluation definition and release-gate tests |
| production dependency probes | current provider transport and structured clarification contract | repeated content-free OpenAI/Anthropic D1 evidence |
| human legal review | legal accuracy and source-span approval | remains a separate gate and is not inferred from automation |

## Release interpretation

A provider being operational does not mean a model is legally accurate. A green synthetic corpus does not prove the production source set is current. A historical staging probe does not prove the present production configuration. Model changes therefore require:

1. allowlist/config review;
2. schema, privacy, cost, timeout, retry, and fallback regression;
3. RU/UZ evaluation replay on the same validated input packets;
4. source-coverage and unsupported-claim review;
5. human review where the quality gate requires it;
6. fresh production-safe dependency evidence after release.

The legislation/corpus data population and legal-source freshness evaluation are excluded from this v100 increment. The existing detailed framework is in [`LEGAL-EVALUATION.md`](../../apps/platform/docs/ai-platform/LEGAL-EVALUATION.md) and [`AI-RELIABILITY-SLO.md`](../../apps/platform/docs/ai-platform/AI-RELIABILITY-SLO.md).
