# JURO known limitations checkpoint

> Malware-scanner local candidate — 2026-08-04: migration `0068` and a
> provider-neutral internal service contract now cover strict response-schema
> validation, source/R2 SHA verification, tenant fencing, immutable terminal
> evidence, idempotent clean promotion, infected quarantine, and downstream
> analysis enqueue only after a clean verdict. This is not a scanner claim.
> Read-only Wrangler evidence says the current account does not have Workers
> Paid/Cloudflare Containers access, and Docker is absent locally; therefore no
> ClamAV image, service binding, malware Queue producer/consumer, migration
> `0068`, or staging deployment was activated. All checked-in environments
> remain fail-closed with no scanner binding until a real privacy-approved
> service and EICAR/clean-file staging evidence exist.

> Access redirect diagnosis — 2026-08-04: cookie-free HTTP traces for `/`, the
> AI-new route and voice route each make exactly one expected `302` to the
> Cloudflare Access login and finish there with `200`. DNS/Worker/Access policy
> is therefore not the observed loop source; the loop is confined to stale
> Chrome login state. No cookies or authentication state were modified without
> owner confirmation.

> Evaluation-harness checkpoint — 2026-08-04: the 314-scenario legal gate now
> uses unique RU/UZ prompts, account-type coverage, explicit expected behaviors
> and live same-host HTTPS citation verification; an allowlisted-looking but
> nonexistent URL no longer passes. The 100-package document gate now requires
> unique artifact hashes and enforces all requested aggregate thresholds plus 30
> reviewed comparison pairs. These are stronger validators, not quality results:
> 314 reviewed legal outputs, 100 real document artifacts, a real malware
> scanner/provider run and named human review remain outstanding. Chrome staging
> QA is currently blocked by a stale Cloudflare Access redirect loop; no cookies
> or OTP state was changed without owner approval.

> Deadline-calculation checkpoint — 2026-08-04: migration `0067` and the
> preview/confirm/task-evidence flow are deployed to protected staging after a
> verified private-R2 backup/round-trip/restore. The calculator has no
> owner-approved authoritative Uzbekistan holiday-calendar feed and no reviewed
> legal-source verification workflow, so every result is intentionally marked
> `preliminary`. User-supplied calendar/version/legal-basis text is evidence of
> input, not proof of law. Authenticated staging RU/UZ browser, keyboard, mobile,
> historical-law applicability and official holiday review remain open.

> Current authoritative runtime checkpoint — 2026-08-04: read-only Cloudflare
> and D1 evidence confirms active staging Worker
> `5e85ee33-f7ec-4e5d-a726-431c67ea46f0` at 100% traffic and schema through
> `0067`; guest and voice migrations are applied. Provider transport is no
> longer the cause of the earlier unavailable state: the latest closed OpenAI
> and Anthropic probes succeeded, and aggregate `ai_runs` metadata contains
> completed runs for both providers after the last historical OpenAI failure.
> This does not prove an authenticated RU/UZ browser flow, citation quality or
> legal accuracy. See `STAGING-AI-RUNTIME-2026-08-04.md`.
> All seven reviewed staging Queues now have producer/consumer attachment;
> `notification.dispatch` passed a remote identifiers-only neutral-rejection
> probe. Malware scanning remains deliberately unattached and fail-closed.
> Canonical case section routes are deployed and anonymously proven to remain
> behind Access, but authenticated case-data, keyboard, responsive and human
> RU/UZ browser journeys remain unclaimed.

## Guest AI local candidate — 2026-08-03

- The one-answer route, encrypted 24-hour storage, clarification flow,
  Turnstile/rate-limit boundary and scheduled purge are implemented and tested
  locally.
- Additive migration `0065_guest_ai_sessions.sql`, private-R2 backup, disposable
  restore rehearsal, migration checks and staging deploy are complete. Production
  keeps `GUEST_AI_ENABLED=false`.
- Real-provider guest smoke and protected RU/UZ browser/accessibility QA are open.

