# JURO Cloudflare resources

> Local candidate — 2026-08-05: `LEGAL_LEX_RSS_DISCOVERY_ENABLED` is `true`
> only in the checked-in staging environment candidate and `false` in
> development/production. No binding or remote resource is added. The deployed
> staging Worker remains version `3af9bfe6-bd1d-436c-a94a-3fa3ef9283d4` from
> commit `cff38f0`, and `juro-staging` remains through migration `0078` (79
> ledger rows). Production is unchanged.

> Current checkpoint — 2026-08-05: protected staging Worker
> `juro-platform-staging` version `3af9bfe6-bd1d-436c-a94a-3fa3ef9283d4`
> serves 100% from commit `cff38f0`. `juro-staging` is through additive
> migration `0078` with 79 ledger rows. The pre-migration private-R2 backup and
> post-migration isolated restore passed checksum/integrity verification; direct
> remote integrity pragmas exceeded the D1 query memory ceiling and are not
> claimed. Root and canonical protected routes return Access `302` anonymously.
> Production was not targeted. See root
> `docs/ai-platform/STAGING-0069-0078-EVIDENCE.md`.

## Containers capability check — 2026-08-04

`wrangler containers list --json` authenticated to account
`e22babd36b65c99b69adf3de50df5227` but returned Cloudflare's explicit
`Unauthorized: You do not have access to Cloudflare Containers; Workers Paid
required`. Local `docker` is also unavailable. No Container, image, Durable
Object class, service binding, Queue attachment or resource ID is claimed.
The scanner integration remains a disabled service-binding contract.

> Current checkpoint — 2026-08-04: protected staging Worker version
> `030e3db0-6de5-455f-a90b-0350d346f5cf`, deployment
> `b2de852d-18fd-4bef-a86e-9532537a2f1e`, serves 100% of traffic with
> `APP_ENV=staging`. `juro-staging` is through additive migration `0068` after a
> full/schema/data export, private `juro-staging-backups` SHA-256 round trip and
> disposable restore (`quick_check=ok`, zero FK violations). Cloudflare Access
> protects root and canonical AI routes. Production Worker `juro` remains
> unchanged at `91774ed4-72e9-47bb-b93a-a4208d490b24`. See
> `STAGING-0068-FILE-SCAN-EVIDENCE.md`. The evidence schema is deployed, but no
> malware scanner binding or clean verdict exists; uploads remain fail-closed.

> Phase 5 OCR candidate — 2026-07-31: source now declares the Workers AI binding
> `AI` in development, staging, and production profiles and attaches the already
> provisioned `OCR_PROCESSING_QUEUE` to a real identifiers-only consumer.
> Migration `0042` adds `file_extractions`. Local config/type/migration/Queue tests
> pass. No remote binding, migration, version, or traffic claim is made at this
> checkpoint: Cloudflare version readback returned HTTP 522, and staging deploy is
> still pending. Production resources and traffic remain unchanged.

> Current checkpoint — 2026-07-31: `juro-staging` has 42 migrations through additive `0041`; `juro-platform-staging` version `ffbfe9df-40f8-4442-8080-7eaf1e63fe40` serves 100% behind Access with five consumers and one five-minute cron. Completed analyses support private JSON/PDF/DOCX export lifecycles, R2-first terminal deletion, and account-deletion continuity. Staging has no eligible completed analysis. Production Worker `juro` remains `91774ed4-72e9-47bb-b93a-a4208d490b24`. This supersedes older current-state summaries below; their historical resource IDs remain evidence of earlier checkpoints.

Updated: 2026-07-30
Status: owner-approved Wrangler OAuth was used for staging only. `juro-staging` is through `0034` with verified pre/post Time Travel/private-R2 exports and a pre-change isolated restore. Worker version `2ebc2ea8-6216-4f39-af96-d1b600973b74` serves 100% from commit `cd24095` behind owner-only Access. Exactly two staging consumers and one five-minute cron are active; legal ingestion and staff APIs remain disabled. Production resources, traffic, Sites v20, and legacy Worker `juro` were not changed.

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
| Staging | `juro-staging` | `bb716a96-b2fb-4823-90d6-6c228fed181a` | exists; EEUR; exact 35-entry ledger `0000`–`0034`; 113 application tables (114 including `d1_migrations`), 72 triggers, 199 indexes; pre/post private-R2 checkpoints, isolated pre-change restore, zero FK violations |
| Production | `juro-production` | `4cce509b-0e02-4ca9-a3ba-a5ce1327aeda` | exists; 61 non-internal tables reported; preserve |

