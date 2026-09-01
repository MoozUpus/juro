# JURO legal answer pipeline

Status: **VERIFIED in source; legal correctness and live availability remain separate**

Evidence cutoff: **2026-09-01**

## Pipeline

1. Authenticate the user, resolve the active workspace, enforce same-origin writes, validate a bounded request, and reserve an idempotent AI run against the product entitlement.
2. Normalize the question and derive a bounded retrieval plan. Model output can propose queries or rank candidates but cannot become legal evidence.
3. Retrieve official authority. Production configuration keeps the local corpus disabled and direct Lex.uz retrieval enabled; the retriever falls through truthfully when a source cannot be verified.
4. Consult secondary public web material only after official coverage is weak or empty and only when its independent operational flag is enabled. Secondary material cannot establish a statutory rule, deadline, amount, or guaranteed outcome.
5. Send the bounded source packet to OpenAI, with Anthropic used only under the documented fallback policy.
6. Parse the strict structured response, rebuild citations from server-owned source identities, enforce freshness and source coverage, and downgrade to clarification/unavailable when grounding is insufficient.
7. Persist the conversation, structured metadata, citations, usage, SLO, and privacy-safe product milestones transactionally or fail the AI run without charging it.

## Trust boundaries

- User text, conversation history, memories, private document snippets, retrieved pages, and provider output are untrusted data.
- Only server-verified source spans and canonical source identifiers may support a legal claim.
- Provider/model status does not bypass tenant authorization, quota, source validation, schema validation, or persistence.
- Source and provider failure logs retain safe codes and correlation metadata, not question/answer content.

## Current limits

The pipeline is source-tested but not certified as legally correct for every scenario. Current production provider health, a complete reviewed RU/UZ evaluation, and the exact-revision authenticated Chrome journey remain separate open gates.
