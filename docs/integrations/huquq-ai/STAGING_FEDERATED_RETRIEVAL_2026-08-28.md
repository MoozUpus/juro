# Staging federated legal retrieval — 2026-08-28

This note records the staging-only handoff from bounded corpus acquisition to
read-only federated retrieval. It is operational evidence, not a production
release approval and not a legal-coverage claim.

## Runtime boundary

- JURO branch: `feature/full-legal-corpus`
- Retrieval commit: `5ba3352d`
- Shard-ingestion freeze commit: `0e016a31`
- Legacy-ingestion freeze commit: `9aa68342`
- Staging Worker deployment: `juro-platform-staging`, version
  `562ff94b-9c0d-497b-ace9-45405d16c8e5` (2026-08-28T05:54:54Z)
- Dedicated corpus Worker deployment: `juro-legal-corpus-staging`, version
  `72dd276b-4ba6-4275-aa12-a2a1b09f197f`
- `LEGAL_CORPUS_FEDERATED_ENABLED=true`
- `LEGAL_CORPUS_FEDERATED_SOURCE_SET=all-staging-d1`
- `LEGAL_CORPUS_LIVE_LEXUZ_ENABLED=false`
- `LEGAL_CORPUS_AUTO_INGEST_ENABLED=false`
- `LEGAL_LEX_INGESTION_ENABLED=false`
- `LEGAL_LEX_METADATA_MONITOR_ENABLED=false`
- `LEGAL_LEX_RSS_DISCOVERY_ENABLED=false`
- `LEGAL_CORPUS_SHADOW_MODE=false`

The production environment remains unchanged and keeps the corpus and
federation flags disabled. No production deployment, migration, DNS change or
corpus publication was performed.

## Sources used by staging chat

`all-staging-d1` currently routes read-only indexed retrieval through these
four explicit D1 bindings:

| Binding | Database | Exact current provisions | Indexed chunks | Canonical documents |
| --- | --- | ---: | ---: | ---: |
| `LEGAL_CORPUS_LEGACY_DB` | `juro-staging` | 62,075 | 151,499 | 3,575 |
| `LEGAL_CORPUS_V2_DB` | `juro-staging-corpus-v2` | 15,899 | 55,814 | 599 |
| `LEGAL_CORPUS_SHARD_1_DB` | `juro-staging-corpus-shard-1` | 18,724 | 52,370 | 1,635 |
| `LEGAL_CORPUS_SHARD_2_DB` | `juro-staging-corpus-shard-2` | 19,484 | 62,089 | 2,495 |

These rows are per-database counts. They must not be summed as a release
metric: overlap and version identity are resolved at retrieval time by the
stable evidence key, current-status/version ordering and federated RRF.

## Shard 3 exclusion

`juro-staging-corpus-shard-3` is a continuation acquisition shard and is not
yet a frozen release source. At the handoff it contained 113 canonical
documents, 7,863 exact current provisions and 24,362 indexed chunks, with
31,159 queued jobs. Its dedicated Worker was deployed with auto-ingestion and
live/shadow flags disabled; the last run completed at
`2026-08-28T05:13:57.227Z`, after which no new scheduler run was observed.
It is intentionally excluded from `all-staging-d1` until a formal shard
freeze, snapshot, point-in-time and parity evidence pass is available.

The older `juro-legal-corpus-staging` Worker bound to v2 was also deployed with
auto-ingestion, live and shadow flags disabled. Its two pre-existing running
job rows are retained as lease-recovery evidence; no new scheduler run was
created by the freeze.

## Read-only post-freeze probe

Sequential remote D1 probes on 2026-08-28 after the platform redeploy
confirmed that the four federated sources retain their indexed totals and no
terminal/dead-letter ingestion jobs. The dedicated v2 and shard-3 workers have
no new scheduler run after the freeze. Legacy `juro-staging` still contains
three pre-existing running version rows and two expired lock rows from the
older acquisition path; they were not mutated or force-completed. The
shard-3 control row remains `acquisition_state=active`, so it stays excluded
from the federated source set until a separately evidenced formal freeze.

## Verification

- Federated/chat/retrieval/shard boundary tests: 43 passed, 0 failed.
- Platform type-check: passed.
- Platform lint: passed.
- Staging artifact dry-run and performance budgets: passed.
- Staging deployment: completed successfully.
- Dedicated corpus Worker staging deployment: completed successfully with
  ingestion disabled.
- The platform staging Worker was redeployed with legacy Lex ingestion,
  metadata monitoring and RSS discovery disabled as well; this prevents new
  acquisition through the older queue while retaining read-only retrieval.
