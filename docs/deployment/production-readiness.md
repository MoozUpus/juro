# Production readiness — 2026-08-29

This is an evidence record for the signed-share/HTTPS baseline and the
privacy-safe analytics/effective-cost follow-up. It does not claim that every
item in the wider ecosystem audit is complete.

## 2026-08-29 Compact conversation-context candidate

Commit `c7c6d35eb88baaec157f8709ee214b936c07b64a` implements branch-aware,
deterministic context compaction for authenticated legal chat. From the existing
bounded 12-turn read, the latest three turns remain recent, up to five older
turns become redacted summaries, and the remainder are explicitly omitted. The
same context reaches follow-up rewrite, planning, OpenAI and Anthropic. It makes
no additional provider or D1 read and treats the summary as untrusted context;
current verified sources remain the legal grounding boundary.

Focused 20/20, full core 1129/1129, Cloudflare/infrastructure 203/203, rendered
Worker 35/35, type-check, lint and production artifact validation passed
locally. Emitted budgets passed at CSS 596.6/600.0 KiB, initial JS
295.4/320.0, largest lazy increment 208.1/240.0, fonts 453.6/512.0, images
564.4/640.0 and Worker entry 3656.7/6144.0 KiB. A synthetic long-history
fixture measured 15,931 legacy versus 6,155 compact serialized characters
(61.36% lower), but that is not a token, billing, latency, quality or production
cost measurement. The 30% target remains `UNVERIFIED`.

The legal-chat prompt identity advances to
`juro-legal-chat-v3-compact-context`, with source-backed v1 → v2 → v3 history.
No migration, Worker/Sites publish, DNS, notification or customer-data mutation
occurred. Production remains Worker 170 and Sites v86 pending explicit release
authorization.

## 2026-08-29 Anthropic prompt-cache candidate

Commit `d1da89a1` applies an explicit five-minute Anthropic cache breakpoint
only to the static code-owned system instruction block. Questions,
conversation history, memory, retrieved sources and document payloads remain
in the separate user message and have no cache marker. The provider's disjoint
uncached/read/write counters are normalized into total input while read and
write tokens remain independently observable.

Migration `0163_anthropic_prompt_cache_accounting.sql` adds default-zero,
non-negative cache-write counters to immutable usage events and daily
aggregates. Five-minute cache writes are priced at the documented 1.25x
ordinary Anthropic input rate with integer arithmetic. The protected RU/UZ
Admin console shows write-token volume and explicitly states that user content
is not cached.

Focused provider-cost 8/8 and Anthropic/document-provider 15/15 tests, full
core 1128/1128, Cloudflare/infrastructure 203/203, rendered Worker 35/35,
type-check, lint and production artifact validation passed. The emitted Worker
entry is 3652.5/6144.0 KiB; CSS, initial JS, lazy-route JS, fonts and images are
also within their checked-in limits. Production remains unchanged: migration
0163 is outside the production migration pattern, and no D1, Worker, Sites,
DNS, notification or customer-data mutation occurred. A restored-backup
migration rehearsal, controlled staging cache create/read, billing
reconciliation, role-correct Admin replay and a comparable cost/quality sample
remain release gates; the 30% reduction target is still `UNVERIFIED`.

## 2026-08-29 scoped AI budget candidate

Commit `f312a930e9e93a690a71ad963ea0ff59ab1a4ab6` adds operator-defined daily
and monthly AI cost budgets for a technical user or an allowlisted feature.
The three explicit actions are alert only, disable optional Deep calls, or
block all calls in that scope. The protected Admin flow is still bound to
operations capability, active TOTP, fresh MFA and same-origin/CSRF checks. No
threshold is seeded or inferred from the small historical sample.

Migration `0162_scoped_ai_cost_budgets.sql` stores immutable policy versions
and threshold events plus retry-safe alert delivery evidence. Calendar periods
are UTC. Unpriced success is reported separately and never receives a fake
cost or becomes proof of budget exhaustion. Chat, guest chat, document
analysis and private-document vector work check policy before provider work;
the internal legal-corpus ingestion path is unchanged.

Focused 3/3, full core 1127/1127, Cloudflare/infrastructure 203/203,
rendered Worker HTML 35/35, type-check, lint, ordered migration/foreign-key
checks and production artifact validation passed locally. The D1 control is
best-effort at request boundaries: concurrent in-flight calls may overshoot a
cap, so it is not a provider billing hard limit.

This candidate is not deployed. Migration 0162 remains outside the production
`migrations_pattern`; no policy, threshold, email, D1, Worker, Sites, DNS,
notification or customer-data mutation was made. A fresh verified backup,
ordered migration rehearsal, operator-approved thresholds, controlled staging
crossings, real alert retry evidence and role-correct Admin browser replay are
still release gates. The 30% cost-reduction/quality target remains
`UNVERIFIED`.

## 2026-08-29 Admin AI cost-observability candidate

Commit `a08698df` extends the fresh-MFA Admin cost console with content-free
cost totals by technical user/workspace and current subscription plan, plus
provider error rate, average recorded provider latency, cache-hit request rate,
cached-input token share, Deep escalation and provider fallback. Deep/fallback
rates use only completed authenticated legal-chat runs; guest AI and document
analysis are not silently mixed into their denominator. Plan attribution is
explicitly labelled in RU/UZ as a read-time current-plan snapshot rather than
historical event-time truth.

The implementation adds no migration or user-content field. Focused 6/6, core
1124/1124, Cloudflare/infrastructure 203/203, rendered Worker HTML 35/35,
type-check, lint and production artifact validation passed locally. Emitted
budgets passed at CSS 596.6/600.0 KiB, initial JS 295.4/320.0 KiB, largest lazy
increment 208.1/240.0 KiB, fonts 453.6/512.0 KiB, images 564.4/640.0 KiB and
Worker entry 3647.0/6144.0 KiB.

No authorized real Admin/MFA session was available, so protected browser replay
is not claimed. The last verified production sample remains 4/30 and the 30%
cost-reduction target remains `UNVERIFIED`. The candidate is unpublished and
made no Worker, Sites, D1/migration, DNS, notification or customer-data
mutation.

## 2026-08-29 Admin AI prompt-registry candidate

Commit `9eee8d54` centralizes the current prompt identities for authenticated
legal chat, guest legal chat and document analysis. Persisted run hashes and the
protected Admin console now use the same code-owned registry. Admin shows only
the three version IDs and their code-review/evaluation gate, links to the real
cost, quality, emergency feature-control and provider-health surfaces, and
truthfully states in RU/UZ that no A/B prompt experiment is active. Prompt text
and secrets are not sent to the browser.

Commit `2a57cc88` adds a source-backed release manifest with exact introducing
commits and dates for current legal-chat v2, guest-chat v1 and document-analysis
v1 plus superseded legal-chat v1 and its v2 replacement. The localized Admin
history links to those immutable GitHub sources without exposing prompt text.

Focused 9/9, core 1123/1123, Cloudflare/infrastructure 203/203, rendered Worker
HTML 35/35, type-check, lint and production artifact validation passed locally.
Emitted budgets passed at CSS 596.6/600.0 KiB, initial JS 295.4/320.0 KiB,
largest lazy increment 208.1/240.0 KiB, fonts 453.6/512.0 KiB, images
564.4/640.0 KiB and Worker entry 3647.0/6144.0 KiB.

The release manifest is code-owned and reviewable in git; no mutable D1
prompt-history ledger is claimed. No authorized real Admin/MFA session was
available, so protected browser replay is not claimed. The candidate is
unpublished and made no Worker, Sites, D1/migration, DNS, notification or
customer-data mutation.

## 2026-08-29 Admin AI routing-transparency candidate

Commit `6bb8d607dfaead59fa345468ccf0ec56afe16016` makes the protected Admin AI
settings page show the actual active Fast, Balanced and Deep routing contract.
Provider execution, Anthropic fallback, run reservation and the Admin summary
now share `aiReasoningRuntimeRoute`, preventing a separately maintained display
table from drifting away from runtime behavior. The localized cards show the
primary and fallback model, Balanced default, reasoning effort, bounded attempt
and first-content windows, compact/detailed output limits and the shared
30-second absolute request deadline. Saved-version history now includes chat,
Deep and Anthropic fallback model identifiers.

