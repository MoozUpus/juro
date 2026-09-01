# JURO Privacy-Conscious Product Metrics

Status: **event contract and the expanded cohort-safe D1 dashboard are implemented through v112; production deployment and baseline remain open**

## Decision framework

The first operating question is whether a new account reaches a useful, trustworthy Legal Answer and then advances into a durable legal workflow without harming quality, privacy, reliability, or cost. The weekly review should use three primary KPIs:

| Primary KPI | Definition | Decision use | Current source |
| --- | --- | --- | --- |
| Value activation rate | accounts with a completed first Legal Answer within 7 days of signup / mature completed-signup cohort | detect whether onboarding reaches legal value | v111 D1 aggregate; raw account identifiers never leave D1 |
| Workflow progression rate | mature activated accounts that create a plan, case, lawyer request, or consultation within 7 days / mature activated accounts | test whether the Legal Answer leads to a practical next step | v111 D1 aggregate over durable records |
| Successful Legal Answer cost | priced Legal Chat provider cost / completed, validated Legal Answers | control unit economics without rewarding failed/unsupported answers | v111 D1 aggregate over `ai_provider_usage_events` and `ai_runs`; provider invoice reconciliation remains separate |

Driver metrics now implemented in the D1 dashboard are time to first value, first-question completion/drop-off, 14-day return, separate case creation, 14-day plan completion, and 14-day lawyer-request acceptance. Guardrails now implemented there are user-reported error rate, end-to-end and first-useful p50/p95 latency, provider availability, fallback rate, successful-answer cost, average successful provider-attempt cost, and analytics privacy thresholds. Source-open and legal-source quality metrics remain intentionally outside this release because they require a separately validated source-quality contract.

No numerical target is set. v112 does not claim a production baseline: migrations, route, and dashboard must first be deployed, then accumulate mature and fully priced samples. A firm target before that evidence would be invented.

The protected dashboard uses a fixed 30-day window by default (operator-selectable only to 60 or 90 days). Seven- and fourteen-day conversion metrics include only cohorts that have received their complete observation window. Product cohorts require at least 10 accounts, plans, requests, or answers as applicable and apply complementary suppression when either side of a conversion could expose a small positive cell. Downstream time-to-value, return, case-creation, and combined-workflow cells are also hidden whenever activation is suppressed, preventing reconstruction of its hidden count. Content-free reliability, latency, provider-probe, and average-attempt-cost metrics require at least 20 observations. Suppressed and insufficient metrics return `null`, never exact hidden counts.

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

| Event | Authoritative completion point | Status |
| --- | --- | --- |
| `plan_created` | case creation or non-replayed AI plan save after D1 success | `IMPLEMENTED` |
| `case_created` | case/plan D1 batch success | `IMPLEMENTED` |
| `lawyer_request_created` | request, consent, conflict-check, and audit D1 batch success | `IMPLEMENTED` |
| `lawyer_request_accepted` | a new two-party case-access grant and request status transition succeed | `IMPLEMENTED` |
| `consultation_scheduled` | booking, slot, consent, and audit D1 batch success | `IMPLEMENTED` |
| `document_uploaded` | upload integrity/format validation and quarantine scan outbox transition succeed; quarantined replay is excluded | `IMPLEMENTED` |
| `document_compared` | comparison result, changes, final state, and audit D1 writes succeed; completed replay is excluded | `IMPLEMENTED` |
| `feedback_submitted` | first non-replayed AI feedback D1 save | `IMPLEMENTED` |
| `signup_completed` | new account and mandatory registration acceptances persist after verified OTP; existing-account and spent-OTP replays are excluded | `IMPLEMENTED` |
| `first_question_sent` | first user question and response persist with a unique D1-local account milestone in the same batch | `IMPLEMENTED` |
| `first_legal_answer_completed` | validated `responseKind=answer`, assistant message, D1-local account activation, and completed AI run persist in one batch | `IMPLEMENTED` |
| `document_analyzed` | normalized result, usage ledger, completed analysis state, index outbox, and audit persist; only the winning `persisting` to `completed` transition emits | `IMPLEMENTED` |
| `landing_view`, `start_scenario`, `signup_started`, `source_opened`, `lawyer_viewed`, `paid_action_started` | consent-aware browser interaction with closed reason codes and no stable identity | `IMPLEMENTED` |
| `clarification_completed` | first follow-up answer whose durable parent is a `clarification_required` response | `IMPLEMENTED` |
| `AI_error`, `retrieval_fallback`, `source_not_found` | content-free AI outcome emitted from durable/validated runtime boundaries | `IMPLEMENTED` |

