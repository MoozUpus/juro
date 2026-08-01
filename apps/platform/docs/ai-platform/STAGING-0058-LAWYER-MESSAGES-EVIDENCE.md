# STAGING-0058 — lawyer request messages

Date: 2026-08-01. Environment: protected staging only. Worker: `juro-platform-staging`, version `a19a251b-5539-48fe-b5ab-402b9517c565`. D1: `juro-staging`.

Migration `0053_dashing_eddie_brock.sql` added `lawyer_request_messages` only, after a private remote R2 checkpoint verified by SHA-256 (`79b6403f0a0b16f2205e4bdefa8cabeeb81e3dc80157734fd33a24e416274aea`). `quick_check` is `ok`, `foreign_key_check` is empty, and the migration ledger records ID 54.

The API permits reading or sending only to the owning requester or a public-approved lawyer with a current, non-revoked access grant. Each sent message creates workspace audit evidence. RU/UZ UI is included in both authorized surfaces. `npm run type-check`, `npm run lint`, `npm test` (87/87), and `npm run build:staging` passed. Authenticated browser E2E remains unverified behind Cloudflare Access. Production was unchanged.