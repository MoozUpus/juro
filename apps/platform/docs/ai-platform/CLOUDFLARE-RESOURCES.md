# JURO Cloudflare resources

Updated: 2026-07-28
Status: source configuration and deploy artifacts verified locally. Phase 1 created and re-read the approved isolated staging D1, bootstrapped it through `0000`–`0021` under the consumed verified-empty D-040 exception, and created empty private development/staging R2 targets, Queue + DLQ sets, and Vectorize indexes. No remote Worker, route, DNS record, environment binding, secret, deployment, R2 object, vector, message, consumer, producer attachment, or production resource was created, changed, copied, exposed, or deleted.

## Verified control-plane identity

Cloudflare account: `e22babd36b65c99b69adf3de50df5227`.

Production is currently split across two deployment surfaces:

| Surface | Verified identity | Current responsibility |
|---|---|---|
| Sites project | `appgprj_6a5f404b623081919cbfa1e3c85d412a` | `app.juro.uz`; active deployment `appgdep_6a688f65590c81918af6b6ac14093d35`, source commit `40310786188eb545f224e906c2c9506c146a907c` |
| Legacy Worker | `juro` | `admin.juro.uz` and the legacy Workers.dev surface; active version `91774ed4-72e9-47bb-b93a-a4208d490b24`, deployment `54aee3c6-39eb-4a16-ae59-c74418ae599f` |

The Workers Domains API still associates both `app.juro.uz` and `admin.juro.uz` with the legacy Worker while Sites reports `app.juro.uz` on its provider Worker. This ownership ambiguity must be reconciled before any staging-to-production routing change. HTTP evidence shows `app.juro.uz` serving Sites assets and `admin.juro.uz` serving the legacy Worker asset set.

The existing Sites project has no preview URL. Every Sites deployment is a production deployment, so it cannot be reused as staging.

## Verified remote inventory

### D1

| Environment | Database | ID | Remote state |
|---|---|---|---|
| Development | `juro-development` | `d07670cf-f7bf-460c-a668-101671d4c330` | exists; 61 non-internal tables reported |
| Staging | `juro-staging` | `bb716a96-b2fb-4823-90d6-6c228fed181a` | exists; EEUR; exact ledger `0000`–`0021`; quick check `ok`; zero FK violations; 98 tables including `d1_migrations`; 275 schema objects |
| Production | `juro-production` | `4cce509b-0e02-4ca9-a3ba-a5ce1327aeda` | exists; 61 non-internal tables reported; preserve |

The current branch has migrations `0000`–`0021`, 71 Drizzle table definitions, and produces 97 non-internal tables in a fresh local migration. Staging now contains the same 97 application/non-internal tables plus the standard `d1_migrations` ledger table. Its 22-entry ledger and seven migration-0011 control tables were re-read after bootstrap. Production/development remain at `0000`–`0004`; the staging result is not evidence that either was migrated or that portable backup/import succeeded.

### R2

Existing private JURO buckets:

- `juro-private-documents` — production primary; preserve;
- `juro-private-documents-development` — existing development primary;
- `juro-private-backups-development` — existing development backup namespace;
- `juro-quarantine-development` — existing development quarantine namespace;
- `juro-development-files`, `juro-development-backups`, and `juro-development-quarantine` — newly created empty EEUR Standard targets; private and not bound;
- `juro-staging-files`, `juro-staging-backups`, and `juro-staging-quarantine` — newly created empty EEUR Standard targets; private and not bound.

The account also contains `site-creator-r2`, a Sites-managed/non-JURO-primary resource. It must not be repurposed as a JURO file, backup, or quarantine bucket.

No production backup or quarantine bucket exists. The JURO buckets above have no public development URL or custom domain. No object was copied between legacy and target buckets, and no binding was cut over.

The owner-approved target names differ from the older source/runtime names:

| Purpose | Approved target | Existing legacy name | Phase 1 rule |
|---|---|---|---|
| Dev primary files | `juro-development-files` | `juro-private-documents-development` | empty target exists; do not abandon or duplicate data; inventory objects, choose an additive copy/cutover plan, then update binding |
| Staging primary files | `juro-staging-files` | absent | empty isolated target exists; keep unbound until the staging Worker gate |
| Production primary files | `juro-private-documents` | same | preserve; no replacement |
| Backups | `juro-{environment}-backups` | dev uses `juro-private-backups-development` | empty dev/staging targets exist; do not claim backup until a protected object and restore are verified; production remains absent |
| Quarantine | `juro-{environment}-quarantine` | dev uses `juro-quarantine-development` | empty dev/staging targets exist; they are not scanners and remain unbound until a real fail-closed workflow; production remains absent |

