# Indexed Official Corpus retrieval redesign

Status: implemented-staging-validation-with-open-gates

## Objective

Make Indexed Official Corpus retrieval proposition-complete for natural-language legal questions, with mandatory fast semantic selection, provision-aware sparse and dense search, direct validated Lex.uz citations, and primary acceptance through authenticated requests to the running local application.

## Confirmed diagnosis

- The current development remote-fast path limits indexed search to two query formulations and disables dense retrieval, semantic reranking, and exact-window hydration.
- That path can lose independently relevant provisions such as Labor Code article 215 and adjacent responsive provisions such as article 409, leaving article 408 as the only source.
- Current indexed coverage uses the best single-source score, so one strong hit can incorrectly stop the Source Ladder even when other Coverage Requirements are unsupported.
- The answer gateway preserves a complete Provision Set when retrieval supplies one; the primary regression is upstream retrieval and coverage assessment.
- A legal finding titled with a bare article number can be demoted into an assumption and persisted as a proposed Case Fact, producing the standalone `408` shown in the interface.
- Authenticated citation chips currently reveal a source card rather than linking directly to Lex.uz.
- Existing tests and the previous live loop accept at least one validated source, so they remain green for this failure.

## Retrieval contract

- Official Coverage is evaluated collectively over every material legal proposition, not by source count, the best source, or a fixed top-result list.
- Query understanding derives Coverage Requirements for every materially plausible interpretation. A colloquial ambiguity is researched across all material branches and produces a Conditional Answer when unresolved Case Facts change the result.
- A natural-language query requires both sparse and dense candidate channels. An explicit, unambiguous act-and-article lookup may use deterministic exact retrieval.
- Candidate chunks remain grouped by provision. The semantic reranker selects a complementary Provision Set and maps each selected provision to the Coverage Requirements it supports.
- The reranker may add a candidate-grounded Coverage Requirement. An unsupported added requirement triggers one bounded targeted repair search.
- The Provision Set has no fixed top-four or top-eight truncation. It contains sufficient evidence for every requirement up to a bounded context ceiling; exceeding that ceiling produces a focused clarification or Insufficient-Evidence Result instead of silent omission.
- Fast and deep modes share the same retrieval and evidence-safety contract. They may differ in answer depth, not source coverage.

## Semantic reranker

- Natural-language evidence selection must complete semantic reranking before indexed candidates may support a Legal Answer.
- The only reranker bypass is explicit, unambiguous act-and-article lookup.
- The reranker has an independent, versioned scoring policy and consumes the pinned dense embedding model's per-branch ranks. It does not share or invoke the answer model by accident.
- The indexed stage gives the in-process reranker one bounded attempt and no second provider round trip; failure continues through the Source Ladder.
- The reranker returns the selected Provision Set, Coverage Requirement mappings, valid rejection state, and any candidate-grounded newly discovered requirement.

## Source Ladder outcomes

| Indexed outcome | Meaning | Next action |
| --- | --- | --- |
| Complete mapped Provision Set | Good indexed Official Coverage | Produce a grounded answer without unnecessary live search |
| Valid reranker rejection | Absent indexed Official Coverage | Continue to Live Official Search |
| Planner, sparse, dense, or reranker unavailable/invalid | Indexed Source Unavailability | Discard the unranked packet and continue to Live Official Search |
| Uncovered requirement after the repair pass | Insufficient indexed Official Coverage | Continue to Live Official Search |
| Live official evidence completes coverage | Good or partial official coverage | Answer only the supported propositions |
| Live official evidence is insufficient | Insufficient official evidence | Return an Insufficient-Evidence Result |
| Live official retrieval is unavailable | Source Unavailability | Return a retryable operational result without quota consumption or saved Legal Answer |

Secondary Web Research remains the last tier and cannot establish a legal rule, deadline, calculation, or mandatory action.

## Index design and rollout

- Dense representations include act title, article number and title, legal hierarchy, language, and provision text.
- Sparse and dense indexes are versioned and paired under one release manifest with the corpus and retrieval-policy versions.
- A rebuilt D1/Qdrant pair is populated away from the active pair, validated through the local application, and activated atomically.
- The previous pair remains available for immediate rollback.
- Completion includes rebuilding and activating the staging index only. Production index activation and application deployment are out of scope.

## Cache contract

- Only packets with good Official Coverage may be cached.
- Cache keys include corpus, sparse index, dense index, reranker, retrieval-policy, locale, legal date, tenant/user/matter scope, and normalized question versions or values.
- Partial, degraded, failed, or repaired-but-incomplete packets are never cached.
- Live validation runs a cold pass with an empty process cache and a warm replay; critical cases are repeated in fast and deep modes.

## Answer and citation contract

- Every material legal proposition carries a product-rendered Official Citation such as `ст. 408 · ТК РУз` or its Uzbek equivalent.
- An Official Citation is a direct link to the validated provision-specific Lex.uz URL, falling back to the validated canonical act URL. JURO never invents an article fragment or query parameter.
- A separate affordance may still reveal the evidence card.
- Model-authored Markdown does not control official links.
- Bare article-number headings or findings such as `408` are prohibited.
- The confirmation panel contains only Case Facts. Legal propositions, Citations, and source-freshness warnings never become proposed Case Facts.

## Development retrieval trace

