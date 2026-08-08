# Cloudflare resource inventory

Updated: 2026-08-09. This is a read-only inventory; names and IDs are not secrets.

| Environment | Worker / host | D1 | Primary R2 | Backup / quarantine R2 | Key queues | Notes |
|---|---|---|---|---|---|---|
| development | `juro-platform-development` | `juro-development` (`d07670cf-f7bf-460c-a668-101671d4c330`) | `juro-development-files` | `juro-development-backups`, `juro-development-quarantine` | `development-*` | Async runtime disabled |
| staging | `juro-platform-staging`; `staging.app.juro.uz` | `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`) | `juro-staging-files` | `juro-staging-backups`, `juro-staging-quarantine` | `staging-document-analysis`, OCR, export, email, legal, retention, notifications, malware + DLQs | Current Worker version `4e18a195-6c89-4d0e-a708-0c958e7e6429` at 100%; owner-only Access returns login redirect before content |
| production | `juro`; `app.juro.uz` is treated as production only | `juro-production` (`4cce509b-0e02-4ca9-a3ba-a5ce1327aeda`) | `juro-private-documents` | `juro-production-backups`, `juro-production-quarantine` | `production-*` | Read-only inventory only; no deployment/routing/migration in this checkpoint |

## Bindings and lifecycle

- All application environments use explicit D1, private R2, queue and Vectorize bindings in `wrangler.jsonc`.
- Direct Lex/Advice retrieval is the live source path. `*-lex-uz` and `*-advice-uz` Vectorize bindings are legacy/dormant candidates: do not add direct-source page writes to them, do not delete them automatically, and plan any removal separately.
- Staging is the only place for protected synthetic test records. `app.juro.uz` must never be used as a staging smoke endpoint.
- Worker secrets are intentionally not listed or read. Server-side provider configuration is defined by binding names and non-secret variables only.

## Current control-plane checks

1. `staging.app.juro.uz` returned `302` to Cloudflare Access with `no-store` behaviour on 2026-08-09.
2. `juro-staging` and `juro-production` each report 111 migration-ledger rows. This does not authorise production deployment and does not replace a backup/rollback gate.
3. The exact accidental synthetic production analysis was purged under explicit owner approval. Details and verification are recorded in `DECISIONS.md` D-161.
