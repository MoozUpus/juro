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

The Analytics Engine column contract is fixed across the dataset:

| Column | Meaning |
| --- | --- |
| `blob1` | canonical event name |
| `blob2` | product surface |
| `blob3` | locale |
| `blob4` | outcome |
| `blob5` | provider |
| `blob6` | fallback kind, or the allowlisted public-page kind for `public_site` |
| `double1` | event count |
| `double2` | bounded elapsed milliseconds |

The non-funnel `user_support_ticket_created` operational event shares those
same first six dimensions and stores its allowlisted category and severity only
in `blob7` and `blob8`. AI feedback similarly stores only its bounded feedback
class in `blob7`; the optional comment never enters analytics. This preserves
one queryable schema without adding identity or content.

## Metric definitions and readiness

| Metric | Definition | Current evidence status |
| --- | --- | --- |
| Activation rate | completed signups reaching a successful answer, completed analysis, or saved case plus plan within 7 days / completed signups | `UNVERIFIED`; aggregate events currently have no privacy-safe cohort linkage |
| Time to first value | p50/p75/p95 elapsed time from `signup_completed` to the first qualifying outcome | `UNVERIFIED`; requires aggregate cohort computation rather than raw identifiers in Analytics Engine |
| Completion rate | successful terminal events / matching started events, by workflow | `INSUFFICIENT_SAMPLE`; no signup or document-completion pair exists in the current window |
| Step drop-off | 1 minus adjacent-step completion rate | `INSUFFICIENT_SAMPLE`; do not infer a funnel from unrelated event totals |
| Return rate | activated actors returning in the approved observation window / activated actors | `UNVERIFIED`; no privacy-safe cohort aggregate exists yet |
| Plan completion | completed plan tasks or plans / created plans | `UNVERIFIED`; `plan_created` exists but completion is a D1 workflow aggregate, not a canonical event |
| Case creation | `case_created` count and, once comparable, `case_created / signup_completed` | Instrumented; zero current-window events |
| Lawyer conversion | `lawyer_request_created / lawyer_viewed`, with comparable surface and window | Instrumented; denominator is request-occurrence based and cannot be treated as unique visitors |
| Source open rate | `source_opened / successful answer outcomes` in the same window | Instrumented; current counts are too small and unlinked for a rate claim |
| Cost per successful answer | priced successful provider cost / priced successful answers | `INSUFFICIENT_SAMPLE`; 4/30 priced successes, `$0.104549` total |
| Average AI cost | priced provider cost / fully priced provider requests, reported separately for success/failure | `INSUFFICIENT_SAMPLE`; zero-token failures may understate billed failed work |
| Escalation rate | lawyer requests created / eligible AI or case outcomes | Instrumented numerator; eligible denominator is not yet comparable |
| Web fallback rate | `retrieval_fallback / first_question_sent`, same locale/window | Instrumented; current counts are too small and may include controlled QA |
| Citation validation failure | failed citation-validation outcomes / answers subject to validation | `UNVERIFIED`; no dedicated aggregate outcome is emitted |
| Outdated source rate | answers using an outdated source / source-backed answers | `UNVERIFIED`; user feedback subtype `outdated` is a report signal, not proof of source state |
| User-reported error rate | failure-class feedback / all submitted feedback | Contract fixed in the current candidate; future `feedback_submitted` rows carry success/partial/failure and bounded subtype |
| Latency | p50/p75/p95 bounded elapsed time for comparable successful outcomes | Instrumented where callers provide `elapsedMs`; minimum sample remains required |
| Provider availability | successful content-free provider probes / due probes, plus latest state | `VERIFIED CURRENT` independently from product events for OpenAI and Anthropic |

## Guardrails

- citation validation and unsupported-claim rate must not regress;
- AI error, retrieval fallback, and source-not-found rates must stay visible;
- p95 complete useful chat response remains a release guardrail of 30 seconds;
- cross-tenant/privacy tests and the telemetry allowlist must pass;
- unpriced provider requests must be zero for the active price window;
- successful releases are reported separately from overall service health.

## Production data-quality checkpoint

The production Analytics Engine SQL API was queried read-only on 2026-08-28.
The four-day window contained 24 stored rows representing exactly 24 events;
`_sample_interval` was 1 for every row, so no sampling correction changed the
counts. The observed range was `2026-08-25 08:10:02Z` through
`2026-08-28 01:46:27Z`.

A later read-only checkpoint on the same date used an exact
`toDateTime('2026-08-25 00:00:00')` boundary and returned the same 24 rows and
event totals. A separate boundary at the Worker 166 release time,
`2026-08-28 16:07:52Z`, returned zero stored and represented events. The live
contract is deployed, but no post-release observation growth is claimed yet.

| Event | Count |
| --- | ---: |
| `lawyer_viewed` | 13 |
| `first_question_sent` | 3 |
| `retrieval_fallback` | 2 |
| `source_not_found` | 2 |
| `AI_error` | 1 |
| `source_opened` | 1 |
| `feedback_submitted` | 1 |
| `landing_view` | 1 |

All 24 rows used an allowlisted canonical event and the expected first-six
dimension layout. This proves transport and schema conformance for the observed
rows, not business conversion. Public events are consent-gated, only one
`landing_view` exists, and there are no `signup_started` or `signup_completed`
events. The three first-question events and downstream failure/open/feedback
counts cannot be joined to a person or reliably separated between controlled QA
and ordinary use. Activation, return, drop-off, and conversion therefore remain
`UNVERIFIED` rather than being calculated from mismatched denominators.
