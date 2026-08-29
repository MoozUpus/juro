# Full platform audit

**Audit date:** 2026-08-29
**Branch:** `codex/investor-ready-ecosystem`
**Current production checkpoint:** Worker 170
`8a51f26c-2011-4ea0-a8f9-2e5a80316ce6`, deployment
`8dc989ba-014b-4a40-87e5-d017d8a4488e`, 100% traffic. Its route matrix,
authenticated Client 390/320 px and keyboard/dialog replay, exact-source CI and
the recovered scheduled `/api/status` snapshot passed after deployment; Worker
169 is the immediate application rollback.

**Privacy-safe product KPI candidate:** the protected RU/UZ Admin dashboard now
computes mature signup activation, TTFV, plan completion, lawyer-request
acceptance, 7-day engaged return and the exact first-question → validated answer
→ authorized source-open funnel inside D1 without returning identifiers or
content. Commit `8602e410` defines return as a new explicit action on a later UTC
day, excluding session refresh and passive reads. Migration 0164 prepares a
compatible first-directory-view to 7-day request cohort with one content-free
daily row; account purge deletes it and old Analytics Engine occurrences are not
misrepresented as users. Commit `c0f9c372` and migration 0165 add one
content-free, owner-bound row per actor/answer; repeat source opens cannot inflate
the numerator and account purge removes them. Commit `3101525c` adds a 30-day
user-reported error rate from the existing durable feedback rows, counting one
type per answer and never reading comments or answer content. `outdated` stays a
user signal rather than verified source-state evidence. Commit `e452b3ae` adds
actor-level lawyer escalation after each actor's first-ever grounded answer,
completed analysis or case creation; only a same-actor request within seven days
converts. Legal evaluation, investor demo and active staff are excluded; rates
suppress below five and readiness requires 30. Focused KPI 5/5, combined
KPI/purge 15/15, core 1138/1138,
Cloudflare/infrastructure 203/203, rendered Worker 35/35,
type-check, lint, ordered migration/FK checks and artifact validation passed;
Worker entry is 3720.5/6144.0 KiB. Existing protected-boundary Chrome evidence
remains valid without a fabricated staff identity. The original read-only
production replay found 2/10 activated; the return replay read 417 rows, wrote
zero and found 2/9 activated with 0 returning, so the rate remains
privacy-suppressed. Browse conversion awaits deployment and observation. The
answer replay read 2,142 rows and wrote zero: 5 first-question actors and 0
validated source-backed completions. All five had exact completed structured
responses, but zero passed the strict source-validation contract. Source-open
conversion awaits 0165 and a full observation window. The candidate and
migrations 0164/0165 are unpublished and do not prove retention, conversion or
product-market fit. The read-only feedback replay at
`2026-08-29T12:49:08.640Z` read four rows, wrote zero and found an empty 30-day
denominator, so the dashboard correctly reports `NO DATA`, not a zero error
rate. The lawyer-escalation replay at `2026-08-29T13:13:11.194Z` read 272
rows, wrote zero and found three eligible actors, zero escalations and a 1/1/1
first-outcome split across grounded answer, completed analysis and case. The
rate is privacy-suppressed rather than published as 0.0%.

**Current Anthropic recovery:** after the owner replenished the account, the
production snapshot generated at `2026-08-29T11:14:32.854Z` was operational
with no active incident. The content-free Anthropic probe passed at
`11:10:56.708Z` in 4,810 ms with no safe error; document analysis also remained
operational. This is read-only current evidence, not a release.

**Compact conversation-context candidate:** commit `c7c6d35e` keeps the latest
three branch-local turns, deterministically summarizes up to five redacted older
turns, and explicitly omits the remainder from the already bounded 12-turn
history. Rewrite, planning, OpenAI and Anthropic share the compact context; no
new provider/D1 read is added and current verified sources remain authoritative.
The prompt registry now records legal-chat v3 with an explicit v1 → v2 → v3
chain. Focused 20/20, core 1129/1129, Cloudflare/infrastructure 203/203,
rendered Worker 35/35, type-check, lint and production artifact validation
passed; Worker entry is 3656.7/6144.0 KiB. One synthetic fixture reduced
serialized characters 15,931 → 6,155 (61.36%), which is not provider-token,
billing, latency, quality or production-cost evidence. The candidate is
unpublished and the 30% target remains `UNVERIFIED`.

