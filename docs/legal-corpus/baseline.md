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
HTML, so none of that data is imported into JURO. These values remain the
audited Huquq AI reference floor, not JURO metrics. On 2026-08-17 the owner
raised JURO's effective release floor to 1,500 canonical documents and 22,000
unique provisions; the 22,513 indexed-chunk floor is unchanged.

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

Consequently, this baseline had no validated indexed legal corpus and must not
be used to claim source coverage, recall, or corpus-size parity. On 2026-08-15,
migrations `0124_full_legal_corpus.sql`,
`0125_lex_catalog_discovery.sql`, and the export-safety correction
`0126_exportable_legal_corpus_sparse_index.sql` were applied to **staging
only** after pre-migration backup/restore verification. Migration
`0127_legal_corpus_admin_control.sql` was then applied to staging with its own
pre/post full-export restore and private-R2 readback gate. Migration
`0128_owner_corpus_publications.sql` was then applied under the same gate.

After the branch CI and staging browser smoke passed, production-safe migrations
`0124–0128` were applied to production. Staging-only evidence migrations
`0122–0123` remained excluded. Both environments have verified pre/post
isolated restores and private-R2 readback evidence. All new corpus registries
were empty and all corpus feature flags were disabled at the foundation release;
no crawl or corpus traffic cutover was started by that release. The following
approved phase enables bounded acquisition in staging only. Production remains
disabled and direct Lex remains its visible answer path.

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
- The baseline search had no immutable multilingual source registry,
  versioned article-level corpus, RRF fusion, exact quote-store, or
  current-version sparse boundary. This branch implements those foundations
  with an exportable inverted index; coverage is still unproven until the
  controlled ingestion and evaluation gates pass.
- Existing direct Lex retrieval remains the production fallback. It does not
  create permanent corpus records and therefore remains the source of truth
  until the separate corpus rollout gate is passed.
- Heavy corpus discovery and ingestion have been removed from the ordinary
  application scheduler. A route-free dedicated Worker now owns the bounded
  seed/process crons, a shared D1 lease and an idempotent scheduled-run ledger.
  Development and production remain `false`; staging alone enables bounded
  acquisition and shadow mode after the release verifier and backup gates.

## Data rights and operational boundary

Lex.uz legal text, raw HTML and language versions are not treated as MIT code
and are never committed to Git. A future enabled ingestion run stores raw and
normalized source artifacts only in private R2, validates allowed Lex.uz URLs,
honours robots.txt and uses one durable job per scheduled slot. Private user
and tenant documents remain outside the global official-corpus scope.
