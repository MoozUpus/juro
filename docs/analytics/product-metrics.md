# JURO Privacy-Conscious Product Metrics

Status: **event contract implemented for the first durable conversion slice; full funnel coverage and production baseline remain open**

## Decision framework

The first operating question is whether a new account reaches a useful, trustworthy Legal Answer and then advances into a durable legal workflow without harming quality, privacy, reliability, or cost. The weekly review should use three primary KPIs:

| Primary KPI | Definition | Decision use | Current source |
| --- | --- | --- | --- |
| Value activation rate | accounts with a completed first Legal Answer within 7 days of signup / completed signups | detect whether onboarding reaches legal value | requires a later cohort-safe aggregate from D1; raw account identifiers are forbidden in Analytics Engine |
| Workflow progression rate | activated accounts that create a plan, case, lawyer request, or consultation within 7 days / activated accounts | test whether the Legal Answer leads to a practical next step | durable D1 records; v102 also emits content-free milestone counts |
| Successful Legal Answer cost | estimated provider cost / completed, validated Legal Answers | control unit economics without rewarding failed/unsupported answers | `ai_provider_usage_events` plus `ai_runs`; provider invoice reconciliation remains separate |

Driver metrics are time to first value, Legal Answer completion rate, plan/case creation, source-open rate, and lawyer conversion. Guardrails are citation-validation failure, source-not-found/outdated-source rate, user-reported error rate, p95 latency, provider availability, fallback rate, and analytics privacy violations.

No numerical target is set in v102. The existing production priced sample is only five successful provider attempts and the product-event dataset has no released baseline; a firm target would be invented.

## Product event row contract

Dataset bindings are environment-isolated:

- `juro-product-events-development`;
- `juro-product-events-staging`;
- `juro-product-events-production`.

Every `product_event_v1` row uses the same layout:

| Column | Meaning | Allowed shape |
| --- | --- | --- |
| `blob1` | schema version | exactly `product_event_v1` |
| `blob2` | event name | closed event allowlist |
| `blob3` | surface | `website` or `platform` |
| `blob4` | locale | `ru`, `uz`, `en`, or `unknown` |
| `blob5` | account type | closed non-identifying account-type allowlist |
| `blob6` | outcome | `started`, `completed`, or `failed` |
| `blob7` | reason | closed safe-code allowlist; never free text |
| `double1` | event count | always `1` |
| `double2` | duration | bounded milliseconds, otherwise `0` |
| `index1` | sampling/identity key | intentionally absent |

Forbidden data includes IDs, stable pseudonymous keys, URLs, IPs, questions, Legal Answers, chat content, document text or metadata, filenames, names, emails, phones, OTPs, provider payloads, and free text. Unknown keys make the event invalid. Analytics failure is best-effort and cannot reverse the durable product action.

## Event coverage

| Event | Authoritative completion point | v102 status |
| --- | --- | --- |
| `plan_created` | case creation or non-replayed AI plan save after D1 success | `IMPLEMENTED` |
| `case_created` | case/plan D1 batch success | `IMPLEMENTED` |
| `lawyer_request_created` | request, consent, conflict-check, and audit D1 batch success | `IMPLEMENTED` |
| `consultation_scheduled` | booking, slot, consent, and audit D1 batch success | `IMPLEMENTED` |
| `feedback_submitted` | first non-replayed AI feedback D1 save | `IMPLEMENTED` |
| `landing_view`, `start_scenario`, `signup_started`, `source_opened`, `lawyer_viewed`, `paid_action_started` | browser interaction | `OPEN`: requires consent-aware client collection and anti-abuse design |
| `signup_completed`, `first_question_sent`, `clarification_completed`, `document_uploaded`, `document_analyzed`, `document_compared`, `lawyer_request_accepted` | durable server transition | `OPEN`: add only at an idempotent authoritative transition |
| `AI_error`, `retrieval_fallback`, `source_not_found` | content-free AI outcome | `OPEN`: existing SLO/cost ledgers are authoritative; avoid duplicate or inconsistent counting |

## Metric dictionary and limitations

| Metric | Numerator / denominator | Grain and caveat |
| --- | --- | --- |
| activation rate | activated accounts / completed signups | requires cohort-safe aggregation; milestone counts alone are insufficient |
| time to first value | first completed useful Legal Answer time - signup completion time | p50/p95 from D1; no raw identity export |
| completion rate | completed Legal Answers / first questions sent | separate clarification-required and cancelled outcomes |
| drop-off by step | entries that do not reach the next defined milestone / entries at the step | only after all relevant events share one release contract |
| return rate | accounts with a useful action in a later review window / activated accounts | cannot be calculated from identity-free Analytics Engine rows |
| plan completion | completed plans / created plans | define terminal/cancelled handling before release |
| case creation | created cases / activated accounts | denominator requires cohort aggregate |
| lawyer conversion | accepted lawyer requests or scheduled consultations / lawyer views | browser view and accepted-state events remain open |
| source open rate | Legal Answers with at least one source opened / completed Legal Answers | client event remains open |
| cost per successful answer | estimated provider cost / completed validated Legal Answers | reconcile to OpenAI/Anthropic billing exports |
| average AI cost | total estimated provider cost / provider attempts or product runs | always state the chosen denominator |
| escalation rate | lawyer requests / completed Legal Answers | cohort/window alignment required |
| web fallback rate | Live Official Search or Secondary Web Research runs / retrieval runs | keep Source Ladder stages separate |
| citation validation failure | failed citation validations / citation validations | legal-quality gate; provider health is not a substitute |
| outdated source rate | runs blocked for stale source / source-grounded runs | source freshness work is outside v102 |
| user-reported error rate | error-coded feedback / completed Legal Answers | `feedback_submitted` reason is allowlisted; deduplicate replays |
| latency | p50/p95 end-to-end and first-useful latency | use `ai_slo_telemetry_events`, not browser guesses |
| provider availability | successful fresh probes / scheduled probes | report OpenAI and Anthropic separately |

## Release interpretation

The v102 slice can count selected durable milestones by environment, locale, account type, outcome, and safe reason. It cannot yet calculate account-level activation, return, or multi-step funnel conversion because the dataset deliberately contains no stable identity. Those metrics require a separately reviewed D1 aggregation that emits only thresholded cohort totals, not pseudonymous rows.
