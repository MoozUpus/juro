# JURO legal evaluation

Updated: 2026-08-04

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
`npm run evaluate:legal:validate -- --results
<reviewed-results.json>` accepts only one strictly schema-valid result per
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
