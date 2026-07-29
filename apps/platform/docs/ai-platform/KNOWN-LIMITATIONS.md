# JURO known limitations checkpoint

Updated: 2026-07-29
Scope: current integration branch after the first local Phase 3 legal-source
foundation checkpoint.

## Release blockers

- migrations `0022`–`0029` are applied to `juro-staging`; migration-specific
  full/schema/data exports, private-R2 round trips, and the disposable remote-D1
  restore drill pass. Operational RTO/RPO under representative load remains
  unverified;
- the protected staging Worker, custom domain, exact resource bindings, public
  Turnstile site key, and three server-only secret binding names are verified;
  Queue consumers, schedules, async feature activation, and staff APIs remain
  deliberately disabled;
- Cloudflare Access is enabled with a staging-only owner policy and anonymous
  requests are denied before application content with a no-store redirect;
- aggregate D1 evidence shows three provider-accepted and consumed OTP
  challenges, but it is not correlated with a captured current-version
  browser run, recipient mailbox evidence, or the provider-failure matrix;
- `IDENTITY_PROTECTION_MODE` remains `legacy`: the single staging profile and
  all three retained OTP challenges have zero protected/keyed evidence. The
  guarded dual-write/backfill/verification gate remains a release blocker;
- local test totals (27 rendered route + 265 core + 76 Cloudflare = 368),
  remote schema checks, and the currently deployed Worker are not a substitute for
  the exact current-version authenticated browser/cookie/replay flow. The
  available browser-control runtime currently exits during startup because its
  generated CommonJS kernel is treated as ESM by a user-home package boundary;
  Access was not bypassed and this gate remains open.

## Legal-source acquisition gaps

- the Lex fetch contract is locally tested with synthetic upstream responses;
  a read-only local live probe failed closed at `robots.txt` with
  `LEGAL_SOURCE_ROBOTS_UNAVAILABLE` before the act body, R2, or D1; no Worker
  has fetched a live Lex page or passed staging network/robots/latency checks;
- Advice ingestion is deliberately disabled in every environment because this
  checkpoint did not establish sufficiently explicit broad-use authorization;
- no discovery crawler, sitemap traversal, historical diff, replacement-version
  activation, Vectorize write, lexical index, citation validator, staff UI,
  legal editor, Cron, Queue consumer, DLQ, or alert is active; the three local
  reviewer/publisher HTTP routes are pinned off by
  `LEGAL_SOURCE_STAFF_API_ENABLED=false` in every environment and have no
  remote or browser evidence;
- raw public-source HTML currently shares the existing private `BUCKET`
  binding under a content-addressed `legal-sources/raw/` prefix. A dedicated
  source bucket is not claimed and would require an inventoried Cloudflare
  resource plus binding/deployment review;
- the fetcher intentionally rejects any positive `Crawl-delay` directive
  until durable host-rate scheduling exists; it does not sleep inside a Worker;
- stored HTML remains untrusted. A deterministic bounded parser now creates a
  separate private normalized JSON snapshot. A reviewed snapshot can now be
  published locally as immutable reading rows, but nothing is remotely active,
  indexed, retrieved, cited, or sent to an AI model.

## Identity and session gaps

- migration `0029` is applied in staging and MFA-elevation/MFA-disable rotation
  is deployed. Email-change rotation, encrypted prior-address notification, and
  12-hour periodic token rotation now pass locally but are not deployed. The
  periodic path is integrated through a delayed, jittered application-shell
  scheduler and a same-origin/CSRF route; its 30-second grace rejects an
  in-flight retired token without revoking the replacement, then restores the
  strict replay-revocation boundary. Continuity-backed new-device and conservative
  comparable-region email jobs now pass locally, but exact protected-staging
  HTTP/cookie/replay evidence, migration `0032`, and real security-mail delivery
  remain incomplete;
- the 24-hour/30-day session choice is locally tested, but remote cookies,
  persisted expiry, idle expiry, and MFA completion have not been exercised
  through staging HTTP;
- Turnstile and live independent rate-limit behavior remain source/test facts;
  the immutable 15-minute verification-lock schema from `0023` is active in
  staging but has not been exercised through protected staging HTTP;
- generic anti-enumeration behavior still requires full external timing and
  response-parity verification.

## Workspace invitation gaps

- the one-winner acceptance claim schema from `0022` is active in staging, but
  the full route and remote concurrency behavior remain untested over HTTP;
- `workspace_audit_events` is not a general append-only/tamper-evident ledger;
- business acceptance now redirects to the workspace-aware canonical URL,
  but authenticated remote invitation/switch/browser evidence for the current
  staging version remains open;