> Current authoritative checkpoint — 2026-08-03: this section supersedes an
> older historical statement below when they conflict. `juro-platform-staging`
> is deployed as Worker version `6ec3e8ab-434b-4ab5-98db-c26908d6c8a3`, with
> isolated `juro-staging` D1, staging R2/Queues/Vectorize, and no production
> mutation. Read-only secret inventory confirms names for OpenAI, Anthropic,
> Resend, Turnstile and the identity keyring; it does not prove provider calls.
> `STAGING_SYNTHETIC_PROBES_ENABLED` is currently `false`. Historical fixed
> synthetic connectivity records prove the current Anthropic staging model can
> return a structured response, but they do not prove a user legal-chat flow.
> The configured OpenAI model produced stored `PROVIDER_UNAVAILABLE` runs; the
> Worker attempts its configured Anthropic fallback for that failure class, but
> a successful authenticated fallback run is still required before claiming
> AI-chat availability. The document malware
> gate remains fail-closed, so uploads
> cannot reach extraction or AI. The approved rigged 3D Jurobek asset is absent;
> voice-with-avatar remains off with text-only fallback. The local browser
> control runtime remains unavailable, so visual, accessibility and real-device
> assertions are open. Production remains unchanged.

> The staging deployment includes a search-route compatibility fix for a
> local or partially migrated D1 schema without `tasks` or `lawyer_profiles`.
> It is locally covered and does not replace the requirement to apply and verify
> the planned migrations in staging before a release.

> Phase 5 OCR checkpoint — 2026-07-31: migration `0042` and the Workers AI
> `toMarkdown` OCR/extraction consumer pass locally, including tenant isolation,
> integrity, retry, replay, R2 derivative, outbox chaining, and account-purge
> tests. This does not open uploads: the real malware scanner remains absent, so
> new files stay quarantined. The owner reports staging provider secrets entered,
> but no current control-plane readback or eligible safe-file provider run has
> been captured. The 100-package/30-comparison review, page coordinates,
> multi-file packages, corrected versions, and redline release gates remain open.
> Current staging delta — 2026-07-31: exact publication/lifecycle/hash replay and dual-corpus freshness enforcement are deployed only to owner-protected staging. Staging has zero successful complete corpus runs for both Lex and Advice; therefore the truthful state is `unavailable`, not fresh. The system withholds confirmed chat conclusions and legal-compliance analysis until that evidence exists. Live legal/provider behavior remains unclaimed because only fixed synthetic provider probes are verified.


> Current checkpoint — 2026-07-31: bounded Advice RU/UZ-Latin fetch and parse are proven in protected staging, not production. The resulting versions are unverified and pending human review; publications, reading rows, and Advice vectors are zero. Broad corpus sync, historical revisions, citation verification, authenticated browser QA, human legal evaluation, and live OpenAI/Anthropic execution remain blockers. `STAGING-0038-ADVICE-EVIDENCE.md` supersedes stale disabled/no-live-fetch statements below.

Updated: 2026-07-30
Scope: current integration branch after the first local Phase 3 legal-source
foundation checkpoint.

## Release blockers

- migrations `0022`–`0034` are applied to `juro-staging`; the `0034` migration-specific full/schema/data/manifest exports, private-R2 round trips, isolated pre-change restore, postflight, and deployment pass. Operational RTO/RPO under representative load remains unverified;
- the protected staging Worker, custom domain, exact resource bindings, public
  Turnstile site key, and three server-only secret binding names are verified;
  exactly the email and data-retention Queue consumers plus one five-minute cron are active; legal ingestion and staff APIs remain deliberately disabled;
- Cloudflare Access is enabled with a staging-only owner policy and anonymous
  requests are denied before application content with a no-store redirect;
- aggregate D1 evidence shows three provider-accepted and consumed OTP
  challenges, but it is not correlated with a captured current-version
  browser run, recipient mailbox evidence, or the provider-failure matrix;
