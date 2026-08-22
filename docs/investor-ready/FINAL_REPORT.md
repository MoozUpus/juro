# JURO investor-ready ecosystem — final report

Evidence date: 2026-08-22. Branch: `codex/investor-ready-ecosystem`.
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

`lawyer.jura.us` and `lawyer.juro.us` are invalid. Repository tests lock
`lawyer.juro.uz` as the only professional host.

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
  private R2. Queue and DLQ status is included in operational health evidence.
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

Representative production widths passed at 360, 390, 768, 1366 and 1440
pixels. The live monitoring defect found during this pass was fixed and deployed
in commits `49ceed62` and `9dc062fa`.

Two separate authenticated Chrome profiles completed camera/microphone preflight
and joined one production room. Both showed synchronized timers; mute/unmute,
camera-off and simultaneous end-call states passed without raw technical codes.
Cloudflare TURN preflight returned `relayAvailable=true`, and D1 recorded
`provider=cloudflare_realtime_turn`. Screen-share picker selection and forced
reconnect remain narrower open checks rather than inferred passes.

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

## 7. Theme matrix

| Surface | Light | Dark | System |
| --- | --- | --- | --- |
| Public | verified in production Chrome | verified in production Chrome | verified and restored in production Chrome |
| Client | verified in production Chrome | verified in production Chrome | verified and restored in production Chrome |
| Lawyer | verified in production Chrome | verified in production Chrome | verified and restored in production Chrome |
| Admin | fixed Manrope/light surface deployed | not a supported control in the isolated console | not a supported control in the isolated console |

Shared-theme tests preserve cookie precedence over stale per-domain
`localStorage`. Remaining responsive, zoom, reduced-motion and Admin audit-log
replay stays explicit in `QA_MATRIX.md`.

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
plus the Admin before-state and fresh-MFA overview/billing after-state.
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
`727eacbe-7fb6-4012-87a9-3e290edd525b`, using bounded per-source queries and a
safe global top-N merge. Focused tests and all seven production D1 source queries
pass. A final browser replay of this one page is still open because the
local Chrome client began returning `ERR_BLOCKED_BY_CLIENT` for every platform
Admin path before requests reached the Worker.

## 10. Demo script

The investor sequence is maintained in `DEMO_SCRIPT.md`. Production execution
must use only the bounded demo registry and must never create or edit real user
records during the presentation.

## 11. Limitations and release truth

- Production payment approval is off. Billing is an explicit demo foundation;
  no synthetic row is represented as a settled real payment.
- Full local legal-corpus and dense/vector flags are off. The live release uses
  direct official Lex.uz retrieval/metadata and labels monitoring accordingly.
- Platform audit-log/latest-Admin browser replay, Admin responsive widths,
  Chrome zoom, live reduced-motion emulation, screen-share source selection,
  forced reconnect and the final Admin segment of the investor rehearsal remain open.
- Browser/device exclusions in section 8 remain exclusions, not passes.
- `/api/status` returned to a fully operational 8/8 aggregate after the latest
  Worker deploy and scheduled probe, with no stale dependencies or active
  incidents at `2026-08-22T16:40:54.780Z`.

Until the open Chrome items are closed, this document is a release-candidate
report rather than a blanket Definition-of-Done claim.
