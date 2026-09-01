# JURO citation policy

Status: **VERIFIED in source and automated tests**

Evidence cutoff: **2026-09-01**

## Authority and publication rules

1. A legal-rule citation must resolve to canonical HTTPS `lex.uz`/`www.lex.uz` document routes and match a source retrieved for the same answer.
2. Document title, article number, canonical URL, exact quote, current/historical applicability, locale, content hash, and verification timestamp are server-validated.
3. Every article reference in the answer must be supported by an accepted citation. Unmatched, invented, redirected, stale, private, or provider-only identifiers are rejected.
4. Secondary web material is labelled `SECONDARY_REFERENCE`. It can provide practical context but cannot establish legislation, a statutory deadline, a legal calculation, or a guaranteed outcome.
5. Private tenant documents are never rendered as public links and remain subject to workspace/object authorization and checksum validation.
6. Advice.uz is not an accepted citation authority in the current production contract.

## Failure behavior

If verified authority is absent, stale, inconsistent, or insufficient, the answer must narrow itself, request clarification, or state that a verified legal answer is unavailable. Model memory is never published as law.

## Evidence

- `apps/platform/lib/legal-corpus/citation-validation.ts`
- `apps/platform/lib/ai/legal-ai-gateway.ts`
- `apps/platform/lib/legal/live-lex-retrieval.ts`
- `apps/platform/lib/legal/secondary-internet-retrieval.ts`
- `apps/platform/tests/legal-corpus-citation-validation.test.ts`
- `apps/platform/tests/ai-chat-retrieval-safety.test.ts`
- `apps/platform/tests/ai-citation-article-route.test.ts`
