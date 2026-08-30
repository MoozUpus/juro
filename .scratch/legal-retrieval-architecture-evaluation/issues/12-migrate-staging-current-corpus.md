# 12: Migrate the complete staging current corpus

**What to build:** After fresh staging backups and isolated restore verification, migrate every current Official Expression and Provision Rendition into dedicated staging R2 and legal D1 while keeping active Qdrant/D1 retrieval unchanged.

Blocked by: 11

Status: ready-for-agent

- [ ] A fresh staging platform-D1 export restores in isolation, the existing R2 inventory/hashes verify, and a Qdrant snapshot is restorable before mutation.
- [ ] Dedicated staging legal D1, legal R2, private Worker, service binding, Gateway/project identity, and AI Search namespace are environment-isolated and attested.
- [ ] Every current raw capture, normalized Text Revision, and Provision Rendition exists at an immutable R2 key with verified byte count and hashes.
- [ ] Every current Legal Instrument, Official Expression, authority record, Applicability Period, Provision Concept, relationship, eligibility result, and R2 locator reconciles in legal D1.
- [ ] Unknown authority or applicability remains explicit and is excluded from unsupported capabilities rather than inferred.
- [ ] Source and target counts, identities, keys, bytes, hashes, and current pointers reconcile at 100% with zero unexplained extras.
- [ ] Existing visible staging retrieval remains on the legacy Adapter and rollback evidence is recorded.

## Deduplication and reconciliation acceptance supplement

- [ ] Inventory every source document, raw capture, normalized revision, Provision Rendition, chunk, sparse posting, dense candidate, and current Search Release item before migration.
- [ ] Persist the deterministic canonicalization report with source/canonical counts, exact aliases, preserved variants/provenance, reviewed and unresolved duplicate candidates, and input/report hashes.
- [ ] Prove the current sparse, dense, and Search Release inventories are the expected complete disjoint union of canonical eligible chunks and deterministic shards, with no missing/extra/hash/metadata/provenance/release-membership mismatch.
- [ ] Re-run after completion and after an injected partial-failure checkpoint; both runs must prove restart safety and identical canonical/report identities.
- [ ] Leave sealing, promotion, and activation blocked for any unresolved ambiguity, inventory mismatch, missing provenance, cross-release contamination, or non-disjoint shard membership.

## Comments

### Recovery-gate blocker (2026-08-30T19:42:33Z)

- Read-only target confirmation found that `juro-legal-catalog-staging` and `juro-legal-evidence-staging` do not yet exist. No target resource was provisioned or mutated.
- The source staging inventory reported 11,230 completed ingestion jobs, 1 dead-letter job, and 43,512 queued jobs: 43,513 non-completed jobs. The accepted Qdrant snapshot gate requires automatic ingestion disabled, zero pending work, zero missing dense points, and matching D1/Qdrant counts. A restorable Qdrant snapshot therefore cannot truthfully be taken yet.
- A fresh candidate bundle was started at `D:/Programming/WORK/juro-backups/legal-retrieval-architecture/pre-staging-current-20260830T191121Z/`. Five D1 Time Travel bookmarks were captured. The main D1 export then terminated during SQL download and left an 8,147,435,520-byte truncated file (SHA-256 `2982D2B0EA39126577E458CDBEC3D3D505CB2064347CD2180BCAF9B2C8307906`); it is explicitly recorded as invalid and was not restore-verified.
- Complete evidence, including the bookmark identities, partial-file diagnosis, Qdrant counts, target identities, and fail-closed verdict, is in that bundle's `BACKUP-STATUS.md`.
- At an absolute ceiling of six jobs per four-minute tick with no new discovery, the queue cannot drain before `2026-09-19T22:39:21Z`. This is only a mathematical lower bound: the deployed worker can add discovery work and has no eligible drain-only transition before the recovery gate, so no actual Ticket 12 eligibility time can yet be calculated.
- Next frontier remains Ticket 12. Do not provision, migrate, seal, promote, or activate until one fresh D1/R2/Qdrant/configuration/local bundle passes every restore/hash gate immediately before mutation.

### Recovery evidence identity correction (2026-08-30T20:15:15Z)

- Final review detected four shortened/mistyped D1 names in `BACKUP-STATUS.md`. They are corrected to `juro-staging-corpus-v2` (`62620fb3-3da3-4c76-a8e9-aa60858c1063`) and `juro-staging-corpus-shard-1/2/3` (`e09e0682-0c2e-4458-a8f3-be9de28117e3`, `36fa1cfe-6d00-47b7-a980-864020028d86`, `ccf1f18e-66cf-4358-a7aa-f1d725b7653c`). Their existing Time Travel bookmark values were unchanged.
- The corrected identities were verified against the successful read-only Cloudflare inventory retained in local Wrangler logs at `2026-08-30T19:54:28Z`. A later read-only refresh failed with Cloudflare authentication error 10000; it made no mutation and does not weaken or replace the incomplete-gate verdict.