The current branch has migrations `0000`–`0034`. Staging has the exact 35-entry ledger and post-`0034` integrity evidence. The migration-specific pre/post full/schema/data/manifest sets passed private-R2 checksum round trips; the pre-`0034` set also passed an isolated restore with source-equivalent topology. Production/development remain at `0000`–`0004`; no migration was applied to either environment.

### R2

Existing private JURO buckets:

- `juro-private-documents` — production primary; preserve;
- `juro-private-documents-development` — existing development primary;
- `juro-private-backups-development` — existing development backup namespace;
- `juro-quarantine-development` — existing development quarantine namespace;
- `juro-development-files`, `juro-development-backups`, and `juro-development-quarantine` — newly created empty EEUR Standard targets; private and not bound;
- `juro-staging-files` and `juro-staging-quarantine` — private EEUR Standard targets bound only to `juro-platform-staging`; no public bucket access or active processing consumer is configured;
- `juro-staging-backups` — private EEUR Standard target containing 26 verified D1 migration/restore artifacts documented in `BACKUP-RESTORE.md` and `STAGING-0034-EVIDENCE.md`; bound only to protected staging and not publicly exposed.

The account also contains `site-creator-r2`, a Sites-managed/non-JURO-primary resource. It must not be repurposed as a JURO file, backup, or quarantine bucket.

No production backup or quarantine bucket exists. The JURO buckets above have no public development URL or custom domain. Only the three staging D1 checkpoint exports were written to the staging backup bucket; no user file, legacy object, or cross-environment object was copied, and no binding was cut over.

The owner-approved target names differ from the older source/runtime names:

| Purpose | Approved target | Existing legacy name | Phase 1 rule |
|---|---|---|---|
| Dev primary files | `juro-development-files` | `juro-private-documents-development` | empty target exists; do not abandon or duplicate data; inventory objects, choose an additive copy/cutover plan, then update binding |
| Staging primary files | `juro-staging-files` | absent | isolated target is bound only to the protected staging Worker; upload/scanning remains feature-gated |
| Production primary files | `juro-private-documents` | same | preserve; no replacement |
| Backups | `juro-{environment}-backups` | dev uses `juro-private-backups-development` | staging contains 26 checksum-verified D1 checkpoint artifacts including the `0034` pre/post sets; development remains empty and production remains absent |
| Quarantine | `juro-{environment}-quarantine` | private dedicated dev/staging/prod bindings exist; new document-analysis uploads use the staging binding with `quarantine-v2/` keys | a bucket is not a scanner; files remain quarantined until a real fail-closed scanner marks them safe |

### Queues

Eight development-only queues also remain under the older `juro-*-development` naming convention: AI jobs, file jobs, document jobs, legal sync, email jobs, notification jobs, cleanup jobs, and backup jobs. Each reports zero producers, zero consumers, 24-hour retention, and no verified live DLQ/redrive path. Those legacy names have no staging or production counterparts.

The task-specific development/staging v2 queues and distinct DLQ resources now exist. Every row below was re-read with 86,400-second retention. Development and every DLQ have zero producers/consumers; each staging primary has the single `juro-platform-staging` producer and zero consumers:

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

The deployed staging source attaches only `staging-email-notifications` and `staging-data-retention-cleanup` as consumers. They use distinct DLQs, five retries, 30-second retry delay, and concurrency 2/1 respectively. The other five staging primaries remain producer-only; all development and production consumers remain absent. The only schedule is the locked `*/5 * * * *` outbox dispatcher. Remote legacy development queues remain unchanged; any later cleanup is a separate reviewed operation.

### Vectorize, scheduling, observability, and DNS

