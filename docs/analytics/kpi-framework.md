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
| Completion rate | first-question actors receiving the exact request-linked, completed, validated source-backed answer within 7 days / first-question actors in the fully observed 44-to-14-day cohort | `INSTRUMENTED CANDIDATE / INSUFFICIENT SAMPLE`; the 2026-08-29 read-only D1 replay found 0/5 qualifying completions (0.0%). All 5 had an exact completed structured response, but none met the persisted validated-source answer contract. |
| Step drop-off | 1 minus the adjacent actor-level completion rate, separately for first question → validated answer and validated answer → opened source | `INSTRUMENTED CANDIDATE`; first-question-to-answer drop-off is currently 5/5 (100.0%) in the small production cohort. Source-open drop-off awaits migration 0165, the matching Worker and a complete observation window. |
| 7-day engaged return | activated actors with a new explicit product action on a later UTC day within 7 days / activated actors in a fully observed cohort | `INSTRUMENTED CANDIDATE / PRIVACY-SUPPRESSED`; the protected D1 aggregate excludes passive session refreshes. A read-only production replay found 0/2 returning, below the five-activation disclosure floor. |
| Plan completion | completed plans / created plans in the same 30-day D1 window | `INSTRUMENTED CANDIDATE / PRIVACY-SUPPRESSED`; the read-only production replay found only three created plans. |
| Case creation | `case_created` count and, once comparable, `case_created / signup_completed` | Instrumented; zero current-window events |
| Lawyer conversion | unique actors creating a lawyer request within 7 days of their first authenticated directory view / unique first-time directory viewers in a fully observed cohort | `INSTRUMENTED CANDIDATE / AWAITING OBSERVATION`; migration 0164 adds daily-deduplicated internal visit evidence. The existing 13 Analytics Engine view occurrences remain non-joinable and are not reused as unique visitors. |
| Lawyer-request acceptance | requests in `accepted`, `offer_proposed`, `offer_accepted`, or `completed` / requests created in the same 30-day D1 window | `INSTRUMENTED CANDIDATE / PRIVACY-SUPPRESSED`; the read-only production replay found two requests, one accepted-or-later and zero completed. This is not browse-to-request conversion. |
| Source open rate | actors opening the exact qualifying answer's authorized citation within 7 days / actors receiving a qualifying validated source-backed answer | `INSTRUMENTED CANDIDATE / AWAITING OBSERVATION`; migration 0165 adds answer-deduplicated actor evidence. Historical Analytics Engine occurrences remain non-joinable and are not reused as users. |
| Cost per successful answer | priced successful provider cost / priced successful answers | `INSUFFICIENT_SAMPLE`; 4/30 priced successes, `$0.104549` total |
| Average AI cost | priced provider cost / fully priced provider requests, reported separately for success/failure | `INSUFFICIENT_SAMPLE`; zero-token failures may understate billed failed work |
| Scoped budget utilization | priced UTC day/month cost / operator-entered scope limit, reported separately for technical user and allowlisted feature | Instrumented in candidate `f312a930`; no production policy or threshold exists |
| Scoped budget breach rate | unique `cost_limit` events / active scope-periods, split by daily/monthly and configured action | Instrumented in candidate `f312a930`; unpriced warnings are excluded because unknown cost is not a proven breach |
| Deep budget suppression | Deep attempts rejected by `disable_deep` / Deep attempts subject to an active reached policy | Instrumented as a control outcome; no production value is claimed before policy deployment and a comparable sample |
| AI cache-hit request rate | successful provider calls with positive input and cached-input tokens / successful provider calls with positive input tokens | Instrumented in candidate `a08698df`; no production value is claimed before release |
| AI Deep escalation rate | completed authenticated legal-chat runs in Deep mode / all completed authenticated legal-chat runs in the same window | Instrumented in candidate `a08698df`; excludes guest AI and document analysis by definition |
| Provider fallback rate | completed authenticated legal-chat runs with `fallback_from_provider` / completed authenticated legal-chat runs | Instrumented in candidate `a08698df`; minimum comparable sample is still required |
| Lawyer escalation rate | actors creating a lawyer request within 7 days of their first-ever qualifying self-service outcome / actors whose first-ever grounded answer, completed analysis, or case creation falls in the mature 37-to-7-day cohort | `INSTRUMENTED CANDIDATE / PRIVACY-SUPPRESSED`; commit `e452b3ae` fixes one first outcome per actor and joins only a same-actor request in the complete seven-day window. The read-only production replay found 0/3 escalations, below the five-actor disclosure floor and the 30-actor comparison gate. |
| AI cost by user | priced/unpriced provider totals grouped by technical user and workspace identifier | Instrumented in candidate `a08698df`; content and direct contact fields are excluded |
| AI cost by plan | provider totals grouped by the workspace's current subscription plan at read time | Instrumented in candidate `a08698df`; current-plan snapshot is not historical event-time attribution |
| Web fallback rate | `retrieval_fallback / first_question_sent`, same locale/window | Instrumented; current counts are too small and may include controlled QA |
| Citation validation failure | failed citation-validation outcomes / answers subject to validation | `UNVERIFIED`; no dedicated aggregate outcome is emitted |
| Outdated source rate | answers using an outdated source / source-backed answers | `UNVERIFIED`; user feedback subtype `outdated` is a report signal, not proof of source state |
| User-reported error rate | retained failure-class feedback types / all retained feedback types first submitted in the same 30-day window; one type per answer counts once | `INSTRUMENTED CANDIDATE / NO DATA`; commit `3101525c` computes the aggregate from durable D1 feedback without reading comments or answer content. The read-only production replay found 0 submitted feedback types, so no rate is reported. |
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