**Anthropic prompt-cache candidate:** commit `d1da89a1` marks only the static
code-owned system block for an explicit five-minute cache; user questions,
history, memories, source packets and documents remain outside the breakpoint.
Provider-reported cache reads and writes are counted separately, migration 0163
retains content-free write-token evidence, and the 1.25x five-minute write rate
is applied with integer cost arithmetic. Focused cost 8/8 and provider 15/15,
full core 1128/1128, Cloudflare/infrastructure 203/203, rendered Worker 35/35,
type-check, lint and production artifact validation passed; the Worker entry is
3652.5/6144.0 KiB and all emitted-asset budgets remain within their limits. The
candidate is unpublished, migration 0163 is excluded from production
configuration, and real cache/cost improvement plus the overall 30% target
remain `UNVERIFIED`.

**Admin AI cost-observability candidate:** commit `a08698df` adds content-free
cost views by technical user/workspace and current subscription plan, plus
provider failure rate, average recorded latency, request cache-hit rate,
cached-token share, Deep escalation and provider fallback. Plan attribution is
labelled as a read-time snapshot; Deep/fallback rates use only completed
authenticated legal-chat runs. Focused 6/6, core 1124/1124,
Cloudflare/infrastructure 203/203, rendered Worker 35/35, type-check, lint and
production artifact budgets passed. No real Admin/MFA session was available,
so protected UI replay is not claimed. This candidate is not deployed and does
not change the 4/30 production sample or the `UNVERIFIED` 30% reduction target.

**Scoped AI budget candidate:** commit
`f312a930e9e93a690a71ad963ea0ff59ab1a4ab6` adds independent daily/monthly
budgets for technical users and allowlisted AI features. Operator actions are
alert-only, Deep-only disablement, or scoped hard blocking; no limit is seeded.
Migration 0162 preserves immutable policy/threshold evidence and idempotent,
identifiers-only delivery state. Unpriced usage alerts without fabricated cost
or a false monetary breach. Focused 3/3, full core 1127/1127,
Cloudflare/infrastructure 203/203, rendered Worker 35/35, type-check, lint,
migration integrity and production artifact validation passed. This is a
request-boundary control, not a provider billing hard cap, and concurrent
in-flight calls may overshoot. The internal legal-corpus path was not changed.
Migration 0162 remains excluded from production configuration; no release,
threshold or external mutation occurred, and the 30% target is still
`UNVERIFIED`.

**Public Sites checkpoint:** a read-only Chrome replay of live v86 preserved
the RU/UZ/EN SEO/document structure but found stale accessibility defects:
sub-12 px labels, 32 px theme targets, a closed-menu dangling `aria-controls`,
a duplicate accessible scrim closer and skip-link activation without main
focus. Commit `7e07b56280116bc2494223c7c9e650dc30535fff` fixes those findings in
source and passes the 48/48 functional suite, 56/56 axe/Chrome matrix,
lint, type-check, artifact validation and manual 320/390/981/1101 px Chrome
samples. Exact-source CI `33217112257` passed Website in 1m59s and Platform in
8m54s. It is not deployed; Sites v86 remains live pending an explicit publish
instruction. Follow-up commit
`1e25c1aeaedad1daff964d1cc08714bece814bee` expands the exact-build release
gate to all required 320/360/375/390/393/430/768/1024/1280/1440/1920 px
widths. The final source passed 49/49 functional/route tests, 56 full axe
route/profile combinations, 189 additional localized route-width checks,
seven compact-menu scenarios, lint, type-check and artifact validation. It
also closes the newly detected 320 px CTA clipping and Vinext `.rsc` locale
hydration defects. Exact-source CI `33220671747` passed Website in 3m58s and
Platform in 8m17s. This follow-up is also unpublished.

**DNS checkpoint:** a read-only authenticated Cloudflare dashboard pass at
`2026-08-28T23:55Z` enumerated all 22 DNS rows: 3 A, 2 CNAME, 4 MX, 6 TXT and
7 Worker records; 10 were proxied and 12 DNS-only. The seven Worker rows and
two zone routes matched independent control-plane API reads. The Wrangler OAuth
token still receives 403/code 10000 from the DNS-record endpoint, but that no
longer prevents a complete record-count/type/status inventory. Cloudflare
shows one partially exposed origin-IP recommendation. It remains an explicit
infrastructure review because FTP/mail ownership must be established before
any proxy change. No DNS mutation was made.

