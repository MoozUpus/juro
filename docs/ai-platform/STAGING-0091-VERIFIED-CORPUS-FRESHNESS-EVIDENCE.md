# Staging 0091 checkpoint

Migration `0091_verified_corpus_freshness.sql` and exact commit `81de7bb` are
deployed only to protected staging. Full evidence, including private R2 object
hashes, isolated pre/post restores, the D1 memory-limit note, ledger and trigger
inspection, CI, Worker version, bindings and Access probes, is recorded in
`apps/platform/docs/ai-platform/STAGING-0091-VERIFIED-CORPUS-FRESHNESS-EVIDENCE.md`.

Staging D1 has 92 migration rows and no pending migration. Worker version
`3625c4b0-5bd9-4220-94b0-81ee3480acec` receives 100% of staging traffic.
Production was not migrated or deployed. Authenticated browser, controlled
corpus-run, Queue/DLQ, email-receipt and named legal-review gates remain open.
