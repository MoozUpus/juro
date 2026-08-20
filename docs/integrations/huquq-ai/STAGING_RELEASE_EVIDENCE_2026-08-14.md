# Staging release evidence — 2026-08-14

Status: **COMPLETE for the canonical 314-scenario direct-source evaluation; the
separate indexed-corpus release gate remains open**.

This record distinguishes observed staging evidence from remaining release
controls. Its initial technical run was partial; the later sections record the
fresh-MFA reviewer attestation, 314 immutable per-scenario records and the
subsequent Worker-only rollout. It does not pass the newer indexed-corpus gate
or replace the reviewer's own legal judgment.

## Deployed revision

- Branch: `feature/huquq-ai-staging-evidence`
- Application commit: `e81173f0952f21589f15aeae602cc1520a29cfa0`
- Worker: `juro-platform-staging`
- Worker version: `2596a35b-67b7-4b83-b2a4-4a7929edc7b0` at 100% traffic
- Deployment time: `2026-08-14T16:52:04.682372Z`

The deployment used `npm run deploy:staging`; it builds the flattened staging
artifact and deploys only that Worker with `--containers-rollout none`. It does
not target the `juro` production Worker and does not apply a D1 migration.

The reviewer-evidence page and both of its server APIs are additionally guarded
by `APP_ENV === "staging"`. They return `404` in any other environment, so this
staging-only release control is not exposed by a production deployment.

## Verified staging boundary

- `staging.app.juro.uz` returned the expected Cloudflare Access `302` and
  `Cache-Control: private, no-store` to an anonymous request.
- `https://status.staging.juro.uz/api/status` returned `200` with HSTS, CSP,
  frame denial, and `X-Robots-Tag: noindex, nofollow, noarchive`.
- A remote read-only D1 query returned `reachable = 1` from the staging DB
  (`bb716a96-b2fb-4823-90d6-6c228fed181a`) in EEUR; no rows were written.
- The remote D1 migration ledger contains 123 applied migrations. Wrangler also
  reports no pending staging migrations.
- The deployed staging configuration has `LEGAL_LEX_INGESTION_ENABLED=true`,
  retains `LEGAL_ADVICE_INGESTION_ENABLED=false` and
  `LEGAL_SOURCE_STAFF_API_ENABLED=false`, and
  `STAGING_LEGAL_EVALUATION_ENABLED=true`.

`PRAGMA quick_check` was attempted remotely but Cloudflare D1 returned
`SQLITE_NOMEM` before producing a result. This remote-control-plane limitation
is recorded separately from the successful isolated restore verification below.

## Cost control and evaluation evidence

- Active staging provider policy: OpenAI and Anthropic are each capped at
  `$15/day` (`15,000,000` micro-USD). The rolling failure threshold is `12`
  events per `15` minutes; it was raised from `5` after the first batch proved
  that `5` was too aggressive for a controlled provider evaluation.
- Both provider circuits are currently closed. The policy change and circuit
  closures are represented in the staging cost-control/audit tables.
- Canonical run: `staging-20260814-canonical`, corpus size `314`. All `314`
  unique scenarios now have a persisted completed result. This required the
  initial run plus bounded retries: attempt 1 produced 156 completed results,
  6 `PROVIDER_TIMEOUT` results and 152 `PROVIDER_CIRCUIT_OPEN` results; attempt
  2 completed 155 of the failed scenarios and retained 3 timeouts; attempt 3
  completed two, and attempt 4 completed the final scenario. These historical
  failed attempts remain immutable evidence and are not represented as a
  passing first attempt.

Remote `PRAGMA quick_check(1)` remains unavailable: Cloudflare D1 returned
`SQLITE_NOMEM`, and other remote PRAGMA probes returned `SQLITE_AUTH`. A fresh
full SQL export was restored into an isolated local SQLite database. It passed
`PRAGMA quick_check` with `ok` and `PRAGMA foreign_key_check` with zero
violations. The restore preserved `232` tables, `517` indexes, `313` triggers,
and `121` migration-ledger rows; the export SHA-256 was
`692262e0c6b0c2bef6c0c5baf49c1d5417b2abe2f34caf81eca5a88960ba2c7f`.
The D1 control-plane report at the time showed 232 tables and a 24.5 MB staging
database. The temporary export and local restore were removed at the owner's
direction after this verification.

## AI-quality audit repair

The first protected queue request exposed a D1 schema defect rather than an
MFA, role, or reviewer-access failure: D1 rejected the expanded fixed-width
`GLOB` hash check with `LIKE or GLOB pattern too complex`. Migration
`0121_fix_ai_quality_hash_constraints.sql` was applied to staging after
confirming that both immutable audit tables contained zero rows. It replaces
that expression with an equivalent 64-character uppercase-hex constraint and
retains the chain, stale-review, and MFA/TOTP triggers. The staging Worker was
then redeployed as `9fbf9f23-d67d-4e25-a8db-e41c0c6211c0`.

The authenticated browser automation surface subsequently returned
`ERR_BLOCKED_BY_CLIENT`, so final visual confirmation must be made in a normal
browser session. This is a local browser-extension block; it is not evidence
of a JURO authorization failure. The remote migration ledger and resulting
table definition were verified read-only.

