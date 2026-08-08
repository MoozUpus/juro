# Staging 0039 immutable AI branch evidence

Date: 2026-07-31
Scope: owner-only `juro-platform-staging`. Production, Sites, and `apps/website` were not changed.

## Exact source and behavior

- Source commit: `c1871c3` (`feat(platform): preserve immutable AI branches`).
- Question edits and answer regenerations create new branch/message/version rows; existing messages are not overwritten.
- Regeneration resolves the original request server-side. A client-supplied replacement question is not authoritative.
- Reads and writes require the authenticated conversation owner and workspace, and branch history links select an exact response message.
- A new edit or regeneration consumes a new answer cycle; idempotent replay cannot create or charge a duplicate.
- Migration `0039_lame_killer_shrike.sql` is additive and creates only `message_branches`, `message_versions`, their indexes, and four integrity/immutability triggers.

## Backup and migration

Staging D1: `juro-staging`, ID `bb716a96-b2fb-4823-90d6-6c228fed181a`.

Preflight reported `quick_check=ok`, zero foreign-key violations, 39 migrations through `0038_current_advice_url_guard.sql`, no branch/version tables, and Time Travel bookmark:

`000001f1-00000002-000050b9-4967df2eabc256a47d42eb0467a1eda7`

Private prefix: `juro-staging-backups/d1/juro-staging/20260731T-c1871c3/`.

| Artifact | Bytes | SHA-256 | Private R2 round trip |
| --- | ---: | --- | --- |
| `pre-0039-full.sql` | 433,105 | `7d6e9aaf1170b438b67a969cc59a367c4d322e20445259d9d461f66773aaf093` | exact |
| `post-0039-full.sql` | 439,884 | `5cddb3763b10f6ddef70387f3d6cd8809f7ebb063e730e36654cf748a85f0688` | exact |

Wrangler applied exactly `0039_lame_killer_shrike.sql`. Postflight reported no pending migration, 40 ledger rows, `quick_check=ok`, zero foreign-key violations, both new tables, all four expected triggers, and zero branch/version rows before authenticated use. The immediate post-migration Time Travel bookmark is:

`000001f1-0000000a-000050b9-b56fbe3a7ecbdcf13a35a8796aa3fb0c`

## Worker deployment

- Worker: `juro-platform-staging`.
- Version: `593e7fd4-1d60-4ba2-accc-c44b1e0a2ba0`, 100% traffic.
- Deployment message: `Phase 4 immutable AI branches c1871c3`.
- Startup time: 159 ms.
- Handlers: `fetch`, `queue`, and `scheduled`; schedule remains `*/5 * * * *`.
- Exact D1/R2/Queue/Vectorize/Analytics bindings were read back from the deployed version.
- Anonymous canonical builder and AI-lawyer requests both returned Cloudflare Access `302` before application content.
- Production Worker `juro` remains at `91774ed4-72e9-47bb-b93a-a4208d490b24`.

The deployed version exposes only secret names `IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY`. `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` remain absent, so no live provider response, regeneration, charge, or fallback is claimed.

## Verification gates

- full platform regression: passed, including 84/84 Cloudflare/job tests;
- branch-history contract/migration tests: 3/3 passed;
- type-check and lint: passed;
- staging build and exact artifact validation: passed;
- generated Cloudflare binding types and all-environment matrix: passed;
- canonical builder smoke: passed, 34 scenarios;
- comparison smoke: passed, three changed clauses plus PDF/DOCX output;
- tracked-source secret-pattern scan: zero matching files;
- D1 pre/post integrity and private-R2 SHA-256 round trips: passed;
- Access and unchanged-production read-back: passed.

## Open gates and rollback

Authenticated RU/UZ browser interaction, branch creation with a real provider, accessibility screenshots, and live cost-ledger evidence remain open because provider secrets are absent and no authenticated browser evidence was produced. Conversation facts remain conversation-scoped, not branch-scoped. Reconnect/resume, durable partial-stream recovery, memory, and guest flow remain incomplete.

Application rollback is the prior staging version `1cbc9ea9-6ec8-4ab8-9495-b880b269f423`. The additive tables may remain unused after application rollback. Restore D1 only for demonstrated corruption, under staging maintenance, using the recorded pre-change bookmark and protected private-R2 checkpoint. Production is never a rollback target.
