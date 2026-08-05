# Test plan

## Legal corpus operational-alert and freshness gate

`tests/legal-corpus-alerts.test.ts` proves failed-run binding, content-free
schema, one alert/outbox per epoch, duplicate suppression, recovery of multiple
failed runs after scheduler downtime, seven-day freshness math, immutable
identity, delete rejection and idempotent Resend delivery. Existing provider
cost-alert tests run alongside it to prevent sender regression.
`tests/migration-safety.test.ts` applies the full chain through local `0091`, enforces
LF/remote-D1-safe trigger syntax, accepts only additive CREATE statements and
finishes with zero foreign-key violations. Remote release additionally requires
a controlled failed/stale staging run, outbox/Queue/DLQ evidence and a received
content-free test email. `tests/legal-scheduled-corpus-lifecycle.test.ts` proves
that pending-review changes end as `partial` while an unchanged, activated and
verified version is the only successful freshness path.

## Legal evaluation citation gate

`tests/legal-evaluation-corpus.test.ts` covers the 314-scenario RU/UZ corpus,
strict bounded result schema, canonical Lex/Advice document routes,
same-document redirects, 2xx HTML response evidence, exact source
classification and rejection of provider/user-invented fields. The CLI is
`npm run evaluate:legal:validate -- --packet <packet-directory> --results
<reviewed-results.json> --evidence <staging-persisted-evidence.json>`.
Internal citations are not accepted from result JSON alone. Passing still
requires all real outputs, current public link checks and named human review;
unit fixtures are not legal ground truth.

`tests/legal-evaluation-persisted-evidence.test.ts` additionally executes the
real SQLite/D1 run → message → feedback → MFA legal-review chain. It proves that
the content-free export matches persisted structured sources and rejects
self-declared model metadata, changed content after review, malformed endpoint
input and tampered evidence metadata. Static route checks enforce POST-only,
same-origin/CSRF, `ai.quality.review`, fresh MFA and private/no-store behavior.

## Lex RSS discovery gate — local candidate

`tests/legal-source-discovery.test.ts` covers exact official endpoints,
RU/UZ balancing, canonical URL filtering, 512 KiB streaming bounds, media and
XML validation, redirect rejection, mandatory scheduler wait and excessive
delay failure. `tests/legal-scheduled-corpus-lifecycle.test.ts` proves that the
daily run is acquired before discovery, a duplicate invocation performs no
network discovery, and a candidate completes through private R2 into an
immutable `pending_review` version and pending legal-review item. A live
read-only probe of `https://lex.uz/robots.txt`, `/ru/rss` and `/uz/rss` observed
the 20-second delay and canonical candidates. Staging deploy, queue/log evidence
and reviewer-browser verification are still required.

## Lawyer review reply gate — local candidate

`tests/lawyer-review-replies.test.ts` executes the full D1 lifecycle: strict
input, server-owned actor identity, lawyer/profile binding, client-request
idempotency, one-open-reply fencing, PII rejection, immutable rejected version,
corrected v2, separate staff approval, approved-only public projection, generic
notifications, metadata-only audit and FK integrity. Static route/UI assertions
cover CSRF, fresh MFA, RU/UZ, accessible status and the absence of unsafe HTML.
`tests/migration-safety.test.ts` replays 0079 and the complete chain with exact
186-table/369-FK evidence and rejects remote-D1-incompatible trigger syntax.

Staging still requires a fresh backup/restore, migrations `0069`–`0079`, an
Access-authenticated lawyer→moderator→public-detail journey, D1 evidence, mobile,
keyboard, 200% zoom, screen-reader and browser-console checks.

## Knowledge-base gate — local candidate

`tests/knowledge-base.test.ts` verifies bounded query/feedback schemas, RU/UZ
search and copy selection, latest-published selection, draft exclusion,
structured-body parsing, deterministic related-article order, canonical content
SHA-256, immutable published versions, tenant-derived feedback, idempotent replay,
revision changes, append-only audit, neutral unavailable versions, CSRF/auth route
guards, semantic search/status controls, 44 px targets, reduced motion and the
absence of raw HTML rendering. It is part of the standard platform test list.

`tests/knowledge-base-admin.test.ts` additionally verifies strict bilingual
authoring input, server-derived staff actor identity, dedicated capability and
fresh-MFA boundaries, draft creation/update, immutable publication, public
version switching, related-article publication checks, archive/restore,
append-only actor evidence, delete guards, responsive editor contracts and
explicit confirmation. `tests/migration-safety.test.ts` replays 0078 with exact
table/FK inventory.

Staging additionally requires public HTTP smokes, authenticated helpfulness D1
evidence, keyboard and screen-reader navigation, RU/UZ at 320/360/390/768/1024/
1280/1440+, 200% zoom, forced/reduced motion checks and browser console review.

## Guest AI local gate — 2026-08-03

