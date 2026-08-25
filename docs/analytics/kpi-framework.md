# KPI framework

## Measurement principle

JURO measures whether a person reaches a safe, useful legal outcome—not whether
the product merely produced tokens or page views. Telemetry is aggregate and
content-free: exact event names, locale, surface, outcome, provider/fallback,
and bounded elapsed time only.

## Primary KPIs

| KPI | Definition | Why it matters |
| --- | --- | --- |
| Verified activation rate | New completed signups that reach a successful source-backed legal answer, completed document analysis, or saved case plus plan within 7 days / completed signups | Captures first defensible product value. |
| Time to first verified value | Time from `signup_completed` to the first qualifying outcome, reported p50/p75/p95 | Exposes onboarding and retrieval friction. |
| Cost per successful grounded outcome | Priced provider cost / successful source-backed answers plus completed document-analysis outcomes | Connects AI spend to useful work. |

No business target is invented in this audit. Baselines must be measured after
the event contract is deployed and an observation window is complete; targets
then require an owner and review date.

## Funnel and driver metrics

The canonical event vocabulary is:

`landing_view`, `start_scenario`, `signup_started`, `signup_completed`,
`first_question_sent`, `clarification_completed`, `source_opened`,
`plan_created`, `case_created`, `document_uploaded`, `document_analyzed`,
`document_compared`, `lawyer_viewed`, `lawyer_request_created`,
`lawyer_request_accepted`, `consultation_scheduled`, `paid_action_started`,
`AI_error`, `retrieval_fallback`, `source_not_found`, and
`feedback_submitted`.

Report conversion and time between adjacent applicable steps, segmented only by
approved low-cardinality fields such as locale, surface, outcome, and provider.
Never infer a person-level funnel from content or raw identifiers.

## Guardrails

- citation validation and unsupported-claim rate must not regress;
- AI error, retrieval fallback, and source-not-found rates must stay visible;
- p95 complete useful chat response remains a release guardrail of 30 seconds;
- cross-tenant/privacy tests and the telemetry allowlist must pass;
- unpriced provider requests must be zero for the active price window;
- successful releases are reported separately from overall service health.

The production Analytics Engine dataset is the source for aggregate product
events. This audit did not have a connector capable of querying that dataset, so
no funnel baseline or conversion claim is reported yet.
