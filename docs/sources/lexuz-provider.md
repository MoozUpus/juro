# JURO direct Lex.uz provider

Status: **VERIFIED in source; live availability and legal correctness separate**

Evidence cutoff: **2026-09-01**

## Current contract

Production configuration enables `LEGAL_DIRECT_RETRIEVAL_ENABLED` and keeps the local corpus disabled. The legal-answer route can discover, fetch, parse, and validate official Lex.uz pages within a bounded request budget. Accepted sources require canonical HTTPS Lex.uz document URLs, expected locale and document identity, clean structured text, content hashes, and check timestamps.

Redirects are bounded and must retain the trusted official source shape. Response type, size, parsing quality, article spans, applicability, and freshness are checked before a source becomes model context or a user-facing citation. An unavailable or insufficient official packet fails closed into a clarification/unavailable result rather than using model memory as law.

## Evidence

- `apps/platform/lib/legal/live-lex-retrieval.ts`
- `apps/platform/lib/legal/direct-retrieval.ts`
- `apps/platform/lib/legal/source-fetch.ts`
- `apps/platform/lib/legal/source-parser.ts`
- `apps/platform/lib/legal/source-trust.ts`
- `apps/platform/lib/legal-corpus/chat-retrieval.ts`
- direct-retrieval, source-fetch, source-parser, source-trust, and citation tests under `apps/platform/tests`

## Non-claims

Source validation does not prove the legal conclusion is correct, the provider is currently reachable, the official site is fresh, or every act/revision is covered. Those require live retrieval evidence and human legal review for the exact release candidate.