**Security candidate:** Codex Security scan
`aacf0487-aae5-4c8f-a527-8f3efc70cb76` targeted immutable source
`3a30042c096f5aca91c3852a6998b7ddcd452025` and reported zero Critical, zero
High and six validated Medium findings. Candidate `695693f3` remediates all six
across workspace write roles, collaborator attachments, lawyer access grants,
Builder upload quarantine, DOCX expansion and guest-AI cost controls. Evidence
HEAD `1ee3047b` passed 774/774 selected non-legislation tests, rendered Worker
HTML 35/35, local release gates and exact-source CI `33227714329` (Website
3m50s, Platform 8m14s). The candidate is not deployed; see
[`security-scan-3a30042c.md`](./security-scan-3a30042c.md).

**AI reasoning candidate:** commit
`1ed175014d4255217444c538d3e8d7ae87b8dd9f` adds explicit Fast, Balanced and
Deep legal-AI profiles, makes Balanced the normalized default, preserves the
bounded Anthropic fallback and keeps guest/synthetic probes Fast. Migration
0161 extends telemetry to the three-mode contract while preserving rows and
append-only guards. Local focused 8/8, core 1114/1114,
Cloudflare/infrastructure 203/203, rendered Worker 35/35, static/build/artifact
gates and isolated RU/UZ Chrome at 1024/700/390/320 px passed. Exact-source CI
`33230331239` passed Website in 3m32s and Platform in 8m45s. This candidate and
its migration are not deployed; production remains Worker 170 and Sites v86.

**Admin AI routing-transparency candidate:** commit
`6bb8d607dfaead59fa345468ccf0ec56afe16016` makes runtime execution, Anthropic
fallback, run reservation and the protected localized Admin summary share one
mode-routing contract. The cards expose active models, Balanced default,
reasoning effort, bounded time/output controls and the shared 30-second
deadline; history exposes chat, Deep and fallback models. Focused 6/6, core
1114/1114, Cloudflare/infrastructure 203/203, rendered Worker 35/35,
type-check, lint and artifact budgets passed. The CSS budget is tight at
596.6/600.0 KiB. No real Admin/MFA session was available, so protected browser
verification is not claimed. The candidate is not deployed.

**Admin AI prompt-registry candidate:** commit `9eee8d54` centralizes the
current prompt identities for authenticated chat, guest chat and document
analysis. Their persisted run hashes and the protected localized Admin console
share the same code-owned registry. Admin exposes only version IDs, the
review/evaluation gate and links to existing cost, quality, emergency-control
and provider-health surfaces; prompt text and secrets remain server-side. RU/UZ
copy truthfully records that no A/B prompt experiment is active. Follow-up
`2a57cc88` adds a git-source-backed history for the three current identities and
superseded legal-chat v1. Candidate `c7c6d35e` advances legal chat to v3 compact
context and completes the exact v1-to-v2-to-v3 replacement chain. Focused
conversation/prompt coverage is 20/20, core 1129/1129,
Cloudflare/infrastructure 203/203, rendered Worker 35/35, type-check, lint and
production artifact budgets passed. This is a code-owned release history, not a
mutable D1 prompt ledger, and no signed-in Admin browser replay is claimed. The
candidate is not deployed.

## Current production recovery

Worker 161 safely classified the repeated Anthropic HTTP 400 as
`PROBE_PROVIDER_HTTP_400_INVALID_REQUEST_ERROR_CREDIT_BALANCE_LOW`. The raw
provider message, prompts and secrets were not logged. After the account balance
was restored, fresh production probes recorded Anthropic operational at
`2026-08-28T06:47:17.754Z`. Following the owner's latest top-up report, the
newer status snapshot generated at `2026-08-29T11:14:32.854Z` remained
operational with no active incident. Anthropic passed at `11:10:56.708Z`
(4,810 ms, no safe error), OpenAI passed at `11:10:51.650Z`, and document
analysis remained operational at `10:56:05.105Z`. The exception is closed by
live provider evidence rather than by the balance action alone.

The same recovery window exposed a separate P1 operational defect: Lex RSS
delivery-time churn had generated repeated metadata changes and 222,329
historical `legislation_monitor` notifications. Worker 162 uses a stable
title/URL fingerprint, deterministic event and notification IDs, one atomic
per-recipient digest per run and a bounded dashboard count. Its first retry
processed 40/40 entries with `changed=0`, `error=0`; the notification count did
not grow. Authenticated Chrome shows `99+` with the accessible label `Более 99
новых событий`. Historical rows and user read state were not deleted or edited.