- CI workflow run `33146232319` completed successfully for commit `9aa68342`;
  website and platform jobs passed their configured checks. Qdrant snapshot /
  restore workflow run `33146234786` also completed successfully.
- The release gate is not claimed: the federated snapshot/manifests,
  cross-source deduplication proof, indexed 314-scenario evaluation, Qdrant
  benchmark/restore and D1 backup/restore gates remain open.

## Post-freeze release-gate probe (2026-08-28T06:27Z)

The collection phase remains stopped. Sequential remote D1 queries were
read-only (`rows_written=0`) and observed the following current state:

| Database | Canonical documents | Exact current provisions | Indexed chunks | Active failed/dead-letter jobs | Historical terminal/technical failures | Locks | Checkpoints | Acquisition |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `juro-staging` | 3,575 | 62,075 | 151,499 | 0 | 230 | 2 pre-existing | 44/44 | legacy |
| `juro-staging-corpus-v2` | 599 | 15,899 | 55,814 | 0 | 5 | 0 | 44/44 | frozen |
| `juro-staging-corpus-shard-1` | 1,635 | 18,724 | 52,370 | 0 | 10 | 0 | 44/44 | frozen |
| `juro-staging-corpus-shard-2` | 2,495 | 19,484 | 62,089 | 0 | 8 | 0 | 44/44 | frozen |
| `juro-staging-corpus-shard-3` | 113 | 7,863 | 24,362 | 0 | 7 | 0 | 44/44 | active, excluded |

The terminal/technical-failure column is the immutable failure ledger, not an
active queue claim. It is therefore not silently reclassified as success. No
new scheduler run was observed after the freeze deployments; shard-3 remains
excluded because its control row is still `active`.

The two owner-provided human-review exports were verified locally against the
checked-in schema and hash-chain verifier: corpus `2026-08-13.1`, run
`staging-20260814-canonical`, 314/314 records, zero verifier failures. The raw
exports were not copied into the repository. This is valid human-review
evidence for that historical canonical run; it does not prove a new indexed
federated benchmark or current corpus snapshot.

The current-head CI workflow `33146651604` and Qdrant snapshot/restore gate
`33146653364` passed. A staging browser smoke attempt redirected to Cloudflare
Access login, so authenticated post-deploy UI QA is not claimed. The quality
snapshot guard correctly returned `LEGAL_CORPUS_QUALITY_SNAPSHOT_WINDOW_UNSAFE`
and no snapshot was fabricated. D1 full export/restore remains open after the
previous `SQLITE_NOMEM` probe; production, corpus ingestion, and rollout remain
disabled.

After this probe was committed, exact-head checks also passed for commit
`95402442c7e7587729f13796109c2a3eb6ce3c40`: CI workflow `33148074850`
(Website and Platform validation) and Qdrant snapshot/restore workflow
`33148077161`. These checks validate the checked-in code and infrastructure
fixture; they do not close the legal corpus release gate or substitute for
indexed legal evaluation and D1 restore evidence.

The follow-up documentation commit `12cde692ab0fd3407a01e04cc33833f206abbe60`
was then validated on its exact head: CI workflow `33148541687` and Qdrant
snapshot/restore workflow `33148543880` both passed. The same release-gate
limitations continue to apply.

## Cross-source identity probe (2026-08-28T07:07Z)

Read-only D1 queries enumerated canonical document IDs from the four runtime
sources (8,304 IDs in total). The sets are not disjoint: 1,617 IDs occur in
more than one database. Pairwise repeated-ID counts were: legacy/v2 460,
legacy/shard-1 380, legacy/shard-2 312, v2/shard-1 491, v2/shard-2 374 and
shard-1/shard-2 1,335. These observations are evidence against summing database
counters as unique-corpus totals. Federated retrieval keeps source records
separate and performs deterministic deduplication; no destructive cross-DB
merge was performed. A formal federated release snapshot still requires an
explicit partition/deduplication manifest and a verified snapshot restore.

## Queue reconciliation after freeze (2026-08-28T07:21Z)

The follow-up read-only scheduler probe found durable historical backlog in
the legacy and v2 databases: legacy has 43,683 queued and 3 stale `running`
jobs; v2 has 27,686 queued, 1 retrying and 2 stale `running` jobs. Their
latest updates are before the freeze window (legacy 2026-08-21, v2
2026-08-24), and no live locks remain. Shard 1 and shard 2 remain frozen with
zero queued/retrying/running jobs. All four probes returned `rows_written=0`.
The staging feature flags prevent new claims, but the historical backlog is
not silently reported as an empty queue; strict queue-drain evidence remains
open for any release gate that includes legacy/v2.
