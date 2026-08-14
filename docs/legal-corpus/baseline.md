# JURO Legal Corpus baseline — 2026-08-14

## Pinned inputs

| Item | Value |
| --- | --- |
| JURO branch baseline | `595eb26c6689cac2113d900e1c2758554d1567f2` (`main`) |
| Implementation branch | `feature/full-legal-corpus` |
| Huquq AI audit commit | `1bce500c69b8213373d8ce0b40d56be7d83f6aec` |
| Huquq AI licence | MIT; code patterns only, no corpus data copied |
| Lex.uz crawl policy observed | `User-agent: *`, `Crawl-delay: 20` |

## Reference corpus threshold

Huquq AI's README at the pinned commit publishes these **reference-only**
counts: 1,283 canonical documents, 20,296 provisions and 22,513 chunks. The
reference clone did not contain the underlying legal corpus, vectors or raw
HTML, so none of that data is imported into JURO. These values are acceptance
thresholds, not JURO metrics.

## Verified JURO staging baseline

The read-only remote D1 probe on `juro-staging` returned the following values:

| Registry | Count |
| --- | ---: |
| Legacy legal source rows | 42 |
| Legacy source versions | 65 |
| Parsed sections | 0 |
| Indexed chunks | 0 |
| Published source records | 0 |
| Source sync runs | 23 |
| Source sync errors | 314 |

Consequently, current JURO has no validated indexed legal corpus and must not
claim source coverage, recall, or corpus-size parity. The full-corpus tables
are introduced in migration `0124_full_legal_corpus.sql`; that migration has
not been applied to staging or production as part of this baseline.

## Baseline gaps addressed on this branch

- The legacy scheduler's daily `0 19 * * *` trigger ran metadata monitoring
  but did not invoke the legacy corpus-sync module.
- Legacy ingestion supports only Russian and Uzbek Latin records, requires a
  manual publication lifecycle, and has no indexed sections/chunks.
- Current search has no immutable multilingual source registry, versioned
  article-level corpus, RRF fusion, exact quote-store, or current-version FTS
  boundary.
- Existing direct Lex retrieval remains the production fallback. It does not
  create permanent corpus records and therefore remains the source of truth
  until the separate corpus rollout gate is passed.

## Data rights and operational boundary

Lex.uz legal text, raw HTML and language versions are not treated as MIT code
and are never committed to Git. A future enabled ingestion run stores raw and
normalized source artifacts only in private R2, validates allowed Lex.uz URLs,
honours robots.txt and uses one durable job per scheduled slot. Private user
and tenant documents remain outside the global official-corpus scope.
