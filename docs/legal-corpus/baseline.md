# JURO Legal Corpus baseline — 2026-08-14

## Pinned inputs

| Item | Value |
| --- | --- |
| JURO branch baseline | `595eb26c6689cac2113d900e1c2758554d1567f2` (`main`) |
| Implementation branch | `feature/full-legal-corpus` |
| Huquq AI audit commit | `1bce500c69b8213373d8ce0b40d56be7d83f6aec` |
| Huquq AI licence | MIT; code patterns only, no corpus data copied |
| Lex.uz crawl policy used by the bounded fetcher | `User-agent: *`, `Crawl-delay: 20`; revalidated before acquisition |

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
not been applied to staging or production as part of this baseline. Migration
`0125_lex_catalog_discovery.sql` adds the source-alias and resumable catalog
checkpoint ledgers and likewise remains unapplied remotely.

## Verified public catalog shape

The 2026-08-15 read-only browser audit found 11 public catalog classes and four
language modes, producing 44 independent discovery checkpoints. Numbered
pagination is an ASP.NET POST-back and keeps the visible search URL unchanged.
Document routes are `/ru/docs/:id`, `/uz/docs/-:id`, `/docs/:id` (Uzbek
Cyrillic), and `/en/docs/:id`. Different language variants can use different
provider IDs, so the branch links them through a canonical family rather than
assuming ID equality.

These observations prove the discovery contract only. No full crawl was run,
and the corpus counts remain zero until a controlled staging ingestion report
shows discovered, fetched, parsed, indexed and failed counts by category and
language.

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