Focused 6/6, core 1114/1114, Cloudflare/infrastructure 203/203, rendered Worker
HTML 35/35, type-check, lint and production artifact validation passed locally.
Emitted budgets passed at CSS 596.6/600.0 KiB, initial JS 295.4/320.0 KiB,
largest lazy increment 208.1/240.0 KiB, fonts 453.6/512.0 KiB, images
564.4/640.0 KiB and Worker entry 3647.1/6144.0 KiB. The CSS result has only
3.4 KiB of headroom.

No authorized real Admin/MFA session was available, so no signed-in browser
claim is made for the protected cards. This remains an unpublished candidate:
no Worker, Sites, D1/migration, DNS, notification or customer-data mutation was
made.

## 2026-08-29 legal AI reasoning-mode candidate

Commit `1ed175014d4255217444c538d3e8d7ae87b8dd9f` adds three explicit modes to
the legal AI interface and API: Fast, Balanced and Deep. Balanced is the
default for both omitted and unknown input. It uses the configured chat model,
medium reasoning and bounded latency/output controls; Deep alone selects the
configured deep model/high-reasoning profile. Fast remains the low-latency
profile, and guest/synthetic probes remain explicitly Fast. The existing
bounded Anthropic fallback path remains eligible without becoming an
unbounded primary route.

Migration `0161_balanced_ai_reasoning_mode.sql` rebuilds the telemetry table
constraint to accept all three modes, copies existing rows and recreates the
append-only triggers and indexes. A dedicated regression proves default/input
normalization, schema acceptance, routing profiles, localized source labels,
row preservation and restored update/delete guards.

Local validation passed focused 8/8, core 1114/1114,
Cloudflare/infrastructure 203/203, rendered Worker HTML 35/35, type-check,
lint, the production build and deployable-artifact budgets. Exact-source
GitHub Actions run `33230331239` passed on `1ed17501`: Website in 3m32s and
Platform in 8m45s. Isolated local Chrome confirmed the three exact RU/UZ
labels, Balanced default and switching at 1024, 700, 390 and 320 px, with
44 px targets, no horizontal overflow and no warning/error console output.

This is a prepared but unpublished Platform/D1 candidate. No Worker, Sites,
DNS, D1, notification or customer-data mutation was made. Production still
runs Worker 170 and Sites v86; release approval, migration backup/apply and
signed-in post-deploy replay remain separate gates.

## 2026-08-29 security remediation candidate

Codex Security scan `aacf0487-aae5-4c8f-a527-8f3efc70cb76` targeted immutable
source `3a30042c096f5aca91c3852a6998b7ddcd452025` and reported zero Critical,
zero High and six validated Medium findings. Commit `695693f3` closes all six:
workspace editor-role enforcement on content writes, hidden collaborator
attachment download enforcement, stale lawyer-grant revocation plus operational
profile rechecks, checksum-bound malware quarantine for Builder uploads,
bounded DOCX expansion and guest-AI provider circuit/accounting.

Selected non-legislation Platform tests passed 774/774. Rendered Worker HTML
passed 35/35 after evidence commit `1ee3047b`; type-check, lint, production
build, deployable-artifact validation and emitted-asset budgets passed locally.
Exact-source GitHub Actions run `33227714329` passed on `1ee3047b`: Website in
3m50s and Platform in 8m14s, including the Cloudflare matrix, dependency audit
and licence policy. The detailed report is
[`security-scan-3a30042c.md`](../audit/security-scan-3a30042c.md).

This is a prepared but unpublished Platform candidate. No Worker, Sites, DNS,
D1, notification or customer-data mutation was made. Production does not yet
inherit these six controls, so release approval and post-deploy replay remain
separate gates.

## 2026-08-29 full public responsive candidate

Commit `1e25c1aeaedad1daff964d1cc08714bece814bee` extends the built-site Chrome
release gate to 320, 360, 375, 390, 393, 430, 768, 1024, 1280, 1440 and 1920
px. The corrected candidate passed 56 full axe route/profile combinations, 189
additional RU/UZ/EN route-width checks and seven compact-menu interaction
scenarios. Build, deployable-artifact validation, 49/49 functional/route tests,
26/26 focused source contracts, lint and type-check also passed. Exact-source
GitHub Actions CI `33220671747` passed Website in 3m58s and Platform in 8m17s.

The expanded matrix first found a 2.2 px clipped RU lawyer-catalogue CTA at
320 px and a Vinext hydration path ending in `.rsc` that could revert UZ/EN
document language to RU. The source now gives the CTA a shrinkable wrapping
text cell and normalizes the terminal `.rsc` suffix before locale selection.

No production change was made. Sites v86 remains live with the already recorded
stale accessibility defects. A superseding Sites publish and production replay
still require a separate explicit publish instruction; this checkpoint is not
a WCAG conformance statement.

## 2026-08-29 read-only DNS inventory closure

The authenticated Cloudflare dashboard enumerated all 22/22 `juro.uz` DNS
rows at `2026-08-28T23:55Z`: 3 A, 2 CNAME, 4 MX, 6 TXT and 7 Worker records,
with 10 proxied, 12 DNS-only and automatic TTL throughout. Independent API
reads confirmed the active full/unpaused zone, the same seven Worker custom
domains and the two public Sites Worker routes. The current Wrangler OAuth
token still returns 403/code 10000 for the DNS-record endpoint; this is a token
scope limit rather than a missing dashboard inventory.

Cloudflare reports one recommendation that an origin IP is partially exposed
by a DNS-only record. No proxy, record, TTL, mail or Worker-domain change was
made. Production release readiness therefore records a required owner/network
review of FTP and mail service ownership before any narrowly approved DNS
remediation.

## 2026-08-29 read-only Cloudflare runtime resource inventory

The live `juro` Worker resource graph matches the production Wrangler contract.
All 17 expected `production-*` queues exist with no missing or extra production
queue. Its two schedules are exactly `*/5 * * * *` and `0 19 * * *`; the
`juro-admin` and `juro-legaltech` Workers correctly have no schedules. Worker
170 exposes the expected D1, three R2, 13 queue, two service, one Durable
Object, Analytics Engine, Workers AI, Images and assets bindings. Nine provider,
identity, Turnstile, email, TURN and Admin credentials remain secret bindings;
no secret value was requested or recorded.

The three production private buckets — `juro-private-documents`,
`juro-production-backups` and `juro-production-quarantine` — exist, have no
custom domain and have public `r2.dev` access disabled. The separate
`juro-public-media` bucket is intentionally public through `r2.dev`, has no
custom domain and is not a private application-data binding. The managed
production Turnstile widget is restricted to `app.juro.uz` and
`lawyer.juro.uz`; its staging counterpart is restricted to
`staging.app.juro.uz`.

The OAuth token still cannot read zone/account rulesets or account redirect
lists. Existing authenticated-dashboard proof for Full (strict), the Free
Managed Ruleset and the scoped analytics rate rule therefore remains the
rules-plane evidence boundary. No queue, bucket, domain, schedule, binding,
secret, widget or ruleset was changed during this inventory.

## 2026-08-29 public Sites v86 replay and unpublished correction

A read-only Chrome replay of the deployed Sites v86 artifact covered RU, UZ
and EN home routes at `390×844` and `1440×900`. Exact canonical URLs, matching
document language, four hreflangs, valid JSON-LD, `index, follow`, one H1/main,
explicit image alternatives and zero horizontal overflow passed. The same
artifact failed the accessibility replay: visible labels reached
`8.96–11.84` px, header theme controls were `32×32` px, the closed menu trigger
referenced an absent panel, the open menu exposed the pointer scrim as a second
accessible close control, and activating the skip link did not place focus on
main.

