# JURO Cloudflare resources

Updated: 2026-07-26  
Status: source configuration and deploy artifacts verified locally; remote resources not inventoried or created.

## Source of truth

`wrangler.jsonc` defines the logical development, staging, and production environments. `CLOUDFLARE_ENV` selects the environment during the Vinext/Vite build. The resulting `dist/server/wrangler.json` is flattened and must be deployed without `--env`.

The Cloudflare Vite plugin merges arrays by concatenation. JURO therefore mutates the resolved configuration in place. Only an explicit `CLOUDFLARE_ENV=production` build replaces the Sites-owned primary bindings:

- D1 `DB` becomes the Sites placeholder `site-creator-d1`;
- R2 `BUCKET` becomes the Sites placeholder `site-creator-r2`;
- development and staging retain their environment-specific primary D1/R2 names;
- backup/quarantine buckets, Queues, Vectorize, Images, Analytics Engine, vars, and observability remain environment-specific.

The production placeholder D1 ID `00000000-0000-4000-8000-000000000000` is build metadata for the existing Sites project, not a production resource ID. Development/staging must never deploy through that production Sites mapping.

## Logical environment matrix

| Binding group | Development | Staging | Production |
|---|---|---|---|
| Worker | `juro-platform-development` | `juro-platform-staging` | `juro-platform-production` |
| D1 source name | `juro-development` | `juro-staging` | `juro-production` |
| Primary R2 source name | `juro-private-documents-development` | `juro-private-documents-staging` | `juro-private-documents` |
| Backup R2 | `juro-private-backups-development` | `juro-private-backups-staging` | `juro-private-backups` |
| Quarantine R2 | `juro-quarantine-development` | `juro-quarantine-staging` | `juro-quarantine` |
| Analytics Engine | `juro-platform-development` | `juro-platform-staging` | `juro-platform-production` |
| Static assets binding | `ASSETS` | `ASSETS` | `ASSETS` |
| Images binding | `IMAGES` | `IMAGES` | `IMAGES` |

Each environment declares distinct logical names intended for physically separate resources:

- `AI_JOBS_QUEUE`;
- `FILE_JOBS_QUEUE`;
- `DOCUMENT_JOBS_QUEUE`;
- `LEGAL_SYNC_QUEUE`;
- `EMAIL_JOBS_QUEUE`;
- `NOTIFICATION_JOBS_QUEUE`;
- `CLEANUP_JOBS_QUEUE`;
- `BACKUP_JOBS_QUEUE`;
- one distinct DLQ per queue;
- `LEGAL_RU_INDEX`;
- `LEGAL_UZ_INDEX`;
- `INTERNAL_LEGAL_INDEX`;
- `USER_MEMORY_INDEX`.

AI, file, document, and legal-sync consumers use batch size `1` until duration, memory, and provider concurrency are measured in staging.

## Runtime safety state

The committed defaults are:

```text
ASYNC_RUNTIME_ENABLED=false
CRON_ENABLED=false
JOB_SCHEMA_VERSION=1
```

No `triggers` property is present in source configuration. Generated Wrangler artifacts may normalize this to `triggers: {}`; any non-empty trigger is rejected by artifact validation.

The Worker exports `fetch`, `queue`, and `scheduled`. Queue bodies accept strict identifiers-only envelopes. Only the D1 readiness probe has an executable Phase 1 handler; all other job kinds are recorded as terminal `JOB_HANDLER_NOT_ENABLED` and acknowledged without simulating work. The scheduled handler is inert and calls `noRetry()` because no reviewed schedule is attached.

A runtime flag does not pause Cloudflare Queue delivery. Therefore the declared consumer configuration must not be deployed to a live environment until the exact Queue inventory, enablement order, DLQ terminal path, and alerts are verified.

The current source-only handler acknowledges malformed envelopes and
not-yet-enabled job kinds. Declared DLQs have no consumer, alert, redrive, or
durable reconciliation path yet. These are deliberate fail-closed local
semantics, not a production-ready delivery policy. Live Queue consumer
activation is a hard gate.

## Local verification

The following checked-in matrix command passed for development, staging, and production on 2026-07-26:

```bash
npm run validate:cloudflare:matrix
```

Artifact validation proves:

- one environment-specific `DB` and primary `BUCKET` for development/staging;
- one normalized Sites `DB/BUCKET` only for the production artifact;
- all add-on bindings and selected environment names survive flattening;
- no duplicate binding names;
- no Cron trigger;
- no development auth bypass;
- source and packaged migrations match by SHA-256;
- no `.env*` or `.dev.vars*` is packaged;
- the Sites manifest is unchanged;
- the built Worker exposes all three module handlers.

Dry-run validates deploy shape only. It does not prove that any remote D1, R2, Queue, Vectorize, Analytics Engine, or DLQ exists.

The ordinary `npm run build` intentionally selects development. A Sites
checkpoint or deploy must use the dedicated production build path and prove
that its flattened artifact contains the Sites-owned `DB`/`BUCKET` bindings.
Until the Sites build pipeline is observed setting `CLOUDFLARE_ENV=production`
or invoking `npm run build:production`, deployment is blocked.

Wrangler is reproducibly pinned to `4.92.0`; the CLI reports a newer
`4.114.0`. Upgrade compatibility must be tested as its own change rather than
silently changing the verified deployment toolchain.

## Remote blockers

Before staging deployment:

1. authenticate through an approved local Cloudflare control-plane flow;
2. inventory existing resources and resolve exact IDs/names;
3. create only missing development/staging resources;
4. record D1 backup evidence and perform an isolated restore rehearsal;
5. apply migration `0011` to staging only;
6. verify Queue/DLQ delivery, R2 operations, Vectorize tenant filters, Analytics redaction, and alerts;
7. implement quarantine/DLQ consumption, alerts, redrive, ledger reconciliation, and per-kind producer/handler flags;
8. require globally namespaced server-generated idempotency keys until a tenant-scoped composite key migration exists;
9. prove the Sites production build command selects `CLOUDFLARE_ENV=production`;
10. keep production unchanged.

No secret value belongs in `wrangler.jsonc`, Git, logs, or this document.
