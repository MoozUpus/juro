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
| Activation rate | completed signups reaching a validated source-backed answer, completed analysis, or saved case plus plan within 7 days / completed signups | `INSTRUMENTED CANDIDATE / INSUFFICIENT SAMPLE`; D1 now computes a mature 30-day cohort server-side and returns aggregates only. A read-only 2026-08-29 production replay found 2/10 activated (20.0%), which is below the 30-signup comparison gate. |
| Time to first value | p50/p75/p95 elapsed time from completed onboarding to the first qualifying outcome | `INSTRUMENTED CANDIDATE / PRIVACY-SUPPRESSED`; only two production actors qualified in the replay, below the five-activation disclosure floor. |
| Completion rate | successful terminal events / matching started events, by workflow | `INSUFFICIENT_SAMPLE`; no signup or document-completion pair exists in the current window |
| Step drop-off | 1 minus adjacent-step completion rate | `INSUFFICIENT_SAMPLE`; do not infer a funnel from unrelated event totals |
| 7-day engaged return | activated actors with a new explicit product action on a later UTC day within 7 days / activated actors in a fully observed cohort | `INSTRUMENTED CANDIDATE / PRIVACY-SUPPRESSED`; the protected D1 aggregate excludes passive session refreshes. A read-only production replay found 0/2 returning, below the five-activation disclosure floor. |
| Plan completion | completed plans / created plans in the same 30-day D1 window | `INSTRUMENTED CANDIDATE / PRIVACY-SUPPRESSED`; the read-only production replay found only three created plans. |
| Case creation | `case_created` count and, once comparable, `case_created / signup_completed` | Instrumented; zero current-window events |
| Lawyer conversion | unique actors creating a lawyer request within 7 days of their first authenticated directory view / unique first-time directory viewers in a fully observed cohort | `INSTRUMENTED CANDIDATE / AWAITING OBSERVATION`; migration 0164 adds daily-deduplicated internal visit evidence. The existing 13 Analytics Engine view occurrences remain non-joinable and are not reused as unique visitors. |
| Lawyer-request acceptance | requests in `accepted`, `offer_proposed`, `offer_accepted`, or `completed` / requests created in the same 30-day D1 window | `INSTRUMENTED CANDIDATE / PRIVACY-SUPPRESSED`; the read-only production replay found two requests, one accepted-or-later and zero completed. This is not browse-to-request conversion. |
| Source open rate | `source_opened / successful answer outcomes` in the same window | Instrumented; current counts are too small and unlinked for a rate claim |
| Cost per successful answer | priced successful provider cost / priced successful answers | `INSUFFICIENT_SAMPLE`; 4/30 priced successes, `$0.104549` total |
| Average AI cost | priced provider cost / fully priced provider requests, reported separately for success/failure | `INSUFFICIENT_SAMPLE`; zero-token failures may understate billed failed work |
| Scoped budget utilization | priced UTC day/month cost / operator-entered scope limit, reported separately for technical user and allowlisted feature | Instrumented in candidate `f312a930`; no production policy or threshold exists |
| Scoped budget breach rate | unique `cost_limit` events / active scope-periods, split by daily/monthly and configured action | Instrumented in candidate `f312a930`; unpriced warnings are excluded because unknown cost is not a proven breach |
| Deep budget suppression | Deep attempts rejected by `disable_deep` / Deep attempts subject to an active reached policy | Instrumented as a control outcome; no production value is claimed before policy deployment and a comparable sample |
| AI cache-hit request rate | successful provider calls with positive input and cached-input tokens / successful provider calls with positive input tokens | Instrumented in candidate `a08698df`; no production value is claimed before release |
| AI Deep escalation rate | completed authenticated legal-chat runs in Deep mode / all completed authenticated legal-chat runs in the same window | Instrumented in candidate `a08698df`; excludes guest AI and document analysis by definition |
| Provider fallback rate | completed authenticated legal-chat runs with `fallback_from_provider` / completed authenticated legal-chat runs | Instrumented in candidate `a08698df`; minimum comparable sample is still required |
| Lawyer escalation rate | lawyer requests created / eligible AI or case outcomes | Instrumented numerator; eligible denominator is not yet comparable |
| AI cost by user | priced/unpriced provider totals grouped by technical user and workspace identifier | Instrumented in candidate `a08698df`; content and direct contact fields are excluded |
| AI cost by plan | provider totals grouped by the workspace's current subscription plan at read time | Instrumented in candidate `a08698df`; current-plan snapshot is not historical event-time attribution |
| Web fallback rate | `retrieval_fallback / first_question_sent`, same locale/window | Instrumented; current counts are too small and may include controlled QA |
| Citation validation failure | failed citation-validation outcomes / answers subject to validation | `UNVERIFIED`; no dedicated aggregate outcome is emitted |
| Outdated source rate | answers using an outdated source / source-backed answers | `UNVERIFIED`; user feedback subtype `outdated` is a report signal, not proof of source state |
| User-reported error rate | failure-class feedback / all submitted feedback | Contract fixed in the current candidate; future `feedback_submitted` rows carry success/partial/failure and bounded subtype |
| Latency | p50/p75/p95 bounded elapsed time for comparable successful outcomes | Instrumented where callers provide `elapsedMs`; minimum sample remains required |
| Provider availability | successful content-free provider probes / due probes, plus latest state | `VERIFIED CURRENT` independently from product events for OpenAI and Anthropic; after the account top-up, Anthropic passed at `2026-08-29T11:10:56.708Z` in 4,810 ms with no safe error. |

