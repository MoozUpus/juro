# Staging release evidence — 2026-08-14

Status: **PARTIAL — technical staging evaluation completed; release gate is not approved**.

This record distinguishes observed staging evidence from pending human and legal
controls. It does not claim production readiness or legal correctness.

## Deployed revision

- Branch: `feature/huquq-ai-integration`
- Application commit: `b9376fee1999f56bcff88f6aab4eeb696547a61f`
- Worker: `juro-platform-staging`
- Worker version: `a8952a5e-bd78-4e85-9af8-08c2999d8496` at 100% traffic
- Deployment time: `2026-08-14T10:39:23.462946Z`

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
- The remote D1 migration ledger contains 121 applied migrations. Wrangler also
  reports no pending staging migrations.
- The deployed configuration retained `LEGAL_LEX_INGESTION_ENABLED=false`,
  `LEGAL_SOURCE_STAFF_API_ENABLED=false`, and
  `STAGING_LEGAL_EVALUATION_ENABLED=true`.

`PRAGMA quick_check` was attempted as a read-only verification but Cloudflare D1
returned `SQLITE_NOMEM` before producing a result. This is recorded as a failed
integrity probe, not as a data-corruption finding and not as a passing check.

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
temporary full export was created for an isolated restore, but the restore did
not finish within the safe execution window; it was not treated as integrity
evidence and the temporary directory was removed. The D1 control-plane report
shows `232` tables and a `24,559,616`-byte staging database. A successful
isolated export/restore verification remains a required release-gate artifact.

## Release-gate state

| Gate | Status | Evidence / reason |
| --- | --- | --- |
| Enforceable provider-evaluation monetary cap | ACTIVE | Effective daily policies cap each provider at `$15/day`; OpenAI and Anthropic pricing records were added from official provider pricing. Staging circuit policy is `12` failures per `15` minutes. |
| Real 314-scenario staging execution | COMPLETE | `staging-20260814-canonical` has `314/314` unique completed records. Historical failed attempts are retained as provider-reliability evidence. |
| Human legal review | NOT RUN | The evidence endpoint accepts only records tied to a completed run and a fresh-MFA `legal_reviewer` immutable `correct` review. An AI/Codex annotation is explicitly not human legal approval. |
| Legal-evaluation evidence export | NOT RUN | It depends on all 314 persisted reviewed runs and the same fresh-MFA legal-reviewer session. |
| Corpus ingestion | DISABLED | No Lex.uz/Advice.uz corpus was fetched or committed. The ingestion and staff-API flags remain false. |
| Controlled production rollout | NOT APPROVED | No command targeted `juro`, production D1, production R2, production queues, or production DNS. A fresh isolated D1 restore and human legal evidence are still absent. |

## What the user must authenticate as

The remaining actions are deliberately bound to a named account and a physical
second factor. They cannot be truthfully completed by source code, a Cloudflare
OAuth deployment token, or an AI agent without that account's fresh Access and
TOTP session:

1. A `legal_reviewer` reviews the actual outputs and resolves the immutable
   AI-quality events. The reviewer determines legal correctness; this record does
   not purport to make that determination.
2. The authenticated reviewer exports the persisted evidence, after which the
   strict CLI validator can verify the envelope and its digest.

Once those controlled human actions are complete, the 314-run and evidence
validator can be executed without weakening Access, MFA, provider secrets, or
the legal-review audit trail.
