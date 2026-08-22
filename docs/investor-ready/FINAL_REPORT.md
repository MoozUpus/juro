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
  audit-hash `GLOB` checks without discarding immutable events. Its full pre/post
  exports, isolated restores and private-R2 SHA-256 round trips passed. Queue and
  DLQ status is included in operational health evidence.
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
- Professional AI, document preparation, analysis, comparison/redline and
  action-plan workflows using existing authenticated backend data.
- Lex.uz metadata monitoring with official-source links and task/document actions.
- Tenant-scoped monitoring-to-task creation with immutable official-source snapshot, exact-case linking, Lawyer/Client rendering and a direct notification handoff.
- Consultation room/signalling foundation, transparent demo billing, 1% case
  fee semantics, configurable 2%/5% rules, Uzum exclusion and admin fee matrix.
- Route-scoped camera/microphone/display-capture policy, actionable RU/UZ device
  errors, TURN credential exchange, idempotent end-call handling and reusable
  bounded demo-call reset.
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

Representative Lawyer production widths passed at 360, 390, 768, 1366 and 1440
pixels. The public catalogue, Client dashboard and final Admin overview later
passed the complete requested 320/360/375/390/430/768/820/1024/1280/1366/1440/
1728/1920 sequence without horizontal overflow. The live monitoring defect found during this pass was fixed and deployed
in commits `49ceed62` and `9dc062fa`.

Two separate authenticated Chrome profiles completed camera/microphone preflight
and joined one production room. Both showed synchronized timers; mute/unmute,
camera-off and simultaneous end-call states passed without raw technical codes.
Cloudflare TURN preflight returned `relayAvailable=true`, and D1 recorded
`provider=cloudflare_realtime_turn`. Screen-share picker selection and forced
reconnect remain narrower open checks rather than inferred passes. A subsequent
call-lifecycle audit fixed the untested failure paths in commit `6eaad19d`:
reconnect is now bounded to three automatic attempts, refreshes short-lived TURN
credentials, uses a fresh peer with ICE restart and rejects callbacks from stale
peers. Display capture now has an explicit stop action and is stopped on track
replacement failure, reconnect, end-call and teardown. CI run `32592751302`
passed both jobs and Worker `b9481033-bd24-4dda-8f75-61b8a7ce2473` deployed the
new asset. This is implementation/deployment evidence, not a substitute for the
still-open live interruption and selected-source checks.

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
clipping. The protected Admin re-auth screen and isolated-host handoff also fit
a 1280×609 viewport at DPR 1.5; a fresh-MFA Admin data-screen pass at 150%
remains open. Settings was again visibly restored to 125%.

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
`e8fc00ed-6249-4e04-9300-8732a4a05e91`, using bounded per-source queries and a
safe global top-N merge. A later fresh-MFA Chrome replay reached the route and
found a second D1-specific fault: migration `0086` generated a 64-term hash
`GLOB` that D1 rejected as too complex. Production migration `0155` now uses
bounded length and character-class checks, retains the immutable chain/index
guards, has no pending successor migration and passed pre/post recovery gates.
The final fresh-MFA Chrome replay and one reload both loaded the localized audit
table without any console warning/error and displayed immutable-chain receipts.
A read-only production D1 aggregate confirmed the two corresponding access
events at `2026-08-22T17:45:54.908Z` and `2026-08-22T17:50:00.687Z`; sensitive
actor, session and hash values were not copied into repository evidence.

## 10. Demo script

The investor sequence is maintained in `DEMO_SCRIPT.md`. Production execution
must use only the bounded demo registry and must never create or edit real user
records during the presentation.

## 11. Final-pass audit in progress

1. **Local-MVP pass.** A tracked live-UI scan found no dormant CTA pattern or
   unlabelled coming-soon route in the investor path. It did find the deliberate
   pre-incorporation app-policy screen: registration policies are still draft
   and contain operator placeholders. This cannot be truthfully closed without
   owner-approved legal identity, address and final RU/UZ editions.
2. **Investor-doubt pass.** Production D1 confirms one active synthetic trial,
   one pending synthetic profile-deletion request, 12 explicitly simulated demo
   payment runs and two immutable post-`0155` audit-access events. After the
   administrator capability/session-expiry fix in commit `4751d3c7` and Worker
   `e8fc00ed-6249-4e04-9300-8732a4a05e91`, fresh-MFA Chrome promoted the
   profile/trial/deletion aggregate to a RU/UZ visual pass without submitting a
   mutation.
3. **Weakest-screen pass.** The isolated Admin overview was the weakest primary
   surface. It was rebuilt around localized publication semantics, clear KPI
   hierarchy, an explicit access boundary and operational quick links, deployed,
   captured and checked across all 13 requested Chrome widths. No weaker primary
   screen has been identified in the current screenshot set, but the remaining
   native Chrome gates below keep the overall audit open.

## 12. Limitations and release truth

- Production payment approval is off. Billing is an explicit demo foundation;
  no synthetic row is represented as a settled real payment.
- Full local legal-corpus and dense/vector flags are off. The live release uses
  direct official Lex.uz retrieval/metadata and labels monitoring accordingly.
- App registration policies remain a versioned pre-incorporation preview with
  visibly unfilled operator identity/address fields. Commercial production still
  requires owner-approved operator details and final RU/UZ legal editions; this
  report does not invent them or represent the draft as legal approval.
- Fresh-MFA Admin data screens at Windows scale 150%, screen-share source
  selection and forced reconnect remain open. Native Chrome page zoom is
  intentionally `NOT TESTED` by the latest explicit user instruction. The
  Client dashboard, 19-route Lawyer suite and protected Admin re-auth surface
  passed Windows-scale 150%, and the host was restored to 125%. The
  forced-reconnect and capture-cleanup source,
  focused tests, full CI and production asset are verified, but no live network
  interruption or selected-source remote rendering is inferred from them. The
  platform trial/deletion segment passes in fresh-MFA RU and UZ Chrome with
  direct navigation and refresh.
- Browser/device exclusions in section 8 remain exclusions, not passes.
- `/api/status` returned to a fully operational 8/8 aggregate after migration
  `0155` and remained operational after Worker
  `5438d2e3-b0b5-4e4e-8af6-c1fc910aabcd` (version 121): independent
  app/status-host reads generated at `2026-08-22T21:47:14.564Z` and
  `2026-08-22T21:47:15.633Z`
  showed no stale or degraded component and zero active or recent incident.

Until the open Chrome and legal-publication items are closed, this document is a
release-candidate report rather than a blanket Definition-of-Done claim.