- the owner/member model and invitation flow do not prove tenant isolation for
  every object domain.

## Broader Phase 2 gaps

- canonical localized root/auth/onboarding routing, Uzbek-default behavior,
  structured personal-profile completion, persona-preserving workspace
  selection, canonical business `workspaceId` routes, and the tested
  `/main` to `/dashboard` migration are deployed on protected staging; authenticated
  staging browser evidence, policy approval, deletion purge/recovery, and
  externally reachable staff administration are not complete;
- the local staff-role foundation remains deliberately unreachable and has no
  operator bootstrap or customer-resource access grant;
- no production behavior or UI was replaced, and no production migration or
  deployment is authorized by this checkpoint.

## Legal knowledge gaps

- migrations `0025`–`0028` are active in staging and the trust filter remains
  application-local; no legal-source fetch request, raw evidence object,
  source record, published row, vector, or retrieval result was created;
- one exact-page fetch adapter, robots/rate-policy enforcement, and private
  content-addressed R2 write and pre-verification normalization contracts are
  implemented locally; a protected review/publisher UI now exists behind the
  exact false feature flag, but no bulk discovery crawler, Advice scenario
  model, historical diff, replacement-version activation, Vectorize indexing,
  lexical retrieval, reranking, or citation validator is implemented; the
  first-version publisher remains externally unreachable;
- no Cron or Queue consumer is attached, and a passing one-active-sync lock
  test is not evidence that synchronization runs;
- published rows are intentionally immutable, but a protected withdrawal/
  supersession flow and replacement-version activation model do not yet exist;
  therefore the local publisher must remain unreachable in staging;
- source freshness and language-priority rules still need legally approved
  configuration. Consequently no AI legal answer may be described as
  legislation-verified by this checkpoint.

## Staff inbox gaps

- `LEGAL_SOURCE_STAFF_API_ENABLED` remains false in every checked-in
  environment, so neither the page nor its API is remotely reachable;
- the staging Worker has an owner-only Access boundary, but no reviewer
  account/assignment bootstrap or enabled staff feature route exists;
- local service and HTTP tests do not replace keyboard, screen-reader, 200%
  zoom, forced-colors, touch, or real-device review of the staff surface;
- review withdrawal, reassignment, supervisor override, replacement-version
  activation, and published-source supersession are not yet implemented.

## Builder and browser gaps — 2026-07-29

- The canonical RU/UZ builder library, category, generic template and route
  transitions are verified in protected staging.
- the current protected staging deployment now contains UZ Latin copy for
  documents, contacts, and notifications, but it has not yet received a new
  authenticated browser pass; control-plane deployment evidence alone must not
  be used to claim those three screens are visually verified.
- The attached authenticated Chrome surface was fixed at a desktop viewport.
  The 320/360/390/768/1024 responsive matrix, 200% zoom, reduced motion,
  forced colors, screen reader, and real touch-device verification remain
  open.
- A provider-accepted and consumed OTP state exists in staging, but the current
  auth UI/Turnstile/mailbox flow and negative-provider cases remain unverified
  as one correlated browser trace.

## Remaining builder language gaps

- User-authored document titles, participant names, and legacy stored category
  values are displayed as stored and are not machine-translated.
- Server-originated document-builder error messages and notification payloads
  may still be Russian; the new copy contract covers the client workspace UI,
  not every backend error or historical notification record.
- The specialized receipt builder still needs a separate UZ Latin interface
  pass; its Uzbek Cyrillic document-output option is not a substitute for UZ
  Latin application UI.

## Login device and region limitation — 2026-07-29

The local branch now has an opaque device-continuity cookie backed only by a
user-bound versioned HMAC in D1. It is not an authentication factor and does not
prove hardware identity, physical location, or control by the same person. A
missing identity keyring omits continuity rather than creating an unkeyed
fallback. Coarse country/region and bounded User-Agent evidence remain risk
signals only.

The local policy now alerts on a genuinely new continuity record and on a coarse
country/region change only for an already recognized device with comparable
previous/current evidence. Registration, User-Agent change, missing location,
and incomplete location do not alert. A generic encrypted job, identifiers-only
outbox, RU/UZ copy, one-winner provider idempotency, and atomic session rollback
are covered locally.

This does not prove physical location or compromise. Travel, carrier routing,
VPNs, cookie clearing, and stolen continuity cookies can still create false
positives or influence novelty. Migrations `0030`–`0032`, the reviewed email
consumer, real Resend delivery, DLQ/redrive, and protected primary/MFA HTTP flows
are not deployed or verified in staging. The currently deployed Worker does not
contain this local slice, and production is unchanged.