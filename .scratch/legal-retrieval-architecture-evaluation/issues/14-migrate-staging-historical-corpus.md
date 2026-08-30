# 14: Migrate the complete staging historical corpus

**What to build:** Migrate all historically eligible Text Revisions, Provision Renditions, Applicability Periods, authority evidence, and lineage/equivalence relationships into the same staging Corpus Snapshot lineage without disrupting active current retrieval.

Blocked by: 12

Status: ready-for-agent

- [ ] Fresh pre-stage D1, R2, Qdrant, and configuration backups pass their restore and hash checks.
- [ ] Full publisher revision tokens preserve every distinct historical revision, including multiple revisions on one day.
- [ ] Editorial validity, legal applicability, Controlling Text evidence, Provision Concepts, and lineage/equivalence edges migrate without unsupported inference.
- [ ] Every historically eligible Provision Rendition exists in immutable R2 and legal D1 with reconciled bytes, hashes, relationships, and provenance.
- [ ] Unknown or disputed applicability and authority remain explicit coverage gaps and are absent from historical Search Release eligibility.
- [ ] The complete historical source/target inventory reconciles with zero unexplained missing or extra evidence.
- [ ] Active staging current retrieval and its rollback path remain healthy throughout the migration.

## Deduplication and reconciliation acceptance supplement

- [ ] Reconcile all historical/current overlap by canonical Text Revision, Provision Rendition, chunk, capability, release, and shard identity without dropping provenance or duplicating one eligible item within a release.
- [ ] Preserve distinct same-day publisher revisions, languages/scripts, textual authorities, applicability periods, legal instruments/provisions, and reviewed split/merge/renumber/move/repeal lineage even when bytes or wording match.
- [ ] Persist exact historical source/canonical counts, body aliases, duplicate candidates/reviews, missing/extra/hash/metadata/provenance mismatches, and per-release/per-shard complete-disjoint-union evidence.
- [ ] Prove repeated history migration and partial-failure restart are idempotent; block sealing or comparison activation for any remaining ambiguity or reconciliation defect.