Commit `7e07b56280116bc2494223c7c9e650dc30535fff` corrects the findings in the
source candidate and adds runtime release guards for broken ARIA references and
visible native controls below 44 px. The exact candidate passed build/artifact
validation, 48/48 functional/route tests, the 56/56 axe/Chrome matrix, lint and
type-check. Exact-source GitHub Actions CI `33217112257` passed Website in
1m59s and Platform in 8m54s. Manual Chrome at 320, 390, 981 and 1101 px, plus the
320/620/621/768/981/1024/1101 breakpoint matrix, confirmed zero overflow,
zero exposed sub-44 px controls, one accessible menu closer, skip-link focus
transfer, Escape focus return and clean compact/full header transitions.

No production change was made. Sites v86 remains live and therefore retains
the observed stale defects. Publishing a superseding Sites version, recording
its immutable version/deployment identity and repeating the same production
replay require a separate explicit publish instruction.

## 2026-08-29 Worker 170 authenticated Client shell closure

Commits `36aa369416c991fb9cbf9dd2ae62350a42194fba` and
`31ca216095cd5b09cde25b781c79d9d4a604751e` correct three production Client
shell findings: a closed search trigger no longer references an absent dialog,
explicit 10–11 px labels use the 12 px floor, and the clickable mobile-menu
scrim is hidden from accessibility APIs and removed from the tab order while
the real close button remains available.

The local gate passed rendered HTML 35/35, core 1107/1107,
Cloudflare/infrastructure 203/203, focused accessibility 13/13, lint,
type-check and production artifact validation. Exact final-source CI
`33208687185` passed Website in 1m57s and Platform in 8m57s. Final CI artifact
budgets remained green: CSS 594.8 KiB, initial JS 295.1 KiB, largest lazy
increment 200.5 KiB, fonts 453.6 KiB, images 564.4 KiB and Worker entry
3799.5 KiB. These are emitted-byte limits, not Core Web Vitals.

Worker 170 `8a51f26c-2011-4ea0-a8f9-2e5a80316ce6`, deployment
`8dc989ba-014b-4a40-87e5-d017d8a4488e`, receives 100% traffic. In the existing
signed-in Chrome profile, the production Client dashboard passed 390 px and
320 px overflow/target/text-floor checks, search-dialog ARIA and focus wrapping,
mobile-menu single-close behavior, Escape focus return and the skip-link → main
→ labelled composer keyboard path. No warning/error log was present. Three
authenticated controller-observed navigations were 2,874, 2,256 and 1,587 ms
(median 2,256 ms); no authenticated LCP/INP/CLS claim is made because the
DevTools MCP context cannot reuse that signed-in profile.

The first post-release status snapshot was conservatively degraded after a
single malware-scanner probe returned `SCANNER_UNAVAILABLE`. Cloudflare still
reported the production container active with one instance. The next scheduled
probe recovered without intervention: independent app/status reads generated
at `2026-08-28T20:51:55.490Z` agreed on all eight components operational and
zero active/recent incidents. The scanner was operational at
`20:50:42.909Z`; Anthropic remained operational at `20:45:53.351Z`.

No migration or D1 mutation, DNS change, notification mutation or Sites release
was made. Sites v86 remains live. Worker 169 is the immediate application
rollback.

## 2026-08-29 Anthropic account recovery recheck

After the owner reported replenishing the Anthropic account, independent reads
through `app.juro.uz/api/status` and `status.juro.uz/api/status` returned the
same latest snapshot generated at `2026-08-29T00:19:04.324Z`: all eight published
components were operational and there was no active incident. Anthropic's fresh
synthetic probe was operational at `2026-08-29T00:15:32.841Z` (6,141 ms, no
safe error); the dependent document-analysis probe was operational at
`2026-08-29T00:00:46.020Z` (7,564 ms, no safe error).

This was a read-only recovery check. No provider prompt, private upload,
customer-data access, D1 mutation, DNS change, notification or release was
performed. Worker 170 and Sites v86 remain live.

## 2026-08-28 Worker 168 Client dashboard keyboard focus

Commit `0791a0884a7b9491cc0b8313faf79227bd826a66` restores a dedicated
visible focus indicator to the Client dashboard AI-composer textarea. On the
production Worker 167 baseline, the first Tab visibly focused the skip link and
Enter transferred focus to `main#main-content`, but the next Tab reached the
correctly labelled textarea with `:focus-visible` true and no outline, border
or shadow.

The focused source regression passed 1/1, followed by type-check, lint and the
production build. All artifact budgets remained within their limits, including
594.8 KiB of the 600.0 KiB client CSS budget. Exact GitHub Actions CI
`33195687549` passed the source SHA: Website in 2m12s and Platform in 8m44s.

Worker 168 `9cbfccd2-ec57-4839-9209-061d216ec1b3`, deployment
`eae00573-f828-446d-8780-415603e4eced`, receives 100% traffic. The exact
production CSS asset contains the `3px` shared-color outline and `3px` offset.
In the same authenticated Chrome session, the post-release Tab/Enter/Tab replay
again reached the labelled textarea, now with a solid visible outline. The
page retained one H1, one main landmark, private `noindex` metadata and no
horizontal overflow at 1521 CSS px. No form was submitted and no customer data
was changed.

The public route matrix retained the expected public 200s and redirects.
Status generated at `2026-08-28T17:53:44.842Z` was 8/8 operational with no
active or recent incident. OpenAI was operational at
`2026-08-28T17:45:51.052Z` (`3484 ms`, no safe error) and Anthropic at
`2026-08-28T17:45:57.449Z` (`6025 ms`, no safe error).

No D1 migration or mutation, DNS change, notification mutation or Sites
release was made. Sites v86 remains live. Worker 167 is the immediate
application rollback.

## 2026-08-28 Worker 167 Client login layout stability

Commit `4eba97cead5c56d47c51dbc1965b5b440871dd5b` removes an obsolete
legacy `.auth-brand::after` decoration from the current Client login surface
and increases the authenticated and guest Turnstile reservation from 65 px to
72 px. The separate Lawyer decoration is unchanged. A cold production baseline
at `390×844`, 3× DPR, 4× CPU and Fast 4G recorded CLS 0.2779 and identified the
620 px pseudo-element as LCP. An isolated live-page candidate replay reduced
the 14-second observer result to CLS 0.0462 before deployment.

Focused auth tests passed 10/10; type-check, lint, production build, artifact
budgets and Cloudflare/infrastructure 203/203 passed locally. The broad local
core run had no failing assertion but reached its 300-second harness limit in
the explicitly excluded legal-corpus block. Exact GitHub Actions CI
`33192562472` passed the complete source SHA: Website in 2m14s and Platform in
6m54s.

Worker 167 `b67a2ed8-74f8-4d62-968e-87bff9d3e4dc`, deployment
`7f1431fd-3e89-491d-aacc-f1c630ca020e`, receives 100% traffic. A new isolated
production run without an injected stylesheet observed LCP on the `H2` at
2,680 ms and CLS 0.0462 over 15 seconds. The obsolete pseudo-element computed
to `display:none`/`content:none`, Turnstile held 72 px and the document had no
horizontal overflow.

Client and Lawyer dashboards retained private/no-store `307` login boundaries;
the original Lawyer-host Client URL returned the exact App redirect; Admin
retained its protected `303`. Public status generated at
`2026-08-28T17:11:28.991Z` was 8/8 operational with no incidents. OpenAI was
operational at `2026-08-28T17:10:27.975Z` (`8303 ms`, no safe error) and
Anthropic at `2026-08-28T17:00:55.699Z` (`7815 ms`, no safe error).

No D1 migration or mutation, DNS change, notification mutation or Sites
release was made. Sites v86 remains live. Worker 166 is the immediate
application rollback.

## 2026-08-28 Worker 166 privacy-safe analytics normalization

Commits `aaba59828a967aded926c1fe79b3e5c80936460d` and
`14ecae9a475c75d54c92e8c69d96a3c12290af8e` make the existing Analytics
Engine stream comparable without adding user content or identifiers. Product
and operational events now keep a stable first-six contract of
event/surface/locale/outcome/provider/variant. Support-ticket category and
severity remain bounded dimensions in `blob7`/`blob8`. AI feedback records only
the allowlisted feedback type and its success/partial/failure outcome; optional
comments never enter analytics.