- Vectorize indexes: eight empty v2 indexes exist — `development-{lex-uz,advice-uz,internal-legal-materials,user-documents}` and the matching `staging-*` set. Every index was re-read at 1,536 dimensions with cosine distance; no vector or metadata index is claimed.
- Cron triggers: staging has exactly `*/5 * * * *`; development and production have none.
- AI Gateway: none verified.
- Logpush/metrics export/observability destinations: none verified.
- Staging primary queues have one producer binding; email and data-retention each have one `juro-platform-staging` consumer and distinct DLQ. Other consumers remain unattached.
- Staging Worker serves version `2ebc2ea8-6216-4f39-af96-d1b600973b74`, at 100% from commit `cd24095c8307a4c3b145549f147a823000a438e3`. Script subdomain and previews remain disabled; exactly one schedule and two reviewed staging consumers are active.
- `staging.app.juro.uz` is the only attached staging custom domain and is protected by the Access boundary documented below; `staging.juro.uz`, `status.juro.uz`, and `api.juro.uz` remain unattached by this work.
- The local `0083` candidate declares non-secret `STATUS_HOSTNAME` values
  (`status.staging.juro.uz` for staging and `status.juro.uz` for production) so
  an explicitly attached hostname can be fenced to the public status surface.
  No DNS record, Worker custom-domain attachment, Access policy change or
  production route is created by declaring this variable.
- DNS zone `juro.uz`: `877b1c7d333a3f6957e8e23ea95c8e19`.
- Cloudflare Access is enabled for staging with one exact owner-only policy; an anonymous request receives a no-store Access redirect before application content.

The source declares the approved Vectorize bindings and exact names (`{environment}-lex-uz`, `{environment}-advice-uz`, `{environment}-internal-legal-materials`, and `{environment}-user-documents`). The empty remote indexes now match that shape. The local `0080` candidate uses `text-embedding-3-large` with `dimensions: 1536`, stores all required user-document metadata, and adds D1-authoritative pre/post tenant checks; remote ingestion/query activation and staging evidence remain gated.

### Runtime bindings and secrets

The production Worker exposes Assets, Images, D1, R2, `EMAIL_FROM`, and a secret binding named `RESEND_API_KEY`. Sites runtime revision 2 exposes `APP_URL`, `PUBLIC_SITE_URL`, `EMAIL_FROM`, and a secret binding named `RESEND_API_KEY`. The public Sites project is active at `app.juro.uz`, has no preview URL, and remains on saved version 20/source commit `40310786188eb545f224e906c2c9506c146a907c`. No production OpenAI, Anthropic, encryption, OTP-HMAC, Cron, Turnstile, TOTP-encryption, or signed-URL secret binding was verified. The staging Worker settings API returns secret binding names `IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY`, plus the public plain-text `TURNSTILE_SITE_KEY` binding. Values were never read or requested. No local `.env`/`.dev.vars` or secret value was added to source, generated artifacts, logs, or documentation.

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

Dry-run validates deploy shape only. The independent post-deploy control-plane read now proves the staging Worker version, exact binding names/types, Analytics Engine attachment, seven Queue producers, disabled subdomain/previews, and absence of Worker routes, schedules, and Queue consumers; secret values were never read. Queue/DLQ execution policy, public staging routing, provider configuration, and authenticated HTTP behavior remain unverified.

The ordinary `npm run build` intentionally selects development. A Sites
checkpoint or deploy must use the dedicated production build path and prove
that its flattened artifact contains the Sites-owned `DB`/`BUCKET` bindings.
Until the Sites build pipeline is observed setting `CLOUDFLARE_ENV=production`
or invoking `npm run build:production`, deployment is blocked.

Wrangler is reproducibly pinned to `4.92.0`; the CLI reports a newer
`4.115.0`. Upgrade compatibility must be tested as its own change rather than
silently changing the verified deployment toolchain.

## Provisioning and deployment gates

Completed inactive-deploy gates and remaining public-staging gates:

