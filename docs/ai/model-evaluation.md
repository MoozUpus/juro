# JURO AI Model Evaluation

Status: **implemented evaluation framework; current full-corpus staging execution excluded from this goal**

Evidence cutoff: **2026-09-02 UZT**

## Release evaluation layers

| Layer | Purpose | Evidence source |
| --- | --- | --- |
| Contract tests | reject malformed schemas, fabricated citations, unsafe fallback, budget overrun, and missing runtime controls | platform AI/provider/gateway tests |
| Retrieval and grounding tests | ensure provider-selected IDs cannot bypass server claim/span validation | `legal-ai-gateway.test.ts`, citation and retrieval-safety suites |
| Document tests | validate provider schemas, exact excerpt boundaries, upload isolation, and recovery | document-analysis provider/processor/runtime suites |
| Operational telemetry | measure time to first useful content, full-response latency, failures, tokens, and estimated cost | AI SLO and provider-usage modules |
| User feedback review | let authorized staff classify feedback and store corrected/golden answers in an integrity-linked review history | AI quality console and `quality-review.ts` |
| Human attestation | bind an authorized reviewer's decision to an immutable evaluation scope | legal evaluation human-review module |

## Minimum model-change gate

A proposed model or routing change should not reach production until:

1. it is present in the deployment allow-list;
2. structured-output and compatibility tests pass;
3. fallback, refusal, timeout, and cancellation paths pass;
4. grounding/citation safety tests pass;
5. latency and cost remain within the approved budgets;
6. RU and UZ quality samples receive authorized human review;
7. the exact revision passes CI and security review;
8. deployment has an immediate configuration or Worker rollback.

## Quality dimensions

- factual and legal grounding;
- citation integrity and source relevance;
- directness and usefulness of the first answer;
- uncertainty and clarification quality;
- RU/UZ language quality;
- refusal and prompt-injection resistance;
- latency to first useful content and complete response;
- token/cost efficiency;
- cross-provider behavioral consistency after fallback.

## Reporting rule

Test counts, queue counts, and provider availability do not prove legal correctness. A release report must distinguish automated contract evidence, provider connectivity, sampled human judgment, authenticated product QA, and sustained production telemetry.

## Scope boundary

The owner excluded legislation-database/corpus/vector work and staging-capacity remediation from this goal. Therefore this document does not claim a current full-corpus evaluation run, corpus completeness, or human attestation for the excluded staging workload.