Focused coverage includes encrypted persistence, absence of plaintext schema
columns, signed sessions/IP limits, clarification then final answer, replay,
stale reservation recovery, 24-hour cascade purge, pre-migration scheduler
no-op, Turnstile action isolation, environment flags, provider/retrieval/source
boundaries and `noindex` RU/UZ UI contracts. Focused suites passed 11/11, 27/27
and 67/67. Typecheck, lint, Cloudflare type drift check, full `npm test`,
development/staging builds and artifact validation pass. A tracked-file scan
found no OpenAI, Anthropic or private-key signature. Remote gates require backup, restore,
migration `0065`, deploy and protected provider/browser QA.

Required checks for each staging vertical slice: typecheck, lint, focused unit/integration/security routes, bounded build, artifact validation, secret scan, and relevant D1/R2/queue evidence. Current regression includes auth, tenant isolation, legal-source acquisition/review, scheduled corpus logic, document boundaries, cases, handoff, and staff access.

Open release tests: authenticated browser/axe/keyboard/mobile matrix, real scanner malicious/safe samples, staging execution and named review of the materialized 100 document packages/30 comparisons, legal reviewer scoring, and restore rehearsal. See `KNOWN-LIMITATIONS.md`.

## Document evaluation artifact checkpoint — 2026-08-04

- `npm run evaluate:documents:materialize -- --output .tmp/document-evaluation-corpus`
  must create exactly 100 distinct real binaries and 30 reciprocal pairs.
- Every artifact must revalidate against its manifest by safe relative path,
  byte size, SHA-256 and expected DOCX/PDF/JPEG/PNG/ZIP magic.
- A second materialization of representative rows must produce identical bytes.
- `evaluate:documents:validate` requires the persisted-evidence export and exact
  artifact manifest; a self-declared reviewed-results file is rejected. A row
  cannot pass without completed staging analysis, safe scan, server-resolved
  provider/model/response, reciprocal comparison ID where applicable, and an
  immutable timestamped named human disposition.
- Local artifact generation is preparation evidence only. It cannot satisfy the
  scanner, OCR/provider, legal-quality or authenticated staging gates.

## Comparison change decision checkpoint — 2026-08-04

- Migration `0072` must reject preset, partial, malformed and cross-owner
  decisions while accepting existing undecided rows unchanged.
- The service must deny a second tenant neutrally, persist accept/reject/clear,
  preserve reviewed evidence after clear, and append no document text to audit.
- Same-state replay and synchronized concurrent requests must create one version
  transition and one audit event.
- UI/API contract checks require CSRF, authentication, workspace resolution,
  strict RU/UZ decision copy, `aria-pressed`, pending state and no AI provider or
  document-version mutation.
- Staging evidence additionally requires backup/restore, migration, authenticated
  RU/UZ browser/keyboard/mobile/axe checks and postflight foreign-key validation.
# Archive integrity checkpoint

Every ZIP/DOCX security regression must cover a valid stored entry, a valid raw
deflate entry, a valid streaming data descriptor, local/central path mismatch,
leading polyglot bytes, CRC corruption, traversal, unsupported nesting,
encryption, expansion ratio, member count and required OOXML parts. Passing
central-directory inspection alone is insufficient: the finalize boundary must
call the bounded deep verifier before it records quarantine success.
# Local ZIP-package extraction checkpoint — 2026-08-04

- A text-only ZIP fixture must preserve deterministic member boundaries and
  extract both Russian and Uzbek Latin content.
- The analysis processor must use the package extractor rather than pass an
  opaque archive to the single-document extractor.
- A package containing an image must stop the synchronous analysis path with
  `DOCUMENT_ANALYSIS_PACKAGE_OCR_REQUIRED`, persist `awaiting_ocr`, and enqueue
  one identifiers-only `ocr.process` job without sending the raw ZIP to a
  provider.
- The extractor must repeat deep archive verification and retain the 500-page
  aggregate PDF limit before provider access.
- A member above 20 MB or decoded package above 50 MB must stop before PDF/DOCX
  parsing and persist the external-extraction state without provider access.

# Local ZIP-package OCR checkpoint — 2026-08-04

- A valid package containing a real minimal DOCX and PNG must be expanded and
  sent to Workers AI as one bounded array with deterministic opaque names.
- Provider responses may arrive in a different order; the stored derivative must
  retain deterministic package/member order and sum bounded token evidence.
- Every response must match one expected opaque identity and MIME exactly.
  Duplicate, missing, unexpected, empty, or over-budget results must fail before
  derivative creation and before `document.analyze` is enqueued.
- Inner extension spoofing and invalid nested DOCX structure must fail before
  provider access.
- This checkpoint does not satisfy the 500-page aggregate for scanned PDFs or
  page-coordinate quality gates because Workers AI conversion supplies neither.
- Focused extractor/scheduler/OCR suites pass 14/14 locally; full regression,
  artifact, staging, scanner, and reviewed 100-package gates remain required.

## Analysis-version object reconciliation checkpoint — 2026-08-04

- Migration 0073 must apply additively and reject cross-tenant, mismatched,
  mutable or illegally transitioned write evidence.
