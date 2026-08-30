# 11: Enforce complete Search Release governance

**What to build:** Turn the working current, as-of, and comparison tracers into a governed release lifecycle with deterministic artifacts, cost controls, configuration/privacy attestation, evaluation thresholds, persisted soak evidence, freshness, activation, and rollback.

Blocked by: 06, 08, 09, 10

Status: ready-for-agent

- [x] Search Releases record deterministic shard/item inventories, exact metadata, R2 hashes, provider configuration, token/cost evidence, privacy attestations, sync state, and evaluation evidence.
- [x] Metadata uses only language, document type, valid-from, and valid-to; the fifth custom field remains reserved and item-level parity is 100%.
- [x] Measured embedding tokens enforce measured cost plus 25%, USD 50 current, USD 450 complete-migration, and USD 25 monthly production-query circuit breakers.
- [x] Every numeric quality, citation, grounding, link, availability, latency, and evaluation-cost threshold from the spec is machine-enforced across every required evaluation stratum.
- [x] Integrity, partial-response, configuration, privacy, and reconciliation failures have zero tolerance.
- [x] Staging 14-day/10,000-request, production 30-day canary, and 90-day retirement clocks use immutable persisted evidence rather than mutable flags.
- [x] Current 24-hour freshness, the four-hour emergency path, weekly historical reconciliation, Activation Set compatibility, and rollback health are observable.
- [x] Tests exercise the release-lifecycle Interface with isolated D1 and in-memory R2/provider Adapters, including missing/stale/failed gate evidence.

## Deduplication and reconciliation supplement

- [x] Canonicalization uses stable legal natural identities and hashes; titles, URLs, route prefixes, provider IDs, and ingestion order never establish legal identity.
- [x] Byte-identical immutable bodies use one content-addressed body identity while every source URL, redirect, capture, provenance record, authority distinction, and audit relationship remains represented.
- [x] Exact repeat ingestion is aliased idempotently at revision, rendition, chunk, sparse, dense, and Search Release projection layers without collapsing language, script, textual authority, applicability, instrument, provision, or lineage variants.
- [x] Uncertain semantic duplicates are persisted as explicit candidates and block release eligibility until evidence-backed review records `preserve_distinct`; they are never guessed into equivalence.
- [x] Reconciliation persists source/canonical counts, aliases, variants, provenance, ambiguity, missing/extra objects, hash/metadata mismatches, release contamination, deterministic shard membership, and restart/idempotency evidence.
- [x] The release gate requires a clean immutable reconciliation report and a complete disjoint shard union before sealing or activation.

## Comments

**Verification (2026-08-31):**

- Migrations `0007_migration_reconciliation.sql` and `0008_release_governance.sql` persist immutable reconciliation checkpoints/reports, duplicate candidates, source aliases, governed manifests, shard inventories, per-stratum evaluation evidence, and observation events.
- `reconcileCorpusMigration` deterministically canonicalizes full publisher-token Text Revisions, legally scoped Provision Renditions, chunks, sparse/dense projections, and release membership. Raw captures and URLs remain provenance even when their immutable bytes share one content address. Same wording across instruments/provisions, multilingual expressions, Controlling Text versus Official Translation, applicability variants, and split/merge lineage remain distinct.
- Repeated routes, redirects, same-day captures, retries, projection overlap, and repeated migration runs are classified. A partial run leaves an immutable checkpoint and resumes to the identical input/report hashes; changing the inventory under an existing run ID fails closed.
- Expected sparse, dense, and Search Release inventories are built from the eligible canonical chunk set. SHA-256 assigns exactly one deterministic shard; missing/extra items, duplicate membership, wrong shards, wrong releases, hash/metadata mismatches, missing provenance, or unresolved duplicate candidates make the report `blocked`.
- Governed sealing requires a pre-existing draft, a clean matching reconciliation report, exact four-field provider metadata parity, a complete shard union, complete/paused sync, disabled provider rewriting/reranking/generation/context expansion/logging/caches, privacy evidence, priced measured tokens plus 25%, and all circuit breakers.
- All spec thresholds are evaluated for each of 18 required strata covering the full 314-scenario matrix. The gate has zero tolerance for stale/invalid links and all integrity, partial-response, configuration, privacy, reconciliation, and unpriced-request failures.
- Staging 14-day/10,000-request, production 30-day canary, and 90-day retirement eligibility derive from immutable timestamped green observations. A breach restarts the continuous segment. Current 24-hour, emergency four-hour, weekly history, rollback, and same-snapshot current/history compatibility gates are enforced.
- Red evidence: reconciliation and governance suites first failed on missing Modules; the governed seal then drove draft-only sealing and exact release metadata into the lifecycle. Green evidence: the combined Ticket 02–11 target/candidate/evidence/release/storage/Worker suite passed 63/63; platform type-check, generated Cloudflare types, and the route-free staging Worker dry-run passed. No remote resource was mutated.

### Post-review correction verification (2026-08-30)

