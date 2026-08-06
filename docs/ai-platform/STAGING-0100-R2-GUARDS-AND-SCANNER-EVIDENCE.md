# Staging 0100: immutable R2 guards and malware scanner evidence

Date: 2026-08-06

Scope: protected staging only. Production Worker, D1 and R2 were not changed.

## Applied migration

- D1: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`)
- Migration: `0100_r2_write_guard_exact_keys.sql`
- Ledger after application: 101 rows, with `0100` as the newest entry.
- Purpose: replace two long dynamic `LIKE` R2-key trigger predicates with exact
  deterministic immutable keys. The prior D1 failure was `LIKE or GLOB pattern
  too complex`; equality preserves the tenant/revision/SHA-256 proof and is
  stricter than a prefix test.

## Backup and database postflight

The pre-0100 export was written to the private `juro-staging-backups` prefix
`d1/juro-staging/20260806T010218Z-0100-pre/`, then hash-checked and restored in
an isolated local check.

- full export SHA-256: `c0d01b4a6048ea411738df05bbf73349dd8c83725033764e31aa8596d7d114a7`
- schema export SHA-256: `6a1fe158464fada3105c74c917ed4246a0efc397be007583bcf7bf9a9d088100`
- data export SHA-256: `77d4e4b73e6820d703de689c5d5f1b1e341e50254d4a99f55f646dc2a455fd64`
- isolated restore: `quick_check=ok`, 216 tables, 481 indexes, 291 triggers;
  zero foreign-key violations.
- staging postflight: `PRAGMA foreign_key_check` returned no rows.

Plaintext working exports and downloaded restore copies were removed after the
hash and restore checks.

## Malware scanning without local Docker

The staging file pipeline uses a private Cloudflare Container instead of a
developer-host Docker daemon or a public file bucket.

- Container application: `juro-staging-malware-scanner`
- Cloudflare application ID: `a031feac-d80d-48e5-8519-3ead6399ebac`
- Image digest: `docker.io/clamav/clamav@sha256:4de20bd9ab45a4b763c5412b769217ef5082572ebc8a63aff1a77943419e5dd8`
- Queue: `staging-malware-scan`
- Dead-letter queue: `staging-malware-scan-dlq`
- Application binding: `MALWARE_SCANNER`

The scanner remains private. The pipeline keeps files quarantined until the
scanner returns a clean verdict; suspicious files are not sent to AI providers.
A controlled EICAR staging probe previously produced an infected verdict. This
proves the private scanning path, not general coverage for every malicious
format or a production release gate.

## Controlled document-analysis harness

An explicitly staging-only, synthetic DOCX probe was used to exercise the
scanner and analysis path. It has no HTTP route and its enable flag is now
`false`. Its fixed synthetic profile/workspace/file/analysis records and the
three matching private R2 objects were removed. A final D1 count for every
synthetic identifier was zero and `foreign_key_check` returned no rows.

The probe also established that real document-analysis provider execution is
not yet an acceptance gate: the durable production-like adapter still needs a
separate successful real-provider analysis before it may be claimed as working.
Staging contains `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` by name, but names do
not prove billing, model entitlement or successful provider responses.

## Legal sources

JURO continues to restrict legal citations to the official Lex.uz and Advice.uz
allowlist and preserves the source integrity checks. The staging database had
zero activated current source versions during this probe. Therefore this
technical run cannot prove an indexed legal corpus, citations, legal quality or
the asserted state of every external source; those require the separate
ingestion/activation and human legal-review gates.
