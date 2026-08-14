# Staging release evidence — 2026-08-14

Status: **PARTIAL — staging deployment completed; release gate is not approved**.

This record distinguishes observed staging evidence from pending human, financial,
and legal controls. It does not claim production readiness or legal correctness.

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

## Release-gate state

| Gate | Status | Evidence / reason |
| --- | --- | --- |
| Enforceable provider-evaluation monetary cap | BLOCKED | The cost-control schema is deployed, but no effective official model-price version and no MFA-authorized daily-cost policy have been recorded in staging. The protected cost endpoint requires `staff.operations.manage`, active TOTP, fresh MFA (15 minutes), CSRF, and same-origin validation. |
| Real 314-scenario staging execution | NOT RUN | The internal evaluator is correctly protected by a server-only bearer secret. It is not invoked until the cost policy is active; no secret value was read, exported, or bypassed. |
| Human legal review | NOT RUN | The evidence endpoint accepts only records tied to a completed run and a fresh-MFA `legal_reviewer` immutable `correct` review. An AI/Codex annotation is explicitly not human legal approval. |
| Legal-evaluation evidence export | NOT RUN | It depends on all 314 persisted reviewed runs and the same fresh-MFA legal-reviewer session. |
| Corpus ingestion | DISABLED | No Lex.uz/Advice.uz corpus was fetched or committed. The ingestion and staff-API flags remain false. |
| Controlled production rollout | NOT APPROVED | No command targeted `juro`, production D1, production R2, production queues, or production DNS. Staging status is not all-operational, the financial cap is absent, and human legal evidence is absent. |

## What the user must authenticate as

The remaining actions are deliberately bound to a named account and a physical
second factor. They cannot be truthfully completed by source code, a Cloudflare
OAuth deployment token, or an AI agent without that account's fresh Access and
TOTP session:

1. A `staff.operations.manage` operator records official effective price entries
   and daily-cost circuit policies for OpenAI and Anthropic in the staging costs
   console.
2. A `legal_reviewer` reviews the actual outputs and resolves the immutable
   AI-quality events. The reviewer determines legal correctness; this record does
   not purport to make that determination.
3. The authenticated reviewer exports the persisted evidence, after which the
   strict CLI validator can verify the envelope and its digest.

Once those controlled human actions are complete, the 314-run and evidence
validator can be executed without weakening Access, MFA, provider secrets, or
the legal-review audit trail.