Worker 163 closes the follow-on cadence gap. Monitoring preferences now drive
real `immediate`, `daily` or `weekly` delivery windows through the existing
five-minute scheduler. Legacy null cursors initialize at a one-minute-safe
cutoff without sending old events; due delivery creates the in-app digest and
advances its cursor in one D1 batch with a deterministic digest ID. The first
production run initialized all four existing daily/weekly cursors. A second
completed run left every cursor and the 222,329 historical-notification count
unchanged, proving the no-event path is idempotent. Worker 164 then added a
dedicated, identifiers-only monitoring-email job/outbox with delivery-time
identity, membership, preference and source checks. Migration 0160 and two
post-release scheduler windows passed without historical replay or a forced
customer email.

Worker 165 adds the Admin-only AI cost measurement gate and makes missing
automatic cost-guard policies explicit. The current post-price window contains
four priced successes, zero unpriced successes, two zero-token failures and
`$0.104549` estimated cost. Pricing coverage is 100%, but the sample is only
4/30; the target 30% reduction remains `UNVERIFIED`. No arbitrary production
budget threshold was created. Anthropic's latest content-free probe remained
operational after the balance restoration.

The original screenshot route is not part of the outage. A fresh raw probe
returned private/no-store `307` from
`lawyer.juro.uz/ru/individual/dashboard` to the exact app path, and isolated
Chrome rendered the localized Client login instead of plaintext `Not Found`.
No migration, D1 mutation, DNS or Sites release was made for Worker 165. Sites
v86 remains live, saved v94 remains unpublished, and Worker 164 is the
immediate application rollback. That rollback preserves monitoring cadence and
email delivery but removes the cost measurement readiness UI and the explicit
unconfigured-policy warning.

Workers 166–168 supersede that historical checkpoint. Worker 166 normalized
the privacy-safe Analytics Engine dimensions and feedback outcome. Worker 167
removed the obsolete Client-login pseudo-element and reduced the measured
mobile CLS baseline from 0.2779 to 0.0462 in production. Worker 168 restored a
visible shared-color focus outline to the labelled Client dashboard composer;
the exact CI, 100% deployment, production Tab/Enter/Tab replay and fresh 8/8
operational status passed. No D1, DNS, notification or Sites change was part of
Workers 166–168; Sites v86 remains live.

Workers 169–170 close the next authenticated Client shell findings. Worker 169
made the search `aria-controls` reference conditional and raised explicit
10–11 px Client shell/search/dashboard labels to 12 px. Production Chrome then
revealed that the open mobile menu still exposed both its real close button and
the full-screen pointer scrim under the same accessible name. Worker 170 keeps
the real close button and removes only the scrim from accessibility and tab
order. Exact CI `33208687185`, 100% deployment, authenticated 390/320 px,
search focus wrap, menu Escape/focus return and skip-link replay passed. The
first scanner probe was degraded, but the next scheduled probe recovered
without intervention; both status hosts then agreed on 8/8 operational and
zero incidents. Sites v86, DNS, D1/migrations and notification state were not
changed.

## Executive outcome

JURO is a real multi-tenant product spanning public acquisition, citizen and
business workspaces, lawyer operations, administration, legal-source retrieval,
documents, cases and AI. The audit did not treat successful builds or polished
screens as proof. Security, database, source, pricing, deployment and browser
evidence are separate gates.

The hardened release, analytics/cost follow-up and public dependency-hardening
follow-up are live and CI-green.
Commit `f42c48fc` adds privacy-safe product measurement, explicit OpenAI
non-storage, current provider pricing support, and durable
AI/source/design/audit documentation. Its full suite, database backup/config
gate, Worker and Sites deployment, production boundary checks, crawl and health
verification completed. The remaining limitations below are not silently
upgraded into a blanket ecosystem Definition of Done.

## Ecosystem inventory

