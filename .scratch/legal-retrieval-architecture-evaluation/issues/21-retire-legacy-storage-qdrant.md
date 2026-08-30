# 21: Retire legacy D1 storage and Qdrant

**What to build:** Complete the contract phase of the migration by removing verified-unused platform-D1 corpus bodies/postings and retiring Qdrant containers, snapshots, reconciliation, schedules, configuration, and documentation while retaining immutable legal evidence and reproducibility.

Blocked by: 20

Status: ready-for-agent

- [ ] Fresh final backups and restore evidence exist, and the legacy read-only observation window completed without a target regression.
- [ ] Forward migrations remove only legacy official-corpus body, duplicate chunk, and sparse-posting storage; tenant, user, workspace, owner, and private-document data remains intact.
- [ ] All legacy Qdrant write/read code, container resources, snapshots, reconciliation jobs, schedules, bindings, alerts, and runbooks are removed or archived consistently.
- [ ] No active caller, feature flag, release record, or rollback procedure references the retired storage or Adapter.
- [ ] Current, as-of, comparison, Live Official Search, Citations, freshness, backup, and content-free observability pass final production verification.
- [ ] Immutable R2 captures/revisions/renditions, Corpus Snapshots, Search Release manifests, legal-D1 relationships, activation history, and reproduction tooling remain available.
- [ ] Final migration evidence is appended to the ticket without secret values.
