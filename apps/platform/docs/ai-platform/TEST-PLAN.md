# Test plan

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
- `evaluate:documents:validate` requires both reviewed results and the exact
  artifact manifest. A result cannot pass without completed staging analysis,
  safe scan, provider/model/response, reciprocal comparison ID where applicable,
  and timestamped named human disposition.
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
