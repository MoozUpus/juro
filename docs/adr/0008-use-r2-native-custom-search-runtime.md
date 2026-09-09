# Use an R2-native custom-search runtime

Status: accepted — 2026-09-08

Custom Search Releases use immutable R2 runtime mappings to connect candidate chunks to exact legal identities, applicability and evidence locators. D1 owns only body-free release roots, governance, budgets, Activation Sets and rollback history; the live custom runtime does not depend on the legacy complete-corpus materialization tables, which lets a new production catalog activate already-sealed R2 and Vectorize artifacts without regenerating evidence or embeddings.

## Consequences

- Candidate membership, legal-identity revalidation and evidence locators seal together under an R2 mapping root; selected evidence bytes are still read from Evidence R2 and hash-verified before quotation.
- Vectorize remains disposable, while D1 remains authoritative for which immutable Search Release is active.
- The first production rollback point is an explicit Activation Set with no indexed Search Release, representing the pre-index Live Official Search baseline.
