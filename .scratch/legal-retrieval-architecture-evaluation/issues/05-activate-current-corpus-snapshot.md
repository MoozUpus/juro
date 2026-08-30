# 05: Activate one current Corpus Snapshot

**What to build:** Freeze the target evidence tracer into an immutable Corpus Snapshot and current Search Release, then select it through a capability-scoped Activation Set. The platform must be able to use and roll back that activation without mutating evidence or provider indexes.

Blocked by: 04

Status: ready-for-agent

- [x] Corpus Snapshot membership and its corpus hash become immutable after freeze.
- [x] A current Search Release records its snapshot, item inventory, R2 locators/hashes, retrieval policy, and configuration identity.
- [x] An Activation Set can select current retrieval while explicitly leaving as-of and comparison unsupported.
- [x] Activation and rollback each occur in one legal-D1 transaction and append immutable event history containing the prior set.
- [x] Unsealed releases, incomplete inventory, failed Official Eligibility, cross-environment identity, or mutation of frozen records is rejected.
- [x] A private current-law retrieval resolves the active release; unsupported historical retrieval continues to Live Official Search.
- [x] Tests verify activation and rollback through the release-lifecycle Interface rather than by asserting SQL statement order.

## Comments

### Post-review correction verification (2026-08-30)

- Search Release membership is now the exact complete capability-eligible projection of its Corpus Snapshot: current and history releases may legitimately contain different item sets, but neither may omit or duplicate an eligible member. A two-revision test proves one current item and two historical items from the same Snapshot.
- Rollback now creates a new immutable Activation Set containing the exact releases selected by the prior set. A current-only → current+history/comparison → rollback test proves restoration to current-only rather than an all-null legacy placeholder.
- Production current activation now requires its own persisted 30-day canary. The lifecycle test rejects activation without observations and accepts it only at the real thirtieth-day evidence boundary.

**Verification (2026-08-30):**

- Added immutable Corpus Snapshot membership/hashes, Search Release inventories, Activation Sets, the atomic active-set pointer, and immutable activation history in `legal-drizzle/0004_release_lifecycle.sql`.
- `target-release.ts` freezes only current-eligible target evidence, checks exact release inventory/locator parity, seals releases, atomically activates current-only capability membership, and rolls back to a new legacy/unsupported set while preserving the prior set.
- The private lifecycle client resolves the pinned current Search Release; absent as-of/comparison membership returns `live_official_search` instead of borrowing current evidence.
- Red/green evidence: the first lifecycle seam test failed with `ERR_MODULE_NOT_FOUND`, then passed after implementation; a second red cycle failed on the absent draft API, then verified unsealed, incomplete, ineligible, cross-environment, and frozen-mutation rejection.
- The lifecycle suite passed 2/2; combined target evidence/storage/release and Worker regression tests passed 28/28; platform type-check and legal Worker dry-run passed. No remote resource was mutated.
