# JURO legal evaluation

Updated: 2026-08-02

## Reproducible corpus harness

`evaluation/legal-evaluation-corpus.ts` defines 314 synthetic **inputs** for release evaluation: 132 base Russian scenarios, 132 Uzbek-Latin base scenarios, and 50 additional intentionally ambiguous scenarios (25 per language). Each priority legal area is represented in both languages. The corpus covers historical applicability, deadlines, urgent situations, missing Advice scenarios, Advice/Lex conflicts, unofficial-source attempts, and incomplete facts.

These records intentionally contain no invented legal answer, act, article, link, or
success score. `scripts/validate-legal-evaluation.ts --results
<reviewed-results.json>` accepts only one result per scenario and rejects a result
set when any citation is outside `lex.uz`/`advice.uz`, a declared source type does
not match its host, a human reviewer is absent, RU/UZ reviewer quality is below
95/100, or fewer than 98% of the explicit critical-deadline scenarios are detected.
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

The corpus and automated gate are implemented. A release-quality percentage is
still not claimed until reviewed results with real existing source URLs and human
review evidence are supplied through the validator.
