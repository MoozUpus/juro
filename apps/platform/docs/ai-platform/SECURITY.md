# JURO platform security controls

Updated: 2026-07-30
Status: this file records implemented controls and open gates. It does not replace `SECURITY-AUDIT.md` or `THREAT-MODEL.md`.

## Implemented identity boundary

- Email OTP, recent local-session checks, CSRF validation, session/device revocation, TOTP, one-time backup codes, workspace membership checks, and append-only security events are server-side.
- Raw OTPs, session tokens, continuity tokens, API keys, and identity-encryption keys are not stored in source or browser bundles.
- `IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY` are verified as secret binding names on `juro-platform-staging`; their values were not read.
- Identity protection remains expand-safe `legacy` until the documented dual-write/backfill gate is separately completed.

## Account-deletion controls

The deletion endpoint requires a recent local JURO email session and same-origin write proof. The confirmation challenge is user-, session-, operation-, purpose-, and expiry-bound. A versioned keyed subject hash must match before cancellation, retry, or purge.

D1 guards enforce legal state transitions. `purge_irreversible_at` prevents a false cancellation after external R2 deletion starts. Sole workspace ownership and active staff assignments block before deletion. The queue uses a dedicated staging consumer, DLQ, bounded retries, idempotency, a D1 lease, and durable job evidence. Lifecycle and purge-evidence rows are append-only and hash-chained.

The R2 inventory uses application object keys and server-side ownership queries; names and PII are not derived from user filenames. The bucket is private. The purge never issues a bucket-wide delete.

## Environment isolation

Staging uses `juro-staging`, `juro-staging-files`, `juro-staging-backups`, staging-only queues, and staging-only Vectorize indexes. `staging.app.juro.uz` is attached only to `juro-platform-staging` and protected by owner-only Cloudflare Access. Workers.dev and version previews are disabled.

Production D1 `juro-production`, private bucket `juro-private-documents`, Sites version 20, `app.juro.uz`, and legacy Worker `juro` are outside this release. Production purge, Cron, and async flags remain false and no production schedule is declared.

## Release security evidence

Local gates include type-check, lint, full tests, route/CSRF/security tests, migration constraints, D1/R2 purge tests, Queue/Cron/outbox tests, Cloudflare environment-matrix dry-runs, exact staging artifact validation, builder/comparison smokes, and working-tree/history secret-pattern scans.

Protected staging must still prove the deployed version, migration ledger, queue consumers/DLQs, cron attachment, anonymous Access denial, authenticated account-deletion API/UI behavior on synthetic data, safe logs, and no production control-plane change.

## Open security gates

Malware scanning, OCR/file prompt-injection defenses, SSRF-protected URL fetch, OpenAI/Anthropic adapters, Vectorize tenant filtering, realtime voice, lawyer case access, support/admin content access, provider outage/fallback, full OWASP/IDOR/load testing, production key separation, and final legal/privacy approval remain incomplete or disabled. No absent control is represented as working.