A read-only production query found 24 stored and represented events from
`2026-08-25 08:10:02Z` through `2026-08-28 01:46:27Z`, all with
`_sample_interval=1`. All 24 used one of the 21 canonical product event names
and the expected first-six layout. The sample contains one consented
`landing_view`, three `first_question_sent` occurrences and zero
`signup_started`/`signup_completed` events. There is no privacy-safe cohort
linkage, so activation, return, step drop-off and conversion remain
`UNVERIFIED`; 13 `lawyer_viewed` occurrences are not claimed as 13 unique
people.

Focused analytics/feedback/platform tests passed 83/83. Full local gates passed
core 1106/1106, Cloudflare/infrastructure 203/203, lint, type-check and
production artifact validation. Emitted CSS remained inside the artifact
budget at 594.6 KiB of 600.0 KiB. Exact CI `33187593245` passed source
`14ecae9a`: Website in 2m05s and Platform in 9m21s.

Worker 166 `4bd03261-df05-4e5b-9f91-66bd6d8cfdcd`, deployment
`3579b110-a09d-4f53-8563-34ec0d2d5c4e`, receives 100% traffic. The original
`lawyer.juro.uz/ru/individual/dashboard` URL returns a private/no-store `307`
to the exact Client route; the Client and Lawyer dashboards retain their own
login destinations, and Admin retains its protected `303` handoff. An
unauthenticated feedback POST with the correct origin was rejected `403` with
`no-store`; no session, CSRF token or analytics write was fabricated.

Public status generated at `2026-08-28T16:15:50.194Z` was 8/8 operational with
zero incidents. The first post-release checks recorded Anthropic operational at
`2026-08-28T16:15:50.040Z` (`6020 ms`, no safe error) and OpenAI operational at
`2026-08-28T16:10:23.388Z` (`4780 ms`, no safe error); document analysis
remained operational. A read-only D1 verification wrote zero rows and confirmed
the priced-success sample remains 4/30 with `$0.104549` estimated cost and two
zero-token failures. The 30% reduction target remains `UNVERIFIED`.

No D1 migration or mutation, DNS change, notification mutation or Sites release
was made. Sites v86 remains live. Worker 165 is the immediate application
rollback.

## 2026-08-28 Worker 165 AI cost measurement readiness

Commit `6af3cff4572f83e8f31b40858b5708a6b510f27e` adds a protected,
content-free measurement gate to the Admin cost console. The rolling window
starts no earlier than the first effective price version and reports pricing
coverage, priced successes, estimated cost per priced success and progress
toward a minimum 30-call sample. It returns `no_data`,
`incomplete_pricing`, `insufficient_sample` or `ready`; even `ready` is
explicitly not proof that answer quality was preserved. A provider without an
effective cost-guard policy is now shown as **not configured** instead of
looking like a healthy closed automatic circuit. No budget threshold was
invented.

Focused cost tests passed 4/4. Full local gates passed core 1106/1106,
Cloudflare/infrastructure 203/203, lint, type-check and production artifact
validation. Emitted CSS remained inside the artifact budget at 594.6 KiB of
600.0 KiB. Exact CI `33169181945` passed Website in 1m46s and Platform in
8m57s.

Worker 165 `a75c0337-da48-49fd-8adf-6a721fb24088`, deployment
`ee0465b5-fb83-4ebb-87a5-3b40b0be7f83`, receives 100% traffic. Production
assets returned 200 and contained the measurement and unconfigured-policy
contracts. The seven-route HTTP matrix returned the expected public 200s and
private redirects. Isolated Chrome reached the protected Admin re-auth page
with one H1/main and no console warnings or errors; no privileged session or
MFA was fabricated.

The production measurement window begins at
`2026-08-25T07:44:49.444Z`: four successes are priced, zero successes are
unpriced, two zero-token failures are retained and estimated cost is
`$0.104549`. Coverage is 100%, but 4/30 is insufficient; the target 30% cost
reduction remains `UNVERIFIED`. Production still has zero effective cost-guard
policies, now surfaced truthfully for operator action. Anthropic's latest
content-free probe was operational at `2026-08-28T12:01:44.053Z` with no safe
error code. Public status generated at `2026-08-28T12:13:55.505Z` was 8/8
operational with zero incidents.

No D1 migration, data mutation, DNS or Sites release was made. Sites v86
remains live and Worker 164 is the immediate application rollback.

## 2026-08-28 Worker 164 monitoring email delivery

Commits `1a71ff9833878fba68958a708fb8bc227fd0a552` and
`52f579ca346c170fc31c4ce7125306d4074d117b` add a dedicated, retry-safe
monitoring-email delivery path. Cadence delivery now creates the in-app
notification, a content-minimized `monitoring_email_jobs` row and an
identifiers-only generic outbox item atomically. The queue consumer resolves
the protected recipient identity only at delivery, rechecks active membership,
source freshness and the current email preference, cancels disabled delivery,
and uses a stable Resend idempotency key. RU/UZ email copy links only to the
official Lex.uz source and explicitly describes the message as a metadata
notification rather than a legal conclusion.

Migration `0160_monitoring_email_delivery.sql` was applied to production after
a full D1 export was restored locally twice: once from the direct export and
once from a private-R2 readback. Both restorations reported 343,965 statements,
282 tables, 608 indexes, 380 triggers, `quick_check=ok` and zero foreign-key
violations. The 232,377,843-byte SQL has SHA-256
`4d339e3fcb5f31eecdfcaddb2f0b7fb642503b6cd4464a6172f56889278a41a8` and is
preserved at private R2 key
`d1/juro-production/20260828T105200Z-pre-0160-52f579ca/production-pre-0160.sql`
with its adjacent manifest. Post-migration checks found the table, four indexes,
four guard triggers, no pending migration and zero foreign-key violations.

Focused tests passed 149/149. Full local gates passed lint, type-check, build,
artifact budgets, core 1105/1105 and Cloudflare/infrastructure 203/203. GitHub
Actions CI `33164955029` passed exact release source `52f579ca`: Website 2m09s
and Platform 8m53s. Worker 164
`3ba45422-86e9-4502-8ad2-8468bec57a78`, deployment
`46613e55-f973-4199-a825-e2c576ac63e1`, receives 100% traffic.

The first two post-release scheduler runs completed at
`2026-08-28T11:11:02.509Z` and `2026-08-28T11:16:42.817Z`. All four monitoring
cursors stayed at `2026-08-28T07:54:51.699Z`, the legislation-monitor
notification total/max stayed 222,329 / `2026-08-28T06:40:50.995Z`, and
monitoring-email jobs stayed at zero. No historical event was replayed and no
customer email was forced. The existing transactional email outbox remained
19/19 dispatched.

The six-host HTTPS matrix and `/api/status` returned 200; public status was
operational, including fresh OpenAI, Anthropic, Resend and queue evidence.
Authenticated Chrome confirmed localized RU/UZ monitoring copy and the honest
disabled-delivery state while Lex metadata monitoring has no fresh active run.
It also confirmed that `lawyer.juro.uz/ru/individual/dashboard` redirects to and
renders the authenticated app dashboard rather than plaintext `Not Found`.
Sites v86 remains unchanged. Worker 163 is the immediate application rollback.
Staging was not migrated because its unrelated pending range 0142-0160 falls
inside the user-skipped legal-corpus/database work.

## 2026-08-28 Worker 163 monitoring cadence

Commit `810432eac9c1159c4cbd60fddaab7c1c1131b655` makes the stored monitoring
frequency operational. The existing five-minute scheduler dispatches
`immediate` preferences after a successful daily Lex metadata check and applies
one-day or seven-day intervals to `daily` and `weekly` preferences. A
one-minute cutoff prevents a race with the metadata writer. New digests use
deterministic IDs; notification creation and cursor advance are committed in
one D1 batch. Legacy null cursors initialize at the cutoff without replaying
historical events, and empty due windows advance safely.

Monitoring email is deliberately unavailable: there is no dedicated
retry-safe monitoring-email outbox. The API accepts only in-app delivery and
the RU/UZ client disables the email option with an explicit explanation. This
does not downgrade the separately configured transactional-email capability,
but it avoids claiming a monitoring channel that is not end-to-end proven.

