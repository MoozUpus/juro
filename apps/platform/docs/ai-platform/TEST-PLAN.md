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

Open release tests: authenticated browser/axe/keyboard/mobile matrix, real scanner malicious/safe samples, 100 document packages/30 comparisons, legal reviewer scoring, and restore rehearsal. See `KNOWN-LIMITATIONS.md`.
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
- A package containing an image must stop with
  `DOCUMENT_ANALYSIS_PACKAGE_OCR_REQUIRED` and must not enqueue raw ZIP OCR.
- The extractor must repeat deep archive verification and retain the 500-page
  aggregate PDF limit before provider access.
- A member above 20 MB or decoded package above 50 MB must stop before PDF/DOCX
  parsing and persist the external-extraction state without provider access.