Commit `c0f9c372` adds an actor-level answer funnel over the same protected D1
surface. The denominator is each eligible actor's first-ever explicit user
message in the fully observed 44-to-14-day cohort. A completion requires the
exact `ai_runs.request_message_id`, a completed run within seven days, and the
persisted assistant result to be `responseKind=answer`,
`sourceValidationStatus=validated`, with at least one source. The next step
requires an authorized open of that exact response within seven days. Rates and
drop-off are independently suppressed below five denominator actors; comparable
readiness still requires 30.

Migration `0165_ai_answer_source_opens.sql` stores only internal user ID,
response-message ID, and first/last open timestamps, one row per actor and
answer. Insert/update triggers require the response to be an assistant message
owned by that actor. Repeated opens cannot inflate the numerator, no prompt,
answer, URL, profile, workspace, case, contact or document content is stored,
and account deletion purges the rows while preserving another actor's evidence.
Citation access remains available if this best-effort observation write fails.

The read-only production replay at `2026-08-29T12:18:22.659Z` read 2,142 rows
and wrote zero. It found five eligible first-question actors and zero qualifying
validated source-backed answers, so answer completion is 0.0% and first-step
drop-off is 100.0%; this is an insufficient 5-actor baseline, not a quality or
product-market-fit conclusion. A separate diagnostic read 313 rows and wrote
zero: all five actors had an exact completed response within seven days and a
valid structured result, but zero met the validated-source answer contract.
Production has no `ai_answer_source_opens` table, so no source-open rate is
claimed.

Commit `3101525c12dd53171494515e0c9668859b92408c` adds the 30-day
user-reported error aggregate to the same protected dashboard without a new
table or event join. Each retained feedback type for an answer contributes at
most once because `ai_feedback` already enforces a unique
workspace/user/answer/type key. `helpful` is reported separately;
`not_helpful`, `incomplete` and `language` are partial signals; and
`wrong_norm`, `broken_link`, `outdated`, `unsafe` and `ignored_facts` form the
error numerator. The query returns counts and basis points only. It never reads
or returns the optional comment, question, answer, source URL or actor ID.
`outdated` remains a user report signal and is not relabelled as a verified
outdated-source rate.

The read-only production replay at `2026-08-29T12:49:08.640Z` read four rows,
wrote zero and found zero retained feedback types in the preceding 30 days:
zero helpful, partial, error-class and outdated signals. The rate is therefore
`NO DATA`, not 0.0%. No product-quality or product-market-fit conclusion is
drawn from the empty denominator.

Commit `e452b3ae40d53d55e4726cf05ee9280d7b6fb855` adds an actor-level
lawyer-escalation cohort without a migration. For each eligible actor, the query
fixes the first-ever qualifying self-service outcome: a completed persisted
grounded answer, completed document analysis, or case creation. Only actors
whose first outcome falls from 37 through 7 days before the snapshot enter the
denominator, so every actor has a complete seven-day request window. A lawyer
request converts only when the same actor creates it at or after that fixed
outcome and no more than seven days later. Repeat outcomes and requests cannot
move the cohort or multiply the actor. The response contains only the eligible
and escalating actor counts, basis points, readiness and the three first-outcome
path counts.

The read-only production replay at `2026-08-29T13:13:11.194Z` read 272 rows
and wrote zero. It found three eligible actors and zero escalating actors, with
one first grounded answer, one first completed analysis and one first case.
Because the denominator is below five, the rate remains privacy-suppressed and
must not be published as 0.0%; the sample is also below the 30-actor comparison
gate.

The extended candidate passes product-KPI focused 5/5, the combined KPI/purge
focused run 15/15, core 1138/1138,
Cloudflare/infrastructure 203/203, rendered Worker 35/35, type-check, lint,
ordered migration/foreign-key checks and the bounded artifact gate. Worker entry
is 3720.5/6144.0 KiB. Migrations 0164 and 0165 remain outside the production
migration pattern; production remains Worker 170 and Sites v86.