- The evaluation gate now persists explicit scenario IDs per stratum, verifies each stratum count, and requires the union to contain exactly 314 unique scenarios. It also enforces the USD 30 provider evaluation cap across the complete evaluation rather than only per row.
- Freshness clocks reject reversed evidence: current readiness cannot predate official validation, emergency readiness cannot predate the request, and historical reconciliation cannot occur after the governance record. Current production activation requires a 30-day canary; paired history activation evaluates independent observation windows for both releases.
- Migration identity now uses publisher Instrument/Provision tokens, publisher revision tokens, language/script, textual authority, applicability, and hashes. D1 unique constraints prevent duplicate natural identities. Every capture retains URL, time, Instrument, and audit identity while byte-identical bodies share a deterministic content-addressed canonical locator in the persisted alias plan.
- Reconciliation is multiplicity-aware. Duplicate sparse postings, dense candidates, or Search Release rows cannot disappear inside set comparison: all three are counted as exact aliases, persisted as duplicate projection membership, block the report, and make the shard union false until the target is canonicalized.
- Representative tests cover alternate routes/redirects, same-day/retry duplicates, multilingual authority variants, historical/current overlap, split/merge lineage, unresolved near-duplicates, deterministic shards, repeated runs, and restart after an injected partial failure. The focused corrected target suite passed 50/50 with platform type-check green; no target resource was mutated.

### Final review correction verification (2026-08-30)

- Source sparse, dense, and release inventories are now reconciled independently from target inventories. Orphan projections, missing canonical membership, wrong release/capability, wrong deterministic shard, item/R2-key/byte/hash drift, and conflicting repeats remain explicit blockers; exact source retries alone remain safe aliases.
- Provenance is a required graph: every normalized revision names one or more capture IDs, and capture→revision→rendition→chunk→sparse/dense/release edges are persisted in the report. Missing or cross-Instrument capture edges block reconciliation.
- Canonical chunks carry byte counts. Deterministic Search Release objects use identical `itemKey`/`r2Key` values under the release prefix, and sealing compares canonical chunk ID, R2 key, bytes, and SHA-256 against the exact clean reconciliation report rather than a Provision Rendition body locator.
- The release evaluation registry is versioned against the repository's canonical `legalEvaluationCorpus`; every stratum must contain its exact registered scenario IDs. Any invented, missing, moved, or duplicated scenario blocks governance even when the total remains 314.
- Every activation rechecks governance freshness at the activation instant. Current/history pairs additionally require the same frozen Corpus Snapshot, retrieval-policy version, and provider-configuration identity. Governance refreshes remain immutable and retain their own shard and stratum evidence.
- Final review regression coverage includes source-only defects against a clean target, explicit provenance loss, exact chunk-artifact sealing, conflicting temporal replay, canonical-matrix authentication, legal-title privacy preservation, and 30-day activation with a fresh governance attestation. No target resource was mutated.

### Final reconciliation and governance audit (2026-08-31)

- Authority evidence now attests the actual `textualAuthority` and must agree with the Text Revision it supports. Applicability evidence carries an explicit applicability identity that must equal both its normalized interval and the Provision Rendition identity. Contradictory evidence is persisted as a metadata mismatch and blocks reconciliation.
- Canonical chunk-to-rendition identity is carried through sparse, dense, and Search Release projections. Provision Concepts are independently canonicalized from publisher Instrument and Concept tokens, then bound into rendition identity and metadata so equal bytes/wording in distinct provisions cannot collapse. Shared branded schemas cover Instrument, Official Expression, Text Revision, Provision Concept/Rendition, Snapshot, Search Release, chunk, capture, candidate instance/shard/configuration, and provider-project identities; untrusted provider, D1 rows, and persisted reconciliation JSON are parsed at their adapters.
- Migration `0009_sealed_reconciliation.sql` binds each sealed Search Release to the exact reconciliation run accepted at seal time. A later governance record for a different clean run cannot detach activation from that immutable report; current and paired activation both fail closed on drift.
- The evaluation registry is `legal-evaluation-corpus-v3` and selects language and release-gate strata from explicit semantic metadata. Exact-citation scenarios are explicitly tagged/capability-marked and contain actual exact-article requests; scenarios are no longer admitted merely because fixture metadata happens to contain article IDs.
- Operational timestamps after the governance record, duplicate projection multiplicity, incomplete/disjoint-union defects, missing authority/applicability/provenance/audit relationships, and chunk/rendition swaps all remain zero-tolerance blockers.
- Every Provision Rendition requires a versioned `legal-semantic-v1` fingerprint. Missing attestations fail inventory parsing; reviewed/unresolved near-duplicate groups remain explicit. Authority records bind an exact Revision/Expression/Capture/authority tuple, and all attested facts participate in target metadata hashes.
- Reasoning-provider interpretation/selection responses and stored/new reconciliation reports now cross strict schema boundaries instead of unchecked type assertions.
- Final local verification: 86/86 target feature tests passed; `npm run type-check`, `npm run lint`, `npm run cf:types:check`, the staging Worker dry-run, and `git diff --check` passed. No target resource was provisioned or mutated, so the operational corpus reconciliation report remains gated at Ticket 12.

### Independent spec-review closure (2026-08-31)

- Canonical Provision Concept metadata hashes now contain only stable publisher Instrument/Concept tokens; normalized Text Revision metadata excludes source capture aliases. Adding an exact retry/route alias to an already canonical inventory produces byte-identical canonical Revision, Concept, and Rendition metadata hashes.
- Exact rendition aliases must agree on their required versioned semantic fingerprint. A same-natural-identity, same-body retry with a conflicting fingerprint is recorded as a metadata mismatch and blocks reconciliation instead of allowing source sort order to select the attestation.
- Red-green review regressions cover both alias-independent metadata and conflicting fingerprints. The final target feature suite passed 90/90 after the corrections. No target resource was provisioned or mutated, so operational reconciliation remains gated at Ticket 12.
- The repository code-review workflow finished with no remaining actionable P0–P2 Spec findings and no remaining Standards findings.