| Surface | Purpose | Runtime boundary |
| --- | --- | --- |
| `juro.uz`, `www.juro.uz` | Public RU/UZ/EN acquisition, trust, knowledge, lawyers | Sites-hosted public artifact; no private product data. |
| `app.juro.uz` | Citizen/business product and APIs | Production Worker, D1/R2/Queues and authenticated tenant scope. |
| `lawyer.juro.uz` | Dedicated lawyer persona | Same hardened runtime; server-enforced role/destination. |
| `admin.juro.uz` | Operations, AI quality, costs, sources, audit | Capability and recent-MFA boundaries. |
| `status.juro.uz` | Public health | Status-only host; application routes denied. |
| staging equivalents | Controlled testing/evaluation | Separate D1/R2/queues/config; not production evidence. |
| GitHub `MoozUpus/juro` | Source, CI and review | Draft PR, protected evidence and artifact checks. |

The detailed route and domain evidence is in `domain-route-inventory.md` and
`broken-links-report.md`.

## Release-gate matrix

| Area | State | Evidence / remaining gate |
| --- | --- | --- |
| Public routes and SEO | PASS in production | Sites version 86 is live; all 78 sitemap URLs returned `200` with exact canonical, complete RU/UZ/EN hreflang, Open Graph/Twitter preview metadata, single H1, valid present JSON-LD and expected indexability. `robots.txt` points to the canonical sitemap, while the provider-generated direct host is response-level `noindex`. |
| Transport/security headers | PASS in production | HTTPS-first Worker redirects, private no-store/noindex and restricted permissions policy tested; public Sites uses Cloudflare canonical redirects. |
| Auth/RBAC/tenant isolation | PASS for this delta | The exact commit passed the complete 1086-test core and 201-test Cloudflare suites; the 26/26-file security diff scan found no tenant/privacy issue. Historical authenticated journey coverage remains scoped in the QA matrix. |
| Signed public shares | PASS at baseline | Signed authorization and bounded transport deployed in the hardened release. |
| AI citations | PARTIAL by design | Direct Lex.uz fail-closed pipeline active; fresh current legal evaluation still required for a quality claim. |
| Full legal corpus/vector retrieval | NOT RELEASED | Separate 44/44 snapshot/evaluation gate open; production flags disabled. |
| Document/case/lawyer workflows | PASS from prior authenticated release evidence; PARTIAL for this delta | The analytics delta is covered by server-side success-boundary tests. Fresh in-app browser checks proved guest, Client login, dedicated Lawyer login, Admin re-auth and status boundaries; no new OTP-authenticated mutable workflow was submitted for this delta. |
| Payments | DEMO / NOT APPROVED | Production approval flag false; no live-payment claim. |
| Product analytics | DEPLOYED / INSUFFICIENT SAMPLE | Exact 21-event content-free contract, optional public consent and bounded route are live. A scoped Cloudflare rule rate-limits only the public ingestion route. The 2026-08-28 read-only recheck retained 24 represented events from 25 August onward and found zero events at or after the Worker 166 release boundary, so no conversion baseline is invented. |
| AI costs | ACTIVE MEASUREMENT / INSUFFICIENT SAMPLE | Four official, effective-dated production price rows passed backup/restore gates. The protected production console reports 100% current price coverage, `$0.104549` estimated cost and 4/30 priced successes; it refuses to call the sample ready and explicitly shows that production cost-guard policies are not configured. Candidate `a08698df` adds user/current-plan, cache, Deep-escalation, fallback, provider-error and latency views with explicit denominator/attribution caveats; candidate `1ed17501` adds bounded Fast/Balanced/Deep routing. Neither is deployed, so the 30% reduction target remains `UNVERIFIED`. |
| Artifact performance | PASS | CSS/JS/font/image/Worker budgets green; no Core Web Vitals claim. |
| Accessibility | PARTIAL | The exact public candidate source passed the pinned Chrome/axe 56/56 RU/UZ/EN desktop/mobile light/dark matrix, the 44 px and ARIA-reference runtime guards, and retained 320/390/981/1101 px keyboard/visual samples. The deployed Sites v86 replay is now complete and recorded as a live FAIL for its stale sub-12 px labels, 32 px theme targets, dangling menu reference, duplicate accessible closer and missing skip-to-main focus transfer; commit `7e07b562` fixes them only in the unpublished candidate. Workers 156–158 close confirmed Client comparison, Lawyer professional and non-corpus Admin interaction-target defects, and Workers 168–170 close the sampled Client focus/shell defects in production. No signed-in Lawyer/Admin, real OTP/MFA error, screen reader or physical mobile device was used. Protected Lawyer/Admin rendering and live auth-error assistive-technology replay remain open, so this is not a WCAG conformance claim. |
| Cloudflare continuity | PARTIAL | Scoped public-analytics rate limiting is active, the 31-rule Free Managed Ruleset is always active, and zone origin TLS is `Full (strict)` with production/staging smoke. Fresh app/status reads reconfirmed Anthropic and document analysis operational after the reported account top-up. The authenticated dashboard verifies the complete 22-record DNS inventory. A fresh control-plane inventory also exactly matched 17 production queues, two production schedules and the active Worker 170 bindings; all three private R2 buckets have no custom domain and public `r2.dev` access disabled. The narrower OAuth token still receives authentication errors from DNS/ruleset/list endpoints. Cloudflare's one partially exposed origin-IP recommendation, overdue infrastructure billing and unavailable real CWV tracing remain explicit risks. |

