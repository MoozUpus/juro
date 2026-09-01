# JURO AI Model Routing

Status: **implemented routing contract; live quality and availability are separately measured**

Evidence cutoff: **2026-09-02 UZT**

## Legal chat

1. OpenAI is the required primary provider. Fast and deep requests select separate allow-listed runtime model slots.
2. Fast requests use low reasoning effort and bounded output. Deep requests use high reasoning effort and a larger output allowance.
3. Anthropic is a configured recovery provider, not a parallel vote. Fallback is considered only for unavailable/circuit-open, invalid-output, or otherwise retryable primary failures; refusal is not a fallback trigger.
4. Primary and fallback share one absolute execution budget. The fallback starts only when its minimum attempt and finalization reserve still fit.
5. Provider kill switches and cost circuits are checked server-side before calls.
6. The provider result is never authoritative by itself. A provider-neutral gateway validates the structured contract and rebuilds publishable claims from server-owned evidence.

Implementation: `apps/platform/lib/ai/provider.ts`, `provider-fallback.ts`, `execution-budget.ts`, and `legal-ai-gateway.ts`.

## Document analysis

- Quick analysis prefers OpenAI's native structured-output path, with Anthropic as a bounded fallback.
- Full and expert analysis use the configured document-analysis primary; when Anthropic is configured it is preferred, with OpenAI recovery.
- Each provider normally gets one attempt. Quick analysis uses an overall 110-second budget with an 80-second primary window and a 30-second fallback window.
- Provider output must pass the shared structured schema, source boundary, and exact document-excerpt boundary before persistence.

Implementation: `apps/platform/lib/document-analysis/provider.ts`.

## Runtime configuration

Model names come from environment allow-lists and may be promoted through versioned database configuration. Updates require a staff capability, fresh MFA, optimistic version matching, a reason, and an integrity-linked history. Arbitrary model names are rejected.

The configuration slots are:

- OpenAI chat;
- OpenAI deep;
- Anthropic chat fallback;
- Anthropic document;
- OpenAI document fallback;
- response tone.

Implementation: `apps/platform/lib/ai/runtime-settings.ts`.

## Failure behavior

- Missing required configuration returns a safe unavailable response.
- Refusal and cancellation remain terminal rather than silently changing provider.
- Provider bodies, prompts, document text, and credentials are excluded from operational failure logs.
- Public health is derived from bounded synthetic evidence and must be described as point-in-time unless a sustained window is actually measured.

## Current evidence limits

The v116 status snapshot reported OpenAI and Anthropic operational, but one snapshot does not prove sustained availability or answer quality. This document describes the code contract; it does not claim that every production AI journey has been exercised in the current authenticated session.
