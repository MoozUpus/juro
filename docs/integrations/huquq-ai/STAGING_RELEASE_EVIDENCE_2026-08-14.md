# Staging release evidence — 2026-08-14

Status: **PARTIAL — technical staging evaluation completed; release gate is not approved**.

This record distinguishes observed staging evidence from pending human and legal
controls. It does not claim production readiness or legal correctness.

## Deployed revision

- Branch: `feature/huquq-ai-staging-evidence`
- Application commit: `86e1e93fb82dbc586154f6b380d73ef7027c4133`
- Worker: `juro-platform-staging`
- Worker version: `f3e99cc6-613e-491e-bae6-bb116e2c5337` at 100% traffic
- Deployment time: `2026-08-14T12:50Z`

The deployment used `npm run deploy:staging`; it builds the flattened staging
artifact and deploys only that Worker with `--containers-rollout none`. It does
not target the `juro` production Worker and does not apply a D1 migration.

## Verified staging boundary

- `staging.app.juro.uz` returned the expected Cloudflare Access `302` and
  `Cache-Control: private, no-store` to an anonymous request.
- `https://status.staging.juro.uz/api/status` returned `200` with HSTS, CSP,
  frame denial, and `X-Robots-Tag: noindex, nofollow, noarchive`.
- A remote read-only D1 query returned `reachable = 1` from the staging DB
  (`bb716a96-b2fb-4823-90d6-6c228fed181a`) in EEUR; no rows were written.
- The remote D1 migration ledger contains 122 applied migrations. Wrangler also
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
database. The temporary export and local restore are pending local cleanup.

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

## Release-gate state

| Gate | Status | Evidence / reason |
| --- | --- | --- |
| Enforceable provider-evaluation monetary cap | ACTIVE | Effective daily policies cap each provider at `$15/day`; OpenAI and Anthropic pricing records were added from official provider pricing. Staging circuit policy is `12` failures per `15` minutes. |
| Real 314-scenario staging execution | COMPLETE | `staging-20260814-canonical` has `314/314` unique completed records. Historical failed attempts are retained as provider-reliability evidence. |
| Isolated D1 export/restore integrity | COMPLETE | Fresh staging export restored locally; `quick_check=ok`, zero foreign-key violations, and topology/migration counts matched the remote D1 metadata. |
| Human legal review | NOT RUN | The evidence endpoint accepts only records tied to a completed run and a fresh-MFA `legal_reviewer` immutable `correct` review. An AI/Codex annotation is explicitly not human legal approval. |
| Legal-evaluation evidence export | NOT RUN | It depends on all 314 persisted reviewed runs and the same fresh-MFA legal-reviewer session. |
| Corpus ingestion | ENABLED IN STAGING | Lex-only staging ingestion is enabled behind the existing fresh-MFA manual endpoint. Advice.uz and the staff source API remain disabled; no corpus is committed to Git and no source is published without the review lifecycle. |
| Controlled production rollout | NOT APPROVED | Production preflight/dry-run passed against the isolated `juro` artifact, but no production upload, migration, R2 write, queue write, DNS change, or traffic change was performed. Human legal evidence remains absent. |

## What the user must authenticate as

The remaining actions are deliberately bound to a named account and a physical
second factor. They cannot be truthfully completed by source code, a Cloudflare
OAuth deployment token, or an AI agent without that account's fresh Access and
TOTP session:

1. A `legal_reviewer` reviews the actual outputs and resolves the immutable
   AI-quality events. The reviewer determines legal correctness; this record does
   not purport to make that determination. The reviewer may then run the enabled
   Lex-only staging ingestion endpoint; its fresh-MFA guard cannot be bypassed
   with a service token.
2. The authenticated reviewer exports the persisted evidence, after which the
   strict CLI validator can verify the envelope and its digest.

Once those controlled human actions are complete, the 314-run and evidence
validator can be executed without weakening Access, MFA, provider secrets, or
the legal-review audit trail.
