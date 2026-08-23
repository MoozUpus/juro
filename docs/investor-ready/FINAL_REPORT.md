# JURO investor-ready ecosystem — final report

Evidence through 2026-08-23 (Tashkent). Branch: `codex/investor-ready-ecosystem`.
Draft PR: [#64](https://github.com/MoozUpus/juro/pull/64).

This report separates implemented code, deployed production state and observed
Chrome evidence. An item is not promoted to complete solely because its build
or deploy passed.

## 1. Ecosystem map

| Surface | Canonical production host | Responsibility |
| --- | --- | --- |
| Public | `juro.uz` / canonicalized `www.juro.uz` | Product, trust/legal content and public lawyer marketplace |
| Client | `app.juro.uz` | Authenticated client/business LegalTech workspace |
| Lawyer | `lawyer.juro.uz` | Host- and role-gated professional practice workspace |
| Admin | `admin.juro.uz` | Isolated staff console with host-only session and fresh-MFA checks |
| Status | `status.juro.uz` | Public operational status and incident history |

Repository tests lock `lawyer.juro.uz` as the only professional host and reject
every noncanonical variant.

A fresh 2026-08-23 public-edge pass resolved all six named hosts through
Cloudflare, confirmed the expected apex/app/lawyer/admin/status responses and
the `www` 308 canonical redirect, and checked `robots.txt` plus the live
sitemap. Every one of the 78 RU/UZ/EN sitemap URLs returned HTTP 200; all 78 use
the `juro.uz` host and neither forbidden lawyer-domain variant appears in the
tracked repository or public discovery files. This is public HTTP coverage,
not authenticated route or browser-state evidence.

## 2. Before audit

The initial production review found four investor-visible risks:

1. the dedicated lawyer host was not consistently treated as the canonical
   professional entry point;
2. public unlocalized lawyer catalogue/profile paths were incomplete and `www`
   canonicalization could lose the intended navigation context;
3. the admin surface used weaker typography and overflowed on its lawyer table
   at a 390-pixel Chrome viewport;
4. live long Lex.uz titles expanded the lawyer monitoring grid to 3013 pixels on
   a 1536-pixel desktop viewport.

The corresponding before evidence is in `screenshots/before/`.

## 3. Architecture

- The public Sites project is version 74, fronted by the public routing Worker.
- The platform Worker serves the client, lawyer and status hosts with canonical
  host-aware routing and server-side persona/role enforcement.
- Admin is a separate Worker service with a separate host-only session. Every
  privileged request rechecks staff capability and current MFA evidence.
- Production D1 is the system of record; private files and verified backups use
  private R2. Corrective migration `0155` replaces D1-incompatible expanded
  audit-hash `GLOB` checks without discarding immutable events. Migration `0156`
  adds request-scoped reply/pin/typing state and immutable lawyer-only internal
  notes. Migration `0157` adds an explicit no-show outcome constrained to a
  completed consultation with no result note. The `0157` full pre/post exports,
  isolated restores and private-R2 SHA-256 round trips passed; no migration
  remains pending. Queue and DLQ status is included in operational health
  evidence.
- AI uses OpenAI and Anthropic with direct official Lex.uz grounding. Advice.uz
  ingestion and the local full-corpus flags remain disabled in this release.
- Cloudflare Realtime provides call room transport; TURN credentials are Worker
  secrets and are absent from repository and evidence files.

## 4. Implemented changes

- Canonical lawyer-host routing, clean professional paths and legacy entry
  redirects.
- Separate lawyer onboarding/application, consent publication, 90-day trial,
  profile editing and admin-decided deletion lifecycle.
- Professional dashboard, assigned requests, clients, matters, messages,
  documents, tasks, time recording, conflict check and knowledge base.
- The request chat now includes search, replies, copy, one persisted pin,
  typing/read/delivery state, retry/unread presentation, eight private
  lawyer-only AI-assist modes, and document-linked internal notes that require an
  explicit conversion before becoming a case task. Compact chat context cards
  expose the current proposal, payment/case action, consultation/call action and
  document requests without mixing private notes into Client reads. AI output is
  never sent to the client automatically, and the server omits AI/note data from
  Client reads.
- Professional AI, document preparation, analysis, comparison/redline and
  action-plan workflows using existing authenticated backend data.
- Lex.uz metadata monitoring with official-source links and task/document actions.
- Tenant-scoped monitoring-to-task creation with immutable official-source snapshot, exact-case linking, Lawyer/Client rendering and a direct notification handoff.
- Consultation room/signalling foundation, transparent demo billing, 1% case
  fee semantics, configurable 2%/5% rules, Uzum exclusion and admin fee matrix.
- Route-scoped camera/microphone/display-capture policy, actionable RU/UZ device
  errors, explicit camera/microphone/speaker selection, WebRTC-stat network
  quality, audio-only state, TURN credential exchange, idempotent end-call
  handling and reusable bounded demo-call reset.
- Three bounded demo accounts, three synthetic payment records and one
  consent-published demo lawyer. Synthetic data is labelled and bounded.
- Auto-published profiles now use neutral publication language on public,
  Lawyer and Admin surfaces; no badge implies a JURO verification that did not
  occur. The Admin console no longer offers manual initial approval as the
  normal publication path.
- Manrope and navy/gold visual system across public, client, lawyer and admin
  surfaces; gold professional navigation accents and responsive containment.
- Canonical public catalogue/profile redirects in Sites 74 with query retention.

## 5. Lawyer platform

Authenticated Chrome exercised the production dashboard plus requests,
schedule, matters, clients, messages, documents, tasks, profile, calendar,
security, billing, AI chat, document builder, document review, monitoring,
knowledge, settings, demo payments and help. These routes produced no new
warning/error console logs and no page-level horizontal overflow.

The `0156` chat release passed rendered HTML 33/33, core 1068/1068 and
Cloudflare 201/201 locally, then GitHub CI `32608885211`. Its first authenticated
Lawyer load exposed a schema mismatch confined to the new private-note query:
`user_profiles` has no `display_name`. Commit `e25a9fee` reads the canonical
`lawyer_profiles` identity instead; focused tests, dry-run and CI `32609779920`
passed, and Worker `00e80afc-a659-4158-827b-1b73228cf862` deployed at 100%.
Two-profile Chrome then loaded the same synthetic request history, verified
search and local reply preview, kept the Client free of private AI/notes, and
rendered both 1536-pixel pages at 1521/1521 without overflow. Synthetic
send/pin/AI/note-to-task mutations remain pending exact action-time confirmation.

The follow-up `0157` release passed rendered HTML 33/33, core 1069/1069,
Cloudflare 201/201, production artifact/performance budgets, dependency audit and
GitHub CI `32612175998`. Migration `0157` passed pre/post full-export recovery
gates and private-R2 readback, then Worker
`ecabef2f-cd37-40f0-9e20-66803b753f3b` took 100% traffic. Authenticated RU and UZ
Lawyer Chrome rendered two context cards, the call action and the private
AI/note boundaries at 1521/1521 pixels without overflow. Chrome itself blocked
the Client profile and protected call-route navigation with
`ERR_BLOCKED_BY_CLIENT`; the deployed hashed call asset proves device enumeration,
speaker switching, WebRTC stats, network-quality and audio-only code, but this
release does not mislabel that artifact check as a new live device-selector pass.

Representative Lawyer production widths passed at 360, 390, 768, 1366 and 1440
pixels. The public catalogue, Client dashboard and final Admin overview later
passed the complete requested 320/360/375/390/430/768/820/1024/1280/1366/1440/
1728/1920 sequence without horizontal overflow. The live monitoring defect found during this pass was fixed and deployed
in commits `49ceed62` and `9dc062fa`.

Two separate authenticated Chrome profiles completed camera/microphone preflight
and joined one production room. Both showed synchronized timers; mute/unmute,
camera-off and simultaneous end-call states passed without raw technical codes.
Cloudflare TURN preflight returned `relayAvailable=true`, and D1 recorded
`provider=cloudflare_realtime_turn`. A subsequent call-lifecycle audit fixed the
previously untested failure paths in commit `6eaad19d`:
reconnect is now bounded to three automatic attempts, refreshes short-lived TURN
credentials, uses a fresh peer with ICE restart and rejects callbacks from stale
peers. Display capture now has an explicit stop action and is stopped on track
replacement failure, reconnect, end-call and teardown. CI run `32592751302`
passed both jobs and Worker `b9481033-bd24-4dda-8f75-61b8a7ce2473` deployed the
new asset.

The live two-profile follow-up then closed both remaining gates. Client shared
only the selected public `juro.uz/ru` tab: its control changed to `Остановить
показ`, Lawyer rendered the 1920×962 display stream, and stopping returned both
peers to the 1280×720 camera stream. Closing the Lawyer tab produced the real
`attempt 1/3` reconnect state on the unchanged Client tab; reopening and joining
the same room recovered both remote streams while Client retained its original
timer. D1 independently recorded `reconnected` and the replacement Lawyer
`joined` events. No camera or display frame was retained.

The same pass exposed peer-side teardown missing after a one-sided End. Commit
`25ba7dbe` makes ended-room heartbeats idempotently persist `left_at`, return the
terminal room state and stop/null every local media source. Focused tests passed
6/6 and the full local release suite remained green. Worker
`2cce22c9-1c43-41cb-ad7f-8a0555ca3710` (version 123) deployed the correction.
In a fresh production room, Lawyer alone pressed End; Client transitioned on its
next heartbeat without a click, and both sides reported paused `readyState=0`,
0×0 remote/local videos. D1 recorded both participant `left_at` values, one
terminal event and zero signals. Both exact synthetic QA rooms were removed with
their ephemeral rows while immutable workspace audit events remained.

A later production header audit found that non-call Platform pages still
advertised microphone access. Commit `b9faf4bd` denies microphone access on
every non-call route while preserving the exact protected call-route allowlist.
Local type-check, lint, production build, rendered HTML 33/33 and artifact
validation passed; GitHub CI run `32594218794` passed both jobs. Worker
`2ab9e425-6a1f-4126-a244-99f27f25861c` (version 120) deployed the correction.
Fresh app-login, Lawyer-root and status-root responses all returned HTTP 200
with camera, display capture and microphone denied. A new live call preflight is
not inferred from those non-call reads; the allow branch remains rendered-test
verified.

The final Admin re-auth and Lawyer clean-view correction is commit `06239de4`.
GitHub CI run `32599975102` passed both jobs, and the reviewed production release
script deployed Worker `5438d2e3-b0b5-4e4e-8af6-c1fc910aabcd` (version 121).
Post-deploy authenticated Chrome rendered the exact Requests, Schedule, Clients,
Matters, Messages, Documents and Tasks screens on all seven visible clean Lawyer
URLs at DPR 1.25 with no page overflow. The enabled legacy Admin routes now
render the localized protected re-auth surface instead of an opaque 404: all 13
RU routes and an UZ representative passed. The disabled
`/admin/legal-sources/reviews` surface intentionally remains 404 behind its
production feature flag.

The same rehearsal created and stopped a five-second billable timer, ran a
one-result conflict check, saved a favourite case-linked knowledge note and
advanced an isolated simulated payment through preview, success and refund.
Read-only production D1 queries confirmed the timer, immutable conflict event,
knowledge record and three payment events.

## 6. Client to lawyer flow

The implemented flow is:

1. client creates or selects a tenant-scoped case;
2. client submits an anonymized lawyer request with explicit access consent;
3. lawyer performs the restricted conflict check and sends an offer;
4. client accepts through the demo checkout foundation;
5. an active `lawyer_access_grant` controls case/document visibility;
6. participants use request messages and a confirmed consultation room;
7. completion gates the private review and moderation lifecycle.

Backend tests prove tenant scope, consent, grant/revoke, private notes, offer,
message, phone and review guards. Production Chrome then replayed the complete
non-call Client route suite: dashboard, saved clarification-first AI history,
populated synthetic document and preview, marketplace/profile, accepted request,
active grant, messages, confirmed consultation, case plan, calendar, billing,
notifications, profile/settings/security and monitoring. A monitoring task
notification opened the exact case plan, and a Client attempt to open a Lawyer
route was denied without exposing professional data. The two-party Client/Lawyer
media call also passed. The authenticated Client dashboard passed
360/390/768/1366/1440 widths, and a live AI request completed with a direct
official Lex.uz link whose article 217 text was opened and checked in a second
Chrome profile.

A later authenticated responsive replay covered 20 top-level Client routes at
both 390×844 mobile and 768×1024 tablet viewports: dashboard, AI, builder,
review, cases, documents, plans, calendar, archive, history, consultations,
lawyers, monitoring, notifications, billing, profile, settings, security,
demo payments and help. Every route retained its canonical URL and Manrope,
returned a real page rather than 404, fit the root width without horizontal
overflow and produced no browser warning/error log. This is Chrome responsive
viewport evidence, not a physical-device claim.

The same 20-route set later passed an 844×390 landscape loop under restored
System. The AI-chat composer was checked separately after load and scroll: its
bottom was 221 pixels while the fixed mobile navigation started at 322 pixels,
so the input remained reachable without overlap. This does not simulate an
on-screen mobile keyboard and is not promoted to that separate gate.

## 7. Theme matrix

| Surface | Light | Dark | System |
| --- | --- | --- | --- |
| Public | verified in production Chrome | verified in production Chrome | verified and restored in production Chrome |
| Client | verified in production Chrome | verified in production Chrome | verified and restored in production Chrome |
| Lawyer | verified in production Chrome | verified in production Chrome | verified and restored in production Chrome |
| Admin | fixed Manrope/light surface deployed | not a supported control in the isolated console | not a supported control in the isolated console |

Shared-theme tests preserve cookie precedence over stale per-domain
`localStorage`. The polished Admin overview passed every requested viewport from
320 through 1920 pixels. Remaining full-matrix responsive coverage and the
user-excluded native Chrome page-zoom check stay explicit in `QA_MATRIX.md`.

Client theme coverage was later expanded beyond dashboard screenshots. All 20
top-level Client routes passed a 390×844 loop in explicit Dark and a second loop
in explicit Light. Every route kept the selected `data-theme`, Manrope and its
canonical URL, while the shell/text computed colors changed from dark/light
(`rgb(9,20,30)` / `rgb(238,243,246)`) to light/dark
(`rgb(248,246,242)` / `rgb(16,35,51)`). Neither loop produced a 404,
horizontal overflow or browser warning/error log. System was then restored,
survived reload and remained selected after returning to the normal 1536-pixel
dashboard viewport.

Windows scale was also exercised directly rather than inferred from viewport
emulation. Settings changed 125% to the recommended 150%, the authenticated
Client dashboard rendered at DPR 1.5 with a 1280×665 viewport and 1265-pixel
document width without horizontal overflow, and Settings was then visibly
restored to 125%. A later stable connection repeated the system-scale transition
and exercised 19 authenticated Lawyer routes at DPR 1.5 and a 1536×769 viewport.
Every route stayed within the root width and the dashboard screenshot showed no
clipping. A final fresh-MFA pass rendered the isolated Admin overview, profiles,
reviews and Legal Corpus plus the Platform fee matrix, 200-row immutable audit
view and lawyer lifecycle/deletion controls at DPR 1.5 and 1280×609. Every root
stayed at or below the viewport; the loaded Manrope face, the expected 1%/2%/5%
sandbox rules and the pending `SYNTHETIC DEMO` deletion were visible. The safe
overview capture is indexed with SHA-256
`173E7D5980C171504A05D7F5F09BEB986FA424FA9D2A25DF3BA225EA14A0A4CD`.
Settings was again restored to DPR 1.25, and native Chrome page zoom was never
changed.

Reduced motion was exercised through the real Windows preference rather than a
browser override. With Animation effects temporarily disabled, the authenticated
Client dashboard changed `prefers-reduced-motion` from false to true, reduced
the computed `body` color transitions from 180 ms to 0.01 ms and the Platform
sidebar transform from 220 ms to the design system's bounded 120 ms feedback.
After the check, Animation effects were visibly restored and Chrome returned to
`no-preference` with the original computed durations.

## 8. Browser and device coverage

Chrome is the only approved browser for this goal. Desktop and responsive
emulation are recorded independently from physical-device evidence.

Edge, Firefox, Safari/WebKit and physical iPhone/iPad/Android are intentionally
`NOT TESTED` by user instruction. They are not inferred from Chromium results.

## 9. Screenshots

The evidence index is `screenshots/README.md`. It includes public home, catalogue,
profile and responsive evidence; Client System/Dark, notifications, populated
synthetic document and monitoring-task source; Lawyer Light/System and Dark,
responsive views, live monitoring, source-linked task, AI, billing and profile;
plus the Admin before-state and final polished fresh-MFA overview/billing
after-state.
The index also contains a privacy-safe production Client call preflight capture;
live camera frames were not retained in the repository.

Admin Demo now has an active TOTP factor. The fresh-MFA handoff created the
separate production Admin session and Chrome verified overview, lawyer profiles,
review moderation, Legal Corpus and the platform fee matrix. The fee view showed
the fixed 1% consultation policy, explicit 2%/5% rules, sandbox-only transactions
and immutable configuration history. Fresh-MFA overview and billing captures are
included in the evidence index.

That pass also found a previously hidden audit-log failure: production D1
rejected the seven-term compound query. The fix first shipped in Worker
`073aac71-2aa2-4083-948e-1c4c12f1fd68` and is retained in current Worker
`ecabef2f-cd37-40f0-9e20-66803b753f3b`, using bounded per-source queries and a
safe global top-N merge. A later fresh-MFA Chrome replay reached the route and
found a second D1-specific fault: migration `0086` generated a 64-term hash
`GLOB` that D1 rejected as too complex. Production migration `0155` now uses
bounded length and character-class checks, retains the immutable chain/index
guards and passed its pre/post recovery gates. Migration `0157` is now the
latest applied migration, with no pending successor.
The final fresh-MFA Chrome replay and one reload both loaded the localized audit
table without any console warning/error and displayed immutable-chain receipts.
A read-only production D1 aggregate confirmed the two corresponding access
events at `2026-08-22T17:45:54.908Z` and `2026-08-22T17:50:00.687Z`; sensitive
actor, session and hash values were not copied into repository evidence.

## 10. Demo script

The investor sequence is maintained in `DEMO_SCRIPT.md`. Production execution
must use only the bounded demo registry and must never create or edit real user
records during the presentation.

## 11. Three final investor-ready passes

1. **Local-MVP pass.** A tracked UI scan found one disabled public-URL beta panel
   on the primary document-review route. Commit `787f009f` removes that unavailable
   flow from the investor path while its API remains deny-by-default; file upload
   and analysis remain the complete working route. No empty/placeholder CTA or
   unlabelled coming-soon route remains in the scripted demo. Registration
   policies remain an explicitly versioned pre-incorporation preview and cannot
   be truthfully published without owner-approved legal data.
2. **Investor-doubt pass.** Production D1 confirms one active synthetic trial,
   one pending synthetic profile-deletion request, 12 explicitly simulated demo
   payment runs and two immutable post-`0155` audit-access events. After the
   administrator capability/session-expiry fix in commit `4751d3c7` and Worker
   `e8fc00ed-6249-4e04-9300-8732a4a05e91`, fresh-MFA Chrome promoted the
   profile/trial/deletion aggregate to a RU/UZ visual pass without submitting a
   mutation.
3. **Weakest-screen pass.** The isolated Admin overview had already been rebuilt
   around localized publication semantics, clear KPI hierarchy, an explicit
   access boundary and operational quick links, then checked across all 13
   requested Chrome widths. Comparing that result with the other primary screens
   exposed the active-trial heading as the remaining weak Dark Lawyer detail:
   its fixed navy foreground was replaced by theme-aware primary text and a gold
   icon in commit `787f009f`. Worker 124 carries both final-pass corrections.

## 12. Limitations and release truth

- Production payment approval is off. Billing is an explicit demo foundation;
  no synthetic row is represented as a settled real payment.
- Full local legal-corpus and dense/vector flags are off. The live release uses
  direct official Lex.uz retrieval/metadata and labels monitoring accordingly.
- App registration policies remain a versioned pre-incorporation preview with
  visibly unfilled operator identity/address fields. Commercial production still
  requires owner-approved operator details and final RU/UZ legal editions; this
  report does not invent them or represent the draft as legal approval.
- Native Chrome page zoom is intentionally `NOT TESTED` by the latest explicit
  user instruction. The Client dashboard, 19-route Lawyer suite and fresh-MFA
  Admin data screens passed Windows-scale 150%, and the host was restored to
  125%. Selected-source sharing, capture stop, forced reconnect and one-sided
  remote end propagation passed separately in two authenticated Chrome profiles.
  The platform trial/deletion segment passes in fresh-MFA RU and UZ Chrome with
  direct navigation and refresh.
- Browser/device exclusions in section 8 remain exclusions, not passes.
- `/api/status` remained fully operational after migration `0157` and Worker
  `ecabef2f-cd37-40f0-9e20-66803b753f3b`. Fresh app and status-host reads
  generated at `2026-08-23T02:23:40.568Z` and `2026-08-23T02:23:40.997Z`
  reported all eight components operational, no non-operational component and
  zero active incidents.
  The live content-hashed Admin launch asset contains Manrope and no previous
  inline Inter declaration.

Until the owner-supplied legal-publication items are closed, this document is a
release-candidate report rather than a blanket Definition-of-Done claim.