1. preserve the locally verified v2 mapping recorded in `DECISIONS.md` and inventory legacy remote resources before additive cutover;
2. resolve `app.juro.uz` ownership between Sites and the legacy Worker without changing production traffic;
3. create only the approved missing isolated development/staging resources; never create a second production D1 or replace `juro-private-documents`;
4. preserve the completed portable export/private-R2/local-restore evidence; require a separate remote disposable-D1 import drill before treating recovery time as proven or before any production migration;
5. preserve and recheck staging's exact `0000`–`0029` ledger, restore/checksum evidence, and schema manifest; do not reapply completed migrations;
6. verify Queue/DLQ delivery, R2 operations, Vectorize tenant filters, Analytics redaction, and alerts;
7. implement quarantine/DLQ consumption, alerts, redrive, ledger reconciliation, and per-kind producer/handler flags;
8. require globally namespaced server-generated idempotency keys until a tenant-scoped composite key migration exists;
9. prove the Sites production build command selects `CLOUDFLARE_ENV=production`;
10. require zero null-workspace document and file rows after migration 0012;
11. completed: built and validated the staging artifact with `workers_dev: false`, `preview_urls: false`, no schedules/consumers, async/cron disabled, and no platform-header bypass;
12. completed: used owner-approved local Wrangler OAuth to deploy pushed, CI-green commit `29a3d9a` while the Worker had no public route;
13. completed: re-read the control plane and proved subdomain/previews disabled, no schedule/consumer attachment, exact staging-only bindings, and unchanged Sites v20 plus legacy Worker deployment;
14. completed: configured owner-only Access, proved unauthenticated denial, and only then attached `staging.app.juro.uz`;
15. completed for the current Phase 2 slice: required values were entered through Cloudflare and only binding names were inventoried; future secrets must follow the same rule and never enter chat, Git, docs, screenshots, or logs;
16. keep production data, traffic, domains, and deployments unchanged.

No secret value belongs in `wrangler.jsonc`, Git, logs, or this document.

## Staging Access boundary

Cloudflare Access is enabled for the `curly-rice-90a4` Zero Trust organization. The staging perimeter is configured before a DNS record or Worker custom domain is attached.

| Resource | Verified value | Boundary |
|---|---|---|
| Access application | `JURO platform staging — owner only` | staging only |
| Application ID / UID | `d88c147e-bbd0-43bd-b783-3fc49a7edd11` | Cloudflare Access API, 2026-07-29 |
| Protected destination | `staging.app.juro.uz` | attached only to `juro-platform-staging` |
| Worker custom-domain ID | `83fa11970645f783cf0b7cfa6c8b914f2753325e` | staging only |
| Identity provider | Cloudflare account-members provider `42ab9b55-7e07-45f5-962f-c3d464bd42fe` | restricted to Cloudflare account members |
| Owner allow policy | `90306b71-4731-47fa-969e-34fc22722f17` | one exact owner email; no group/domain-wide bypass |
| Session | 8 hours | `HttpOnly`, `SameSite=Strict`, binding cookie enabled |

The Access application is hidden from the App Launcher and auto-redirects to the sole configured Cloudflare identity provider. A 200 API re-read proved the exact destination, provider, policy selector, cookie settings and session duration. An unauthenticated HTTPS smoke test was redirected to the Access login endpoint; it did not reach the application. This proves the external deny-before-auth gate. Production DNS, routes, domains, Workers, Sites and policies remained unchanged.

## Active protected staging deployment — 2026-07-30 UTC