### Queues

Eight development-only queues also remain under the older `juro-*-development` naming convention: AI jobs, file jobs, document jobs, legal sync, email jobs, notification jobs, cleanup jobs, and backup jobs. Each reports zero producers, zero consumers, 24-hour retention, and no verified live DLQ/redrive path. Those legacy names have no staging or production counterparts.

The task-specific development/staging v2 queues and distinct DLQ resources now exist. Every row below was re-read with 86,400-second retention, zero producers, and zero consumers:

| Environment | Purpose | Primary queue ID | DLQ ID |
|---|---|---|---|
| Development | document analysis | `dc9b64d6a3ef47c3981ea4546a2e4ddb` | `ad35c8f42a4c45919e07dc64a6ee9a79` |
| Development | OCR processing | `00cfdffdcde04fe0aebfcaf91074c14e` | `984ea12d64034476a267b281a776e845` |
| Development | document export | `fb02cd0945e641e5a9d711ae5aa5fe65` | `6604d80b5153458bb223e9791125fb83` |
| Development | email notifications | `378041c03ddc4f6196aa8b75232b6b53` | `31cd1e0b709840deb2c21b41afa7df9f` |
| Development | legal sources sync | `20264fee1a27472fa603ba77a13d14ed` | `821b1d95b38c48ddb52c3da9c14fc3d1` |
| Development | data retention cleanup | `9fa657fa92f74b6283fd52251894cd46` | `e941586a69b0446d98ca3135c0196de5` |
| Development | notifications | `78aa464f84d043b9bbbd6939391d323e` | `5e4971599c7849df9652a934ccfc1aa7` |
| Staging | document analysis | `5daca3710f954ca49046ff56cfed4176` | `60b41d382df142edb72be3693c4b61ba` |
| Staging | OCR processing | `e050407874d741c5beb36c762b9e83fc` | `67b273da1950422b92d12757b6a946b0` |
| Staging | document export | `9c7b4a34cf374905961bd0398fd5f13d` | `127a145a49e840f39b55ea61b17030bf` |
| Staging | email notifications | `57261c23b3584d1798cc92d8f7c11f14` | `71cd33076f4548efa65c958e49698b10` |
| Staging | legal sources sync | `97f0929e6e9a4a1e8e05cdf01ab4cff6` | `9906426b2b754841ba4c53999ffc33e1` |
| Staging | data retention cleanup | `626ed10539354be1a1476fdd34a78993` | `2f7f59b8a2374616a210ed9dc8074caf` |
| Staging | notifications | `d438df684a584891ac46a706bd8dc708` | `7ccbd9d4b02c41309af92a6692624a4d` |

Names are `{environment}-{purpose}` and `{environment}-{purpose}-dlq`. The local source declares seven producer bindings but no deployed Worker binding, no consumers, no DLQ attachment, and no malware producer. The first API attempt created `development-document-analysis` and then rejected an unsupported settings mutation with generic error `10013`; inventory proved the single partial creation, after which provisioning resumed idempotently without duplicates. The API-supported creation default remains 86,400 seconds; retry, backoff, delivery, and DLQ policies are not claimed until the real consumer is implemented and reviewed. Remote legacy development queues remain unchanged; any later cleanup is a separate reviewed operation.

### Vectorize, scheduling, observability, and DNS

- Vectorize indexes: eight empty v2 indexes exist — `development-{lex-uz,advice-uz,internal-legal-materials,user-documents}` and the matching `staging-*` set. Every index was re-read at 1,536 dimensions with cosine distance; no vector or metadata index is claimed.
- Cron triggers: none.
- AI Gateway: none verified.
- Logpush/metrics export/observability destinations: none verified.
- All legacy and v2 development/staging queues have no producer or consumer binding.
- Staging Worker, Worker route, and environment bindings: none.
- `staging.app.juro.uz`, `staging.juro.uz`, `status.juro.uz`, and `api.juro.uz`: no DNS records.
- DNS zone `juro.uz`: `877b1c7d333a3f6957e8e23ea95c8e19`.

