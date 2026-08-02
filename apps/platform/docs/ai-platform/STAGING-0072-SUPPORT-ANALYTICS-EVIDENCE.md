# Staging 0072 — privacy-safe support analytics

Date: 2026-08-02

## Deployed change

Creating a support ticket writes one best-effort aggregate event to the existing
staging Analytics Engine dataset. The allowlisted payload is exactly the event
kind, support category, severity, and UI locale. It contains no account,
workspace, ticket, request, URL, subject, message, document, or AI/provider
data. A metrics failure is intentionally isolated from the durable D1 ticket
and audit batch.

## Deployment evidence

- Environment: `staging`
- Worker: `juro-platform-staging`
- Worker version: `81759a9b-5e7e-4603-8772-2c689a5f2253`
- Dataset binding: `juro-platform-staging`
- Route: `https://staging.app.juro.uz/ru/individual/help`

## Verification

- Type-check, lint, and full platform tests — passed
- Staging build and artifact validation — passed
- Static contract test rejects personal/content fields from the analytics writer
- Cloudflare deployment list reports 100% traffic on the version above
- Anonymous route request receives Cloudflare Access `302` with `no-store`

Authenticated event inspection remains an Access-protected staging gate; no
test ticket or user content was generated. Production remains unchanged.
