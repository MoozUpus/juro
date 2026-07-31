# JURO known limitations checkpoint

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

The deployed Worker version exposes only three secret binding names. A live OpenAI/Anthropic Phase 4 call must not be attempted or reported until the exact staging version proves the required provider secret names and server-side model configuration. Secret values must never be requested in chat.

## Phase 4 open gates — 2026-07-31

- `OPENAI_API_KEY` is absent from the inspected staging Worker.
- `ANTHROPIC_API_KEY` is absent from the inspected staging Worker.
- No live OpenAI response, Anthropic response, or provider failover is claimed.
- Upstream Responses SSE, bounded browser progress, stop, and no-charge cancellation are implemented and locally tested, but no live provider stream is claimed without protected provider secrets.
- Edit, regenerate, and immutable branch history are deployed to protected staging, but live provider-backed branch creation and authenticated browser evidence remain open because provider secrets are absent.
- Reconnect/resume, durable partial-stream recovery, memory, guest flow, and full entitlement integration remain open.
- Conversation facts remain conversation-scoped rather than branch-scoped; source evidence remains attached to the exact answer message.
- Retrieval is exact lexical retrieval from current verified D1 material; Vectorize hybrid retrieval, reranking, and citation revalidation remain open.
- Authenticated browser QA is blocked by a local browser-control kernel failure before connection; anonymous Access denial is verified and Access was not bypassed.

## Phase 5 secure-upload open gates — 2026-07-30

- A real malware scanner is not connected; every new document-analysis upload remains quarantined and unavailable to AI/download.
- The malware queue binding is intentionally not attached and no fake scan result is produced.
- OCR, page counting, bounding boxes, extraction, Claude analysis, OpenAI fallback, corrections, exports, and multi-file packages are not implemented by this slice.
- ZIP/DOCX now receive bounded central-directory, path, nesting, encryption, symlink, member, expansion-ratio/size, and OOXML structure checks. Local-header identity, CRC verification, decompression timeout, and the real isolated scanner/extractor must still revalidate before any derivative or AI access.
- The browser computes SHA-256 from one in-memory `ArrayBuffer`; this does not buffer the upload in the Worker, but a later client-side incremental hash path may improve low-memory devices.
- Fetch upload progress is not yet surfaced; the UI has a busy state but no byte-level progress indicator.
- Authenticated staging HTTP and R2 round-trip evidence remains open because the available browser-control kernel fails before connecting to the existing Access session. Access was not bypassed.
- The separate staging quarantine bucket is not yet used; quarantine is an opaque safe prefix in the primary private staging bucket so existing account-deletion purge remains complete.
- No Phase 5 production readiness or document-analysis quality threshold is claimed.

## Phase 5 async-analysis open gates — 2026-07-30

The protected staging Worker now has a real document-analysis consumer, bounded PDF/DOCX extraction, verified-source retrieval, structured Anthropic/OpenAI adapters, normalized persistence, and honest RU/UZ waiting/error states. This supersedes the earlier statement that all extraction and provider adapters were unimplemented.

The following gates remain open:

- no malware scanner marks files `analysis_safe`, so every user upload remains quarantined before the consumer;
- `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are absent from the exact staging secret-name inventory;

## Phase 6 case/plan open gates — 2026-07-30

- The deployed slice supports existing case creation, plan-step status/date updates, nearest deadline, and builder linkage; it is not the complete Phase 6 lifecycle.
- Action-plan version history, proposed-plan diff/confirmation, deadline legal-basis calculation, business-day/holiday rules, reminders, task assignees, and complete case-tab APIs remain open.
- The action-plan creation endpoint still uses the bounded built-in scenario catalogue; AI-proposed plans and explicit user confirmation before task creation are not yet integrated.
- A `templateCode` query hint can accompany a plan step, but automatic resolution to a category/template route is not claimed; the user can select the real published template while case/step context is preserved.
- Authenticated staging RU/UZ click-through remains unverified because the browser-control runtime exits before connecting (`require is not defined in ES module scope`). Access was not bypassed.
- No production readiness claim is made; production functional deployment and production UI replacement still require separate approvals.
- no live provider request/fallback, completed result, token/cost row from a real provider, or authenticated browser flow is proven;
- scanned/image OCR, actual ZIP/multi-file package extraction and relationship analysis, external extraction above 20 MB, and long-document chunk synthesis remain waiting states;
- retrieval is exact lexical over current verified D1 rows, not complete hybrid Vectorize/reranking/citation revalidation;
- corrections, redline, exports, the 100-package evaluation, DLQ redrive, and full performance/security/browser gates remain incomplete.

No Phase 5 production-readiness claim is made.

## Phase 7 entitlement and handoff open gates — 2026-07-30

- The deployed entitlement boundary and booking contract are real, but staging has no active subscription, consultation slot, or booking evidence; a successful paid handoff is not claimed.
- Checkout, webhooks, add-on packs, provider reconciliation, lawyer directory/profiles, conflict checks, scoped access grants and revocation, offers, messaging, reviews, and operator management remain incomplete.
- Audio/video calls remain feature-off and are not simulated; no provider has been selected.
- Authenticated RU/UZ browser traversal remains blocked by the recorded browser-control runtime failure before connection. Cloudflare Access was not bypassed.
- Phase 7 is not production-ready. Functional deployment and replacement of the production UI remain separate owner approvals.

## Phase 8–10 design and release open gates — 2026-07-30

- The exact prototype is deployed to protected staging as Worker version `cfef8153-3322-4ce5-b271-3478a0531b28`; deployment itself does not close the authenticated design gate.
- The owner-approved rigged Jurobek source is absent; armature, skinning, clips, shirt lettering, facial corrections, gaze, materials, lip sync, and 3D optimization are not implemented or claimed.
- STT, TTS, realtime voice, audio retention/purge, and voice-with-avatar remain feature-off; text AI remains the honest fallback.
- Authenticated screenshots, keyboard traversal, axe, NVDA/VoiceOver, 200% zoom, console/hydration, 320–1440+ matrix, and real-device touch checks remain blocked by the recorded browser-control kernel failure. Access was not bypassed.
- LCP/INP/CLS, route bundle delta, GPU/memory, long-session, and WebGL context-loss measurements are not claimed.
- The shared pre-existing desktop shell collapse animates `grid-template-columns` and `width`; it is a P1 motion debt for a separately approved production shell migration, not introduced by the prototype.
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
- Staging currently has no OpenAI or Anthropic secret, so no live provider result
  is fabricated merely to exercise export. Existing provider limitations remain.
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
- Staging still has no completed provider-generated analysis and no OpenAI or
  Anthropic secret names, so no live provider artifact is claimed or fabricated.
- The generator is covered with representative bounded synthetic content. Large
  reports, complex typography, page overflow, browser download, and authenticated
  mobile/zoom visual checks remain release gates.
- Exports intentionally have no automatic TTL: approved user-content retention is
  explicit per-export deletion or account deletion. A future policy-driven purge
  is not implied by this implementation.
- Migration `0041` and the exact Worker artifact remain pending protected-staging
  application at this checkpoint. Production remains separately unauthorized.