The source declares the approved Vectorize bindings and exact names (`{environment}-lex-uz`, `{environment}-advice-uz`, `{environment}-internal-legal-materials`, and `{environment}-user-documents`). The empty remote indexes now match that shape. Model/dimensions are documented below; indexed metadata, legal evaluation, tenant checks, ingestion, and query authorization remain gated.

### Runtime bindings and secrets

The production Worker exposes Assets, Images, D1, R2, `EMAIL_FROM`, and a secret binding named `RESEND_API_KEY`. Sites runtime configuration exposes `APP_URL`, `PUBLIC_SITE_URL`, `EMAIL_FROM`, and a secret binding named `RESEND_API_KEY`. No OpenAI, Anthropic, encryption, OTP-HMAC, Cron, Turnstile, TOTP-encryption, or signed-URL secret binding was verified.

Only secret names were inventoried. A read-only Sites connector response unexpectedly exposed a bypass bearer token in connector telemetry. The value was not copied, used, stored, logged into the repository, or committed. It must be rotated/revoked before production work, and the raw connector operation must not be repeated.

## Source of truth

`wrangler.jsonc` defines the logical development, staging, and production environments. `CLOUDFLARE_ENV` selects the environment during the Vinext/Vite build. The resulting `dist/server/wrangler.json` is flattened and must be deployed without `--env`.

The Cloudflare Vite plugin merges arrays by concatenation. JURO therefore mutates the resolved configuration in place. Only an explicit `CLOUDFLARE_ENV=production` build replaces the Sites-owned primary bindings:

- D1 `DB` becomes the Sites placeholder `site-creator-d1`;
- R2 `BUCKET` becomes the Sites placeholder `site-creator-r2`;
- development and staging retain their environment-specific primary D1/R2 names;
- backup/quarantine buckets, Queues, Vectorize, Images, Analytics Engine, vars, and observability remain environment-specific.

The production placeholder D1 ID `00000000-0000-4000-8000-000000000000` is build metadata for the existing Sites project, not a production resource ID. Development/staging must never deploy through that production Sites mapping.

## Current source logical environment matrix

This table describes the locally verified v2 `wrangler.jsonc`; it is not evidence that the remote resources exist.

| Binding group | Development | Staging | Production |
|---|---|---|---|
| Worker | `juro-platform-development` | `juro-platform-staging` | `juro-platform-production` |
| D1 source name | `juro-development` | `juro-staging` | `juro-production` |
| Primary R2 source name | `juro-development-files` | `juro-staging-files` | `juro-private-documents` |
| Backup R2 | `juro-development-backups` | `juro-staging-backups` | `juro-production-backups` |
| Quarantine R2 | `juro-development-quarantine` | `juro-staging-quarantine` | `juro-production-quarantine` |
| Analytics Engine | `juro-platform-development` | `juro-platform-staging` | `juro-platform-production` |
| Static assets binding | `ASSETS` | `ASSETS` | `ASSETS` |
| Images binding | `IMAGES` | `IMAGES` | `IMAGES` |

Each environment declares the seven v2 producer bindings shown below and an explicit empty `consumers` array. `MALWARE_SCAN_QUEUE` exists only in the TypeScript job contract and is not a Wrangler binding. No DLQ, trigger, or executable job handler is attached. The four Vectorize bindings are `LEX_UZ_INDEX`, `ADVICE_UZ_INDEX`, `INTERNAL_LEGAL_MATERIALS_INDEX`, and `USER_DOCUMENTS_INDEX`. Legacy queue/index bindings are rejected by source and artifact tests.

## Source contract v2 — implemented locally; non-production resources provisioned; runtime attachment pending

R2 binding identifiers remain stable, while non-production resource names change:

| Binding | Development | Staging | Production |
|---|---|---|---|
| `BUCKET` | `juro-development-files` | `juro-staging-files` | `juro-private-documents` |
| `BACKUP_BUCKET` | `juro-development-backups` | `juro-staging-backups` | `juro-production-backups` |
| `QUARANTINE_BUCKET` | `juro-development-quarantine` | `juro-staging-quarantine` | `juro-production-quarantine` |

The approved primary Queue contract is:

