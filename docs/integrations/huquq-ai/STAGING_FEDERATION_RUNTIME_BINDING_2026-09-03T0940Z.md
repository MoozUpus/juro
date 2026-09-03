# Staging federation runtime binding — 2026-09-03 09:40Z

This evidence records the staging-only configuration change that makes the
target shard visible to the federated retrieval contract. It does not activate
the shard, consume its queue, ingest sources, or change production.

## Application change

- Branch: `feature/full-legal-corpus`
- Commit: `7260729d` (`feat: add staging corpus shard four federation binding`)
- Main staging Worker version: `5d84e7e6-5ded-49bf-873c-9a36ecdbfe51`
- Target-bound corpus Worker version: `8932797e-e37f-4d1f-97f9-bee1e4de74c1`
- Staging D1 binding: `LEGAL_CORPUS_SHARD_4_DB` → `juro-staging-corpus-shard-4`
  (`7c6dba67-5561-473f-aaa8-a0f6ed6e9bf2`)
- Staging Qdrant allow-list now includes `juro_legal_staging_shard_4`.
- `LEGAL_CORPUS_FEDERATED_SOURCE_SET=all-staging-d1` now requires the six
  explicit staging D1 sources, including shard-4.

The production environment retains one primary D1 binding, corpus federation
disabled, corpus disabled, and dense retrieval disabled.

## Safety state at capture

- shard-3: `frozen`
- shard-4: `handoff_prepared`
- shard-4 documents/provisions/chunks: `0 / 0 / 0`
- shard-4 open jobs: `23,706`
- queue processing and auto-ingest on the target-bound corpus Worker: `false`
- target legacy job `legal-corpus:07aa10e095f0c77b28e6ada80fc8`: still
  `dead_letter`, error `LEGAL_CORPUS_LANGUAGE_FAMILY_CONFLICT`, attempts `5/5`
- target job admin events: `0`

The six sequential post-deploy D1 probes returned `rows_written=0` and
`changed_db=false`. Counts alone are not treated as release evidence; the
release gate remains closed because recovery, activation, queue freeze,
disjointness, snapshot/restore, evaluation, and human legal review are not
proven.

## Verification

- Cloudflare tests: `187/187` passed.
- Legal corpus/chat tests: `25/25` passed.
- lint: passed.
- type-check: passed.
- staging artifact validation: passed.
- Direct `wrangler deploy --dry-run --config wrangler.jsonc --env staging`
  remains unavailable because this legacy config omits `assets.directory`; the
  bounded `npm run validate:artifact:staging` check passed instead.
- Production deployment, DNS, migrations, and feature-flag changes: none.

Activation and queue processing require a real named-staff recovery event with
fresh MFA/TOTP. Technical access cannot substitute for that audit record.
