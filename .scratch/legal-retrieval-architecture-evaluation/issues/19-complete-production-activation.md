# 19: Canary and complete production activation

**What to build:** Run privacy-qualified production canaries for as-of and arbitrary comparison retrieval, complete the required stability period, and activate all supported capabilities together.

Blocked by: 18

Status: ready-for-agent

- [ ] As-of and comparison canaries remain green for 30 continuous days across all required quality, latency, integrity, privacy, configuration, cost, and failure strata.
- [ ] Current, as-of, and comparison Search Releases are compatible members of one atomic Activation Set.
- [ ] History-versus-history and mixed-endpoint Legal Answers use separate Provision Sets, controlling evidence, and correct lineage in production.
- [ ] Current freshness, emergency updates, weekly historical reconciliation, content-free telemetry, and spend circuit breakers operate successfully.
- [ ] Complete production activation is atomic and preserves the prior current-only and legacy Activation Sets.
- [ ] Rollback from complete activation to current-only and then to Qdrant/D1 succeeds and is recorded.
