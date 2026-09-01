# JURO Privacy-Conscious Product Metrics

Status: **event contract and the first cohort-safe D1 dashboard are implemented; production deployment and baseline remain open**

## Decision framework

The first operating question is whether a new account reaches a useful, trustworthy Legal Answer and then advances into a durable legal workflow without harming quality, privacy, reliability, or cost. The weekly review should use three primary KPIs:

| Primary KPI | Definition | Decision use | Current source |
| --- | --- | --- | --- |
| Value activation rate | accounts with a completed first Legal Answer within 7 days of signup / mature completed-signup cohort | detect whether onboarding reaches legal value | v111 D1 aggregate; raw account identifiers never leave D1 |
| Workflow progression rate | mature activated accounts that create a plan, case, lawyer request, or consultation within 7 days / mature activated accounts | test whether the Legal Answer leads to a practical next step | v111 D1 aggregate over durable records |
| Successful Legal Answer cost | priced Legal Chat provider cost / completed, validated Legal Answers | control unit economics without rewarding failed/unsupported answers | v111 D1 aggregate over `ai_provider_usage_events` and `ai_runs`; provider invoice reconciliation remains separate |

Driver metrics are time to first value, Legal Answer completion rate, plan/case creation, source-open rate, and lawyer conversion. Guardrails are citation-validation failure, source-not-found/outdated-source rate, user-reported error rate, p95 latency, provider availability, fallback rate, and analytics privacy violations.

No numerical target is set. v111 does not claim a production baseline: the migration, route, and dashboard must first be deployed, then accumulate a mature and fully priced sample. A firm target before that evidence would be invented.

The protected dashboard uses a fixed 30-day window by default (operator-selectable only to 60 or 90 days). Seven-day conversion metrics include only cohorts that have received the complete seven-day observation window. Product cohorts require at least 10 accounts and apply complementary suppression when either side of a conversion could expose a small positive cell. Downstream time-to-value and workflow cells are also hidden whenever the activation cell is suppressed, preventing them from reconstructing its hidden count. Content-free reliability and provider-probe rates require at least 20 observations. Suppressed and insufficient metrics return `null`, never exact hidden counts.

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
| activation rate | activated accounts / mature completed signups | v111 returns only thresholded aggregate cells; first-question counts are not treated as activation |
| time to first value | first completed useful Legal Answer time - signup completion time | exact nearest-rank p50/p95 are calculated inside D1 and returned only after the cohort threshold |
| completion rate | completed Legal Answers / first questions sent | separate clarification-required and cancelled outcomes |
| drop-off by step | entries that do not reach the next defined milestone / entries at the step | only after all relevant events share one release contract |
| return rate | accounts with a useful action in a later review window / activated accounts | cannot be calculated from identity-free Analytics Engine rows |
| plan completion | completed plans / created plans | define terminal/cancelled handling before release |
| case creation | created cases / activated accounts | v111 includes case creation in the combined workflow-progression KPI; a separate rate needs an adequately sized baseline |
| lawyer conversion | accepted lawyer requests or scheduled consultations / lawyer views | browser view and accepted-state events remain open |
| source open rate | Legal Answers with at least one source opened / completed Legal Answers | client event remains open |
| cost per successful answer | estimated provider cost / completed validated Legal Answers | withheld whenever a successful provider attempt lacks an immutable price version; reconcile to OpenAI/Anthropic billing exports |
| average AI cost | total estimated provider cost / provider attempts or product runs | always state the chosen denominator |
| escalation rate | lawyer requests / completed Legal Answers | cohort/window alignment required |
| web fallback rate | Live Official Search or Secondary Web Research runs / retrieval runs | keep Source Ladder stages separate |
| citation validation failure | failed citation validations / citation validations | legal-quality gate; provider health is not a substitute |
| outdated source rate | runs blocked for stale source / source-grounded runs | source freshness work is outside v102 |
| user-reported error rate | error-coded feedback / completed Legal Answers | `feedback_submitted` reason is allowlisted; deduplicate replays |
| latency | p50/p95 end-to-end and first-useful latency | use `ai_slo_telemetry_events`, not browser guesses |
| provider availability | successful fresh probes / scheduled probes | report OpenAI and Anthropic separately |

## Release interpretation

Identity-free Analytics Engine rows remain suitable for event volume, locale, account type, outcome, and safe-reason trends, but cannot calculate account-level activation, return, or multi-step conversion. v111 therefore records the first validated Legal Answer in a replay-safe D1-local row and performs joins only inside D1. The staff-only route requires `staff.operations.manage`, MFA verified within 15 minutes, `private, no-store`, and a noindex page. Its response contains window metadata, thresholded totals/rates, durations, costs, and content-free technical status only—never a user, workspace, conversation, run, document, URL, or stable pseudonymous identifier.

`IMPLEMENTED` means present and locally verified in the release branch. It does not mean the v111 migration is applied to production or that a production KPI baseline is available.