- `IDENTITY_PROTECTION_MODE` remains `legacy`: the single staging profile and
  all three retained OTP challenges have zero protected/keyed evidence. The
  guarded dual-write/backfill/verification gate remains a release blocker;
- the staging `IDENTITY_KEYRING` secret name exists, but a controlled Cron/Queue rerun after the owner-reported secret re-entry still returned `STAGING_SYNTHETIC_PROBE_IDENTITY_FAILED`. It created no request/profile/file/evidence rows or R2 object, and the final Worker version restores the probe flag to `false`. The opaque value must be corrected through protected Cloudflare controls and retained in a protected recovery copy before another controlled rerun;
- local test totals (27 rendered route + 284 core + 80 Cloudflare = 391), remote schema checks, and authenticated RU/UZ personal/business builder QA now pass on the current Worker. They do not substitute for full auth/cookie/replay, cross-account, 200% zoom, reduced-motion, axe, Lighthouse, real-device, and provider matrices.

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
- positive `Crawl-delay` directives use a D1-fenced per-environment/per-host
  window; a busy window retries through the existing queue path and never makes
  a Worker sleep. Live source-fetch evidence remains an external staging gate;
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
  comparable-region email jobs and migrations `0030`–`0032` are deployed to protected staging, but exact protected-staging HTTP/cookie/replay evidence and real security-mail delivery remain incomplete;
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
- business acceptance redirects to the workspace-aware canonical URL; business creation is atomic/idempotent with full/short identity, and migration `0034` plus authenticated remote creation/switch/browser evidence pass. Cross-account HTTP proof remains open;
- the owner/member model and invitation flow do not prove tenant isolation for
  every object domain.

## Broader Phase 2 gaps

- canonical localized root/auth/onboarding routing, Uzbek-default behavior,
  structured personal-profile completion, persona-preserving workspace
  selection, canonical business `workspaceId` routes, and the tested
  `/main` to `/dashboard` migration are deployed on protected staging; bounded authenticated builder/browser evidence passes, while the full auth/onboarding matrix, policy approval, deletion purge/recovery, and externally reachable staff administration are not complete;
- the local staff-role foundation remains deliberately unreachable and has no
  operator bootstrap or customer-resource access grant;
- no production behavior or UI was replaced, and no production migration or
  deployment is authorized by this checkpoint.

## Legal knowledge gaps

- verified retrieval is now implemented as bounded exact lexical matching plus
  full publication/lifecycle/reading evidence replay, but hybrid Vectorize
  retrieval, reranking, article-level semantic citation verification, and the
  250+50 scenario human-reviewed evaluation remain open;
- freshness enforcement is implemented, but staging has no qualifying complete
  Lex-and-Advice corpus run. A successful page fetch does not close this gate;
  current staging must remain `unavailable` until both source families complete
  a recorded corpus run;
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

This does not prove physical location or compromise. Travel, carrier routing, VPNs, cookie clearing, and stolen continuity cookies can still create false positives or influence novelty. Migrations `0030`–`0032` and the reviewed email consumer are deployed to protected staging; real Resend delivery, operator DLQ/redrive, and protected primary/MFA HTTP flows remain unverified. Production is unchanged.

## Account-deletion staging limitations

The account-deletion D1/R2 slice is deployed to owner-only protected staging. Schema/integrity, runtime bindings, consumer/DLQ attachment, anonymous Access denial, one completed cron run, and private-R2 backup round-trip are verified; an authenticated synthetic deletion through HTTP/UI is still open. User-document Vectorize deletion is intentionally absent because that index does not yet accept user content. Provider-side AI retention deletion, guest purge, voice-audio purge, legal holds, scheduled backup automation, operator redrive UI, and a measured incident RTO remain open.

A blocked immediate request cannot be cancelled, by design, but can be retried after the blocker is removed. Recoverable blocked requests may either cancel or retry before the irreversible boundary. Once R2 deletion begins, cancellation is impossible and retry is the only safe completion path.

