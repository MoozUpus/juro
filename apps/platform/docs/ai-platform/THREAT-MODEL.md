# JURO threat model

Initial version: 2026-07-26  
Scope: platform identity, workspaces, AI, legal knowledge, documents, lawyers, staff access, and Cloudflare infrastructure.

This is the Phase 0 threat baseline. It will be updated with each vertical slice and staging evidence.

## Protected assets

- account identity, OTP/session/TOTP credentials, recovery codes;
- personal and third-party PII;
- chats, cases, documents, OCR text, analyses, signatures, and exports;
- workspace membership and document collaboration rights;
- legal-source provenance, versions, verification state, and editor decisions;
- AI system instructions, provider credentials, model configuration, and cost limits;
- staff privileges, support access, lawyer grants, and conflict checks;
- append-only consent/access/security/cost evidence;
- D1, R2, Queue, Vectorize, backup, and deployment controls.

## Trust boundaries

```mermaid
flowchart TD
    U["User browser"] --> E["Cloudflare edge / Worker"]
    S["Staff or lawyer browser"] --> E
    E --> D["D1 authorization and records"]
    E --> R["Private R2 files"]
    E --> Q["Queues and scheduled jobs"]
    Q --> P["OpenAI / Anthropic / Resend / scanner"]
    Q --> V["Vectorize legal and user indexes"]
    E --> P
    L["LexUZ / AdviceUZ public sources"] --> Q
```

Every boundary assumes incoming identifiers and document text are untrusted. Vector metadata filters and provider output are not authorization decisions.

## Primary threat actors

- unauthenticated abuse and credential/OTP enumeration;
- authenticated user attempting cross-account or cross-workspace access;
- invited collaborator before acceptance or after revoke;
- malicious uploaded document/archive or prompt-injection payload;
- compromised account, lawyer, support, or administrator;
- malicious or compromised upstream/source page;
- provider outage, malformed output, or unexpected logging;
- accidental operator deployment, migration, or secret exposure;
- automated cost exhaustion and queue replay.

## Threat register

| ID | Threat | Current exposure | Required controls |
|---|---|---|---|
| T-01 | OTP enumeration/brute force | local atomic claims and disabled keyed evidence exist; independent limits, Turnstile, remote activation, and legacy-digest drain are absent | generic response, Turnstile, per-email/IP limits, staged HMAC activation, atomic attempts/lock |
| T-02 | session fixation/replay | local device/session revocation foundation exists; rotation, remote evidence, regional signals, and security mail remain absent | rotation, staged device/session tests, security-event revoke, one/all logout, alerts |
| T-03 | IDOR/cross-tenant access | confirmed builder listing and invitation gaps | central object authorization, active-workspace scope, negative matrix, neutral response |
| T-04 | invitation/token replay | acceptance is not consistently atomic | one-time conditional consume, expiry, email binding, resend invalidation |
| T-05 | CSRF | optional Origin check and static header | strict same-origin policy, CSRF token/binding, safe method/content checks |
| T-06 | XSS from AI/document text | rich content paths and permissive inline CSP need review | text-first rendering, sanitizer allowlist, CSP hardening, adversarial tests |
| T-07 | malicious file/polyglot/archive | no quarantine/scanner pipeline | magic bytes, archive limits, scan, quarantine, fail closed |
| T-08 | SSRF/public URL fetch | target URL ingestion not yet built | scheme/domain/IP checks, DNS recheck, redirect/size/time limits, no credentials |
| T-09 | prompt injection/tool abuse | documents can reach provider without a dedicated guard | untrusted-content boundary, fixed tool allowlist, no document-directed tools/secrets |
| T-10 | fabricated/outdated legal basis | exact-host allowlist is implemented; citation/version validator and ingestion remain absent | keep allowlist protected; add exact citation/version checks, freshness and historical applicability |
| T-11 | vector cross-tenant leak | user index absent, target risk high | physical environment isolation, pre/post D1 auth, metadata filters, leak tests |
| T-12 | secret/log leakage | no values found; runtime inventory incomplete | secret store, generated type/config validation, redaction, bundle/history/log scans |
| T-13 | provider payload retention | direct calls and gateway policy unverified | data minimization, payload-log opt-out, privacy disclosure, protected diagnostics |
| T-14 | queue replay/double charge | queues/ledger absent | idempotency keys, unique ledger constraints, terminal job state, DLQ |
| T-15 | cost exhaustion | no complete usage/circuit-breaker service | per-feature/user/workspace limits, anomaly alerts, emergency kill switch |
| T-16 | destructive deletion/evidence loss | hard delete and cascading audit confirmed | soft delete, delayed purge, immutable evidence, protected export |
| T-17 | backup/migration corruption | in-D1 copies only; no restore evidence | external export, integrity check, isolated restore rehearsal, rollback trigger |
| T-18 | privileged insider misuse | admin/support suite and 2FA absent | least roles, mandatory TOTP, immutable view/download/edit audit, immediate revoke |
| T-19 | weak signature representation | evidence package incomplete | explicit method labels, version/file hashes, consent/OTP/device evidence |
| T-20 | public status/info disclosure | status unavailable | high-level component states only; exclude topology, IDs, incident attack details |
| T-21 | canonical email takeover | local dual-address proof and one-winner rotation exist; no remote D1/two-mailbox evidence or security alert | fresh MFA session, current/new mailbox proof, uniqueness fence, revoke other sessions/devices, immutable audit, prior-address alert |

## Security invariants

1. Client-provided `userId`, `workspaceId`, `caseId`, `chatId`, `analysisId`, `documentId`, and access tokens are never sufficient authorization.
2. An invitation grants no content access until atomically accepted by the matching email identity.
3. A file never reaches an AI provider before verified `safe/ready`.
4. Provider output never changes authorization, source allowlists, or protected safety rules.
5. A legal finding is not “confirmed” without an existing, applicable, server-verified source.
6. A repeated request/job/message cannot double-charge or repeat a side effect.
7. Secrets and encryption keys never reach the browser, provider context, logs, analytics, screenshots, or generated documents.
8. Deletion hides content immediately while required minimized evidence remains tamper-evident.
9. Staff/lawyer content access always requires a current role/grant and produces immutable audit evidence.
10. Production migration/deployment requires verified backup, rollback, staging evidence, and explicit approval.
11. Canonical email change requires proof from both current and proposed
    addresses, preserves only the verified current session, and cannot succeed
    twice or without immutable audit evidence.

## Abuse and crisis considerations

- progressive defenses: Turnstile, rate limit, scoped temporary pause, notice, alert, review;
- forged documents, backdating, evidence destruction, tax evasion, and court deception are rejected with lawful alternatives;
- urgent criminal/deadline/violence/self-harm flows prioritize immediate safe steps and professional help;
- the general platform must not expose hidden restriction reasons or other tenants’ existence.

## Verification strategy

- unit tests for crypto, validation, policy, source and job invariants;
- integration tests with real local/staging D1/R2/Queue bindings;
- concurrency tests for OTP, email change, invitations, signatures, usage, and
  queue replay;
- IDOR matrix across every profile/workspace/object route;
- file/ZIP/polyglot/SSRF/prompt-injection corpus;
- browser CSRF/XSS/CSP/accessibility tests;
- Vectorize pre/post-authorization leak tests;
- secret scans across source, history, bundles, artifacts, logs, and docs;
- backup and rollback rehearsal against isolated staging resources.
