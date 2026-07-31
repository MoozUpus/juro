# Phase 5 async document-analysis staging evidence

Date: 2026-07-30 UTC; reconciled 2026-08-01 UTC

Scope: owner-only `juro-platform-staging`. Production Worker `juro`, the public Sites deployment at `app.juro.uz`, production D1/R2, and `apps/website` were not changed.

## Source and deployment identity

- Source commit: `aa713e6` (provider validation) plus `6027e06` (current Anthropic model).
- Worker: `juro-platform-staging`.
- Worker version: `91edb0b9-3758-4959-97d6-27fc52d643ae` at 100% traffic.
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

The configured OpenAI resolver remains `gpt-5.6-sol`. The Anthropic configuration uses `claude-sonnet-4-6` for document and fallback paths; the retired `claude-sonnet-4-20250514` is not configured.

The exact post-deploy secret-name inventory contains:

- `ANTHROPIC_API_KEY`;
- `IDENTITY_KEYRING`;
- `OPENAI_API_KEY`;
- `RESEND_API_KEY`;
- `TURNSTILE_SECRET_KEY`.

Secret values were not read or logged. A one-time synthetic Anthropic structured-output connectivity probe completed successfully on `claude-sonnet-4-6`; the probe flag was then returned to `false`. No live document-analysis run, provider fallback, or completed analysis is claimed because the malware gate prevents any uploaded file from becoming `analysis_safe`.

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
- A real malware-scanning service is unavailable in this Cloudflare account: the current account is not entitled to Cloudflare Containers (Workers Paid is required). No fake scanner has been added; upload finalization remains fail-closed in quarantine.
- Image/scanned-PDF OCR, ZIP/package extraction, documents above the inline extraction limit, and chunked long-document synthesis remain explicit waiting states.
- Retrieval is verified exact lexical D1 retrieval, not complete Vectorize hybrid retrieval/reranking.
- Corrections, redline, exports, multi-file package analysis, and the 100-document quality gate remain incomplete.
- Authenticated RU/UZ browser traversal remains open; only the owner-only Access boundary is proven in this checkpoint.

No Phase 5 production-readiness claim is made.
