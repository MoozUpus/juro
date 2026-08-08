# JURO legal evaluation

Updated: 2026-08-06

## Reproducible corpus harness

`evaluation/legal-evaluation-corpus.ts` defines 314 unique synthetic **inputs**
for release evaluation: 132 base Russian scenarios, 132 Uzbek-Latin base
scenarios, and 50 additional intentionally ambiguous scenarios (25 per
language). Each priority legal area and each individual/entrepreneur/lawyer
account context is represented in both languages. The prompts now encode the
actual historical, deadline, urgent, Advice-missing, Advice/Lex-conflict,
unofficial-source, incomplete-facts, foreign-element and evidence-quality
situations instead of relying on tags attached to repeated generic text.

These records intentionally contain no invented legal answer, act, article, link,
or success score. `npm run evaluate:legal:materialize -- --output <directory>`
creates a versioned review packet with `scenarios.json`, reviewer instructions
and a SHA-256 manifest; it still creates no answer or score.

### Latest integrity materialization

On 2026-08-06, the harness materialized corpus version `2026-08-05.1` into
an ignored local evidence directory and re-verified every artifact with zero
failures: 314 scenarios (157 Russian, 157 Uzbek-Latin), 50 ambiguous scenarios
and 12 legal areas. The packet manifest SHA-256 was
`e702e7f86730f34d56bf2a9d062edc249c9081403b54f2568f117408fb9039ca`;
the scenario payload SHA-256 was
`57a0b8aea337e13d1cdfb194e5aef0ce96c2142b55c587fc15e50f7b2413b6d6`.
This verifies only deterministic packet composition. It is not a claim that a
provider response, live citation, or legal review has passed.
`npm run evaluate:legal:validate -- --packet <packet-directory> --results
<reviewed-results.json> --evidence <staging-persisted-evidence.json>` accepts
only a strict staging envelope bound to the
packet corpus version and SHA-256, with one schema-valid result per
scenario. Public citations must use the exact canonical Lex or Advice document
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

The current integration branch tests exact Lex/Advice host and type trust,
verified-status insufficiency, corpus freshness, publication/lifecycle evidence
replay, section and chunk SHA-256 integrity, future-effective and expired
versions, and RU/UZ stale/unavailable response downgrades. The real publication
integration test applies the complete migration set to SQLite, publishes
reviewed synthetic evidence, records qualifying Lex and Advice corpus runs, and
retrieves one verified source through the production SQL path. Tampering causes
zero trusted results.

These tests prove deterministic trust-boundary behavior. They do not prove the
legal correctness or coverage of a real corpus.

## Release-matrix harness

- 125 Russian and 125 Uzbek-Latin legal scenarios;
- 50 intentionally ambiguous scenarios;
- all priority legal areas, historical versions, deadlines, urgent situations,
  missing Advice scenarios, Advice/Lex conflicts, and unofficial-source attacks;
- zero fabricated links, 100% existing cited links and source-type
  classification, at least 98% critical-deadline detection, and at least 95%
  reviewer-scored RU/UZ quality;
- a tracked human-reviewed subset with reviewer identity, source version,
  applicable date, expected answer, result, and remediation.

The corpus and fail-closed automated gate are implemented. Unit fixtures only
exercise the validator and are never legal ground truth. A release-quality
percentage is still not claimed until all 314 real outputs, current live-link
checks and named human reviews are supplied through the validator.
