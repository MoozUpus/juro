# Staging 0038 Advice legal-source evidence

Date: 2026-07-31
Scope: owner-only `juro-platform-staging`. Production, Sites, and `apps/website` were not changed.

## Exact code and schema

- Source commit: `54237e4` (`feat(platform): enable reviewed Advice source ingestion`).
- Migration `0038_current_advice_url_guard.sql` drops and recreates only `legal_source_fetch_requests_insert_guard`; it does not alter a table or user row.
- Current Advice routes are exact positive numeric document URLs: Russian `/ru/documents/{id}` and Uzbek Latin `/oz/documents/{id}`. Stale `/questions`, Cyrillic `/uz/documents`, queries, fragments, mismatched locale/ID, and noncanonical host/path forms fail closed.
- Advice fetches identify JURO, re-read `robots.txt`, enforce same-document HTTPS redirects, and wait at least one second before the document request even when robots declares no delay.
- Advice normalization accepts only `.page-document-content`; it does not fall back to `main`, `article`, or `body` for this source.
- `LEGAL_ADVICE_INGESTION_ENABLED=true` and `LEGAL_SOURCE_STAFF_API_ENABLED=true` only in the staging artifact. Development and production remain `false`.

Staging D1 `juro-staging` has ID `bb716a96-b2fb-4823-90d6-6c228fed181a`. Postflight has 39 migration ledger rows through `0038_current_advice_url_guard.sql`, `quick_check=ok`, and no `foreign_key_check` rows.

## Backup and migration

Before `0038`, the database had 38 ledger rows through `0037` and bookmark:

`000001cb-00000000-000050b9-33ca6e2205d62bf7a5d39a773b0f4344`

The portable pre-change export is retained privately at:

`juro-staging-backups/d1/juro-staging/20260731T050713Z/pre-0038-full.sql`

| Artifact | Bytes | SHA-256 | Private R2 round trip |
| --- | ---: | --- | --- |
| `pre-0038-full.sql` | 399,627 | `db727653fc02f0d1f1a7dab15848ea23be46db8217e67b833309aa4e9879259e` | exact |

The raw Cloudflare export did not pass a direct local SQLite import because its insertion order reaches child rows before `workspaces`. This is an export-order limitation, not evidence of staging corruption. The exact pre-change Time Travel bookmark is the tested in-place rollback anchor for this trigger-only migration, and the prior parent-first full remote restore through `0037` remains the portable topology proof. No restore is claimed for the raw `pre-0038-full.sql` file itself.

Migration `0038` applied successfully and left no pending migrations. The immediate post-migration bookmark was:

`000001cc-00000006-000050b9-14fd0e9751f0bfaa0bb8a31b6a1a4dfa`

The final post-probe bookmark is:

`000001d5-00000008-000050b9-14ad566220bf7432803d38b87be08bd8`

## Worker deployment

- Worker: `juro-platform-staging`.
- Version: `623e591b-f36b-4fc1-9f1e-a86f6e94fe0a`, 100% traffic.
- Deployment message binds the version to commit `54237e4`.
- Startup time reported by Wrangler: 164 ms.
- Handlers: `fetch`, `queue`, and `scheduled`.
- Cron: `*/5 * * * *`.
- Active staging consumers: document analysis, legal sources, email notifications, and data-retention cleanup. The legal-source queue is `staging-legal-sources-sync`, ID `97f0929e6e9a4a1e8e05cdf01ab4cff6`, with one producer and one consumer.
- Exact staging D1/R2/Vectorize/Queue/Analytics bindings were re-read from the deployed version.
- Version inspection exposed only secret names: `IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY`. It did not expose values.
- An anonymous canonical document-builder request returned Cloudflare Access `302` before application content.

Production Worker `juro` remains at version `91774ed4-72e9-47bb-b93a-a4208d490b24`. No production migration, binding, route, traffic, Sites deployment, or UI replacement occurred.

## Live RU and Uzbek-Latin probes

Both probes used one exact public document URL. They did not crawl a category, sitemap, or linked page. The Queue consumer fetched raw bytes, persisted content-addressed private R2 evidence, created a `pending_review` source/version and low-confidence review item, then normalized the source in a separate `legal.parse` run.

