# Cloudflare resource inventory — protected staging

Checked read-only on 2026-08-09 through the owner-authorized Wrangler OAuth
session. Secret values are intentionally not listed.

| Environment | Worker | D1 | Primary R2 | Backup R2 | Quarantine R2 | Notes |
|---|---|---|---|---|---|---|
| development | `juro-platform-development` | `juro-development` | `juro-development-files` | `juro-development-backups` | `juro-development-quarantine` | local development boundary |
| staging | `juro-platform-staging` | `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`) | `juro-staging-files` | `juro-staging-backups` | `juro-staging-quarantine` | owner-designated host: `https://app.juro.uz`; migrations reported none pending before this application-only change |
| production | `juro` | `juro-production` | `juro-private-documents` | `juro-production-backups` | `juro-production-quarantine` | no mutation performed; no production hostname activation is implied |

Staging has its own queues, analytics dataset, Vectorize names and a private
ClamAV Container service binding. The direct legal-source path has no D1/R2/
Queue/Vectorize write dependency. The current OAuth warning only concerns
unused `websearch.run`, `agent-memory:write` and `challenge-widgets.write`
scopes; it did not block the recorded staging checks.

## Current hostname boundary

On 2026-08-09 the owner designated `https://app.juro.uz` as the staging
entrypoint. The former `staging.app.juro.uz` references remain historical QA
evidence only. The app-production router configuration is deliberately
detached in source so a manual production deploy cannot reclaim this hostname.
This documentation change does not alter DNS, a Worker route, the production
Worker, production D1, or production R2. A separate production hostname and
both required production approvals remain prerequisites for release.
