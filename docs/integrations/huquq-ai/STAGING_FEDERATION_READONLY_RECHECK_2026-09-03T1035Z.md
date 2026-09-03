# Staging federation read-only recheck — 2026-09-03T10:35Z

This record is a sequential, read-only staging probe. Every D1 query used
`npx wrangler d1 execute --remote --json` with `SELECT` statements only and
reported `rows_written=0` and `changed_db=false`. No corpus, queue,
checkpoint, handoff, failure-ledger, production, DNS or feature-flag state was
changed.

## Current source state

| Database | Documents | Provisions | Chunks | Open jobs | Dead-letter jobs | Terminal/technically-unavailable rows | Checkpoints | D1 size (bytes) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `juro-staging` | 4,291 | 1,306,019 | 1,301,928 | 43,539 | 1 | 270 | 44/44 | 9,999,998,976 |
| `juro-staging-corpus-v2` | 599 | 1,311,096 | 1,308,850 | 27,689 | 0 | 5 | 44/44 | 9,999,998,976 |
| `juro-staging-corpus-shard-1` | 1,635 | 370,808 | 369,081 | 0 | 0 | 10 | 44/44 | 2,890,203,136 |
| `juro-staging-corpus-shard-2` | 2,495 | 997,115 | 997,338 | 0 | 0 | 8 | 44/44 | 8,116,838,400 |
| `juro-staging-corpus-shard-3` | 3,313 | 1,434,894 | 1,434,847 | 0 | 7 | 24 | 44/44 | 10,011,586,560 |
| `juro-staging-corpus-shard-4` | 0 | 0 | 0 | 23,706 | 0 | 0 | 44/44 | 39,559,168 |

The physical totals are not release evidence: canonical-document ownership,
current unique-provision parity, physical disjointness and indexed parity are
still unproven. The terminal/technically-unavailable column is a failure-ledger
observation, not a claim that all rows are terminal; release requires zero
terminal and dead-letter jobs.

## Recovery and handoff

- `juro-staging.legal_corpus_admin_events`: **0 rows**.
- Protected job `legal-corpus:07aa10e095f0c77b28e6ada80fc8` remains
  `dead_letter`, attempt `5/5`, error
  `LEGAL_CORPUS_LANGUAGE_FAMILY_CONFLICT`.
- Shard-3 control: `frozen`; shard-4 control: `handoff_prepared`.
- Handoff `14f54255-7025-47cd-ae13-38da842132fe` has 23,706 held jobs and
  14 copied failure rows; shard-4 has no corpus rows. Activation and queue
  drain were not executed.
- Latest terminal/technically-unavailable timestamps remain historical (the
  latest is shard-3 `2026-09-02T07:07:45.368Z`); no new terminal failure was
  observed in this recheck.
- `npx wrangler d1 list --json` showed no new replacement staging database;
  legacy and v2 remain at the exact 10 GB file-size ceiling.

## Release impact

The protected named-staff fresh-MFA recovery event is still missing. Technical
credentials cannot author that audit principal. The release gate therefore
remains closed; snapshot, indexed 314-scenario evaluation, Qdrant benchmark /
restore, federated D1 backup / restore, legal review and production rollout are
not claimed. Production and DNS remain unchanged.

## CI and branch

- Branch: `feature/full-legal-corpus`
- HEAD: `00732445fb818453fafc63542eb01cfb8c1ea4ce`
- CI: [33742810881](https://github.com/MoozUpus/juro/actions/runs/33742810881),
  success on the exact HEAD.
- Draft PR: [#43](https://github.com/MoozUpus/juro/pull/43), still open and
  unmerged.