| Evidence | Russian | Uzbek Latin |
| --- | --- | --- |
| Canonical URL | `https://advice.uz/ru/documents/1744` | `https://advice.uz/oz/documents/624` |
| Request | `lsfetch_1b206a1217fabeedfff3ae254bd187f0` | `lsfetch_69c211af6b0b70051928ddb4ebb037a6` |
| Source | `lsource_19076c26de2dc0e5068017dc35faddd7` | `lsource_559862cb97adc8e29ee745021077b97d` |
| Version | `lsversion_56e0f31c292c486d5fbc27baa97445f7` | `lsversion_3bb54dc52546c34a12bb91cb4f03ff24` |
| Fetch | completed; 1 attempt; no error | completed; 1 attempt; no error |
| Raw bytes | 84,868 | 77,332 |
| Raw SHA-256 | `8b0db88792c6528bda42110a230f6bb3cacb5b0203032981888ffd8cfe3e5ab1` | `43d7187969a9f4e532fcd76f44c7b2998903c54954221ab17fa5819690f9f17c` |
| Parse | completed; 1 attempt; no error | completed; 1 attempt; no error |
| Parsed bytes | 12,642 | 2,238 |
| Parsed SHA-256 | `d2721b9d40339e81b0dbfab1760ac77cccf79827f6af418283536b36454c181f` | `ab484e379fdca32a1be91723dd44de3c314a69be67f5d431c17e4421173d0a4c` |
| Selector | `advice-document` | `advice-document` |
| Blocks / plain text | 29 / 3,011 chars | 4 / 785 chars |
| Review state | `low`, `pending`, no decision | `low`, `pending`, no decision |

The downloaded raw and normalized objects matched their D1 hashes byte-for-byte. Source bodies remain outside Git and are not copied into this evidence document.

## Idempotency and trust boundary

Re-running each exact request/outbox batch produced zero row writes. Aggregate evidence remained:

- two fetch requests, one per locale;
- two `legal.sync` outbox rows and two completed runs;
- two `legal.parse` outbox rows and two completed runs;
- two pending review rows;
- one source version per exact source/locale/content hash.

After both probes:

- legal-source publications: 0;
- legal-source sections: 0;
- legal-source chunks: 0;
- `staging-advice-uz` vectors: 0;
- both Advice sources remain `pending_review` / `fetched` and are ineligible for AI retrieval.

This proves acquisition and normalization, not legal correctness or publication approval.

## Verification gates

- targeted source/migration/route tests: 112/112;
- core test suite: 310/310;
- Cloudflare/job suite: 84/84;
- rendered route suite: 28/28;
- platform type-check: passed;
- platform lint: passed;
- generated Cloudflare binding type check: passed;
- staging build and artifact validation: passed;
- development/staging/production artifact and dry-run matrix: passed;
- GitHub Actions run `30606283831`: `apps/platform` and `apps/website` passed;
- post-probe D1 integrity and foreign keys: passed;
- private R2 raw/normalized hash checks: passed;
- Access denial and production Worker identity re-read: passed;
- repository diff check and secret-pattern scan: passed before deployment.

## Open gates

- A human legal reviewer must inspect and explicitly approve or reject both pending versions before any publication.
- Authenticated staff-page browser, keyboard, axe, zoom, and screenshot QA remain open because the available browser-control runtime fails before navigation; anonymous Access enforcement is proven.
- Broad Advice discovery/corpus coverage, historical versions, source health alerts, midnight Asia/Tashkent sync, hybrid retrieval, citation verification, and the 250-scenario legal evaluation remain incomplete.
- The deployed Worker still has no `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` secret binding, so live Phase 4/5 provider calls remain fail-closed and are not claimed.
- This checkpoint does not authorize production deployment or production UI replacement.

## Rollback

Application rollback is to the prior staging version `cfef8153-3322-4ce5-b271-3478a0531b28` or to a rebuilt staging artifact with both new flags disabled. Queue delivery can be detached without deleting queues. Because `0038` only replaces a validation trigger, it may remain unused after application rollback; restore D1 only for demonstrated corruption, under staging maintenance, using the exact pre-change bookmark and protected recovery inputs. Production is never a rollback target.