- Initial and corrected versions must end with one exact attached intent.
- Two synchronized correction writers must produce one visible version; the
  losing unique object must remain ledgered and be removed by reconciliation.
- Reconciliation must claim before delete, verify size/SHA and post-delete
  absence, retry mismatches/failures, and audit identifiers without document text.
- Account deletion must inventory pending intent keys as well as attached version
  keys. Staging evidence remains gated on backup/restore, migrations 0069–0073,
  deploy, protected D1/R2 smoke and authenticated browser regression.

## Analysis-to-case continuity checkpoint — 2026-08-04

- Upload initiation may carry only a nullable UUID `caseId`; the API must resolve
  an active target in the authenticated workspace before the D1 batch.
- Later link/move/unlink operations require session, CSRF, strict JSON and a
  scoped idempotency key; workspace/user identifiers never come from the body.
- D1 must reject a foreign/archived target, stale projection version, direct
  projection update, evidence mutation/deletion and reused key with another
  request hash.
- Link, move and unlink create exact case activity and metadata-only workspace
  audit evidence. Account deletion must still cascade with zero FK violations.
- RU/UZ UI must preserve `caseId` across review/compare tabs, preselect a valid
  case, allow explicit detach and show linked analyses in the canonical case
  route. Staging browser/keyboard/axe/mobile evidence remains separately gated.

## Document-to-case link checkpoint - 2026-08-04

- Strict input accepts only an active-case UUID or explicit `null`; tenant and
  owner identifiers are always resolved from the authenticated session.
- Service tests cover move, detach, foreign tenant, foreign case, idempotency
  replay/conflict, stale writer, direct projection mutation, immutable evidence,
  metadata-only audit and account cascade.
- Moving from a document created by a plan step must atomically clear the old
  `plan_step_id`.
- The list API hides owner case IDs from collaborator projections. The RU/UZ
  owner control has a visible label, native keyboard behavior, 44 px target,
  busy announcement, success status and recoverable rollback on error.
- Staging evidence additionally requires private D1 backup/restore, migrations
  `0069`-`0075` in order, postflight checks and authenticated browser/axe passes.

## AI quality-review checkpoint — 2026-08-05

- Queue responses must remain metadata-only even when a user supplied a comment.
- Full question, answer, structured output and comment require a separate view
  request whose immutable event is committed before response.
- Resolve must bind the current feedback timestamp, append a monotonic version
  and never mutate the original AI message or an older decision.
- Legal-reviewer access requires active TOTP and 15-minute MFA in both service
  and D1; administrator/support forgery must fail.
- Updating feedback must mark the prior decision stale; content deletion must
  cascade corrected/golden text while retained evidence remains verifiable.
- Event/content mutation, chain tampering, branching and stale writes fail closed.
- Route tests require POST-only, CSRF, strict Zod, private/no-store, RU/UZ,
  noindex, keyboard focus transfer and no HTML injection rendering.
## AI runtime settings gate

`tests/ai-runtime-settings.test.ts` verifies environment defaults, allowed-model
activation, immutable D1 versions, stale-write rejection, forged-role denial,
hash-chain corruption fail-closed behavior, protected-field exclusion,
POST-only CSRF/fresh-MFA route contracts, RU/UZ UI accessibility hooks and the
chat/document instruction-hash integration. `tests/migration-safety.test.ts`
replays `0088` with the full ordered schema.

## Document evaluation persisted-evidence gate — 2026-08-05

- The release CLI must reject `--results`; `--evidence` plus the exact hashed
  materialized artifact manifest is mandatory.
- Review input cannot self-declare scanner/provider/model/response/completion or
  critical-risk count; these values are loaded from D1.
- D1 must reject non-reviewer, expired/non-MFA, forked-chain, stale file/scan,
  incomplete analysis, changed provider run and non-terminal comparison claims.
- Export revalidates every latest review, verifies reciprocal comparison pairs,
  appends an immutable export receipt and exposes no content.
- Tampering with any review metric, event, record list, manifest hash or export
  receipt must fail digest/chain verification.
- A passing local contract test is not the 100-package/30-comparison release
  run; staging scanner/OCR/provider execution and named review remain required.

## Case lifecycle checkpoint — 2026-08-05

- Apply the complete migration journal and require zero foreign-key violations.
- Complete with unresolved tasks/steps and verify the ledger stores D1-derived
  counts; replay the same idempotency key without a second event.
- Exercise `complete → archive → restore → reopen`; require sequential revisions,
  exact hash parentage and the expected projection after every event.
- Reject foreign-workspace access with neutral `CASE_UNAVAILABLE`, fabricated
  counts, illegal transitions, event update/delete and key reuse with another
  action/actor.
- Route/static UI tests require session, CSRF, server workspace derivation,
  RU/UZ copy, confirmation, visible alert and retry-safe archive restoration.
- Staging still needs authenticated desktop/mobile, keyboard, axe and audit-log
  rehearsal after private backup, ordered migrations and exact deploy.