Production async runtime, cron, and account purge remain disabled. The protected staging evidence does not authorize production migration, production functional deployment, or production UI replacement.
## Legal-source Phase 3 residual limits

The staging Lex acquisition/parse slice is operational, but it is not a production legal knowledge base. The only live source remains fetched/pending_review and cannot be used by the AI until an authorized legal reviewer explicitly approves immutable evidence. Sections, chunks, and Vectorize publication remain empty by design.

Advice ingestion, RU/UZ corpus coverage, historical revisions, midnight Asia/Tashkent sync, source health alerts, hybrid retrieval, citation verification, legal-editor browser QA, and the 250-scenario evaluation are incomplete. Authenticated browser traversal is also open because the available local browser runtime is unavailable; anonymous Cloudflare Access denial is the only HTTP/browser boundary proven in this checkpoint.

The deployed Worker now exposes both provider secret names and server-side model configuration. Fixed synthetic OpenAI and Anthropic structured-output probes pass; a live legal response must still not be claimed until retrieval, policy, and authenticated-flow gates pass. Secret values must never be requested in chat.

## Phase 4 open gates — 2026-07-31

- `OPENAI_API_KEY` is present by name in the inspected staging Worker; only a fixed synthetic structured-output probe is verified, not a user/legal chat.
- `ANTHROPIC_API_KEY` is present by name in the inspected staging Worker; Anthropic v5 (`claude-sonnet-4-6`) passed a fixed synthetic structured-output probe, not a document analysis.
- No live user/legal OpenAI response, Anthropic document result, or provider failover is claimed.
- Upstream Responses SSE, bounded browser progress, stop, and no-charge cancellation are implemented and locally tested, but no live provider stream is claimed beyond fixed synthetic probes.
- Edit, regenerate, and immutable branch history are deployed to protected staging, but live provider-backed branch creation and authenticated browser evidence remain open because only fixed synthetic provider probes are verified.
- Reconnect/resume, durable partial-stream recovery, guest flow, and full entitlement integration remain open. Encrypted user memory and its bounded seven-day hard-purge runtime are implemented locally, but migration `0062`, valid staging keyring evidence, authenticated RU/UZ QA and remote scheduled-run proof are still open.
- A terminal failed/released AI run is now recoverable through an explicit fresh
  retry instead of an endless `processing` replay. A bounded automatic status
  check can reload a completed persisted answer after an uncertain stream error.
  Durable partial-token recovery remains open; JURO still renders no unvalidated
  partial legal answer.
- Conversation facts remain conversation-scoped rather than branch-scoped; source evidence remains attached to the exact answer message.
- Hybrid retrieval is implemented as lexical D1 matching plus optional isolated
  Vectorize matches. A vector id is never a citation: each candidate is reloaded
  from D1 and verified against the active immutable publication evidence before
  it can enter a prompt. Live indexed-corpus, reranking, and authenticated
  staging evidence remain open.
- Authenticated browser QA is blocked by a local browser-control kernel failure before connection; anonymous Access denial is verified and Access was not bypassed.

## Phase 5 secure-upload open gates — 2026-07-30

- A real malware scanner is not connected; every new document-analysis upload remains quarantined and unavailable to AI/download.
- The malware queue binding is intentionally not attached and no fake scan result is produced.
- The later "Phase 5 async-analysis" checkpoint supersedes this initial
  secure-upload baseline for bounded extraction, structured provider adapters,
  and report exports. It must not be read as a claim that those later slices are
  absent.