- A trace is opt-in and available only in development, on loopback, to an authenticated local developer session.
- It records an opaque request identifier, Coverage Requirement identifiers and states, query branches, public provision/chunk identifiers, sparse/dense/fusion ranks and scores, reranker selection, repair outcome, cache and version state, and stage durations.
- It never contains credentials, provider payloads, private-document text, workspace or user identifiers, or persisted production traces.
- Raw test query text may appear only in an explicit local validation artifact; it is not added to production SLO or provider telemetry.

## Primary live acceptance

Automated tests support implementation but are not completion evidence. Primary acceptance uses the authenticated running local application and real SSE requests through `/api/platform/ai`.

### Profiles

1. **Indexed isolation**: staging Indexed Official Corpus with sparse and dense retrieval plus reranking enabled; Live Official Search disabled so it cannot mask indexed defects.
2. **Full Source Ladder**: the same local application with Live Official Search enabled to exercise valid rejection, degradation, failure, and fallback.

### Reviewed request matrix

- At least 24 provision-level breadth scenarios: Russian and Uzbek coverage for each existing area—civil, contracts, labor, family, entrepreneurship, tax, consumer, real estate, administrative, litigation, banking/finance, and data/IT.
- At least 12 focused labor/maternity scenarios covering pregnancy, maternity leave, childcare leave, child age, fixed-term contracts, employer liquidation, ambiguous colloquial wording, and follow-ups.
- Critical scenarios run repeatedly in fast and deep modes with cold and warm cache states.
- The maternity-dismissal ground truth is reviewed against current official Lex.uz and covers every materially applicable branch, including the roles of articles 215, 237, 404, 405, 408, 409, and the applicable termination grounds and exceptions.

### Blocking checks

- Every required provision is present in the final Provision Set and mapped to its Coverage Requirement.
- Human-reviewed forbidden or unsupported provisions are absent from the final Provision Set.
- Natural-language requests show successful mandatory reranker use; there is no silent `not_configured` or deterministic semantic fallback.
- Indexed isolation proves sparse and dense candidate participation and the bounded repair behavior.
- Official Citations have validated Lex.uz destinations and article-specific labels; no response or Case Fact begins with an unexplained bare article number.
- Cold and warm runs preserve the same Provision Set and Citation mapping.
- Indexed retrieval, including reranking and an optional repair pass, satisfies p95 at or below five seconds; complete Legal Answers satisfy p95 at or below thirty seconds.
- Source Unavailability, absent Official Coverage, and valid semantic rejection remain distinguishable in response state and trace evidence.

## Delivery boundary

Implementation includes code, migrations, versioned index tooling, the local validation harness, a staging index rebuild and activation, the complete authenticated local-app matrix, and staging canaries. Production deployment or production index activation requires separate explicit authorization.

## Staging validation evidence — 2026-08-30

- Pinned staging candidate: `staging-20260830-provision-v1`, finalized and originally exact-count validated with 151,499/151,499 indexed chunks in `juro_legal_staging_provision_v1` and reranker policy `provision-set-v1`. It was not promoted because the five-second indexed p95 and breadth gates below remain open.
- Final authenticated critical run: `artifacts/indexed-isolation-1788062918848.json`. Russian ambiguous-decree, Uzbek ambiguous-decree, father-care, and the three-year follow-up all returned their required complementary provision sets with no scenario failure. The only report failure was indexed p95 6,009 ms versus the 5,000 ms gate; complete-answer p95 was 16,131 ms.
- Final rendered UI run: `artifacts/ui-citations-1788062954815.json`. It rendered direct safe Lex.uz links including `Ст. 215`, `Ст. 404`, `Ст. 408`, and `Ст. 409`; no bare article Case Fact was produced.
- Full 36-scenario authenticated cold matrix: `artifacts/indexed-isolation-1788062154485.json`. It completed with 18,658 ms complete-answer p95 and exposed open breadth gaps for several non-labor expected acts, intermittent planner/stream failures, one variable Uzbek labor run, and 8,559 ms indexed p95. The variable critical labor cases were corrected and rerun in the final critical artifact above; the non-labor breadth failures and five-second indexed SLO remain blocking promotion evidence rather than being hidden by tests.
- The mandatory in-process semantic reranker remained selected on successful natural-language requests and completed in tens of milliseconds in local traces. Most indexed latency came from structured query planning and the cross-region staging service path.
- The complete Full Source Ladder profile and the full cold/warm fast/deep combination were not completed. Together with the non-labor breadth gaps and indexed p95 miss, they remain explicit promotion gates.
- Post-review failure handling correctly exposed a later loss of the ephemeral Qdrant disk instead of misclassifying the hybrid failure as absent coverage. The staging candidate intentionally had no activation row while its gates were open, so the original keepalive did not resolve it; the replacement now resolves the pinned candidate, checks its exact point count on each scheduled tick, and keeps an incomplete collection in visible Source Unavailability. Reconciliation is deterministic, serialized, and provider-paced.
- Current recovery gate: the collection exact count is `0/151499` after the pre-fix container sleep. A one-chunk recovery probe at `2026-08-30T05:37Z` still received OpenAI `429` with JURO's rolling failure window empty. No post-review authenticated canary can be claimed until provider embedding capacity returns and exact-count reconciliation completes. Current staging corpus Worker version: `e0629a14-3426-42a1-9bff-f5d519ba4863`.
- No production application deployment, production corpus deployment, or production index activation was performed.
