# 15: Build and activate staging as-of and comparison search

**What to build:** Build the deterministic four-shard staging history Search Release, validate as-of and arbitrary two-endpoint comparisons, complete its soak, and activate compatible history/comparison capabilities.

Blocked by: 13, 14

Status: ready-for-agent

- [ ] Every historically eligible item belongs to exactly one deterministic shard and every shard stays below provider limits with growth headroom.
- [ ] All required shards participate in each endpoint search; partial responses or missing shards invalidate the packet.
- [ ] As-of and current/current, current/history, history/current, and history/history matrices pass with separate Provision Sets and correct lineage.
- [ ] The history release passes all quality, integrity, metadata, latency, privacy, configuration, and cost gates plus its 14-day/10,000-request staging soak.
- [ ] Current and history releases selected for comparison come from the same Corpus Snapshot and compatible policy versions.
- [ ] As-of and comparison capabilities activate atomically while current retrieval remains available.
- [ ] Rollback to current-only AI Search or the prior Qdrant/D1 path succeeds and is recorded.
