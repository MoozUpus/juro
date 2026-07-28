# JURO deployment boundary

Updated: 2026-07-29
Status: inactive staging Worker foundation deployed; production deployment is not authorized.

## Production surfaces that must remain unchanged

- Public application: Sites project `appgprj_6a5f404b623081919cbfa1e3c85d412a`,
  public URL `https://app.juro.uz`, saved version 20, source commit
  `40310786188eb545f224e906c2c9506c146a907c`.
- Existing legacy Worker: `juro`.
- Production D1: `juro-production`.
- Production private file bucket: `juro-private-documents`.

The Sites project has no preview URL. Sites defines every deployment URL as a
production URL, including access-restricted deployments. It must not be used
to simulate staging, and no Sites version or environment revision may be
deployed without the separate production authorization required by the owner.

## Staging deployment target

The checked-in staging Worker target is `juro-platform-staging`. Its primary
bindings are `juro-staging`, `juro-staging-files`,
`juro-staging-backups`, and `juro-staging-quarantine`, plus the seven staging
Queue producers and four staging Vectorize indexes documented in
`CLOUDFLARE-RESOURCES.md`.

The first deployment is deliberately unreachable:

- `workers_dev: false`;
- `preview_urls: false`;
- `routes: []`;
- no Cron trigger;
- no Queue consumer;
- async runtime, legal ingestion, staff API, and Cron flags are false.

This deploy created Worker `juro-platform-staging`, version
`14d89ac0-19f5-4c0d-89f5-7db97a50bb44`, deployment
`e09462ba-b8e6-40fe-abd6-83893652abb9`, from pushed/CI-green source commit
`29a3d9a`. It attached staging-only bindings and seven Queue producers. A
post-deploy API read proved an empty secret list, no routes, schedules, or
consumers, and disabled Workers.dev subdomain/previews. It is not a public
staging release and cannot support HTTP smoke tests. A later
staging hostname requires a separately verified access boundary, runtime
secrets entered directly in Cloudflare, and proof that unauthenticated access
is denied.

## Required sequence

1. **Completed:** build and validate all environment artifacts from a clean pushed commit.
2. **Completed:** run type-check, lint, full tests, Cloudflare matrix validation, generated
   binding type check, artifact validation, and secret scan.
3. **Completed:** confirm `juro-staging` has no pending migration and retain the private
   pre/post checkpoint exports.
4. **Completed:** deploy `juro-platform-staging` with no route, preview URL, schedule, or
   consumer.
5. **Completed:** re-read the Worker deployment, bindings, flags, routes, domains, schedules,
   Queue attachments, and secret names; prove production resources unchanged.
6. Enter missing secret values directly through Cloudflare's approved secret
   UI/CLI flow. Secret values never enter chat, Git, documentation, logs, or
   screenshots.
7. Configure a protected staging hostname only after access-control and
   unauthenticated-denial tests pass.
8. Run authenticated staging HTTP, browser, accessibility, security, and
   provider smoke tests.
9. Keep feature flags false for every incomplete or unverified integration.

The standalone `validate:artifact` task defaults to the development profile.
Running it immediately after a staging build without an explicit
`CLOUDFLARE_ENV=staging` correctly reports a development/staging name mismatch.
The deploy gate uses the explicit staging environment; that rerun passed.

## Rollback

Before public staging routing, rollback is removal of the staging-only Worker
deployment/bindings after revalidating its exact name; isolated data resources
are retained for evidence unless separately approved for deletion. After a
public staging route exists, rollback uses the prior Worker version plus route
removal/feature flags. D1 recovery uses the recorded Time Travel bookmark or a
verified portable export under `BACKUP-RESTORE.md`.

Production rollback is intentionally not described as executable permission.
It requires a separately approved change set, backup, migration rehearsal,
Sites/Worker ownership resolution, and explicit production confirmation.