| Evidence | Verified value |
|---|---|
| Worker | `juro-platform-staging` |
| Version | `2ebc2ea8-6216-4f39-af96-d1b600973b74` at 100% |
| Source | commit `cd24095c8307a4c3b145549f147a823000a438e3` |
| Secret names | `IDENTITY_KEYRING`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` |
| Consumers | staging email + data-retention only; each has its own DLQ |
| Schedule | locked outbox dispatch `*/5 * * * *` |
| Anonymous boundary | owner-only Access denies application access before authentication |
| Authenticated smoke | exact-version RU personal and RU/UZ business builder routes verified across desktop, tablet, and mobile widths |

Secret values were neither read nor emitted. Staging async/cron/account-purge flags are true; legal-source ingestion and staff API flags remain false. Workers.dev and previews are disabled. Production resources and traffic were not changed.

## Current staging control-plane delta — 2026-07-30 UTC

Control-plane verification confirms the exact custom domain and owner-only Access application, staging-only bindings, Worker version `2ebc2ea8-6216-4f39-af96-d1b600973b74` at 100%, one schedule, two primary consumers and their distinct DLQs. `juro-staging` is through `0034` with no pending migration; the pre/post checkpoints and hashes are in `STAGING-0034-EVIDENCE.md`. Secret inventory remains names-only. Production Worker `juro`, Sites, D1, R2, routes, queues, domains, and schedules remain unchanged.
## Current Phase 3 staging resource state — 2026-07-30

juro-platform-staging serves Worker version d65ad586-98ef-47bc-95e2-158e4dfd45cf at 100% traffic. The exact flattened artifact exposes fetch, queue, and scheduled handlers; the five-minute cron; seven staging producers; and three reviewed consumers, including the serial staging-legal-sources-sync consumer with its dedicated DLQ. workers.dev and preview URLs remain disabled, and the single custom domain remains owner-only Access protected.

juro-staging is through migration 0036. The legal source probe persisted one raw and one normalized content-addressed object only in private juro-staging-files. The pre/post recovery artifacts are in private juro-staging-backups. No quarantine, production R2, production D1, production Worker, production route, or Sites resource was changed.

Version inspection lists only the names IDENTITY_KEYRING, RESEND_API_KEY, and TURNSTILE_SECRET_KEY. It does not prove broader Phase 4 provider secrets, and no secret value was read. LEGAL_ADVICE_INGESTION_ENABLED, LEGAL_SOURCE_STAFF_API_ENABLED, and STAGING_SYNTHETIC_PROBES_ENABLED remain false.

## Phase 5 async-analysis staging delta — 2026-07-30 UTC

| Evidence | Verified value |
|---|---|
| Worker version | `0ba11fcf-a095-436d-a30b-aeacc1aa9c3c` at 100% on `juro-platform-staging` |
| Source | commit `2456742373ef045328e4d9df09ac6c6ef95bc03a` |
| Analysis queue | `staging-document-analysis`, ID `5daca3710f954ca49046ff56cfed4176`, one producer + one consumer |
| DLQ | `staging-document-analysis-dlq`, ID `60b41d382df142edb72be3693c4b61ba` |
| Database | `juro-staging`; `quick_check=ok`, zero foreign-key violations, zero analysis rows |
| Secret names | `IDENTITY_KEYRING`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`; AI provider secrets absent |
| Anonymous HTTP | document-review and canonical document-builder both return `302` at Access |

The new consumer uses serial concurrency, batch size 1, three retries, 30-second retry delay, and the distinct DLQ. No migration was applied in this slice. Production bindings, consumers, traffic, Sites v20, `apps/website`, production D1/R2, and the legacy Worker were not changed.

## Phase 5 OCR staging resource state — 2026-07-31 UTC

`juro-platform-staging` now serves version
`85151979-ba7d-4fc0-a2dc-fccf4f1e4da3` at 100% from commits
`9a6a9c9` and `48861a1`. Migration `0042` is applied only to `juro-staging`;
integrity, foreign keys, pending migrations, and private pre/post backup round
trips pass.

Queue `staging-ocr-processing` (`e050407874d741c5beb36c762b9e83fc`) has
one `juro-platform-staging` producer and one consumer. Its distinct DLQ is
`staging-ocr-processing-dlq` (`67b273da1950422b92d12757b6a946b0`). The Worker
has the Workers AI `AI` binding.

The authoritative secret-name list still contains only the three established
identity/email secrets; OpenAI and Anthropic key names are absent. Production


## Current staging secret-name checkpoint — 2026-07-31 UTC

A fresh read-only `wrangler secret list --env staging` on `juro-platform-staging` returned the secret names `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY`. No secret value was read, written, logged, or exported. This supersedes only earlier statements about the *current* absence of provider secret names; historical deployment records retain the secret inventory observed at their own timestamps. Presence of these names does not prove a provider call, a legal result, or a document-analysis completion.
