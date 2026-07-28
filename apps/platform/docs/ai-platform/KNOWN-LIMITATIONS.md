# JURO known limitations checkpoint

Updated: 2026-07-28
Scope: current integration branch after the first local Phase 3 legal-source
foundation checkpoint.

## Release blockers

- migrations `0022`–`0026` have not been applied to `juro-staging`; the
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
- local test totals (25 rendered route + 216 core + 63 Cloudflare = 304) are
  not remote D1, live-provider, or protected staging browser evidence.

## Legal-source acquisition gaps

- the Lex fetch contract is locally tested with synthetic upstream responses;
  it has not fetched a live Lex page from a Worker, stored a remote R2 object,
  or passed staging network/robots/latency checks;
- Advice ingestion is deliberately disabled in every environment because this
  checkpoint did not establish sufficiently explicit broad-use authorization;
- no discovery crawler, sitemap traversal, parser, historical diff, section/
  chunk creation, Vectorize write, lexical index, citation validator, reviewer
  authorization route, legal editor, Cron, Queue consumer, DLQ, or alert is
  active;
- raw public-source HTML currently shares the existing private `BUCKET`
  binding under a content-addressed `legal-sources/raw/` prefix. A dedicated
  source bucket is not claimed and would require an inventoried Cloudflare
  resource plus binding/deployment review;
- the fetcher intentionally rejects any positive `Crawl-delay` directive
  until durable host-rate scheduling exists; it does not sleep inside a Worker;
- stored HTML is untrusted data and is neither parsed nor sent to an AI model
  in this checkpoint.

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

## Legal knowledge gaps

- migrations `0025`–`0026` and the trust filter are local-only; no remote
  legal-source schema, fetch request, R2 evidence object, or source record was
  created;
- one exact-page fetch adapter, robots/rate-policy enforcement, and private
  content-addressed R2 write contract are implemented locally, but no bulk
  discovery crawler, parser, Advice scenario model, historical diff,
  privileged review UI, Vectorize indexing, lexical retrieval, reranking, or
  citation validator is implemented;
- no Cron or Queue consumer is attached, and a passing one-active-sync lock
  test is not evidence that synchronization runs;
- source freshness and language-priority rules still need legally approved
  configuration. Consequently no AI legal answer may be described as
  legislation-verified by this checkpoint.
