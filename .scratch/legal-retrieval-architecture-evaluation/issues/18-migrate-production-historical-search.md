# 18: Migrate and build production historical search

**What to build:** Migrate complete production historical evidence and build four off-side history shards compatible with the active current Corpus Snapshot, without activating as-of or comparison retrieval.

Blocked by: 17

Status: ready-for-agent

- [ ] Fresh production backups and isolated restore verification pass immediately before historical mutation.
- [ ] All historical evidence, Applicability Periods, textual authority, Provision Concepts, lineage/equivalence, Temporal Coverage Gaps, and locators reconcile at 100%.
- [ ] Every eligible history item belongs to exactly one deterministic shard with exact provider metadata and R2/D1 hash parity.
- [ ] The history release shares the active current release's Corpus Snapshot and compatible query, chunk, embedding, metadata, and reranker policies.
- [ ] As-of and every comparison form pass the full production shadow matrix with zero integrity or partial-response tolerance.
- [ ] Active production current retrieval and both rollback paths remain healthy while the history release is off-side.
