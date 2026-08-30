# 20: Stop legacy corpus writes after recovery qualification

**What to build:** After complete target activation has remained stable for 90 days, prove recovery from fresh backups and stop all legacy platform-D1 body/posting and Qdrant writes while retaining temporary read-only rollback access.

Blocked by: 19

Status: ready-for-agent

- [ ] Immutable evidence proves complete activation has remained green for at least 90 continuous days and prior Search Releases satisfy their retention period.
- [ ] Fresh production D1/R2/Qdrant/configuration backups pass an isolated end-to-end restore rehearsal.
- [ ] Ingestion and release workflows stop writing legacy body text, duplicate chunks, sparse postings, and Qdrant points without changing target writes.
- [ ] Read-only comparison verifies target Legal Answers against the frozen legacy path during a bounded observation window.
- [ ] Any unexpected target regression can re-enable the legacy writers through the documented recovery procedure before schema removal.
- [ ] Tests prove no legacy write side effect through the ingestion/release Interfaces and keep private platform data unaffected.
