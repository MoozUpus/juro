# Use source snapshots for retrieval eligibility

Status: accepted — 2026-09-02; verification simplified by owner direction — 2026-09-05

## Decision

JURO models the current official-source corpus additively as Source Document →
Source Snapshot → Snapshot Provision → Retrieval Eligibility. A Source
Document is the publisher's stable document identity in one language/script.
A Source Snapshot is an immutable publisher revision and captured D1/R2 byte
identity. A Snapshot Provision is a deterministic extraction with exact source
position, normalized-content hash, provenance, privacy and temporal state.

Current Retrieval Eligibility is derived only from verified official-source
provenance, exact D1/R2 integrity, supported extraction, stable identities, a
verified current pointer, supported current temporal state, public privacy,
quarantine clearance and conflict-free deterministic canonicalization.
Textual authority, controlling-language status and translation relationships
are not inferred and are not gates.

Legacy Legal Instrument, Official Expression, Text Revision, authority,
translation, alias, failed-candidate and eligibility records stay immutable and
queryable. They are audit evidence and optional future enrichment. A neutral
Citation identifies publisher, publisher document/revision, language, capture
and source URL; it does not label a text controlling or an official
translation unless independent explicit evidence exists.

The current candidate is built off-side into immutable canonical chunks,
sparse projection rows, dense candidates, a pairwise-disjoint complete shard
union and one Search Release. Checkpoints and immutable puts make restart after
partial failure byte-identical. New writes are byte/hash-checked while the
builder accumulates the complete identity inventory. Unchanged accepted source
manifests are reused under the
[verification policy](../operations/legal-corpus-verification.md). Storage
completion does not activate a Search Release; the new index's membership check
and a bounded capability smoke precede activation.

Legacy primary keys remain compatibility surrogates only. Additive stable
identity mappings derive Source Document, Source Snapshot and Snapshot
Provision identities from publisher tokens, capture provenance, source
position and verified content hashes; authority and translation fields do not
participate. Construction records its completion and inventory once. The earlier
requirement for two independent whole-source/R2 replays and a separate external
qualification package is superseded. Reuse accepted completion records and
explicit waivers; verify restart and failure behavior with bounded fixtures.
Existing stored qualification history remains immutable, and this procedural
change does not claim that a waived check ran or seal an unbuilt Search Release.

## Consequences

- Unsupported current temporal state remains fail-closed and inventoried.
- Distinct publisher document identities are never merged by guessed language
  or translation relationships.
- Private, quarantined, missing, corrupt or canonical-conflict material cannot
  enter a Search Release.
- Existing production/private resources, the legacy Adapter, failed green
  candidate and rollback resources are retained unchanged.
