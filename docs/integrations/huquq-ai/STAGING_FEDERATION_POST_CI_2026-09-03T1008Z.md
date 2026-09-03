# Staging federation post-CI evidence — 2026-09-03T10:08Z

## Scope

This record covers only the staging legal-corpus federation. No production
deployment, migration, feature-flag change, DNS change, or queue activation was
performed.

## CI

- Branch: `feature/full-legal-corpus`
- Commit: `ac6bc95dcae14afe126f54d4fbb84a3dd47d3acc`
- Workflow: [CI run 33741313023](https://github.com/MoozUpus/juro/actions/runs/33741313023)
- Result: `success`
- Covered platform and website validation, generated Cloudflare types, lint,
  type-check, tests, deployable-artifact validation, environment matrix,
  production-dependency audit, and dependency licence policy.

## Sequential read-only D1 probes

The following probes were run one database at a time with Wrangler `d1 execute
--remote --json`; every probe reported `rows_written=0` and
`changed_db=false`.

| Database | Documents | Provisions | Chunks | Open jobs | Dead-letter jobs | Completed checkpoints |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `juro-staging` | 4,291 | 1,306,019 | 1,301,928 | 43,539 | 1 | 44/44 |
| `juro-staging-corpus-v2` | 599 | 1,311,096 | 1,308,850 | 27,689 | 0 | 44/44 |
| `juro-staging-corpus-shard-1` | 1,635 | 370,808 | 369,081 | 0 | 0 | 44/44 |
| `juro-staging-corpus-shard-2` | 2,495 | 997,115 | 997,338 | 0 | 0 | 44/44 |
| `juro-staging-corpus-shard-3` | 3,313 | 1,434,894 | 1,434,847 | 0 | 7 | 44/44 |
| `juro-staging-corpus-shard-4` | 0 | 0 | 0 | 23,706 | 0 | 44/44 |

The physical totals above are not a release claim: canonical-document and
chunk disjointness, current unique-provision totals, and a federated snapshot
remain unproven.

## Handoff and recovery state

- Handoff `14f54255-7025-47cd-ae13-38da842132fe` remains
  `juro-staging-corpus-shard-3` = `frozen` and
  `juro-staging-corpus-shard-4` = `handoff_prepared`.
- Shard-4 has 23,706 held jobs and zero documents; activation and queue drain
  were not run.
- The protected legacy job `legal-corpus:07aa10e095f0c77b28e6ada80fc8` remains
  `dead_letter` with
  `LEGAL_CORPUS_LANGUAGE_FAMILY_CONFLICT` at retry 5/5.
- A read-only query of `juro-staging.legal_corpus_admin_events` returned no
  rows. There is no authoritative recovery event containing named staff,
  assignment, and fresh MFA evidence.
- No new terminal failure was observed after the prior probe; historical
  failure rows were not modified.

## Release impact

The recovery/audit event is still required before the protected activation
operation. This evidence therefore does not close the release gate and does
not authorize production rollout.
