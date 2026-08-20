# JURO legal evaluation

Updated: 2026-08-15

The canonical protected staging execution completed on 2026-08-14: 314/314
unique runs have immutable per-scenario evidence linked to a named
`legal_reviewer` decision made with fresh MFA. The scope digest, event chain and
compact export digest were independently reverified. See
`../../../../docs/integrations/huquq-ai/STAGING_RELEASE_EVIDENCE_2026-08-14.md`.
This closes that exact direct-source evaluation gate only; changed prompts,
models or source snapshots require a new review, and the indexed-corpus release
gate remains separate.

## Reproducible corpus harness

`evaluation/legal-evaluation-corpus.ts` defines 314 unique synthetic **inputs**
for release evaluation: 132 base Russian scenarios, 132 Uzbek-Latin base
scenarios, and 50 additional intentionally ambiguous scenarios (25 per
language). Each priority legal area and each individual/entrepreneur/lawyer
account context is represented in both languages. The prompts now encode the
actual historical, deadline, urgent, live-Lex-unavailable, false-article,
unofficial-source, prompt-injection, provider-failure, incomplete-facts,
foreign-element and evidence-quality
situations instead of relying on tags attached to repeated generic text.

These records intentionally contain no invented legal answer, act, article, link,
or success score. `npm run evaluate:legal:materialize -- --output <directory>`
creates a versioned review packet with `scenarios.json`, reviewer instructions
and a SHA-256 manifest; it still creates no answer or score.

### Latest integrity materialization

On 2026-08-13, the harness materialized corpus version `2026-08-13.1` into
an ignored local evidence directory and re-verified every artifact with zero
failures: 314 scenarios (157 Russian, 157 Uzbek-Latin), 50 ambiguous scenarios
and 12 legal areas. The scenario payload SHA-256 was
`e10b824adc439c5a1a414c830610c605fd3556c3ed1ab9d91ae58cf50c089239`.
This verifies only deterministic packet composition. It is not a claim that a
provider response, live citation, or legal review has passed.
`npm run evaluate:legal:validate -- --packet <packet-directory> --results
<reviewed-results.json> --evidence <staging-persisted-evidence.json>` accepts
only a strict staging envelope bound to the
packet corpus version and SHA-256, with one schema-valid result per
scenario. Public citations must use the exact canonical Lex.uz document
path without credentials, query, fragment or alternate port. Live checking
permits only bounded redirects that retain the same source kind, locale and
canonical document ID, and requires a 2xx HTML/XHTML response. Host shape alone
is insufficient. Each citation also needs a check timestamp and snapshot hash.
Internal materials fail closed unless the caller supplies separate staging-DB
verification evidence; the CLI does not infer it from result JSON. The validator
rejects unknown or oversized fields, missing expected behaviors, language or
jurisdiction mismatch, unreviewed output, reviewer language quality below
95/100, any unproven citation, or critical-deadline detection below 98%.
Therefore a passing report still requires real reviewed output and cannot be
fabricated by the synthetic corpus.

Each reviewed result also records the persisted AI run, actual provider/model,
instruction hash, legal-database version, completion time, reviewer, review
time and a hash reference to separately retained review evidence. The required
evidence file is produced only by the staging POST endpoint
`/api/platform/admin/ai-quality/evaluation-evidence` after session, CSRF,
`legal_reviewer`, active TOTP and MFA-freshness checks. The exporter independently
loads the completed `ai_runs` row, exact user/assistant messages, structured JSON,
latest immutable `correct` review event and review chain. It rejects a prompt
that is not byte-identical to the scenario, changed reviewed content, mismatched
provider/model/hash/timestamps, result citations that do not match persisted
structured sources, duplicate runs/reviews and a non-correct review decision.

The exported artifact contains hashes and opaque IDs only: no question, answer,
workspace, user email or feedback text. Its digest detects later file mutation,
the evidence binds the SHA-256 of the complete strict results envelope, and the
endpoint separately appends a content-free quality-review access event that
commits both hashes. Changing a reviewer score or behavior disposition after
export therefore invalidates the gate.
The owner must retain the complete authenticated response receipt. A copied hash
or locally fabricated JSON remains insufficient proof that human review occurred
or that the legal conclusion is correct.

## Staging execution order

1. Materialize the packet and retain its manifest.
2. Submit every exact scenario prompt through the real authenticated staging chat
   and retain each completed `aiRunId`.
3. Create feedback for that response and have an authorized legal reviewer open
   and resolve it through the AI-quality console. Only a `correct` decision is
   eligible for a passing result; corrected or partially incorrect output remains
   a release failure for that run.
4. Assemble the strict reviewed-results envelope from the persisted metadata and
   reviewer judgments.
5. While signed in as the same fresh-MFA legal reviewer, POST
   `{ "resultsEnvelope": ... }` with the normal same-origin CSRF header to
   `/api/platform/admin/ai-quality/evaluation-evidence`. Store `evidence` as the
   evidence JSON and retain the separate `receipt` with the evaluation record.
6. Run the validator with `--packet`, `--results` and `--evidence`. Do not edit
   the exported artifact; its digest and field bindings will fail closed.

The endpoint does not accept a reviewer identity, tenant ID or review decision
from a separate client field. Those values are resolved from D1 and the
MFA-authorized immutable review event.
## Current automated evidence

The current branch tests direct Lex.uz URL/redirect trust, request-scoped HTML
parsing, semantic article spans and SHA-256 hashes, UI-noise removal, official
base-act reranking, false-article rejection, same-packet provider retry/fallback,
strict terminal validation and RU/UZ stale/unavailable downgrades. Advice.uz,
local legal-corpus retrieval, vectors and embeddings are fail-closed on the
interactive path. Foundational act identifiers are metadata-only search hints:
the exact Lex.uz document is still fetched and validated live for every request.

These tests prove deterministic trust-boundary behavior. They do not prove the
legal correctness of real provider output or substitute for named legal review.

## Release-matrix harness

- 157 Russian and 157 Uzbek-Latin legal scenarios;
- 50 intentionally ambiguous scenarios;
- all priority legal areas, historical versions, deadlines, urgent situations,
  unavailable Lex.uz, false articles, prompt injection, provider failures and
  unofficial-source attacks;
- zero fabricated links, 100% canonical live Lex.uz citations, recall@1/@3,
  citation precision, unsupported-claim rate, false-refusal rate, UI-noise rate,
  p50/p95 first-useful-token and completion latency, cost, RU/UZ parity, at
  least 98% critical-deadline detection and at least 95% reviewer-scored quality;
- a tracked human-reviewed subset with reviewer identity, source version,
  applicable date, expected answer, result, and remediation.

The corpus and fail-closed automated gate are implemented. Unit fixtures only
exercise the validator and are never legal ground truth. The 2026-08-14
canonical evidence satisfies the exact 314-case review contract above; no
quality percentage is carried forward to a changed model, prompt, source
snapshot or the still-growing indexed corpus without a new reproducible run.