| Binding | Job meaning | Resource pattern |
|---|---|---|
| `DOCUMENT_ANALYSIS_QUEUE` | `document.analyze` | `{environment}-document-analysis` |
| `OCR_PROCESSING_QUEUE` | `ocr.process` | `{environment}-ocr-processing` |
| `DOCUMENT_EXPORT_QUEUE` | `document.export` | `{environment}-document-export` |
| `EMAIL_NOTIFICATIONS_QUEUE` | `email.send` | `{environment}-email-notifications` |
| `LEGAL_SOURCES_SYNC_QUEUE` | `legal.sync`, `legal.parse` | `{environment}-legal-sources-sync` |
| `DATA_RETENTION_CLEANUP_QUEUE` | `cleanup.run` | `{environment}-data-retention-cleanup` |
| `NOTIFICATIONS_QUEUE` | `notification.dispatch` | `{environment}-notifications` |
| `MALWARE_SCAN_QUEUE` | `malware.scan` | `{environment}-malware-scan`, declared/attached only after a real scanner adapter exists |

When a real consumer is implemented and activated, its primary queue requires a distinct `-dlq`, terminal consumer/alert policy, reviewed redrive, and reconciliation. The current source deliberately declares none of those consumers or DLQs. There is no approved live Queue mapping for `ai.request`, `backup.run`, `platform.probe`, or legacy `file.process`: streaming chat stays on the reviewed request/SSE path, backup orchestration uses the control-plane/Workflow design, and a health probe must not share destructive cleanup semantics.

The approved Vectorize binding contract is source/data-class based rather than language based:

| Binding | Resource pattern |
|---|---|
| `LEX_UZ_INDEX` | `{environment}-lex-uz` |
| `ADVICE_UZ_INDEX` | `{environment}-advice-uz` |
| `INTERNAL_LEGAL_MATERIALS_INDEX` | `{environment}-internal-legal-materials` |
| `USER_DOCUMENTS_INDEX` | `{environment}-user-documents` |

Existing language-oriented bindings were not relabeled or aliased to these data classes. The local source contract is corrected; eight empty non-production v2 indexes now exist as recorded above, but none is bound to a Worker, populated, or queried.

The verified staging candidate vector contract is:

| Setting | Value | Evidence boundary |
|---|---|---|
| embedding model | `text-embedding-3-large` | OpenAI documents it for English and non-English tasks |
| requested dimensions | `1536` | explicit OpenAI `dimensions` parameter; fits Vectorize's current 1,536 maximum |
| distance metric | `cosine` | compatible with normalized OpenAI embeddings and the reviewed Vectorize contract |
| encoding | `float` | direct Vectorize insertion; no browser exposure |
| versioning | model + dimensions + preprocessing + chunking version | any change creates a new index and full re-embedding |

This permits deterministic index provisioning but does not open legal ingestion. RU/UZ/cross-language retrieval evaluation, chunking, the at-most-ten indexed metadata fields, tenant pre/post-authorization, lexical retrieval, reranking, freshness filters, and citation verification remain hard gates. OpenAI publishes no Uzbek-legal-corpus guarantee; multilingual suitability is a candidate hypothesis to test, not a release claim.

## Runtime safety state

The committed defaults are:

```text
ASYNC_RUNTIME_ENABLED=false
CRON_ENABLED=false
LEGAL_ADVICE_INGESTION_ENABLED=false
LEGAL_SOURCE_STAFF_API_ENABLED=false
JOB_SCHEMA_VERSION=1
```

No `triggers` property is present in source configuration. Generated Wrangler artifacts may normalize this to `triggers: {}`; any non-empty trigger is rejected by artifact validation.

The Worker exports `fetch`, `queue`, and `scheduled`. Queue bodies accept strict identifiers-only v2 envelopes. `legal.sync` has a local request/fetch/R2/pending-review implementation and `legal.parse` has a local raw-evidence verification/private normalized-snapshot implementation; both remain unreachable remotely because global async execution is false and no consumer is attached. Advice is separately disabled. Every other valid v2 kind is recorded as terminal `JOB_HANDLER_NOT_ENABLED` and acknowledged without simulating success. Legacy `ai.request`, `backup.run`, `platform.probe`, and `file.process` are rejected by schema/routing/outbox compatibility checks. The scheduled handler is inert and calls `noRetry()` because no reviewed schedule is attached.