## Human legal-review attestation

On `2026-08-14T16:13:11.149Z`, the authenticated reviewer recorded an immutable
`confirmed_correct` attestation for `staging-20260814-canonical`. The record is
bound to a `legal_reviewer` assignment and a fresh MFA verification at
`2026-08-14T16:04:08.503Z` (within the 15-minute control window). It covers
`314/314` completed, unique canonical scenarios.

The scope was recomputed read-only from the ordered completed attempts and
matched the stored scope digest:
`8948CB47D96DCF68256ECDE87B0CF39E4776B7A2296607AD5091D22826E88EDE`.
The immutable event hash was also recomputed and matched:
`3074EE1621522D6B17F6A006E6543F540AC4446D17DA32251D3063AB32F74EE2`.
Its previous hash is the all-zero genesis value. This is a real reviewer
decision recorded by the protected flow; it is not an AI-generated approval.

## Per-scenario evidence materialization

Migration `0123_legal_evaluation_human_review_records.sql` adds a separate,
append-only ledger for the release contract's 314 individual review records.
It does **not** write `ai_feedback` and therefore cannot fabricate user
feedback. A record can only be created in one D1 batch when all of the
following are true: the linked immutable whole-run attestation is
`confirmed_correct`; its reviewer identity matches; the canonical scope is
exactly `314/314`; each scenario's completed attempt and prompt/response hashes
match; and the reviewer again has an active legal-review assignment, TOTP
device, and fresh MFA session. Updates and deletes are rejected by D1 triggers.

At `2026-08-14T17:06Z`, a fresh-MFA reviewer materialized the records. A
remote read-only D1 query then returned `314` records, `314` distinct scenario
IDs, and one linked attestation, with creation timestamps from
`2026-08-14T17:06:36.099Z` through `2026-08-14T17:06:36.412Z`.

The exported compact evidence envelope was verified independently with the
repository verifier: it contains exactly 314 records, matches the checked-in
corpus and every scenario prompt hash, has no duplicate or missing scenario,
and has a valid event-hash chain and export digest
`216e96db32b8d234188c59b695a15c086bacdd12376d66a0683dbd59e83406a5`.
It contains no raw prompt or response text. The protected UI correctly treated
this as technical materialization, not a second legal decision.

## CI evidence

GitHub Actions run
[`31820688835`](https://github.com/MoozUpus/juro/actions/runs/31820688835)
completed successfully for `e81173f`. Both `apps/platform` and `apps/website`
jobs passed their applicable install, lint, type-check, test, artifact,
Cloudflare-matrix, and dependency-audit steps.

The current documentation commit was also verified by GitHub Actions run
[`31821623717`](https://github.com/MoozUpus/juro/actions/runs/31821623717),
with the same two successful job matrices.

## Release-gate state

| Gate | Status | Evidence / reason |
| --- | --- | --- |
| Enforceable provider-evaluation monetary cap | ACTIVE | Effective daily policies cap each provider at `$15/day`; OpenAI and Anthropic pricing records were added from official provider pricing. Staging circuit policy is `12` failures per `15` minutes. |
| Real 314-scenario staging execution | COMPLETE | `staging-20260814-canonical` has `314/314` unique completed records. Historical failed attempts are retained as provider-reliability evidence. |
| Isolated D1 export/restore integrity | COMPLETE | Fresh staging export restored locally; `quick_check=ok`, zero foreign-key violations, and topology/migration counts matched the remote D1 metadata. |
| Human legal review | COMPLETE | A fresh-MFA `legal_reviewer` recorded the immutable `confirmed_correct` attestation for the verified `314/314` canonical-run scope. The scope digest and event-hash chain were recomputed read-only. |
| Legal-evaluation evidence export | COMPLETE | Remote staging D1 returns `314/314` unique immutable review records. The compact evidence envelope independently passes corpus, prompt-hash, count, duplicate/missing, chain, and export-digest verification. |
| Corpus ingestion | ENABLED IN STAGING | Lex-only staging ingestion is enabled behind the existing fresh-MFA manual endpoint. Advice.uz and the staff source API remain disabled; no corpus is committed to Git and no source is published without the review lifecycle. |
| Controlled production rollout | COMPLETE — Worker only | Production Worker `juro` version `d6bd7e5f-29c4-440a-a20e-14d2ea100ced` was uploaded after a successful production dry-run and final CI. No D1 migration, corpus ingestion, R2 write, queue write, DNS change, or container rollout was performed. See `PRODUCTION_ROLLOUT_EVIDENCE_2026-08-14.md`. |

## Production-preparation constraint

The individual-record evidence gate is now closed. The production Worker rollout
completed without applying database migrations. Its migration ledger still shows
`0121`, `0122`, and `0123` as pending. `0122` and `0123` are staging-only
reviewer-evidence schema and must not be applied to the production database
merely to advance the shared ledger. A future production database release must
separate the production-safe hash-constraint repair from staging-only migration
delivery and validate that split before any D1 mutation.
