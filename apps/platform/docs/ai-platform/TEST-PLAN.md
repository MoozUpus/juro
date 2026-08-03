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
