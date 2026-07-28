# JURO known limitations checkpoint

Updated: 2026-07-28
Scope: current integration branch after the local Phase 2 identity/workspace
checkpoint.

## Release blockers

- migrations `0022`–`0024` have not been applied to `juro-staging`; the
  staging ledger remains exactly `0000`–`0021`;
- a portable D1 export/import rehearsal and protected backup object remain
  unverified, so the consumed verified-empty bootstrap exception cannot be
  reused for these migrations;
- no staging Worker, route, DNS, runtime binding, secret/configuration set, or
  deployment has been verified; Wrangler authentication remains blocked;
- `TURNSTILE_SECRET_KEY` and public `TURNSTILE_SITE_KEY` are absent from the
  inspected remote surfaces; no live Siteverify or client-widget flow exists;
- Resend API code exists, but real OTP mailbox delivery, sender/domain
  authorization, and provider-failure behavior have not been verified live;
- local test totals (25 rendered route + 204 core + 59 Cloudflare = 288) are
  not remote D1, live-provider, or protected staging browser evidence.

## Identity and session gaps

- session-token rotation, fixation/replay detection, approximate location,
  new-device/region security email, and security-event-triggered revocation
  remain incomplete;
- the 24-hour/30-day session choice is locally tested, but remote cookies,
  persisted expiry, idle expiry, and MFA completion have not been exercised
  through staging HTTP;
- Turnstile, independent rate limits, and the 15-minute verification lock are
  source/test facts only until the bindings and migration `0023` are active in
  protected staging;
- generic anti-enumeration behavior still requires full external timing and
  response-parity verification.

## Workspace invitation gaps

- the one-winner acceptance claim is local-only until migration `0022` is
  applied and the full route is tested against remote D1;
- `workspace_audit_events` is not a general append-only/tamper-evident ledger;
- acceptance redirects to `/:locale/:accountType/main`; the target business
  URL still lacks the required `workspaceId` segment;
- the owner/member model and invitation flow do not prove tenant isolation for
  every object domain.

## Broader Phase 2 gaps

- canonical localized root/auth/onboarding routing, Uzbek-default behavior,
  structured personal-profile completion, and persona-preserving workspace
  selection are implemented locally but remain unstaged; the `/main` to
  `/dashboard` migration, business `workspaceId` routes, policy approval,
  deletion purge/recovery, and externally reachable staff administration are
  not complete;
- the local staff-role foundation remains deliberately unreachable and has no
  operator bootstrap or customer-resource access grant;
- no production behavior or UI was replaced, and no production migration or
  deployment is authorized by this checkpoint.