- ZIP/DOCX now receive bounded central-directory, path, nesting, encryption,
  symlink, member, expansion-ratio/size, and OOXML structure checks. The local
  branch additionally requires an exact contiguous local-header layout, matching
  path/flags/method/size metadata, verified data descriptors, streaming
  `deflate-raw` expansion, exact output length and CRC32 within a 15-second
  deadline before the file can enter quarantine. That deeper gate is locally
  tested but not yet deployed. The local downstream extractor now repeats the
  deep check, extracts text PDF/DOCX members in deterministic order, preserves
  member boundaries, caps known text-PDF pages at 500, and enforces a 20 MB
  member / 50 MB inline expanded working-set budget. The current local candidate
  queues packages containing scans for bounded per-member Workers AI conversion;
  it never sends the opaque ZIP. Exact opaque result identity, MIME, token, and
  text evidence is required before one deterministic derivative is stored. This
  is not staging evidence, does not provide page coordinates or scanned-PDF page
  counts, and does not bypass the real isolated malware-scanner requirement.
  Packages above 20 MB compressed input, 20 MB per expanded member, or 50 MB
  expanded working set still require an external streaming extractor.
- The browser computes SHA-256 from one in-memory `ArrayBuffer`; this does not buffer the upload in the Worker, but a later client-side incremental hash path may improve low-memory devices.
- Upload byte progress is surfaced through the secure XHR client on both the
  dashboard and document-review surfaces. Authenticated browser verification of
  that UI remains open; it is not inferred from the component source alone.
- Authenticated staging HTTP and R2 round-trip evidence remains open because the available browser-control kernel fails before connecting to the existing Access session. Access was not bypassed.
- New document-analysis quarantine uploads use the separate private staging quarantine bucket with `quarantine-v2/` keys. Existing legacy `quarantine/` keys remain in the primary bucket for backward-compatible deletion; no automatic migration is claimed.
- No Phase 5 production readiness or document-analysis quality threshold is claimed.

## Phase 5 async-analysis open gates — 2026-07-30

The protected staging Worker now has a real document-analysis consumer, bounded PDF/DOCX extraction, verified-source retrieval, structured Anthropic/OpenAI adapters, normalized persistence, and honest RU/UZ waiting/error states. This supersedes the earlier statement that all extraction and provider adapters were unimplemented.

The following gates remain open:

- no malware scanner marks files `analysis_safe`, so every user upload remains quarantined before the consumer;
- `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are present by name, but no safe file can reach either provider while the malware gate remains closed;

## Phase 6 case/plan open gates — 2026-07-30

- The deployed slice supports existing case creation, plan-step status/date updates, nearest deadline, and builder linkage; it is not the complete Phase 6 lifecycle.
- Immutable action-plan version history and the proposed-plan diff/confirmation UI are deployed to protected staging. Legal-basis calculation, business-day/holiday rules, and complete case-tab APIs remain open. Reminders are created only after the user confirms task creation; task ownership is the current user in this first-stage model.
- A persisted structured AI answer can create a new tenant-owned case after
  explicit confirmation. The existing-case append gap is now closed locally:
  the user selects a real destination, the server re-reads the tenant-owned
  assistant message, appends an immutable plan revision and tasks, and exact
  replay is idempotent. Staging deployment and authenticated RU/UZ
  click-through remain open. Deadline calculation from legal rules,
  business-day/holiday rules and complete case-tab APIs are still incomplete.
- A `templateCode` query hint can accompany a plan step, but automatic resolution to a category/template route is not claimed; the user can select the real published template while case/step context is preserved.
- Authenticated staging RU/UZ click-through remains unverified because the browser-control runtime exits before connecting (`require is not defined in ES module scope`). Access was not bypassed.
- No production readiness claim is made; production functional deployment and production UI replacement still require separate approvals.
- real OpenAI RU/UZ no-source lifecycle and Anthropic fallback provider calls are proven in protected staging, including bounded token/latency evidence and D1 run/ledger semantics; an Access-authenticated browser flow, verified-source live answer, and provider cost reconciliation remain unproven;
- scanned/image OCR and bounded ZIP/multi-file conversion exist as local post-safe paths; relationship analysis, scanned-PDF page-count/coordinate evidence, external extraction above 20 MB, and long-document chunk synthesis remain waiting states;
- live indexed-corpus and reranking evidence remain open; the implemented hybrid
  D1/Vectorize retrieval still revalidates every candidate citation server-side;
- corrections, redline, exports, the 100-package evaluation, DLQ redrive, and full performance/security/browser gates remain incomplete.

No Phase 5 production-readiness claim is made.

## Phase 7 entitlement and handoff open gates — 2026-07-30

- The deployed entitlement boundary and booking contract are real, but staging has no active subscription, consultation slot, or booking evidence; a successful paid handoff is not claimed.
- Checkout, webhooks, add-on packs, provider reconciliation, payment/invoicing, lawyer messaging, reviews, and operator management remain incomplete. The D1-backed public-approved directory list, anonymized conflict check, lawyer conflict-check workspace, owner grant/revocation, persisted offer/decision terms, and audit evidence are implemented; protected staging browser traversal of the new owner-control UI is still pending.
- Audio/video calls remain feature-off and are not simulated; no provider has been selected.
- Authenticated RU/UZ browser traversal remains blocked by the recorded browser-control runtime failure before connection. Cloudflare Access was not bypassed.
- Phase 7 is not production-ready. Functional deployment and replacement of the production UI remain separate owner approvals.

## Phase 8–10 design and release open gates — 2026-07-30

- The exact prototype is deployed to protected staging as Worker version `cfef8153-3322-4ce5-b271-3478a0531b28`; deployment itself does not close the authenticated design gate.
- The owner-approved rigged Jurobek source is absent; armature, skinning, clips, shirt lettering, facial corrections, gaze, materials, lip sync, and 3D optimization are not implemented or claimed.
- Plain STT/TTS, encrypted transcript storage, private-R2 audio retention/purge,
  editable transcript confirmation and canonical voice routes are implemented
  locally on the migration-0066 backend. Protected staging deploy and an
  authenticated real-provider/browser run remain open. Realtime voice and
  voice-with-avatar remain feature-off; text AI remains the independent
  fallback.
- Authenticated screenshots, keyboard traversal, axe, NVDA/VoiceOver, 200% zoom, console/hydration, 320–1440+ matrix, and real-device touch checks remain blocked by the recorded browser-control kernel failure. Access was not bypassed.
- LCP/INP/CLS, route bundle delta, GPU/memory, long-session, and WebGL context-loss measurements are not claimed.
- The shared shell’s grid/width layout transition was removed in staging version `97745a0a-f0c6-416b-9049-f756a66403a6`; authenticated visual and touch-device verification remains open.
- The full phases 3–7 product definition, legal/document evaluation corpus, live provider calls, malware scan, hybrid retrieval, complete lawyer marketplace/admin/support/status, and closed beta remain incomplete.
- Phase 9 is not a closed beta until authenticated owner test accounts and the full browser/security matrix pass.
- Phase 10 production readiness is not reached. Production functional deployment and production UI replacement require separate explicit owner approvals.

## Completed-analysis export open gates — 2026-07-31

- The implemented export format is normalized JSON only. Highlighted PDF, clean
  PDF, DOCX, comparison-table, and case-export formats are not implemented.
- Migration `0040`, the Worker, and the export Queue consumer are deployed to
  protected staging. Local contract tests prove Queue/R2 behavior, but an
  authenticated end-to-end staging completion is not claimed because staging has
  zero completed analyses and synthetic probes are disabled.
- Staging has both provider secret names, but no completed analysis and no safe-file path; no live provider result is fabricated merely to exercise export.
- Account deletion removes owned export objects before the D1 cascade, and a
  CSRF-protected tenant-scoped action deletes individual terminal exports R2-first.
  Time-based retention, batch export, redline export, and large-artifact
  performance gates remain open.
- Production is unchanged and remains separately unauthorized.

### PDF/DOCX report-export update

- Normalized JSON plus human-readable PDF and DOCX analysis reports are now
  implemented locally; the prior JSON-only limitation is superseded.
- The PDF/DOCX report summarizes the completed normalized analysis. It is not a
  highlighted copy of the uploaded document, a clean corrected document, redline,
  comparison table, or case bundle; those formats remain open.
- Staging still has no completed provider-generated analysis; provider secret names exist, but no live provider artifact is claimed or fabricated.
- The generator is covered with representative bounded synthetic content. Large
  reports, complex typography, page overflow, browser download, and authenticated
  mobile/zoom visual checks remain release gates.
- Exports intentionally have no automatic TTL: approved user-content retention is
  explicit per-export deletion or account deletion. A future policy-driven purge
  is not implied by this implementation.
- Migration `0041` and the exact Worker artifact are deployed to protected staging;
  authenticated provider-generated report completion remains unproven because
  staging has no completed analysis; provider secret names are present but the malware gate prevents a provider run.
  Production remains separately unauthorized.

## Phase 5 OCR extraction open gates — 2026-07-31

- No real malware scanner is attached; new uploads remain quarantined.
- The remote staging secret-name inventory confirms `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` by name; values were neither read nor exported.
- Workers AI OCR is deployed, but no scanner-approved user file exists for a
  truthful live end-to-end provider run.
- Coordinate-level OCR, multi-file ZIP packages, corrected/redline artifacts,
  100 document packages, and 30 comparisons have not passed release gates.

### Advice sitemap discovery (2026-08-01)

A bounded implementation exists but is disabled in development, staging, and production through `LEGAL_ADVICE_SITEMAP_DISCOVERY_ENABLED=false`. It follows only public robots-declared `advice.uz` sitemap files, submits no more than 20 exact canonical document URLs per run, and remains review-only. There is no live staging sitemap-run evidence, policy/load approval, or claim that this has indexed the Advice corpus.
## Lawyer review moderation — protected staging limits

Migrations `0055` and `0056` are applied to `juro-staging` after a checksum-verified private R2 checkpoint. The authenticated lawyer picker now projects approved aggregates and at most three approved texts, but staging contains no approved review rows and no authenticated browser traversal is claimed. Reviewer reply, comprehensive PII review beyond the conservative contact/PINFL screen, public unauthenticated directory rendering, and rating moderation appeal remain open.

Migration `0057_calm_rating_guard.sql` is applied to `juro-staging` after a checksum-verified private R2 checkpoint. Both rating triggers exist remotely. Authenticated browser verification of review submission and moderation remains open because Cloudflare Access is not bypassed.

The authenticated lawyer-detail route is deployed to protected staging, but its
Access-authorized browser traversal, RU/UZ visual review, and a real approved
review record check remain open. The route does not make the public directory
unauthenticated and does not change production.

## Payment foundation open gates

- Migration `0061` and the Stage-1 Worker are deployed only to protected
  staging after checksum-verified private-R2 pre/post checkpoints and an
  isolated SQLite restore rehearsal. The secret-name inventory includes
  `PAYMENT_SANDBOX_WEBHOOK_SECRET`; its value is not stored in source or docs.
- An Access-authorized owner must still run the protected checkout-to-signed
  sandbox-event flow. Anonymous HTTP smoke proves Access denial only and is not
  a substitute for that transaction E2E proof.
- The only prepared price is an explicitly synthetic staging fixture. No
  production price, tax position, commission, provider contract, fiscal receipt,
  refund, chargeback, or payout is approved or claimed.
- Stage 2 marketplace orders, Uzum sandbox, reconciliation imports, payout
  batches, refunds, disputes and real provider webhooks remain blocked behind
  separate later stages.
- Authenticated browser, mobile, keyboard, screen-reader and visual checks of the
  checkout require the protected staging deployment; local build/tests are not a
  substitute.

## Canonical case creation open gate

Canonical manual case creation is deployed to protected staging and passes a real local HTTP/D1 create/read smoke. A remote authenticated staging create/read, RU/UZ visual pass, mobile/keyboard/axe pass and cleanup of any resulting synthetic case still require an Access-authorized test session.
