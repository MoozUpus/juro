# Production Worker rollout evidence — 2026-08-14

Status: **COMPLETE — Worker-only rollout**.

This evidence records an approved production deployment. It does not claim a
production corpus ingest, production D1 migration, legal-source coverage, or a
human legal outcome.

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

## Smoke checks

An anonymous request to `https://app.juro.uz/ru/individual/dashboard` returned
the expected `307` redirect to the application login route. Its response
included `Cache-Control: private, no-store`, HSTS, a restrictive CSP,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and
`X-Robots-Tag: noindex, nofollow, noarchive`.

`status.juro.uz` did not resolve from the release runner at the time of this
check. This is recorded as a monitoring/DNS limitation; no DNS or routing change
was made during the release.

## Explicit non-actions

- No production D1 migration was applied.
- No production legal corpus was ingested or published.
- No R2 object, queue message, deployment container, payment setting, or DNS
  record was changed by this rollout.
- Staging-only legal-review routes remain runtime-gated to `APP_ENV=staging`.

## Rollback

If a regression is observed, roll back the `juro` Worker traffic to the prior
known deployment through Cloudflare Versions. No data rollback is required for
this Worker-only rollout because it did not mutate D1, R2, queues, or corpus
data.
