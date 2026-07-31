# Test plan

Required checks for each staging vertical slice: typecheck, lint, focused unit/integration/security routes, bounded build, artifact validation, secret scan, and relevant D1/R2/queue evidence. Current regression includes auth, tenant isolation, legal-source acquisition/review, scheduled corpus logic, document boundaries, cases, handoff, and staff access.

Open release tests: authenticated browser/axe/keyboard/mobile matrix, real scanner malicious/safe samples, 100 document packages/30 comparisons, legal reviewer scoring, and restore rehearsal. See `KNOWN-LIMITATIONS.md`.