Focused cadence tests passed 7/7. Full local release gates passed lint,
type-check, the production build, artifact budgets, rendered Worker 35/35, core
1104/1104 and Cloudflare/infrastructure 202/202. GitHub Actions CI
`33152530994` passed exact source `810432ea`: Website 2m41s and Platform 6m58s.

Worker 163 `e7c8ec49-bba6-4abd-ac00-89bfd1cd4acd`, deployment
`dc3efbec-6909-4f56-80ef-0d964cdea027`, receives 100% traffic. Its first
production cadence run completed at `2026-08-28T07:55:58.100Z` and initialized
all four existing daily/weekly cursors to `2026-08-28T07:54:51.699Z` without
historical delivery. The repeat run completed at `08:01:53.188Z`; cursors did
not move and the legislation-monitor total/max remained exactly 222,329 /
`2026-08-28T06:40:50.995Z`. No notification was deleted or marked read.

The post-release `juro`, `www`, `app`, `lawyer`, `admin`, `status` and
`status/api/status` matrix returned 200. Authenticated Chrome confirmed the RU
and UZ Monitoring cadence state and localized copy. It also confirmed that the
original `lawyer.juro.uz/ru/individual/dashboard` screenshot URL redirects to
and renders the exact app dashboard instead of plaintext `Not Found`. No
migration, DNS or Sites release was made. Sites v86 remains live; saved v94
remains unpublished. Worker 162 is the immediate application rollback.

## 2026-08-28 Worker 162 provider recovery and notification stability

Commit `75064bee61909baa0e1a05dabdedc6268f86ed29` removes the unstable Lex RSS
delivery timestamp from monitoring fingerprints, treats only real title changes
as customer events, uses deterministic retry-safe event/notification IDs, emits
one per-recipient digest per run and commits its writes as one D1 batch. The
dashboard's unread-count query stops at 100 and renders `99+` rather than
scanning and exposing an unbounded historical count. No notification was
deleted or marked read.

Focused monitoring/dashboard tests passed 81/81. Full local tests, lint,
type-check and the bounded production artifact gate passed. GitHub Actions CI
`33148425519` passed the exact commit: Website 2m15s and Platform 6m57s,
including rendered 35/35, core 1101/1101 and Cloudflare/infrastructure 202/202.

Worker 162 `d2146684-bd77-4a33-a2a2-8d47042e473e`, deployment
`0c8ec9f3-cd7f-4a0c-9e99-e0b1d91fc998`, receives 100% production traffic. The
last pre-release Worker 161 retry at `2026-08-28T06:40:50.995Z` increased the
historical legislation-notification count to 222,329. Worker 162's first retry
at `06:45:53.618Z` processed 40/40, recorded `changed=0`, `error=0`, and left
that count and its maximum `created_at` unchanged. Authenticated Chrome showed
the new `99+` summary with accessible `Более 99 новых событий` text.

After Anthropic credit restoration, a fresh scheduled synthetic probe recorded
Anthropic operational at `2026-08-28T06:47:17.754Z`. Both public status APIs
agreed on 8/8 operational at `06:49:05.922Z`; document analysis also remained
operational. No migration, manual D1 cleanup, DNS or Sites release was part of
Worker 162. Worker 161 is the immediate application rollback, but it does not
contain the stable monitoring fingerprint/batching fix. Sites v86 remains live;
saved v94 remains unpublished.

## 2026-08-28 Worker 161 Anthropic health diagnostic

Commit `316ef335a0dfd0e1acd57be2e4cfd014d53be01f` adds bounded,
content-free classification for Anthropic request failures. It prefers the
provider's safe machine code and otherwise maps only known message categories;
it never returns or logs the raw provider message. Focused tests passed 10/10,
the complete local suites passed core 1099/1099 and Cloudflare/infrastructure
202/202, and lint plus type-check passed. GitHub Actions CI `33144330811`
passed Website in 2m10s and Platform in 8m38s.

Worker 161 `34c54357-0878-4637-b533-1fa1afa36336`, deployment
`72c5d2be-e417-4dcf-a4eb-8022a59a1b61`, receives 100% production traffic. The
first captured scheduled probe classified Anthropic's HTTP 400 as
`PROBE_PROVIDER_HTTP_400_INVALID_REQUEST_ERROR_CREDIT_BALANCE_LOW`. Both public
status endpoints agreed on 6/8 operational at
`2026-08-28T05:36:31.571Z`: only `ai` and `document_analysis` were degraded;
OpenAI and the Lawyer area remained operational. This is an external Anthropic
account-balance blocker, not a healthy release claim. Add API credit, wait for
a fresh scheduled probe, and require both endpoints to return operational
before closing it.

The exact screenshot route returns private/no-store `307` to the preserved app
path. Isolated Chrome reached the localized Client login with one H1, one main
landmark, no horizontal overflow and private noindex metadata instead of
plaintext `Not Found`. The Cloudflare Turnstile frame emitted known provider
issues and two opaque `NaN` console entries had no attributable source, so this
replay does not claim a clean console.

No production D1 write, migration, DNS or Sites change was made. Worker 160 is
the immediate application rollback. Sites v86 remains live; saved v94 remains
unpublished.

## 2026-08-28 Worker 158 Admin interaction floor

Commit `93bb6abf48478af8de5bb86bbc38df3e6dcdbe15` applies the established
44 px interaction floor to confirmed non-corpus Admin controls: shared retry
buttons, Knowledge Base header/fieldset actions and the Cost console checkbox
label. Legal-source review controls were intentionally excluded. The focused
accessibility contract passed 12/12.

The exact source passed lint, type-check, production build, artifact budgets,
rendered Worker 35/35, core 1098/1098 and Cloudflare/infrastructure 201/201.
GitHub Actions CI `33136790049` passed Website in 2m15s and Platform in 6m32s.

Worker 158 `6ebf3a20-ca4d-4751-8283-22bcc9b10988`, deployment
`f7e89714-43be-4450-b232-6b988e8f7f86`, receives 100% production traffic. The
exact `/assets/index-C92iLqdd.css` asset returns `200` and contains the new
selector group. Anonymous Admin console and costs requests return private,
no-store `303` handoffs. Isolated Chrome reached the app Admin re-authentication
screen with one H1, one main landmark, no horizontal overflow, no console
warnings/errors and no staff-data disclosure. Signed-in Admin rendering remains
open because no privileged session, MFA submission or synthetic production
record was fabricated. Both status endpoints reported 8/8 operational and no
active/recent incident at `2026-08-28T02:53:33.522Z`.

No D1, migration, DNS or Sites change was part of Worker 158. Worker 157 is the
immediate application rollback. Sites v86 remains live; saved v94 remains
unpublished.

## 2026-08-28 Worker 157 Lawyer interaction floor

Commit `67bd679e39e2ce2357d879cc7d806e53e4ce2651` applies the established 44 px
interaction floor to confirmed Lawyer professional controls across offers,
messages, AI assist, internal notes, consultations, scheduling, knowledge,
time tools and source links. The focused contract passed 11/11.

The exact source passed lint, type-check, production build, artifact budgets,
rendered Worker 35/35, core 1097/1097 and Cloudflare/infrastructure 201/201.
GitHub Actions CI `33134728801` passed Website in 2m28s and Platform in 8m47s.

Worker 157 `2ec24c74-57b9-4c66-8afa-372cceb24767`, deployment
`62266f40-fe05-423b-9916-7c4220bf66d3`, receives 100% production traffic. The
exact production CSS asset contains both new selector groups. Anonymous Lawyer
workspace access returns `401`, and Chrome sent an existing Client session to
the dedicated Lawyer re-authentication page without disclosing Client data; the
page retained one H1, one main landmark and no horizontal overflow. This does
not claim a signed-in Lawyer route loop. Both status endpoints reported 8/8
operational with no active/recent incident at `2026-08-28T02:14:34.121Z`.
Worker 156 is the immediate rollback. No production D1, DNS or Sites change was
made; Sites v86 remains live and saved v94 remains unpublished.

## 2026-08-28 Worker 156 document-comparison interaction floor