## Metric dictionary and limitations

| Metric | Numerator / denominator | Grain and caveat |
| --- | --- | --- |
| activation rate | activated accounts / mature completed signups | thresholded aggregate only; first-question counts are not treated as activation |
| time to first value | first completed useful Legal Answer time - signup completion time | exact nearest-rank p50/p95 are calculated inside D1 and returned only after the cohort threshold |
| completion rate | accounts with a first validated Legal Answer within 7 days / mature accounts with a first question | clarification-only responses do not count as completion |
| drop-off by step | first-question accounts without a validated answer within 7 days / mature first-question accounts | the complement of the completion cell; both are hidden together when either side is small |
| return rate | activated accounts with a new user question, case, plan, lawyer request, or consultation 24 hours to 14 days later / mature activated accounts | calculated by D1-local joins; actions inside the first 24 hours are excluded |
| plan completion | plans completed within 14 days / mature plans created | a plan is complete only when its durable status is `completed`; plans with cancelled steps remain non-completers in the denominator |
| case creation | activated accounts that create a case within 7 days / mature activated accounts | separate from the combined workflow-progression rate and activation-dependent for suppression |
| lawyer conversion | lawyer requests with a durable case-access grant within 14 days / mature lawyer requests | request acceptance, not a browser profile view, is the conversion boundary |
| source open rate | Legal Answers with at least one source opened / completed Legal Answers | the identity-free client event is implemented, but it intentionally cannot be joined back to an answer; this rate remains unavailable without a new privacy-safe contract |
| cost per successful answer | estimated provider cost / completed validated Legal Answers | withheld when recorded successful attempts are fewer than completed answers or any attempt lacks an immutable price version; reconcile to OpenAI/Anthropic billing exports |
| average AI cost | total estimated Legal Chat provider cost / successful provider attempts | withheld if any successful attempt lacks an immutable price version; minimum 20 attempts |
| escalation rate | activated accounts with a lawyer request or consultation within 7 days / mature activated accounts | currently visible inside combined workflow progression; request acceptance is reported separately |
| web fallback rate | Live Official Search or Secondary Web Research runs / retrieval runs | keep Source Ladder stages separate |
| citation validation failure | failed citation validations / citation validations | legal-quality gate; provider health is not a substitute |
| outdated source rate | runs blocked for stale source / source-grounded runs | source freshness work is outside v102 |
| user-reported error rate | validated answers with at least one negative feedback category within 7 days / mature validated answers | distinct by assistant answer; repeated or multiple negative categories do not multiply the numerator |
| latency | nearest-rank p50/p95 end-to-end and first-useful latency for completed authenticated Legal Chat requests | calculated inside D1 from content-free `ai_slo_telemetry_events`; minimum 20 completed observations |
| provider availability | successful fresh probes / scheduled probes | report OpenAI and Anthropic separately |

## Release interpretation

Identity-free Analytics Engine rows remain suitable for event volume, locale, account type, outcome, and safe-reason trends, but cannot calculate account-level activation, return, or multi-step conversion. v111 records the first validated Legal Answer in a replay-safe D1-local row; v112 adds only aggregate queries and indexes over existing durable records. All joins remain inside D1. The staff-only route requires `staff.operations.manage`, MFA verified within 15 minutes, `private, no-store`, and a noindex page. Its response contains window metadata, thresholded totals/rates, durations, costs, and content-free technical status only—never a user, workspace, conversation, run, document, URL, or stable pseudonymous identifier.

`IMPLEMENTED` means present and locally verified in the release branch. It does not mean the v110-v112 migrations are applied to production or that a production KPI baseline is available.
