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
