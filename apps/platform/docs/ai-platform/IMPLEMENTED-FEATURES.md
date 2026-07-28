# JURO implemented-features checkpoint

Updated: 2026-07-28
Scope: verified local source and tests on the integration worktree. This is not
staging or production evidence.

## Phase 2 identity and workspace slices

| Slice | Locally implemented and tested | Not yet proved |
|---|---|---|
| Workspace invitation acceptance | Strict bounded RU/UZ input; exact token/identity binding; migration `0022` unique immutable claim; one D1 batch for claim, membership, default-workspace, and audit; one winner under concurrency; existing owner role preserved; rollback on audit failure | Remote migration `0022`; protected staging HTTP flow; broader append-only workspace audit; business route containing `workspaceId` |
| OTP request limits | Separate `5/email/hour` and `20/IP/hour` gates; retained lookup-key versions share buckets; invalidated provider failures count toward email limits; missing connecting IP does not merge unrelated users; 60-second resend cooldown retained | Remote D1 behavior; live traffic/rate behavior; enumeration parity through protected staging |
| OTP verification lock | Migration `0023` adds immutable `verification_locked_until`; fifth wrong attempt applies a 15-minute lock; replacement challenge is denied while locked | Remote migration `0023`; full-HTTP remote concurrency and lock timing |
| Turnstile | Server Siteverify integration with action `auth_otp`, exact hostname, optional remote IP, eight-second timeout, schema validation, and fail-closed invalid/unavailable handling; client widget integrated into auth flow | Real site/secret bindings, hostname configuration, provider response, browser widget, and Resend mailbox flow in staging |
| Session persistence | 24-hour default and 30-day explicit remember-me absolute lifetimes; aligned cookie `Max-Age` and D1 expiry; same choice after OTP or MFA; strict boolean inputs with false default; existing seven-day idle cap | Remote cookie/session behavior; rotation, fixation/replay detection, region signals, and security email |
| Structured onboarding | Canonical `/:locale/onboarding`; strict 4 KiB Zod input; required separate names, normalized phone with explicit unverified evidence, personal persona, primary goal, and exact current policy digests; deterministic personal workspace creation | Remote migration `0024`; protected staging browser flow; final policy approval; phone verification |
| Localized auth and persona routing | Canonical RU/UZ login/register routes; guest root defaults to Uzbek; registration personas are individual, entrepreneur, or lawyer; workspace switches preserve the stored persona; legacy builder redirects preserve supported personas | Staging HTTP/browser evidence; business `workspaceId` route; planned `/main` to `/dashboard` migration |

## Evidence checkpoint

The latest recorded successful local full suite contains:

- 25 rendered-route/security tests;
- 204 core/auth/document tests;
- 59 Cloudflare/migration/job tests;
- 288 tests total.

This evidence includes local migration/schema contracts and service-level
concurrency/rollback paths. It does not substitute for remote migrations,
live provider calls, a deployed staging Worker, or browser E2E on a protected
staging hostname.

## Deployment truth

- production was not changed;
- `juro-production` and `juro-development` remain through migration `0004`;
- `juro-staging` remains through migration `0021`;
- source migrations `0022`–`0024` are local-only;
- no staging Worker, route, DNS, Turnstile binding, secret configuration, or
  deployment is verified;
- live Turnstile and Resend delivery are unverified.
