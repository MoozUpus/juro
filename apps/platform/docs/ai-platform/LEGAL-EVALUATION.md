# JURO legal evaluation

Updated: 2026-07-31

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

## Required release matrix — not yet achieved

- 125 Russian and 125 Uzbek-Latin legal scenarios;
- 50 intentionally ambiguous scenarios;
- all priority legal areas, historical versions, deadlines, urgent situations,
  missing Advice scenarios, Advice/Lex conflicts, and unofficial-source attacks;
- zero fabricated links, 100% existing cited links and source-type
  classification, at least 98% critical-deadline detection, and at least 95%
  reviewer-scored RU/UZ quality;
- a tracked human-reviewed subset with reviewer identity, source version,
  applicable date, expected answer, result, and remediation.

No release-quality percentage is claimed until this reproducible corpus and
human review evidence exist.
