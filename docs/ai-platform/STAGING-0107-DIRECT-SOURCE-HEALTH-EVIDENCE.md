# Staging 0107 — direct legal-source health

Date: 2026-08-06

## Scope

This protected owner-only staging checkpoint adds an operational health surface
for the query-scoped direct Lex.uz/Advice.uz path. It checks only the two public
`robots.txt` endpoints and stores bounded operational metadata: provider kind,
availability, check time, latency, a public error code and the fixed endpoint
URL. It never fetches or stores a legal document, page HTML, chunk, embedding,
question or AI response.

The operator API is private/no-store, requires a platform-staff capability and
fresh MFA. It is deliberately separate from the disabled legacy corpus review
surface. Production was not modified.

## Backup and migration evidence

- Pre-migration private R2 prefix:
  `d1/juro-staging/20260806T153842Z-0107-pre/` in
  `juro-staging-backups`.
- Full export SHA-256:
  `55e4f30028e8402ee586f8bf172a38ae9b0727b40e1f36da9bfe54d41034dc2a`.
- Schema export SHA-256:
  `55767051c04e53d354d2fa8e0cd3f3ee358d6036dd7cbd4d7a2ddf4328db6622`.
- Data export SHA-256:
  `d4a40cc3597ddbef755f80e085dbf65df318183470dea941a58459848784b277`.
- Full R2 download matched the full-export SHA-256. The isolated restore passed
  `quick_check=ok` and `foreign_key_check=0` before migration.
- Migration `0107_direct_legal_source_health.sql` was applied once to
  `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`). A subsequent
  lightweight postflight found its ledger entry, table
  `legal_source_health_checks`, and index
  `legal_source_health_checks_lookup_idx`.
- The temporary local plaintext export and isolated restore copy were deleted
  after the private R2 round-trip and restore verification.

Cloudflare D1 returned `SQLITE_NOMEM` to a full remote `PRAGMA quick_check`
after migration. This did not affect the narrow ledger/table/index reads; it is
recorded as an external D1 diagnostic limitation, not as a passed remote
integrity check.

## Delivery and verification

- Commit: `8ab039d` (`feat(platform): add direct legal source health`).
- Initial source-health Worker version: `b096f096-d90c-4b85-90ad-57c107e456bc`.
- Later staging Worker version containing the bounded direct-source diagnostics:
  `a38ae4f7-543a-4498-aec7-5bc2d1fc61be`.
- `npm run type-check`, `npm run lint`, direct-source health tests, direct
  retrieval tests, platform-core tests and Cloudflare-config tests passed before
  the 0107 deployment.
- A no-write technical probe reported both fixed endpoints healthy from the
  deploy environment: Lex `109 ms`, Advice `366 ms`.

## Direct source smoke status

An authenticated owner-only synthetic RU AI question was sent through staging.
The safety behavior was correct: no fabricated citation was shown and no answer
cycle was charged. However, direct search in the Worker failed before receiving
an HTTP response for both providers; the bounded audit records
`LEGAL_SOURCE_SEARCH_UNAVAILABLE`. A safe same-host redirect implementation and
bounded timeout diagnostics were deployed and retested. The latest visible run
did not complete within the test window and was stopped through the UI.

Consequently the source-card success criterion remains **not passed**. Local
query-scoped retrieval of the same synthetic wording obtained the official
Advice page `https://advice.uz/ru/document/4668`, so the remaining issue is
specific to outbound Worker search egress/upstream behavior, not a fabricated
answer or a database corpus fallback. The platform stays fail-closed until that
external path is made available.
