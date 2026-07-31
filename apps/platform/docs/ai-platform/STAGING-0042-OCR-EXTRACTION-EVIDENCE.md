# Staging 0042 OCR extraction evidence

Date: 2026-07-31 UTC

## Scope

This checkpoint deploys the post-safe OCR/extraction boundary only to the
owner-protected `juro-platform-staging` Worker. Production, `apps/website`, the
production Worker, D1, R2, routes, and Sites deployment were not changed.

- implementation commit: `9a6a9c9`;
- staging-consumer correction: `48861a1`;
- active staging version: `85151979-ba7d-4fc0-a2dc-fccf4f1e4da3` at 100%;
- pre-Phase-5 application rollback: `37687899-f17a-4bdf-9f9c-41c6b509cfb9`;
- staging D1: `juro-staging`, ID
  `bb716a96-b2fb-4823-90d6-6c228fed181a`;
- production Worker remains version
  `91774ed4-72e9-47bb-b93a-a4208d490b24`.

## Implemented boundary

- additive `file_extractions` lifecycle with tenant/source identity guards,
  constrained transitions, complete-result evidence, and immutable terminal
  records;
- identifiers-only `ocr.process` outbox and Queue envelope;
- one staging OCR producer and one staging OCR consumer with a distinct DLQ;
- Workers AI `AI` binding and `toMarkdown` conversion for supported
  PDF/DOCX/image inputs;
- safe-state, tenant, R2 size, and SHA-256 checks before conversion;
- immutable private-R2 normalized extraction with replay verification;
- durable handoff back to `document.analyze`;
- R2-first account-deletion inventory for the extraction derivative.

This boundary starts only from `analysis_safe`. It does not promote quarantined
uploads and is not a malware scanner.

## Local gates

- targeted Phase 5 upload/provider/processor/OCR/export tests: 18/18;
- Cloudflare config/migration/Queue suite after the consumer correction: 85/85;
- account-deletion purge suite: 9/9;
- migration-specific tenant/lifecycle test passes;
- TypeScript and lint pass;
- exact staging build and artifact validation pass;
- generated binding includes `AI`;
- staged high-confidence credential scan: zero matches;
- `git diff --check`: pass.

## Recovery points and migration

Pre-migration Time Travel bookmark:

`0000024c-00000004-000050b9-9f8d7fc5b7b842aaeb9cffb634759f9a`

The portable pre-migration export was uploaded to private R2 as
`d1/juro-staging/20260731T152101Z/pre-0042.sql`, downloaded independently, and
matched at 491,875 bytes with SHA-256
`84d9bbef0f3a95ef5029823624e2cdf06d299d2f7186a535d413d0c777f9fb2a`.

Wrangler 4.92.0 applied only `0042_sleepy_callisto.sql` and reported 12
successful SQL commands. Postflight proves 43 migration rows, 22 columns, four
explicit indexes, six triggers, zero extraction rows, `quick_check=ok`, zero
foreign-key violations, and no pending migration.

Post-migration Time Travel bookmark:

`0000024d-00000004-000050b9-d4ea78c5e99a6b15b56d73d5fd2c0e37`

The post-migration export was uploaded privately as
`d1/juro-staging/20260731T152101Z/post-0042.sql`, downloaded independently, and
matched at 497,289 bytes with SHA-256
`81af1db37c15a3aea6debcd3b9322600b82c734a34e2d607d37f676c8ee22234`.

## Deployment and read-back

The final staging deployment is `85151979-ba7d-4fc0-a2dc-fccf4f1e4da3` at
100%. Queue read-back proves:

- `staging-ocr-processing`, ID `e050407874d741c5beb36c762b9e83fc`:
  one producer and one consumer, both `juro-platform-staging`;
- `staging-ocr-processing-dlq`, ID
  `67b273da1950422b92d12757b6a946b0`: zero consumers.

The exact deployed artifact includes `fetch`, `queue`, and `scheduled` handlers,
the `AI` binding, staging D1/R2/Queue/Vectorize/Analytics bindings, and the
five-minute outbox schedule. Anonymous staging access returns Cloudflare Access
`302`. The production document-builder URL retains its expected authentication
redirect, and production Worker traffic remains on the prior version.

## Open gates

The authoritative staging secret-name read-back still lists only
`IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY`. It does not list
`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`; no secret value was read. Therefore a
live Anthropic/OpenAI document analysis is not claimed.

A real malware scanner is not attached, so new user uploads remain quarantined
and cannot honestly produce a live safe-file OCR run. The 100-package evaluation,
30 comparisons, scan accuracy thresholds, coordinate-level OCR, ZIP package
processing, corrected/redline artifacts, and authenticated end-to-end staging
flow remain open. Phase 5 is deployed as a fail-closed staging slice, not released
as complete functionality.

## Rollback

For an application regression, restore protected-staging traffic to
`37687899-f17a-4bdf-9f9c-41c6b509cfb9`. Migration `0042` is additive and its
empty table can remain unused. Use the recorded pre-migration bookmark only for
demonstrated D1 corruption. Production deployment remains unauthorized.
