# Changelog — ecosystem audit release 2026-08-25

## Shipped to production

- All JURO subdomains now redirect HTTP to the exact HTTPS URL with status 308
  before application or host routing.
- Standalone signed-PDF share verification now has a durable per-share
  five-attempt/15-minute lockout with `Retry-After` and atomic success cleanup.
- New standalone share tokens and access codes are AES-GCM protected with the
  existing identity keyring. Hashes remain lookup/comparison boundaries;
  plaintext columns remain empty for protected rows.
- D1 guards reject partial encryption metadata and mixed
  plaintext-plus-ciphertext states.
- Migration `0159_signed_share_verification_guard.sql` was applied after a
  verified pre-backup and followed by a verified post-backup.
- Platform production Worker advanced from rollback version
  `f91406c2-903b-438f-bafb-01a64f5af2b7` to
  `357d0438-1a5f-4b29-ba81-869cbc130c0a`.
- Public website dependency resolution now pins PostCSS `8.5.23` and Sharp
  `0.35.3`; production `npm audit` reports zero vulnerabilities.
- Sites version 80 deployed exact 121-file source from `81aaf408`; version 79
  is the immediate public rollback. The Platform Worker remains version 146
  because this follow-up did not change `apps/platform`.

## Verification

- Local: rendered 34/34, core 1083/1083 and Cloudflare 201/201; lint,
  type-check, production build/artifact and migration safety passed.
- GitHub: CI run `32816221498` completed successfully for Website and Platform.
- Production: migration ledger empty, D1 foreign-key violations zero, four-host
  HTTPS enforcement passed, signed-share unknown-token fail-closed passed and
  public status was operational.
- Security: immutable whole-repository Standard scan
  `df6f1247-116c-42b8-b233-a693efb52263` closed 8/8 planned surfaces with zero
  reportable findings and explicit PARTIAL coverage. Exact hardening diff scan
  `a2cb0d4a-7512-4b0a-aa5e-362681007619` retained zero findings.
- Public hardening release: GitHub CI `32829635485` passed Website and Platform;
  42/42 local website tests, types, lint, 716-package licence policy and
  deployable artifact passed; production crawl returned 78/78 exact canonical
  URLs and status remained operational 8/8.

## Not represented as complete

Lighthouse/Core Web Vitals, full manual keyboard accessibility, physical-device
QA and every authenticated write path were not re-run for this commit. Earlier
investor-ready evidence remains relevant, but these narrower gaps retain their
explicit status in the audit and QA documents.
