# Cloudflare resource inventory — 2026-08-27

Status: **PARTIAL**. This inventory was refreshed through the authenticated
Wrangler session, Cloudflare Worker-domain and zone-route APIs, current
Wrangler configuration and live HTTP probes. Secret values are intentionally
excluded. The active credential can read the zone, Worker domains and Worker
routes, but the zone DNS-record endpoint returns HTTP 403; complete A/AAAA/
CNAME/TXT/MX enumeration remains open.

The former statement that `app.juro.uz` is staging is obsolete.

## Zone and routing

- Zone `juro.uz`: active, full and not paused.
- Zone Worker routes: `juro.uz/*` and `www.juro.uz/*` -> `juro-legaltech`.
- No zone-wide pause or routing mutation was performed during this refresh.

| Hostname | Worker service | Boundary | Live probe |
| --- | --- | --- | --- |
| `app.juro.uz` | `juro` | Production Client/Business | `307` to production login; noindex/no-store |
| `lawyer.juro.uz` | `juro` | Production Lawyer | Dedicated login surface; noindex/no-store |
| `admin.juro.uz` | `juro` | Production entry delegated through `ADMIN_CONSOLE` to `juro-admin` | Protected `303` handoff; noindex/no-store |
| `status.juro.uz` | `juro` | Production public-safe status fence | Page/API `200`; sampled application route `404`; noindex |
| `staging.app.juro.uz` | `juro-platform-staging` | Owner Access-protected staging | `302` to Cloudflare Access before content |
| `admin.staging.juro.uz` | `juro-admin-staging` | Owner Access-protected staging Admin | `302` to Cloudflare Access before content |
| `status.staging.juro.uz` | `juro-platform-staging` | Public-safe staging status fence | Page/API `200`; sampled application route `404`; noindex |

Worker custom-domain API records report `environment=production` for these
service records, including the services whose application environment is
staging. Environment classification in this inventory follows the Worker
service/configuration and hostname purpose, not that deprecated API field.

## Current deployments

| Service | Application environment | Deployment | Version at 100% | Created |
| --- | --- | --- | --- | --- |
| `juro` | production | `6f536ee9-9666-41bb-b0f3-6f174019692b` | `ed0253e1-1c35-416e-9f2a-5bd8352c1936` (version 147) | 2026-08-27 11:01 UTC |
| `juro-platform-staging` | staging | `396a792d-8ddb-43a4-861c-14956279d95a` | `e2e4be14-ee0b-4c6e-b4b1-74729103000f` | 2026-08-16 20:41 UTC |
| `juro-admin` | production service binding | `2be71fe7-ee92-4e43-9bbd-d500f7deac5e` | `67065fd8-fcc8-4c15-93c8-bc7b46ce4fcb` | 2026-08-23 11:01 UTC |
| `juro-admin-staging` | staging custom domain | `0a3659b1-1d96-49bb-b57a-a6710c650577` | `0b51b249-0a57-4921-a973-2df01ebba538` | 2026-08-15 18:37 UTC |

Commit `6503667c` is represented by production version 147 above. The immediate
rollback is `c3237f9e-a258-42eb-8b94-62f5045b7b03` (version 146), deployment
`ecb41ecc-84ef-461a-ae5c-d24b3447008f`.

## Environment resources declared in source

| Environment | Worker | D1 | R2 | Async / search / telemetry | Compute and schedules |
| --- | --- | --- | --- | --- | --- |
| development | `juro-platform-development` | `juro-development` | `juro-development-files`, `juro-development-backups`, `juro-development-quarantine` | Development queues, four Vectorize bindings, Analytics Engine, Images and Workers AI | No live routes; async and cron disabled by vars |
| staging | `juro-platform-staging` | `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`) | `juro-staging-files`, `juro-staging-backups`, `juro-staging-quarantine` | Staging document/OCR/export/email/retention/notification/malware/health queues and DLQs; four Vectorize bindings; `juro-platform-staging` Analytics dataset | Malware-scanner Container, service binding, cron at five-minute and daily intervals; `workers_dev=false`, previews disabled |
| production | `juro` | `juro-production` (`4cce509b-0e02-4ca9-a3ba-a5ce1327aeda`) | `juro-private-documents`, `juro-production-backups`, `juro-production-quarantine` | Production document/OCR/export/email/retention/notification/malware/health queues and DLQs; four Vectorize bindings; `juro-platform-production` Analytics dataset | Malware-scanner Container; service bindings to scanner and `juro-admin`; cron at five-minute and daily intervals; `workers_dev=false`, previews disabled |

The table records configured bindings, not queue depth, database integrity or
fresh backup proof. Those need their own environment-specific evidence before
an operational claim.

## Admin services

| Environment | Worker | Platform origin | Service binding |
| --- | --- | --- | --- |
| development | `juro-admin-development` | local Platform | `juro-platform-development` |
| staging | `juro-admin-staging` | `staging.app.juro.uz` | `juro-platform-staging` |
| production | `juro-admin` | `app.juro.uz` | `juro` |

`admin.juro.uz` is owned by the production Platform Worker and reaches the
isolated Admin Worker through the `ADMIN_CONSOLE` service binding. The
production Admin Worker itself has no public custom-domain record in the
current configuration.

## Evidence limits and next actions

1. Add Zone DNS Read to the audit credential and export all DNS record types.
2. Re-query redirects, Bulk Redirects, origin/transform/cache rules, Turnstile,
   R2 custom domains and WAF through their dedicated APIs; do not infer them
   from Worker routes.
3. Capture queue depth/DLQ state, D1 integrity and backup freshness separately
   before claiming full production health.
4. Keep the absolute-font-path artifact gate in CI and retain version 146 as
   incident rollback; post-deploy production verification for version 147 is
   recorded in `docs/qa/test-report.md`.
5. Keep this inventory **PARTIAL** until the remaining control-plane gaps have
   direct evidence.
