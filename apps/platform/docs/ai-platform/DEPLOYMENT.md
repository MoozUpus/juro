# JURO deployment boundary

Updated: 2026-07-29
Status: owner-only protected staging is active; production deployment is not authorized.

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

The initial deployment was deliberately unreachable, and the current deployment preserves these execution safeguards:

- `workers_dev: false`;
- `preview_urls: false`;
- `routes: []`;
- no Cron trigger;
- no Queue consumer;
- async runtime, legal ingestion, staff API, and Cron flags are false.

The current deployment is `d033f009-426f-4283-9308-f6c7bdf7f29e`
serving version `b4a497ce-9a47-4ea9-be75-b0f48e46c7cd` at 100% from pushed code
commit `0544a56`. It attaches staging-only bindings and seven Queue producers.
Workers.dev and previews are disabled; Queue consumers, schedules, async
runtime, legal ingestion, and staff APIs remain disabled. The custom domain was
attached only after the owner-only Access application existed and anonymous
denial had been proven.

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
6. **Completed:** the owner entered Worker secrets directly on
   `juro-platform-staging`; API re-read exposes names only:
   `IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY`.
7. **Completed:** Cloudflare Access protects `staging.app.juro.uz` with one
   owner-only allow policy and an eight-hour session.
8. **Completed:** the staging custom domain was attached only after Access was
   configured; an anonymous request receives an Access 302 with `no-store`.
9. **Partially completed:** an earlier version passed authenticated canonical
   RU/UZ document-builder smoke. The exact current version has control-plane
   and anonymous Access evidence, but authenticated UI/cookie/replay smoke is
   still open: the available browser runtime failed during startup, and Access
   was not bypassed. Broader accessibility, mobile, provider, and end-to-end
   product smoke tests also remain open.
10. Keep feature flags false for every incomplete or unverified integration.

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

## Protected builder checkpoint — 2026-07-29

The current staging deployment is `d033f009-426f-4283-9308-f6c7bdf7f29e`
with Worker version `b4a497ce-9a47-4ea9-be75-b0f48e46c7cd` at 100% of
`juro-platform-staging` traffic. The current artifact also contains typed RU/UZ
workspace copy for documents, contacts, and notifications. The previously
verified routing change preserves locale and
account context for builder/library/documents/contacts/notifications links,
removes the nested main landmark, and synchronizes the document language after
client-side RU/UZ transitions. Control-plane and anonymous Access checks pass
for the current deployment. The canonical business-workspace route tree,
membership guard, legacy adapters, route-aware links, and MFA session-token
rotation/replay defense are now deployed. Migration `0029` is applied only to
staging. The Worker settings API re-read confirms the custom domain, owner-only
Access application, public Turnstile binding, three server-only secret names,
and all staging D1/R2/Queue/Vectorize/Analytics bindings. Authenticated browser
verification of this exact version remains pending because the available
browser-control runtime exited before an owner Access session could be used.
Production was not deployed or changed.
