# Staging evidence — migration 0037 and Phase 4 boundary

Date: 2026-07-30
Environment: owner-protected staging only
Production: unchanged

## D1 migration and recovery evidence

- database: `juro-staging`;
- database ID: `bb716a96-b2fb-4823-90d6-6c228fed181a`;
- applied migration: `0037_square_blacklash.sql`;
- postflight: no pending migrations, `quick_check=ok`, zero foreign-key violations;
- new tables: `ai_runs`, `ai_usage_ledger`;
- initial post-migration rows: zero in both tables.

The pre-migration export was restored into a disposable D1 database. Source and restore matched 116 application tables, 295 indexes, 78 triggers, 37 migration records, representative tenant/legal-source row counts, `quick_check=ok`, and zero foreign-key violations. The disposable database was deleted after the proof.

The post-0037 full export is stored privately at:

`juro-staging-backups/d1/juro-staging/20260730T-post0037/post-0037-full.sql`

- size: 337,525 bytes;
- SHA-256: `4d603e3a7f5dfcd7cb406e2abab16359d97d9cb64757296569148fa219889010`;
- a second download from private R2 produced the same SHA-256.

No signed download URL or secret value is recorded in this repository.

## Worker deployment evidence before fallback extension

- Worker: `juro-platform-staging`;
- version: `baf52fcf-d369-4d6e-bfa8-716eacdd9b92`;
- traffic: 100%;
- message: `Phase 4 legal chat boundary fc21def`;
- Access: anonymous page/API requests receive a no-store Cloudflare Access redirect;
- production Worker and production D1/R2 were not changed.

## Verified local Phase 4 behavior

- strict bilingual `LegalChatResponse` and JSON Schema;
- source-ID allowlist enforcement;
- fail-closed no-source clarification with no answer-cycle charge;
- idempotent reservation/replay and request-hash conflict rejection;
- monthly limit reservation;
- actual fallback provider/model persistence;
- full suite: 301 core/rendered checks and 82 Cloudflare checks passed after the Anthropic fallback extension;
- no dependency added.

## Open gates

- staging has no inspected `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` binding, so no live provider answer is claimed;
- authenticated browser QA is blocked by the local browser-control kernel failing before connection; Cloudflare Access was not bypassed;
- streaming, branching, memory, Vectorize hybrid retrieval, guest flow, and entitlement service remain unimplemented;
- the fallback extension must receive its own staging build/deploy/version evidence after commit;
- production deployment remains prohibited without separate owner approval.