A runtime flag does not pause Cloudflare Queue delivery. Source therefore declares seven producer bindings only, `consumers: []`, no DLQ, no trigger, and no malware binding. The current source-only boundary acknowledges malformed envelopes and terminally rejects not-yet-enabled v2 kinds. These are deliberate fail-closed local semantics, not a production-ready delivery policy. A live consumer can be declared only together with its exact resource inventory, handler, DLQ terminal path, alert, redrive/reconciliation policy, and per-kind enablement.

## Local verification

The following checked-in matrix command passed for development, staging, and production on 2026-07-28:

```bash
npm run validate:cloudflare:matrix
```

Artifact validation proves:

- one environment-specific `DB` and primary `BUCKET` for development/staging;
- one normalized Sites `DB/BUCKET` only for the production artifact;
- all add-on bindings and selected environment names survive flattening;
- the exact v2 R2, seven producer-only Queue, and four Vectorize names survive flattening;
- Queue consumers are empty, malware is unattached, and legacy bindings are absent;
- `ASYNC_RUNTIME_ENABLED`, `CRON_ENABLED`,
  `LEGAL_ADVICE_INGESTION_ENABLED`, and
  `LEGAL_SOURCE_STAFF_API_ENABLED` remain false;
- no duplicate binding names;
- no Cron trigger;
- no development auth bypass;
- source and packaged migrations match by SHA-256;
- no `.env*` or `.dev.vars*` is packaged;
- the Sites manifest is unchanged;
- the built Worker exposes all three module handlers.

Dry-run validates deploy shape only. It does not prove that remote resources exist or are correctly attached. The control-plane evidence above separately proves the named D1/R2/Queue/DLQ/Vectorize inventory. Analytics Engine attachment, Worker bindings, consumer/DLQ policy, and staging deployment remain absent or unverified.

The ordinary `npm run build` intentionally selects development. A Sites
checkpoint or deploy must use the dedicated production build path and prove
that its flattened artifact contains the Sites-owned `DB`/`BUCKET` bindings.
Until the Sites build pipeline is observed setting `CLOUDFLARE_ENV=production`
or invoking `npm run build:production`, deployment is blocked.

Wrangler is reproducibly pinned to `4.92.0`; the CLI reports a newer
`4.114.0`. Upgrade compatibility must be tested as its own change rather than
silently changing the verified deployment toolchain.

## Provisioning and deployment gates

Before staging deployment:

1. preserve the locally verified v2 mapping recorded in `DECISIONS.md` and inventory legacy remote resources before additive cutover;
2. resolve `app.juro.uz` ownership between Sites and the legacy Worker without changing production traffic;
3. create only the approved missing isolated development/staging resources; never create a second production D1 or replace `juro-private-documents`;
4. retrieve and verify a portable D1 export, then perform an isolated SQL import/restore rehearsal before any further staging migration or any production migration; the consumed D-040 exception cannot be reused;
5. preserve and recheck staging's exact `0000`–`0021` ledger, integrity results, and schema manifest; do not reapply the bootstrap migrations;
6. verify Queue/DLQ delivery, R2 operations, Vectorize tenant filters, Analytics redaction, and alerts;
7. implement quarantine/DLQ consumption, alerts, redrive, ledger reconciliation, and per-kind producer/handler flags;
8. require globally namespaced server-generated idempotency keys until a tenant-scoped composite key migration exists;
9. prove the Sites production build command selects `CLOUDFLARE_ENV=production`;
10. require zero null-workspace document and file rows after migration 0012;
11. build and validate an inactive staging artifact with `workers_dev: false`, `preview_urls: false`, `routes: []`, no schedules/consumers, async/cron disabled, and no platform-header bypass;
12. authenticate the pinned Wrangler CLI locally through the owner's approved OAuth or narrow token flow, never through chat or Git, then perform the first `deploy` while the Worker has no public route; `versions upload` cannot create the first Worker;
13. re-read the control plane and prove subdomain/previews disabled, no route/domain/schedule/consumer attachment, exact staging-only bindings, and unchanged production Worker/domain state;
14. provision a distinct staging hostname only after Cloudflare Access is configured and unauthenticated access is proven denied, because Sites has no preview surface;
15. enter missing secret values only through an approved Cloudflare secret flow; never in chat, Git, docs, screenshots, or logs;
16. keep production data, traffic, domains, and deployments unchanged.

No secret value belongs in `wrangler.jsonc`, Git, logs, or this document.
