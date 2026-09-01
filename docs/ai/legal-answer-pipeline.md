# JURO Legal Answer Pipeline

Status: **implemented architecture; current authenticated production E2E remains partial**

JURO uses the domain terms defined in [`CONTEXT.md`](../../CONTEXT.md): Legal Answer, Main Point, What the Law Says, What to Do Next, Conditional Answer, Insufficient-Evidence Result, Citation, and Source Ladder.

## Pipeline

1. **Authenticate and bind context.** The server derives user, workspace, locale, request identity, entitlement, and idempotency state.
2. **Minimize input.** Bounded redaction and conversation selection keep provider context relevant; untrusted user/document content is explicitly separated from instructions.
3. **Plan the request.** Deterministic intent/follow-up handling selects whether clarification is required and whether fast or deep reasoning is justified.
4. **Retrieve evidence.** The strict source ladder is sequential. Indexed Official Corpus precedes Live Official Search; Secondary Web Research cannot establish a legal rule.
5. **Build a source packet.** Only server-fetched, canonicalized, validated excerpts and identifiers enter the model contract.
6. **Route the model.** OpenAI primary/retry may use Anthropic fallback only within eligibility, operator, cost, and deadline controls.
7. **Validate output.** JSON schema, Zod, exact source identifiers/excerpts, claim coverage, and safety rules run before a Legal Answer is accepted.
8. **Persist atomically.** Answer, run, usage, model, source-version hash, audit, and idempotency evidence complete together.
9. **Render product-owned sections.** Main Point, What the Law Says, and What to Do Next are stable; optional supporting sections appear only when populated.
10. **Fail honestly.** Missing support yields a Conditional Answer or Insufficient-Evidence Result, never a plausible unsupported conclusion.

## Evidence and exclusions

Unit/integration contracts cover routing, persistence, cancellation, recovery, fallback, and source enforcement. Fresh content-free production probes cover both providers. Authenticated RU/UZ production Legal Answer E2E and the owner-excluded legislation/corpus data work remain open.

Architecture decisions: [strict Source Ladder](../adr/0001-strict-legal-source-ladder.md) and [adaptive Legal Answer structure](../adr/0002-adaptive-legal-answer-structure.md).