## Definition of done for this candidate

1. Platform full tests, type check, lint, production build/artifact budgets and
   public Sites build all pass from the exact commit.
2. Current prices are inserted as effective-dated configuration only after a D1
   export, local integrity/FK check, private R2 backup and SHA-256 readback.
3. CI passes for the pushed commit; the Draft PR remains reviewable.
4. Worker and Sites exact artifacts deploy with rollback identifiers recorded.
5. Chrome/in-app production checks cover anonymous, citizen/business, lawyer and
   admin boundaries without using real personal/legal data.
6. Public crawl, redirects, headers, status and post-deploy cost/source telemetry
   are rechecked.
7. Remaining external risks are reported plainly and no green release is called
   overall healthy if service health is degraded.

## Candidate completion checkpoint

- CI `33195687549` passed exact Worker 168 source
  `0791a0884a7b9491cc0b8313faf79227bd826a66` (Website 2m12s, Platform
  8m44s). Worker 168 receives 100% production traffic. The exact CSS asset and
  authenticated Chrome replay proved the dashboard composer now has visible
  keyboard focus after skip-link transfer; current status was 8/8 operational.
  CI `33196973919` then passed the release-evidence tip `f70eb412` (Website
  2m12s, Platform 9m05s). Worker 167 is rollback; D1, DNS, notifications and
  Sites were unchanged.
- After the owner reported replenishing the Anthropic account, two independent
  production status reads agreed on 8/8 operational at
  `2026-08-28T18:32:32.114Z`; the fresh Anthropic and document-analysis probes
  were operational without safe errors. The Analytics Engine recheck remained
  at 24 represented events from 25 August onward and zero after the Worker 166
  release boundary. The active Cloudflare zone lookup succeeded, while DNS
  record listing returned the documented HTTP 403 / code `10000` scope gate.
- CI `33169181945` passed exact Worker 165 source
  `6af3cff4572f83e8f31b40858b5708a6b510f27e` (Website 1m46s, Platform
  8m57s). Local gates passed focused cost 4/4, core 1106/1106,
  Cloudflare/infrastructure 203/203, lint, type-check and production artifact
  validation. Worker 165 receives 100% production traffic. Deployed assets,
  seven HTTP boundaries, protected Admin Chrome replay, operational 8/8 status
  and current priced usage all passed. Worker 164 is rollback; production D1,
  DNS and Sites were unchanged.
- CI `33148425519` passed exact Worker 162 source
  `75064bee61909baa0e1a05dabdedc6268f86ed29` (Website 2m15s, Platform
  6m57s), including rendered 35/35, core 1101/1101 and
  Cloudflare/infrastructure 202/202. Worker 162 receives 100% production
  traffic. The first new-runtime metadata retry processed 40/40 with no change,
  error or notification growth; authenticated Chrome shows the bounded `99+`
  count. Both status APIs agreed on 8/8 operational. Worker 161 is rollback;
  no migration or manual D1 cleanup occurred, notification history/read state
  was preserved, and DNS/Sites were unchanged.
- CI `33136790049` passed exact runtime source
  `93bb6abf48478af8de5bb86bbc38df3e6dcdbe15` (Website 2m15s, Platform
  6m32s). Local gates passed lint, type-check, production build, artifact
  budgets, rendered Worker 35/35, core 1098/1098 and Cloudflare/infrastructure
  201/201.
- Worker 158 receives 100% production traffic. The exact production CSS asset
  contains the Lawyer workspace/consultation contracts and the non-corpus Admin
  retry, Knowledge Base and cost-checkbox 44 px contract. Anonymous Admin
  console and costs requests return protected `303` handoffs; isolated Chrome
  reached the re-authentication surface with one H1/main, no overflow, no
  console warnings/errors and no staff-data disclosure. Signed-in Lawyer and
  Admin workflow rendering remains open. Worker 157 is the immediate
  rollback. Production D1, DNS and Sites were unchanged.
