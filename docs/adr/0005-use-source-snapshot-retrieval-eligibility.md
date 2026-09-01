# Use source snapshots for retrieval eligibility

Status: accepted — 2026-09-02

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
partial failure byte-identical. Full D1 inventories and R2 readback are part of
reconciliation. Ticket 12 may seal the green2 storage candidate, but the Search
Release stays draft, inactive and unpromoted until Ticket 13 completes provider
evaluation, failure/quality/latency/cost gates and activation.

## Consequences

- Unsupported current temporal state remains fail-closed and inventoried.
- Distinct publisher document identities are never merged by guessed language
  or translation relationships.
- Private, quarantined, missing, corrupt or canonical-conflict material cannot
  enter a Search Release.
- Existing production/private resources, the legacy Adapter, failed green
  candidate and rollback resources are retained unchanged.