Commit `7123fb4b842c0d006f82a83b0e72263a0088020c` closes a confirmed compact
document-comparison defect: the recent-comparisons refresh control could shrink
below the 44 px interaction floor inside its flex header. The correction also
normalizes the remaining comparison actions, links, filters and decisions to
the same minimum, with an 11/11 focused source contract.

The exact source passed type-check, lint, production build, artifact budgets,
rendered Worker 35/35, core 1096/1096 and Cloudflare/infrastructure 201/201.
The end-to-end comparison smoke passed upload, comparison, decision, PDF/DOCX
export, download, tenant isolation, invalid-file rejection, monitoring, search
and deletion against local isolated data. GitHub Actions CI `33132278871`
passed Website in 2m29s and Platform in 8m35s.

Worker 156 `b361ae62-1220-4fa3-b480-488d4791bda4`, deployment
`caaa6ee7-ec98-4ef8-80ac-7643cb2f53ca`, now receives 100% production traffic.
Production Chrome measured the corrected refresh control at exactly `44×44`
CSS px at both 320×800 and 390×844, with no horizontal overflow or console
errors. Both status endpoints reported 8/8 operational and no active/recent
incident at `2026-08-28T01:26:35.918Z`. Worker 155 is the exact immediate
rollback. No production D1, DNS or Sites change was made; Sites v86 remains
live and saved v94 remains unpublished.

## 2026-08-28 public accessibility candidate

The public website source now includes a pinned axe/Google Chrome release gate.
The exact built Worker and client assets passed 56/56 desktop/mobile,
light/dark and RU/UZ/EN route/profile combinations with zero automated WCAG
A/AA violations. Theme-aware contrast corrections cover the public home,
Trust, Lawyers, Legal Center, legal-document and knowledge surfaces. Commit
`32947b37a15af1f2bd4c7ffecbfe3e260252ab37` makes every public main target
focusable, gates skip-link focus transfer across the initial 16-sample matrix,
and removes the mobile scrim's duplicate close control from the accessibility
tree and tab order; the current 56-sample gate retains that focus assertion.
Commit
`befa80af5028c48fbc2018fd35f3bf34746c7d46` adds a release guard that rejects
visible text owned by actions or form fields below 12 CSS px and raises the
initial public controls to that floor. Commit
`58ba7bfa6386c6793644693a5c110b1927b99857` expands the matrix to Legal Center,
a legal document, knowledge and video; it corrects the newly exposed 11 px
actions and full dark-theme contrast contract on the legal and knowledge
surfaces. Commit `ed02018eccad42e0ecc1f3ba49694d1cf6734b35` then applies the
same seven-page light-theme matrix to all three public languages. Commit
`5bdd905884834657cdb7223fc9419774c4085e61` extends the computed-size gate to
all visible public text and adds a static source guard; 77 legacy declarations
across 12 public stylesheets now meet the 12 px floor. A manual exact-build
Chrome pass confirmed one H1, one main target, no horizontal overflow and no
visible text below 12 px on the representative RU/UZ/EN desktop/mobile
surfaces. The retained keyboard pass also
confirmed visible tablist focus, working skip focus and mobile dialog focus
wrap/Escape return. Non-video pages still report two axe rule classes for
manual review and video reports three, so this is not represented as WCAG
conformance or as live Sites evidence.

Sites version 94 is saved from exact source commit
`6f5c70f947df14597cca2e289c3b38bbd36b589d`. Its canonical 83-file archive
hash is
`sha256:5896ac705db3ade8f7dcee18e7c8ed1520bbed5c19aa19dc301695ea2ff4d51b`.
The Sites source tree and GitHub `HEAD:apps/website` both resolve to
`da18d6e15db2676d5fff2df1360adbd27eb94bba`; the canonical archive is
7,096,320 bytes. The local package was 4,715,119 bytes with SHA-256
`add42268af05dda9e274b1db222d1caf5c1eb071570a99d7a6f8974bb4a1ab93`.
It is not deployed. The successful public deployment
`appgdep_6a9027658100819189e6e6bc1a20bf1d` still owns version 86; switching to
version 94 requires separate action-time approval. Saved version 93 is now
superseded and must not be selected for release.

GitHub Actions CI `33122475415` passed the exact readable-text source commit
`5bdd905884834657cdb7223fc9419774c4085e61`: Website completed in 2m15s and
Platform in 8m42s, including locked installs, lint, types, tests, deployable
artifacts, the Cloudflare environment matrix, production dependency audit and
licence policy.

## 2026-08-28 authentication error-association candidate

Commit `742ee6f2f7583a61b242310c79d1ef61cd1ecc9a` associates asynchronous auth
errors with the exact live control: Email, OTP and MFA inputs expose
`aria-invalid`, `aria-errormessage` and a descriptive relationship to the
stable atomic alert, while resend failures belong to the resend action.
Terminal OTP/MFA challenge failures return to the email step and move the
relationship to the newly focused email input instead of leaving an orphaned
code error.

The focused contract passed 2/2, Platform type-check and lint passed, and the
full local gate passed development build, rendered smoke, deployable artifact,
budgets, 1094/1094 core tests and 201/201 Cloudflare/infrastructure tests.
GitHub Actions CI `33125681307` passed the exact auth commit. The correction was
deployed in Worker 153 and remains live in Worker 158. The exact production
auth asset contains `aria-errormessage`, `aria-invalid`, the stable `auth-error`
target and an atomic alert. No OTP or MFA form was submitted, so live assistive-
technology announcement remains a bounded manual check rather than a claimed
conformance result.

## Release identity

| Item | Verified value |
| --- | --- |
| Branch | `codex/investor-ready-ecosystem` |
| Latest platform runtime commit | `4eba97cead5c56d47c51dbc1965b5b440871dd5b` |
| Latest platform source candidate | `4eba97cead5c56d47c51dbc1965b5b440871dd5b`; deployed |
| Latest public website source candidate | `5bdd905884834657cdb7223fc9419774c4085e61` |
| Draft PRs | Platform `#64`; public website `#67` |
| GitHub Actions | Current Platform CI `33192562472` on `4eba97ce` passed Website in 2m14s and Platform in 6m54s |
| Production Worker | `juro` version `b67a2ed8-74f8-4d62-968e-87bff9d3e4dc` (version 167), deployment `7f1431fd-3e89-491d-aacc-f1c630ca020e`, 100% traffic |
| Immediate application rollback | `4bd03261-df05-4e5b-9f91-66bd6d8cfdcd` (version 166), deployment `3579b110-a09d-4f53-8563-34ec0d2d5c4e` |
| Public Sites release | Version 86, deployment `appgdep_6a9027658100819189e6e6bc1a20bf1d`; rollback version 85 |
| Saved public Sites candidate | Version 94, source `6f5c70f947df14597cca2e289c3b38bbd36b589d`; not deployed |
| Production D1 | `juro-production`, binding `DB` |
| Applied migrations | `0159_signed_share_verification_guard.sql` and `0160_monitoring_email_delivery.sql`; no migration remains pending |
| Effective price configuration | Four append-only rows effective `2026-08-25T07:44:49.444Z` |

## 2026-08-28 Worker 153-155 auth and status metadata closure

Worker 153 deployed the auth error-association source from `742ee6f2`. Worker
154 deployed `e2af1460`, making the public status title and document language
follow RU/UZ while the bare production status host defaults to Uzbek. Chrome
then found that the root metadata base still pointed status icons at
`app.juro.uz`, which the existing same-origin CSP correctly blocked. Worker 155
deploys `fcdb9e6f`; its allow-listed host-aware metadata base keeps favicon and
Apple icon requests on their actual JURO application host without trusting an
arbitrary Host header or weakening CSP.

The final source passed the two focused root-layout tests, type-check, lint,
development build, rendered HTML 35/35, artifact budgets, core 1095/1095 and
Cloudflare/infrastructure 201/201. CI `33129369444` passed the exact commit.
Chrome then verified on Worker 155:

- bare `status.juro.uz` has `html[lang=uz]`, `main[lang=uz]`, the title
  `Platforma holati — JURO`, one H1/main, private noindex metadata, loaded fonts,
  no overflow and no warning/error/issue messages;
- `/ru/status` has the matching Russian document and content language, localized
  title and the same clean rendering boundary;