- Both status endpoints reported all eight components operational and no active
  or recent incident at `2026-08-28T02:53:33.522Z`.
- CI `33132278871` passed exact runtime source
  `7123fb4b842c0d006f82a83b0e72263a0088020c` (Website 2m29s, Platform
  8m35s). Local gates passed type-check, lint, production build, artifact
  budgets, rendered Worker 35/35, core 1096/1096, Cloudflare/infrastructure
  201/201 and the end-to-end document-comparison smoke.
- Worker 156 receives 100% production traffic. Chrome verified the comparison
  refresh action at exactly 44×44 px at 320 and 390 px, with no horizontal
  overflow or console errors. Worker 155 is the immediate rollback. Production
  D1, DNS and Sites were unchanged; Sites v86 remains live and saved v94 remains
  unpublished.
- Both status endpoints reported all eight components operational and no active
  or recent incident at `2026-08-28T01:26:35.918Z`.
- CI `33129369444` passed exact commit `fcdb9e6f` (Website 2m30s,
  Platform 6m48s). The same source passed local rendered HTML 35/35, core
  1095/1095, Cloudflare/infrastructure 201/201, type-check, lint and artifact
  budgets before Worker 155 received 100% production traffic.
- Worker 155 keeps status icon metadata on each allow-listed first-party host
  without weakening CSP. Production Chrome verified the bare UZ and explicit
  RU status pages with correct `html`/`main` language, localized title/H1,
  loaded fonts, private noindex, same-origin icons, no overflow and an empty
  warning/error/issue log. Worker 154 is the immediate rollback.
- The original Lawyer-host Client URL still reaches the exact Client surface
  instead of `Not Found`; a clean session correctly lands on localized Client
  login. No form, OTP, MFA, file upload or data mutation was performed.

- GitHub CI `33071334033` passed at exact commit `b4c472332e49b9750ec696652281670efb89bb9b`:
  Website 42/42; Platform rendered HTML 34/34, core 1086/1086 and Cloudflare
  201/201, plus lint, type-check, artifact, environment, dependency and licence
  gates.
- Worker `28dd4ac8-1ae2-4582-9697-8aa28e109cb5` (version 148) receives 100%
  production traffic; `ed0253e1-1c35-416e-9f2a-5bd8352c1936` (version 147) is
  rollback. Version 148 retains the font-path privacy correction and routes
  known misplaced Client links from the Lawyer host to the fixed Client origin
  for read methods while keeping writes and unknown paths fail closed.
- Fresh production Chrome reloaded the exact original failing URL and followed
  the live redirect to the authenticated Client dashboard. The 1920×945 render
  had one localized H1, loaded fonts, private noindex metadata, zero overflow,
  no role alert and an empty warning/error log. Lawyer and Admin retained their
  separate re-authentication and fresh-session boundaries.
- Sites version 86 deployed runtime commit `286c8cec`; deployment
  `appgdep_6a9027658100819189e6e6bc1a20bf1d`. Sites version 85 is rollback.
- GitHub CI `33071334033` passed Website and Platform on the Client-link
  correction `b4c47233`; v86 source CI `33067543449` also passed both jobs. The earlier
  hardening diff scan `a2cb0d4a-7512-4b0a-aa5e-362681007619` retained zero
  findings; metadata diff scan `fa1b3e34-235b-48e6-8fb4-41e9f731f210` also
  retained zero findings with complete changed-source coverage. Social-preview
  diff scan `1985bd83-d685-4ae3-8978-60f4f469d1e7` closed its seven changed
  source files with zero findings. The broader immutable Standard scan remains
  explicitly PARTIAL.
- The live telemetry route returned exact `204/403/403/400/413` for valid,
  foreign-origin, missing-fetch-metadata, invalid-pair and oversized requests.
- `status.juro.uz/api/status`, generated at `2026-08-28T00:30:50.972Z`, was
  operational for all eight published components with no incident.
- The price backup gate is complete in private R2. On 2026-08-27, a fresh
  four-object download matched every recorded byte size and SHA-256 value; the
  exact plaintext source and verification directories were then deleted and
  both absence checks passed.
