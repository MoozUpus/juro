# Model evaluation

## Current evidence

The canonical protected staging execution `staging-20260814-canonical`
completed 314/314 immutable direct-source scenarios on 2026-08-14. It included
an MFA-bound `confirmed_correct` human legal-review attestation and independently
replayable hashes. This is historical evidence for that exact run, not a fresh
2026-08-25 regression result and not proof that every current production answer
is correct.

The separate indexed-corpus gate is **open**. It requires, among other controls,
44/44 language/category checkpoints, a frozen queue, a bound D1/Qdrant snapshot,
the 314-scenario benchmark on that snapshot, current Lex health, dense+sparse
retrieval evidence, pricing completeness, and named human review. Production
keeps the indexed and dense paths disabled until that gate passes.

## Release scorecard

Every routing, prompt, parsing, or source-policy change must report:

- RU, Uzbek Latin, Uzbek Cyrillic, and mixed-language coverage;
- citation existence, canonical URL, exact document/article match, precision,
  recall, and unsupported-claim rate;
- groundedness, abstention, partial-answer, false-refusal, and stale-source rate;
- deadline detection and version/applicability correctness;
- prompt-injection, non-existent article, unavailable source/provider,
  cancellation, and cross-tenant document cases;
- p50/p95 useful-response latency, model/provider failure and fallback rates;
- input, cached-input, and output tokens plus priced cost per successful outcome;
- named human review for legal correctness.

Unit tests prove contracts and fail-closed behavior. Synthetic probes prove
transport and basic integration. Neither substitutes for the signed legal
evaluation artifact or current browser evidence.

## Decision rule

A candidate must not ship when it weakens citation precision, permits an
unsupported legal claim, loses tenant isolation, creates an unpriced request, or
exceeds an approved latency/cost guardrail. If evidence is unavailable, the
status is `UNVERIFIED`, not `PASS`.