- both icon links resolve to `status.juro.uz`, and the favicon and Apple icon
  return `200 image/png`; a sampled application route on the status host remains
  fenced with `404`;
- the original Lawyer-host Client URL reaches the exact localized Client login
  in a clean session rather than `Not Found`.

`/api/status` generated at `2026-08-28T00:30:50.972Z` reported all eight
components operational with zero active or recent incidents. No migration or
D1 write was part of Workers 153-155. Worker 154 was the rollback at that
checkpoint; Worker 158 now uses Worker 157 as its immediate rollback. Sites
version 86 remains the independently deployed public release and saved version
94 remains unpublished.

## 2026-08-27 Worker 151 accessibility and performance closure

Commits `6fa7835e` and `a6008f43` enforce the 44 px interaction floor across
the affected Client routes. Commit
`0bdfe7c04830752e06049ace7afc7575db267499` then reserves the Turnstile layout,
selects the provider's compact mode below the flexible 300 px floor and
re-renders it when a later resize crosses that boundary. Focused tests passed
15/15, the full core suite passed 1090/1090, the infrastructure suite passed
201/201, and production build/artifact budgets, lint and type-check passed.
GitHub CI `33090467509` completed Website and Platform successfully before the
100% deployment.

Live Chrome evidence on the deployed Worker 151:

- Desktop login trace: LCP 521 ms, TTFB 310 ms, render delay 211 ms and CLS
  0.02. Before this correction, the same Turnstile path produced CLS 0.31.
- Chrome 320x800 trace: LCP 248 ms, TTFB 92 ms, render delay 156 ms and CLS
  0.00. The document remained exactly 320 px wide, the auth card was 296 px
  and the compact widget was 150 px, with zero horizontal overflow.
- Changing the same tab from compact mobile to desktop produced the flexible
  widget through the resize observer without overflow.
- Lighthouse 13.4.1 snapshot: 100 Accessibility, 100 Best Practices, 100 SEO
  and 100 Agentic Browsing; 33 checks passed and 0 failed. The exact reports
  are stored in `docs/qa/artifacts/lighthouse-worker151-login/`.
- The six affected authenticated Client routes exposed no undersized public
  target after deployment. The only 21 px candidate was the internal search
  input inside its 44 px label target.
- `/api/status` generated at `2026-08-27T16:06:24.644Z` was operational for
  all eight components with zero active or recent incident.

This is bounded lab and route evidence, not field CrUX, INP, screen-reader or
blanket WCAG-conformance evidence. Authenticated Lawyer and Admin route loops
remain pending until the corresponding protected Chrome sessions are signed in.

## 2026-08-27 Lawyer-host Client-link correction

Worker 148 fixes the exact production defect where
`lawyer.juro.uz/ru/individual/dashboard` returned a plaintext `404`. Known
Client account paths now return a non-cacheable `307` to the fixed
`app.juro.uz` origin for `GET` and `HEAD`; query strings are retained. Writes
are never forwarded across hosts, and unknown Lawyer paths still fail closed
with `404`. The exact commit passed local tests, the three-environment
Cloudflare matrix and GitHub CI `33071334033` before deployment. Post-deploy
HTTP smoke passed and status remained operational 8/8.

A fresh production Chrome reload of the original failing URL followed the live
redirect to `https://app.juro.uz/ru/individual/dashboard` and rendered the
authenticated Client dashboard at 1920×945. It had one localized H1, loaded
fonts, the private `noindex, nofollow, nocache` boundary, zero horizontal
overflow, no role alert and an empty warning/error log. The same Chrome session
reached the dedicated Lawyer re-authentication page without Client-data
disclosure and the Admin fresh-session handoff; their signed-in route loops
remain open until the corresponding protected sessions are established.

## 2026-08-27 Platform privacy correction

Production HTML had exposed absolute Windows build-machine paths in generated
vinext font URLs. Commit `6503667cbf18f249656b29749040cda8b200fd47`
adds a post-transform URL normalizer plus an artifact regression gate.

- Focused tests: 3/3 passed.
- Production build, dry-run, artifact validation, performance budgets,
  type-check and lint passed.
- GitHub CI `33063995387`: Website and Platform successful.
- Built artifact: zero `C:/Users/` and zero `.vinext/fonts` matches.
- Post-deploy production HTML: zero matches; 12 normalized
  `/assets/_vinext_fonts/...` URLs.
- Three sampled normalized WOFF2 assets returned `200 font/woff2`.
- Chrome: Status and authenticated Client dashboard completed font loading,
  rendered their primary headings, contained no absolute build path and
  produced no warning/error log entries.
- Production route smoke retained Client `307`, private API `401`, Lawyer
  `200/307`, Admin `303`, Status `200` and Status application-route `404`.
- `/api/status` reported 8/8 operational and zero active incidents at
  `2026-08-27T11:02:55Z`.
- Wrangler error-only tail produced no event during the post-deploy smoke
  window.

This proves the font-path correction and sampled host boundaries on Worker
147. It does not prove every authenticated write path or the whole ecosystem
Definition of Done.

## Database recovery gate

The pre-migration full export was 155,507,956 bytes with SHA-256
`11a00bda41475ed8fec0030a7cac9bc65d46d5ca9f92219327ebcd14b19d522f`.
Its isolated restore returned `quickCheck=ok`, zero foreign-key violations, 157
migrations, 281 tables, 607 indexes and 378 triggers.

The post-migration full export was 155,660,095 bytes with SHA-256
`2179a00dd03c3173cc3bd7059ed0c9302c458d60f917f59c073bfececb217cec`.
Its isolated restore returned `quickCheck=ok`, zero foreign-key violations, 158
migrations, 282 tables, 608 indexes and 380 triggers.

Both exports and manifests were uploaded to the private
`juro-production-backups` bucket under
`d1/juro-production/2026-08-25/`. Independent downloads matched source byte
lengths and SHA-256 values. The exact local release directory contained ten
temporary SQL, SQLite, manifest and readback files (980,681,954 bytes); it was
removed after the private round trip. Private R2 is the recovery source.

## Effective AI price configuration

The production price table was empty before this configuration. One atomic
insert created exactly four immutable price versions effective
`2026-08-25T07:44:49.444Z`:

| Provider/model/operation | Input / cached input / output microusd per million tokens | Official source |
| --- | --- | --- |
| OpenAI `gpt-5.6-sol` / `responses` | 5,000,000 / 500,000 / 30,000,000 | `https://platform.openai.com/pricing` |
| OpenAI `gpt-5.6-terra` / `responses` | 2,500,000 / 250,000 / 15,000,000 | `https://platform.openai.com/pricing` |
| OpenAI `text-embedding-3-large` / `embeddings` | 130,000 / 0 / 0 | `https://developers.openai.com/api/docs/models/text-embedding-3-large` |
| Anthropic `claude-sonnet-4-6` / `messages` | 3,000,000 / 300,000 / 15,000,000 | `https://platform.claude.com/docs/en/about-claude/pricing` |

The 156,868,036-byte pre export had SHA-256
`df1a19c3a58b7d9929ec535b84f5d47064d90318320fb1bf93d53dcf64e5a7e0`.
The 156,873,094-byte post export had SHA-256
`90f8ad5a6d7c97e7cc24aa8ec068f649e54b7826902ca9f5d4b3fb73208569c8`.
Both isolated restores returned `quickCheck=ok`, zero foreign-key violations,
158 migrations, 282 tables, 608 indexes and 380 triggers; the post restore
contained exactly four price rows. Source exports/manifests and downloaded
readbacks matched byte size and SHA-256 under private prefix
`d1/juro-production/20260825T074158Z-price-config-f42c48fc/`.

On 2026-08-27, the two SQL exports and two manifests were downloaded again from
that exact private prefix. All four files matched the recorded byte sizes and
SHA-256 values. The exact plaintext source directory and the temporary
verification directory were then deleted; `Test-Path` returned false and exact
parent-directory match counts were zero for both. Private R2 remains the
recovery source.

