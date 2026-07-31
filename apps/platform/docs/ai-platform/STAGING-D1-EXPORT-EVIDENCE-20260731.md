# Staging D1 export evidence — 2026-07-31

- Database: juro-staging (b716a96-b2fb-4823-90d6-6c228fed181a)
- Operation: wrangler d1 export --remote
- Export result: successfully downloaded locally for validation.
- Size: $bytes bytes.
- SHA-256: $hash.
- Validation: SQL begins with D1 schema statements and contains $migrationCount recorded migration entries.
- Handling: the local export was not committed, uploaded, or retained after checksum/schema validation. The signed one-hour download URL is intentionally omitted from this document and from Git.

This proves creation and structural validation of a staging backup snapshot. It is not a production backup or a full restore rehearsal; restore remains a release gate.