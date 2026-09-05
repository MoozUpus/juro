# JURO Legal Answer Pipeline

Status: **implemented fail-closed pipeline; legal-source data operations excluded from this goal**

Evidence cutoff: **2026-09-02 UZT**

## Request flow

1. Authenticate the user and resolve tenant/workspace authority.
2. Validate locale, answer/reasoning mode, conversation branch, limits, and request budget.
3. Classify intent and build a bounded research plan.
4. Assemble a server-owned evidence packet. User questions, history, memory, documents, and fetched text remain untrusted data.
5. Reserve the AI run and check provider cost/operational controls.
6. Call the primary provider through a strict structured-output contract; use bounded fallback only for eligible failures.
7. Validate every candidate claim against a permitted source and exact source span. Numeric content must be present in the supporting span.
8. Drop unsupported claims and rebuild source cards from server-owned metadata rather than model-authored URLs or titles.
9. If no usable verified source covers the legal proposition, return a fixed clarification/insufficient-source response instead of model-memory law.
10. Persist the validated result and content-free provider/SLO evidence, then render through the safe answer view.

## Trust boundaries

- Provider-selected IDs are candidates, not authority.
- Private user documents may establish facts contained in the document, not legislation.
- Secondary web material may provide contextual facts only; it cannot establish law, normative deadlines, mandatory steps, calculations, or outcome predictions.
- Provider-authored links are publishable only when they exactly match a request-owned allowed URL.
- Suspected prompt disclosure, tool enumeration, instruction injection, or unvalidated links are removed by output safety rules.

## User experience contract

- Return the useful covered part before asking follow-up questions.
- Keep assumptions and uncertainty explicit.
- Do not promise outcomes or present pseudo-precise success percentages.
- Keep RU entirely Russian and UZ in Uzbek Latin script.
- A fallback must preserve the same evidence and output contract; changing providers never lowers the grounding gate.

## Operational evidence

The pipeline records provider/model/fallback, attempts, latency, token counts, safe error categories, time to first useful content, and full-response timing without storing prompts or provider response bodies in operational logs.

## Scope boundary

This document records application behavior visible in source and tests. It does not inspect, rebuild, ingest, migrate, or certify any legislation database, corpus, vector store, embedding set, or excluded staging-capacity workload.
