# Staging evidence — AI answer feedback

Date: 2026-08-03  
Environment: isolated, Cloudflare-Access-protected staging only  
Worker: `juro-platform-staging`  
Worker version: `6ec3e8ab-434b-4ab5-98db-c26908d6c8a3`  
D1: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`)  
Migration: `0060_lethal_slapstick.sql`

## Scope

The slice adds saved user feedback for a completed AI answer. It does not make
an AI call, alter usage, or transmit a question, answer, document, comment, or
identifier to Analytics Engine.

`POST /api/platform/ai/feedback` requires CSRF, an authenticated user, and the
active workspace. The server resolves the submitted assistant-message UUID
through a completed `ai_runs` row and a conversation owned by that exact user
in that exact workspace. An unavailable or cross-tenant answer returns a
neutral not-found result. Feedback is idempotent per answer/type; the audit
event records only the feedback type and AI run ID, never the comment text.

## Private D1 checkpoints

The migration was preceded by a fresh remote full export. It was uploaded to
private `juro-staging-backups`, retrieved again, and matched byte-for-byte:

| Checkpoint | Object key | Bytes | SHA-256 |
|---|---|---:|---|
| Pre-0060 | `d1/juro-staging/20260803T062630Z/pre-0060-full.sql` | 967,829 | `f4cb33d8045b43838e6748b5b5e10996108e9c4c4a28ba3245c13e1412f1eb09` |
| Post-0060 | `d1/juro-staging/20260803T062630Z/post-0060-full.sql` | 969,789 | `39e50ecd161b3984cdc378ef1ccf17e8ac1eec657875eedf4edbcb4bb62fcff9` |

The four local export/download copies were removed after checksum comparison.
Neither export URL nor its temporary signed credentials is recorded here.

## D1 preflight and postflight

Before the change, remote staging had 60 migrations through
`0059_pretty_punisher.sql`, no `ai_feedback` table, `quick_check=ok`, and no
foreign-key violations. Wrangler applied only `0060_lethal_slapstick.sql`.

After the change:

- migration ledger: 61 rows through `0060_lethal_slapstick.sql`;
- `PRAGMA quick_check`: `ok`;
- `PRAGMA foreign_key_check`: no rows;
- `ai_feedback`: present with four indexes, including its primary-key index;
- `ai_feedback` row count: 0.

## Code and deployment checks

- `npx tsx --test tests/ai-feedback.test.ts` — 3/3 passed.
- `npx tsx --test tests/migration-safety.test.ts tests/ai-feedback.test.ts` — 60/60 passed.
- `npm run type-check` — passed.
- `npm run lint` — passed.
- `npm run build:staging` — passed.
- `npm run validate:artifact -- --environment staging` — passed.
- `npm run deploy:staging` — passed; staging bindings were read back and list
  `juro-staging`, private staging files/backup/quarantine buckets, isolated
  queues and Vectorize indexes, and `APP_ENV=staging`.

## Limits and rollback

Cloudflare Access prevents an anonymous browser submission, so no authenticated
feedback UI traversal is claimed. The safe rollback for application behavior is
to deploy the previous Worker version; no destructive schema rollback is
planned. The verified pre-0060 export is retained solely in the private staging
backup bucket. Production D1, Worker, R2, routes, and public site were not
changed.