Four successful production provider events exist after the effective timestamp
at the Worker 165 checkpoint. All four are priced, two zero-token failures are
retained, and the estimated priced cost is `$0.104549`. This 4/30 sample is
insufficient to verify the target reduction or preserved quality. Historical
unpriced append-only events remain historical evidence outside the current
measurement window.

## Post-migration verification

- The new verification-guard table, lock index and two secret-state triggers
  exist.
- All six public-token/access-code ciphertext metadata columns exist.
- Live `pragma_foreign_key_check` returned zero rows.
- Production contained zero standalone signed-share rows, so no legacy row
  needed lazy encryption during this release.
- An unknown share token returned `410 LINK_EXPIRED`, `no-store`, and no cookie.
- Five-failure lockout, atomic guard clearing and encryption boundaries are
  covered by the passing local suites; there was no real production share on
  which to perform a destructive lockout rehearsal.

## Live transport and health

POST probes to `http://app.juro.uz`, `lawyer.juro.uz`, `admin.juro.uz` and
`status.juro.uz` returned exact 308 HTTPS redirects while preserving method,
path and query. The redirects were private/no-store. HTTPS login pages returned
200 with HSTS, `X-Robots-Tag: noindex` and private/no-store caching. The Admin
route returned the expected protected-session handoff rather than content.

`https://status.juro.uz/api/status`, generated at
`2026-08-25T06:35:29.802Z`, reported `overallStatus=operational`, all eight
published components operational and no active or recent incident.

The in-app browser rendered the RU and UZ Client login surfaces and the
dedicated RU Lawyer persona. The accessibility tree contained localized
headings, labels, theme controls, language links and the correct Lawyer account
registration destination.

## Analytics and public Sites release — 2026-08-25 checkpoint

GitHub CI `32822786084` passed exact commit `f42c48fc`. Website passed 42/42.
Platform passed rendered HTML 34/34, core 1086/1086 and Cloudflare 201/201,
plus generated types, lint, type-check, deployable artifact, environment matrix,
production dependency audit and licence policy.

At that checkpoint, Sites version 82 contained the exact 121-file
`apps/website` source extracted
from `d0310b90`; source-tree comparison reported identical Git tree
`f35a8f36db9240a281e204f7d7e8b3675d2a18e7` before internal source commit
`ec6b7868ea2a34fc60b609b0b707a153dc984e52` was pushed. The saved archive has
canonical storage hash `sha256:2417277aaad0eda9781816fd861be0080d49c5bff63f03908c5e2001cb016ebb`. The
live custom domain rendered the localized privacy banner. Both consent controls
measured 44 pixels high; choosing essential-only removed the banner without
exposing private data. All 78 canonical sitemap URLs returned a successful
response and `robots.txt` points to `https://juro.uz/sitemap.xml`.

The live public telemetry endpoint returned:

- `204` for a valid same-site `landing_view`;
- `403` for a foreign origin;
- `403` with missing Fetch Metadata;
- `400` for an invalid event/page pair;
- `413` for an oversized body.

Every response was non-cacheable. Cloudflare rate-limiting rule
`b6afd1615e2042c898f2a446c7dbb525` is Active and matches only
`POST` + `app.juro.uz` + `/api/public/analytics`; it blocks for 10 seconds after
20 requests per IP in 10 seconds. This closes the one Low/high-confidence
finding from diff scan `3424a2a8-02aa-42b6-9de1-7b57963082ce`. A deliberate
production burst was not fired from the shared operator IP.

The in-app browser also rendered the public RU home and lawyer catalogue, the
Client login, the dedicated Lawyer login, the fail-closed Admin re-auth surface
and the public status page. The status API generated at
`2026-08-25T08:10:26.036Z` reported `overallStatus=operational`, all eight
components operational and no incident.

## Repository security and public dependency hardening

Standard scan `df6f1247-116c-42b8-b233-a693efb52263` targeted immutable
`e4f407a8`, inventoried 1,898 tracked files and closed 8/8 planned threat
surfaces with zero reportable findings. Its coverage remains PARTIAL because an
independent delegated baseline, TAC and destructive production tests were not
available.

The scan identified advisory-affected transitive PostCSS and Sharp versions as
a dependency-hygiene candidate. Production exploit reachability was rejected:
the public site does not process attacker-controlled CSS or images through
those packages. Commit `81aaf408` pins patched PostCSS `8.5.23` and Sharp
`0.35.3`. Production `npm audit` reports zero vulnerabilities across 716 locked
packages. The release head passed 43/43 website tests, types, lint, licence and
artifact gates.
Exact hardening diff scan `a2cb0d4a-7512-4b0a-aa5e-362681007619` retained zero
findings. Metadata diff scan `fa1b3e34-235b-48e6-8fb4-41e9f731f210` covered all
six changed source files in `33d7f8e3..ee0687af` and retained zero findings.
Social-preview diff scan `1985bd83-d685-4ae3-8978-60f4f469d1e7` covered all
seven changed source files in `3f2bf72e..d0310b90` and retained zero findings.
GitHub CI `32838994132` passed and Sites version 82 succeeded at that checkpoint. The replacement
crawl verified 78/78 exact canonical, RU/UZ/EN hreflang, complete Open Graph
and Twitter metadata, single H1, valid present JSON-LD and indexability; the
in-app browser rendered representative legal, lawyer and EN-video routes with
no overflow or page log. Screenshot capture timed out and is not claimed as
evidence. Status generated at `2026-08-25T10:58:57.247Z` was operational 8/8.

Zone origin TLS was then changed from automatic `Full` to explicit
`Full (strict)`. Sites reported the apex custom-domain SSL active, and the four
application hosts are Worker Custom Domains. Post-change probes retained the
expected six production outcomes (`200/308/200/200/303/200`) and three protected
staging outcomes (`302/302/200`) with no `526`. Status generated at
`2026-08-25T11:25:16.533Z` remained operational 8/8 with no active incident.
The control-plane rollback is the previous `Full` mode.

Cloudflare Security Settings also confirmed that the Free Managed Ruleset is
checked and `Always active`; its viewer lists 31 rules with `Block` actions.
The separate public-analytics rate limit remains active. Custom rules are 0/5,
but this is not represented as absent WAF protection, and no unrelated rule was
added solely to change that count.

## Open release risks

- The Cloudflare account UI showed an overdue balance of USD 381.29 and warned
  about possible service interruption. No financial action was taken.
- Worker 151 now has bounded Lighthouse and Chrome lab traces for the deployed
  login surface. Field CrUX, INP, screen-reader coverage and all-route CWV
  sampling remain unverified and must not be inferred from that snapshot.
- Remote URL document import remains disabled in development, staging and
  production. It must not be enabled until a dedicated SSRF/DNS-rebinding gate
  validates the exact Cloudflare egress path.
- Provider-side retention and regional handling for voice transcription and
  synthesis remain an operational privacy assurance question; repository code
  does not prove a zero-retention contractual boundary.

Release status: the named analytics/cost, website dependency-hardening and
Worker 151 accessibility/performance production releases are verified. This is
not a blanket ecosystem Definition of Done: Cloudflare billing, field/INP
performance evidence and any explicitly PARTIAL browser/device rows remain open.

## 2026-08-28 Sites motion candidate

The public homepage motion correction is source-, build-, test- and local
Chrome-verified. Under the goal's mobile lab profile, the built Cloudflare
Worker candidate produced LCP 1,335 ms, CLS 0.00 and 99 ms total forced reflow;
the landing-page attribution was 2 ms. Live Sites v86 remains the production
baseline at LCP 2,041 ms, CLS 0.00 and 548 ms total forced reflow in the latest
trace. No Sites publish occurred in this checkpoint. A separately authorized
publish, production smoke, identical after-trace and rollback capture remain
mandatory before the motion improvement can be called live.

Live Sites v86 Trust Center has an additional release reason: Lighthouse found
two light-theme contrast failures and scored 96 Accessibility. The built branch
candidate scored 100 Accessibility because it already includes the corrected
Trust palette from `4b104c1c`. No production change was made. The superseding
Sites release must verify both named text nodes at or above 4.5:1 and repeat the
mobile Trust trace; one retained cold trace reached LCP 3,726 ms because TTFB
spiked to 1,891 ms even though two immediate repeats passed.