## Guardrails

- citation validation and unsupported-claim rate must not regress;
- AI error, retrieval fallback, and source-not-found rates must stay visible;
- p95 complete useful chat response remains a release guardrail of 30 seconds;
- cross-tenant/privacy tests and the telemetry allowlist must pass;
- unpriced provider requests must be zero for the active price window;
- scoped budget utilization must distinguish UTC daily/monthly periods, active
  policy version and `alert_only`/`disable_deep`/`block_calls`; unknown price
  coverage is an alert, never a fabricated cost or automatic breach;
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
and ordinary use. Analytics Engine alone therefore cannot prove activation,
return, drop-off, or conversion; the protected D1 cohorts below use compatible
actor and observation windows instead of mismatched occurrence totals.

## Privacy-safe D1 cohort computation candidate

The current Draft PR adds a protected RU/UZ Admin dashboard at
`/{locale}/admin/product-kpis` and a no-store aggregate API. Both require
`staff.operations.manage` plus MFA completed within 15 minutes. The query uses
technical user identifiers only inside D1 CTEs; the response contains counts,
basis points, bounded durations and window timestamps, never an identifier,
email, contact field, prompt, answer, case text or document content.

The activation cohort covers completed onboarding from 37 through 7 days before
the snapshot, so every included signup has the full seven-day value window.
Legal-evaluation profiles, the three fixed synthetic investor-demo profiles and
active platform staff are excluded. A grounded answer must be a completed AI run
whose persisted structured result is `responseKind=answer`, has
`sourceValidationStatus=validated` and includes at least one source. Document
analysis must be completed; case activation requires both the case and its plan
inside the seven-day window.

Rates are suppressed below five denominator observations, and TTFV percentiles
below five activated observations. A sample is labelled comparable only from 30
denominator observations. The read-only production replay on 2026-08-29 read
230 rows and wrote zero: 10 eligible signups, two activated users, one grounded
answer user, zero completed-analysis users and two case-plus-plan users. Because
paths can overlap, path counts must not be summed. The observed 20.0% is a small
baseline, not a target or product-market-fit claim; TTFV remains suppressed.
The exact candidate passed focused 3/3, core 1136/1136,
Cloudflare/infrastructure 203/203, rendered Worker 35/35, type-check, lint and
the bounded production artifact gate. Local Chrome verified the localized
RU/UZ protected boundary at desktop and 390 px without a fabricated staff
identity; private noindex, exact re-auth return paths, zero horizontal overflow
and an empty warning/error log were preserved.

Commit `8602e4101e2a61089ac7e5a66a13c6916abd1044` extends that same protected
surface with two narrower metrics. The 7-day engaged-return denominator is the
fully observed activated cohort from 44 through 14 days before the snapshot. A
return requires a new explicit user message, case, document, document-analysis
start, or lawyer request on a later UTC date and no more than seven days after
first value. Session refresh and passive reads are intentionally excluded, so
this is engaged return rather than broad visit retention. A read-only production
replay read 417 rows and wrote zero: 9 eligible signups, 2 activated users and 0
returning users. The rate remains privacy-suppressed because only two users
activated.

Migration `0164_lawyer_directory_daily_visits.sql` prepares compatible
directory-to-request evidence: one content-free row per internal user and UTC
day stores only first/last view timestamps. The first-ever observed directory
view fixes a mature cohort; a request by that actor within seven days is the
numerator. Repeated views cannot move the cohort. Account deletion explicitly
purges the rows, and another user's rows remain isolated in behavioral tests.
The table, matching Worker and observation window are not deployed, so no live
browse-conversion value is claimed. The previous 13 Analytics Engine
`lawyer_viewed` occurrences are not identity-linked and are not substituted for
unique visitors.

The extended candidate passes focused 4/4, core 1137/1137,
Cloudflare/infrastructure 203/203, rendered Worker 35/35, type-check, lint,
ordered migration/foreign-key checks and the bounded artifact gate. Migration
0164 remains outside the production migration pattern; production remains
Worker 170 and Sites v86.
