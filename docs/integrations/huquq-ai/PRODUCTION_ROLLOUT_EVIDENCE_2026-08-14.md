# Production Worker rollout evidence — 2026-08-14

Status: **COMPLETE — Worker rollout followed by a controlled data/status release**.

This evidence records approved production deployments. It does not claim legal
source coverage or a human legal outcome.

## Preconditions

- The protected staging legal-evaluation evidence gate completed with `314/314`
  unique immutable review records and a verifier-confirmed compact envelope.
- Production dry-run completed with all required server-side secret bindings and
  a production-only artifact.
- GitHub Actions run
  [`31822836527`](https://github.com/MoozUpus/juro/actions/runs/31822836527)
  passed both the `apps/platform` and `apps/website` matrices.
- Pull request #39 was `CLEAN` before the release upload.

## Deployment

- Worker: `juro`
- Version: `d6bd7e5f-29c4-440a-a20e-14d2ea100ced` (version number `64`)
- Uploaded at: `2026-08-14T17:18:52.735450Z`
- Deployment path: `npm run deploy:production`
- Container behaviour: `--containers-rollout none`

The deployment retained the existing custom-domain triggers for `app.juro.uz`
and `admin.juro.uz`. It did not change DNS records.

## Follow-up controlled data and status release

- Commit: `4a6b4c8add12d06d889d60249598768a5e4af347`
- CI: [run 31825141890](https://github.com/MoozUpus/juro/actions/runs/31825141890)
  completed successfully for both application matrices.
- Worker version: `06752b09-c279-48e8-8ba6-f480773f073a`.
- D1 recovery bookmark captured before migration:
  `000008d0-00000000-000050c7-0fdb7b191d3887be92f680f23dc4a65a`.

Only migration `0121_fix_ai_quality_hash_constraints.sql` was eligible for the
production migration command and is now recorded as applied. It was preflighted
against an empty `ai_quality_review_events` table and a clean
`PRAGMA foreign_key_check`; the post-release ledger has no pending migrations.
The staging-only human-review evidence migrations `0122` and `0123` are
deliberately excluded by the production `migrations_pattern`, rather than being
applied merely to align a migration ledger.

`LEGAL_LEX_INGESTION_ENABLED` is enabled for the existing Lex-only scheduler and
queue flow. It retains the bounded discovery, robots, crawl-delay and source
controls already implemented by the service. `LEGAL_ADVICE_INGESTION_ENABLED`
remains `false`; this release did not add Advice.uz data or assert provider
rights beyond the existing Lex controlled flow.

`status.juro.uz` is now an explicit custom domain attached to Worker `juro`.
External DNS resolution and `GET /` plus `GET /api/status?lang=uz` returned
`200`; an application route on that hostname returned `404`, preserving the
strict status-host fence.

## Smoke checks

An anonymous request to `https://app.juro.uz/ru/individual/dashboard` returned
the expected `307` redirect to the application login route. Its response
included `Cache-Control: private, no-store`, HSTS, a restrictive CSP,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and
`X-Robots-Tag: noindex, nofollow, noarchive`.

The follow-up release resolved the prior status-host limitation as described
above.

## Authenticated browser QA

After the follow-up deployment, a signed-in production user opened dashboard,
AI chat, document builder and document review. Each route rendered its main
content with no login redirect, not-found state, or browser console error. This
was read-only QA: it submitted no AI prompt and created or edited no document.

## Explicit non-actions

- No staging-only D1 evidence migration was applied to production.
- No unbounded or manual bulk crawl was started, and no corpus is committed to
  Git. The scheduler/queue flow is the only enabled Lex ingestion path.
- No R2 object, container, payment setting, or source provider other than Lex
  was changed by the follow-up release.
- Staging-only legal-review routes remain runtime-gated to `APP_ENV=staging`.

## Rollback

If a regression is observed, roll back the `juro` Worker traffic to the prior
known deployment through Cloudflare Versions. For the D1 schema repair, use the
captured D1 recovery bookmark only through the documented, controlled
Time-Travel restore procedure; do not attempt to reapply staging-only
migrations or manipulate the migration ledger.
