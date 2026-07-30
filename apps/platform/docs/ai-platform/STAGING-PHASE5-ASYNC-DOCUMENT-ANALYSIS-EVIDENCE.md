# Phase 5 async document-analysis staging evidence

Date: 2026-07-30 UTC

Scope: owner-only `juro-platform-staging`. Production Worker `juro`, the public Sites deployment at `app.juro.uz`, production D1/R2, and `apps/website` were not changed.

## Source and deployment identity

- Source commit: `2456742373ef045328e4d9df09ac6c6ef95bc03a`.
- Worker: `juro-platform-staging`.
- Worker version: `0ba11fcf-a095-436d-a30b-aeacc1aa9c3c` at 100% traffic.
- Protected hostname: `https://staging.app.juro.uz`.
- Anonymous `document-review` and canonical `document-builder` requests both returned HTTP `302` at the Cloudflare Access boundary; no Access bypass was used.

## Implemented runtime boundary

The `staging-document-analysis` consumer is deployed with batch size 1, three retries, a 30-second retry delay, serial concurrency, and the distinct `staging-document-analysis-dlq`. Post-deploy inventory shows queue ID `5daca3710f954ca49046ff56cfed4176` with one producer and one consumer. DLQ ID `60b41d382df142edb72be3693c4b61ba` has no producer or consumer.

The consumer:

- accepts only identifiers-only, tenant-scoped `document.analyze` envelopes;
- refuses a quarantined or non-`analysis_safe` file before R2 read or AI invocation;
- verifies stored byte length and SHA-256 before extraction;
- performs bounded PDF/DOCX extraction and uses explicit waiting states for OCR, external extraction, and chunked analysis;
- retrieves only activated, verified, allowlisted Lex/Advice material from D1;
- validates Anthropic/OpenAI structured output with Zod, verified-source boundaries, and exact document-excerpt checks;
- persists normalized output, risks, provider usage, cost-ledger metadata, and content-free audit metadata;
- fences replay with the existing job ledger and a durable `persisting` state.

## Model and secret evidence

The official OpenAI resolver returned `gpt-5.6-sol`. Anthropic's current official model overview identified `claude-fable-5` as its most capable widely released model, so staging uses `ANTHROPIC_DOCUMENT_MODEL=claude-fable-5`; the independent legal-chat fallback remains `claude-sonnet-4-6`.

The exact post-deploy secret-name inventory contains only:

- `IDENTITY_KEYRING`;
- `RESEND_API_KEY`;
- `TURNSTILE_SECRET_KEY`.

`ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are absent. No live provider request, provider fallback, or completed staging analysis is claimed. A safe document would enter `awaiting_ai_configuration` rather than receiving a fabricated result.

## Verification evidence

- `npm run type-check`: pass.
- `npm run lint`: pass.
- `npm test`: pass, including provider, processor, tenant, quarantine, queue-replay, and Worker job tests.
- `npm run cf:types` and `npm run cf:types:check`: pass.
- exact staging build and artifact validation: pass.
- development/staging/production build plus Wrangler dry-run matrix: pass.
- source secret-pattern scan: no matches.
- client artifact scan for provider secret names and key patterns: no matches.
- post-deploy D1 `PRAGMA quick_check`: `ok`.
- post-deploy `PRAGMA foreign_key_check`: zero rows.
- staging `document_analyses`: zero rows; `analysis_safe` ready/processing/persisting rows: zero.

## Open gates

- The malware scanner is not connected. Upload finalization therefore remains fail-closed in quarantine and cannot feed this consumer.
- Provider secrets are absent, so no real Anthropic/OpenAI result is proven.
- Image/scanned-PDF OCR, ZIP/package extraction, documents above the inline extraction limit, and chunked long-document synthesis remain explicit waiting states.
- Retrieval is verified exact lexical D1 retrieval, not complete Vectorize hybrid retrieval/reranking.
- Corrections, redline, exports, multi-file package analysis, and the 100-document quality gate remain incomplete.
- Authenticated RU/UZ browser traversal remains open; only the owner-only Access boundary is proven in this checkpoint.

No Phase 5 production-readiness claim is made.
