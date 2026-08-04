# JURO platform security controls

## Malware scanner service boundary — local candidate

The scanner is designed as a private service binding, not a public URL and not
an API key in the browser. Queue envelopes contain only opaque analysis and
workspace identifiers. The consumer reloads the tenant-scoped D1/R2 source,
verifies size and SHA-256 before scanning, sends the quarantined byte stream to
the service, rejects oversized or invalid JSON responses, requires the returned
source hash to match, and records provider/engine/signature/scan identifiers
plus a hash of the exact response. A clean verdict is the only path that copies
the object to the private primary bucket and schedules document analysis. An
infected verdict leaves the object isolated, records `FILE_UNSAFE`, and never
enqueues OCR/AI.

This boundary is disabled and unbound. The current Cloudflare account cannot
deploy Containers because Workers Paid is unavailable, so neither ClamAV nor
any substitute is represented as active. Before enabling it, staging must prove
the real scanner version/signature update path, clean fixture, EICAR fixture,
timeout/503/429/invalid-response paths, Queue retry/DLQ behavior, logs without
content, and quarantine retention cleanup.

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

## 2026-08-02 Worker/runtime review

The Worker review used current Cloudflare best-practice guidance and current
public Worker type definitions. The checked runtime uses generated bindings,
structured queue logging, explicit error handling, Web Crypto and no
`passThroughOnException`. The document-builder row-id fallback no longer calls
`Math.random()`; an unavailable Web Crypto source fails closed instead. This
review is source/test evidence, not a substitute for authenticated staging or
production security testing.

The reviewed implementation was deployed only to staging as Worker
`juro-platform-staging` version `c9c54208-55be-4d6c-9413-950e0cc78d5f`.
An unauthenticated smoke request reached the Cloudflare Access boundary and
received `302` to Access login; that verifies protection and reachability, not
an authenticated product flow. Production was not changed.

## Release security evidence

Local gates include type-check, lint, full tests, route/CSRF/security tests, migration constraints, D1/R2 purge tests, Queue/Cron/outbox tests, Cloudflare environment-matrix dry-runs, exact staging artifact validation, builder/comparison smokes, and working-tree/history secret-pattern scans.

Protected staging must still prove the deployed version, migration ledger, queue consumers/DLQs, cron attachment, anonymous Access denial, authenticated account-deletion API/UI behavior on synthetic data, safe logs, and no production control-plane change.

## Open security gates

Malware scanning, complete OCR/file prompt-injection evaluation, Vectorize tenant filtering, realtime voice, complete lawyer case access, support/admin content access, full OWASP/IDOR/load testing, production key separation, and final legal/privacy approval remain incomplete or disabled. A strictly-public, credential-free SSRF-protected document URL import exists locally, but it remains behind the fail-closed malware gate and has no staging/browser evidence. No absent control is represented as working.
## Business workspace creation boundary

The deployed staging `POST /api/platform/workspaces` creation path authenticates before body handling, enforces same-origin/CSRF and a strict 2 KiB Zod union, and writes no user-controlled identifier. A client UUID is used only as a bounded idempotency key; workspace, membership, and audit IDs are deterministic opaque derivatives. The D1 batch grants owner access only when creator and request evidence match. Exact replay is safe; cross-user or changed-payload replay returns conflict without disclosing another tenant. Migration `0034`, one synthetic owner workspace, canonical personal/business routing, RU/UZ browser behavior, and D1 audit/FK evidence are verified in owner-only staging; cross-account remote proof remains open.

## Untrusted document intake boundary

Document-analysis initialization requires session, active workspace membership, same-origin/CSRF proof, strict JSON, consent, a 50 MB bound, supported MIME/extension pairing, SHA-256, and a tenant-scoped idempotency key. Binary PUT repeats session/workspace/CSRF checks and requires exact content length, MIME, and checksum before streaming to private R2.

Finalize rechecks the private object and bounded magic bytes. ZIP/DOCX preflight
then requires exact central/local-header identity, contiguous referenced bytes,
valid data descriptors, bounded streaming raw-deflate expansion, exact expanded
length and CRC32 before quarantine; timeout or corruption deletes the private
object and records a tenant audit rejection. New files are unavailable from the
normal download route because their kind remains `analysis_quarantined`. With no
real malware scanner attached, the server records `MALWARE_SCANNER_UNAVAILABLE`,
returns a recoverable `FILE_SCAN_UNAVAILABLE` state, and never invokes OCR or an
AI provider. The deprecated multipart route cannot store or analyze a file.
This is still a fail-closed foundation, not proof of malware safety; a real
scanner, actual package extraction, OCR prompt-injection isolation and
authenticated staging HTTP proof remain release gates. The deep archive verifier
is locally tested and not yet deployed.

## Encrypted user-memory boundary — local candidate

Memory API operations reuse session authentication, active-workspace resolution,
same-origin/CSRF write enforcement, strict Zod unions, UUID validation, no-store
responses and neutral not-found behavior. Plaintext statements are encrypted
with record-bound server-only key material before D1 persistence. Queries bind
the authenticated user and, for workspace scope, the current workspace before
decryption or mutation. Audit metadata contains category/scope/action only.

Credential detection is fail-closed and Unicode-aware for RU/UZ/English terms.
OTP/TOTP, password, access-code and payment-card-like values are always refused.
High-sensitivity facts are excluded from automatic extraction and require an
explicit checkbox for manual create/edit. Provider prompts label memory as
untrusted context and prohibit treating it as instructions. Focused tests cover
cross-user/workspace access, ciphertext-at-rest, record binding, credential
rejection, explicit sensitive consent, no-plaintext audit, and account purge.
Migration `0062` and authenticated staging security evidence remain pending.

Soft-deleted memory is now eligible for permanent removal only after the fixed
seven-day retention window. The existing locked scheduled runtime selects at
most 100 due tombstones in deterministic order and repeats the deleted/time
predicate on every delete. `memory_sources` is removed only by the declared
foreign-key cascade. A `sqlite_master` presence guard makes the runtime a safe
no-op before migration `0062`; no missing-table fallback can delete another
domain. Structured runtime logs expose counts only. Focused tests cover active
and future-row preservation, batch bounds, cascading sources, pre-migration
inertness and absence of memory content from logs. This remains local evidence
until `0062` and the exact Worker are verified in protected staging.

## AI stream recovery boundary — local candidate

`GET /api/platform/ai/runs/:idempotencyKey` authenticates before validation or
D1 access and derives both user and active workspace server-side. The registry
lookup binds the full user/workspace scope and joins only a run owned by the same
tenant. Responses are private/no-store and expose only bounded lifecycle state
plus persisted conversation/message identifiers already owned by that user.

The browser reuses the original key while outcome is missing or processing. It
creates a new key only after D1 proves terminal failure and usage release. A
completed recovery reloads the already validated and persisted structured
message through the existing tenant-scoped conversation read. Partial provider
text, request hashes, prompts, internal error details, token data, and cross-
tenant existence are not returned. Local service and rendered unauthenticated
route tests pass; authenticated staging evidence remains pending.
