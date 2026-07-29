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

The checked-in and deployed target is `juro-platform-staging`. Deployment `a38d3cbc-7fd1-4829-be9d-97249f265882` serves Worker version `12a3abf3-af6d-41da-8726-b7abf03f5dbf` at 100% from pushed commit `a1261c3c68151f9c275187fd422bd58c67b673a8`. The exact flattened artifact was built with the staging profile and deployed without `--env`, with `--keep-vars`.

The runtime preserves `workers_dev=false`, `preview_urls=false`, no Worker route, and the single Access-protected custom domain `staging.app.juro.uz`. It binds only staging D1/R2/Queues/Vectorize/Analytics resources. `ASYNC_RUNTIME_ENABLED`, `CRON_ENABLED`, and `ACCOUNT_DELETION_PURGE_ENABLED` are true only in staging. Legal ingestion and the staff API remain false.

Exactly two staging consumers are attached: `staging-email-notifications` (concurrency 2) and `staging-data-retention-cleanup` (concurrency 1), each with five retries and its own zero-consumer DLQ. The only schedule is locked outbox dispatch `*/5 * * * *`. All other consumers remain unattached. Production has no equivalent activation.

## Required sequence

1. **Completed:** pushed exact source commit `a1261c3c68151f9c275187fd422bd58c67b673a8`.
2. **Completed:** full gate passed: type-check, lint, 378 tests, generated binding types, staging build/artifact, environment matrix, builder/comparison smokes, and secret scan.
3. **Completed:** verified the exact pending `0030`–`0033` set and pre-change Time Travel/private-R2 backup.
4. **Completed with recorded retry:** `0030`–`0032` applied; `0033` was atomically rejected for a concatenated migration breakpoint, corrected in `a1261c3`, retested 64/64, then applied alone.
5. **Completed:** postflight proves 34 migrations, `quick_check=ok`, empty foreign-key check, and the exact lifecycle schema/guards.
6. **Completed:** deployed the exact staging artifact with preserved dashboard secrets and re-read version, bindings, custom domain, Access, flags, consumers/DLQs, and cron.
7. **Completed:** anonymous root, canonical builder, and deletion API all receive Access 302 plus `no-store`.
8. **Completed:** first durable cron run finished successfully with no error or stuck lock.
9. **Completed:** post-`0033` full/schema/data/manifest private-R2 round trip passed SHA-256.
10. **Open:** authenticated UI/cookie/provider flows and the wider accessibility/mobile matrix; the browser runtime failed before tab connection and Access was not bypassed.

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

## Previous protected builder checkpoint — 2026-07-29

The previous staging deployment was `888a4800-daf8-4211-b41d-a653d067ecd8`
with Worker version `448e5bf1-4bf8-4000-af2b-2c034e3eca10` at 100% of
`juro-platform-staging` traffic. The current artifact also contains typed RU/UZ
workspace copy for documents, contacts, and notifications. The previously
verified routing change preserves locale and
account context for builder/library/documents/contacts/notifications links,
removes the nested main landmark, and synchronizes the document language after
client-side RU/UZ transitions. Control-plane and anonymous Access checks pass
for the current deployment. The canonical business-workspace route tree,
membership guard, legacy adapters, route-aware links, and both MFA elevation and
disable session-token rotation/replay defenses are now deployed. Exact-source CI
run `30453980092` passed before deployment. Migration `0029` is applied only to
staging. The Worker settings API re-read confirms the custom domain, owner-only
Access application, public Turnstile binding, three server-only secret names,
and all staging D1/R2/Queue/Vectorize/Analytics bindings. Authenticated browser
verification of this exact version remains pending because the available
browser-control runtime exited before an owner Access session could be used.
Production was not deployed or changed.

## Historical pre-deploy email-change checkpoint

The next local candidate includes commit `79f8632` email-change token rotation
plus additive migration `0030` and one staging-only email Queue consumer. It
has not been deployed. Local gates pass: 351 tests, type-check, lint,
development/staging/production Cloudflare artifact matrix, staging build and
artifact validation, canonical builder smoke, and document-comparison smoke.

The safe staging order is: create/checksum a pre-0030 full/schema/data export;
repeat the disposable restore drill; apply only migration `0030`; verify the
31-entry ledger, new table/index/trigger, queue/DLQ resources, and zero FK
violations; deploy `juro-platform-staging` with `--keep-vars`; re-read the
version/settings/consumer; run anonymous Access denial and authenticated
email-change/old-token/prior-mailbox evidence; inspect safe queue/job state;
then retain a post-0030 export. Roll back the Worker to version
`448e5bf1-4bf8-4000-af2b-2c034e3eca10` if runtime gates fail; D1 rollback uses
the verified pre-0030 recovery input. Production requires separate approval and
is outside this candidate.

## Account-deletion staging deployment record — 2026-07-30

Deployed staging scope: migrations `0030`–`0033`, email-notification and data-retention Queue consumers with dedicated staging DLQs, one locked `*/5 * * * *` outbox cron, account-deletion purge flag, and the tested RU/UZ settings/API flow. Legal-source ingestion and staff APIs remain false; no other Queue consumer is attached.

Pre-deploy gates passed locally: full tests (27 rendered, 272 core, 79 Cloudflare), type-check, lint, generated Cloudflare binding types, exact staging build/artifact, all-environment dry-run matrix, builder/comparison smokes, diff check, and filename-only current/history secret scan. The private pre-migration checkpoint and Time Travel bookmark are recorded in `BACKUP-RESTORE.md`.

Safe order:

1. Commit the exact tested source state.
2. Re-read pending migrations and stop unless they are exactly `0030`–`0033`.
3. Apply migrations only to `juro-staging`.
4. Verify 34 ledger entries through `0033`, `quick_check`, `foreign_key_check`, new tables/columns/triggers, and safe row counts.
5. Deploy the exact staging artifact to `juro-platform-staging` with `--keep-vars`.
6. Re-read custom domain, Access app/policy, version/deployment, bindings, secret names, consumers/DLQs, cron, flags, and production control-plane invariants.
7. Prove anonymous Access denial and authenticated synthetic route/API/UI flows; do not delete an owner or real account.
8. Inspect safe Worker/Queue/D1 logs and retain post-migration exports with checksums.

Rollback application first: disable purge/cron/async or roll traffic to Worker version `448e5bf1-4bf8-4000-af2b-2c034e3eca10`. Queue consumers may be detached without deleting queues. Migrations are additive and may remain unused. Restore D1 only for demonstrated data/schema corruption, using bookmark `00000035-00000000-000050b7-179d399e193e3067399de9571322a50b` under staging maintenance. Production deployment and production UI replacement are separately prohibited.
