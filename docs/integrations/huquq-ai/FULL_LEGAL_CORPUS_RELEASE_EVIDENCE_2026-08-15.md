# Full legal corpus foundation release evidence — 2026-08-15

Status: **DEPLOYED INERT — schema and Workers are live; corpus traffic and ingestion remain disabled**.

This record covers the JURO-native legal-corpus foundation at commit
`6eee1e4957ae82054badf453d555c108ec45a9b6`. It does not claim corpus
coverage, retrieval quality, Qdrant availability or legal-answer readiness.

## CI and staging gate

- Branch: `feature/full-legal-corpus`.
- Draft PR: [#43](https://github.com/MoozUpus/juro/pull/43).
- GitHub Actions run
  [31846403864](https://github.com/MoozUpus/juro/actions/runs/31846403864)
  passed both `apps/platform` and `apps/website` jobs.
- Migration `0128_owner_corpus_publications.sql` was the only pending staging
  migration and was applied after a full pre-migration export/restore pass.
- Staging Worker versions:
  - platform: `550bcbc2-786a-4528-91a3-a3140344f6ac`;
  - isolated admin: `f35b03f5-91bc-40b8-9db0-62fafff75477`;
  - isolated corpus: `efd152e9-0721-4157-a728-f0bc48003afa`.
- Authenticated browser QA loaded the isolated corpus console. It reported a
  valid empty audit chain, every corpus feature flag `OFF`, zero documents,
  versions, chunks, jobs and errors, and no browser console errors.

## Staging D1 backup evidence

| Point | SHA-256 | Tables | Indexes | Triggers | Migrations | Integrity |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Pre-0128 | `be14908649ec07f727cabdbe1c2622ec096b9b479b14e529c0b91e60c664de94` | 248 | 547 | 329 | 128 | `quick_check=ok`; FK violations `0` |
| Post-0128 | `b18b7412b201ebc31b375da328b3b2c30a78f27b5c8192e5f5a9ce06243164de` | 250 | 552 | 336 | 129 | `quick_check=ok`; FK violations `0` |

Private R2 readback matched each export byte-for-byte. The recoverable keys are:

- `legal-corpus/migrations/2026-08-15/pre-0128-6eee1e4/juro-staging.sql`;
- `legal-corpus/migrations/2026-08-15/post-0128-6eee1e4/juro-staging.sql`.

## Production migration gate

- Pre-migration D1 Time-Travel bookmark:
  `00000915-0000000a-000050c7-d63e76604752eede4907e81cb350859b`.
- The production migration glob applied only `0124–0128` and continued to
  exclude staging-only human-evidence migrations `0122–0123`.
- Both pre- and post-migration exports were restored into isolated local
  SQLite databases before their plaintext copies were removed.

| Point | SHA-256 | Tables | Indexes | Triggers | Migrations | Integrity |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Pre-0124–0128 | `78fe976cf8b226957d3819fc90cca474f26973f1b1f0ccf0ba28962db0200fec` | 232 | 517 | 313 | 122 | `quick_check=ok`; FK violations `0` |
| Post-0124–0128 | `4a9e5d8d3c187ec66da6af7f9218ef651a2a117cb824357456838223b966190a` | 248 | 545 | 326 | 127 | `quick_check=ok`; FK violations `0` |

The two-table difference from staging is expected: production does not contain
the staging-only `0122–0123` evidence schema. Private production R2 readback
matched the export hashes at:

- `legal-corpus/migrations/2026-08-15/pre-0124-0128-6eee1e4/juro-production.sql`;
- `legal-corpus/migrations/2026-08-15/post-0124-0128-6eee1e4/juro-production.sql`.

## Production deployment

- platform Worker `juro`:
  `d4c4cae5-4350-44cc-bc49-bbc21d5cba3c`;
- isolated admin Worker `juro-admin`:
  `19cca243-d0e3-46d2-8e8b-c3ce728686dc`;
- route-free corpus Worker `juro-legal-corpus`:
  `ca9f9b82-1430-4bae-80ce-94e1194d420a`.

The deployment retained the existing `app.juro.uz`, `admin.juro.uz` and
`status.juro.uz` domains. No DNS record or container rollout was changed.
Anonymous boundary probes returned the expected `307` login redirect for the
platform dashboard, `303` host-fenced admin-session redirect for the corpus
console, and `200` for the status API.

An authenticated production user then loaded dashboard, AI chat, Document
Builder and Document Review. All four rendered their main content without a
login redirect, not-found state or browser console error. The smoke was
read-only: it did not submit an AI question, upload a file, create a document or
change user data.

## Fail-closed production state

The deployed platform and isolated corpus Worker both report these server-side
flags as `false`:

- `LEGAL_CORPUS_ENABLED`;
- `LEGAL_CORPUS_AUTO_INGEST_ENABLED`;
- `LEGAL_CORPUS_LIVE_LEXUZ_ENABLED`;
- `LEGAL_CORPUS_MULTILINGUAL_ENABLED`;
- `LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST`;
- `LEGAL_CORPUS_USER_UPLOAD_AUTO_TRUST`;
- `LEGAL_CORPUS_HISTORICAL_ENABLED`;
- `LEGAL_CORPUS_DENSE_ENABLED`;
- `LEGAL_CORPUS_SHADOW_MODE`.

A post-deploy read-only production query returned zero corpus documents,
versions, chunks, owner publications, withdrawals and pending ingestion jobs.
The normal direct Lex retrieval path remains active. Therefore this release
publishes the reversible infrastructure only; it does not expose an empty index
to users and does not start a crawl.

## Rollback

If an application regression appears, roll the three Workers back to their
previous verified Cloudflare versions. If the new schema itself must be
reverted, use the recorded Time-Travel bookmark through the controlled D1
restore procedure. Do not delete migration-ledger entries or immutable audit
data. Corpus flags are already disabled, so no traffic cutover is required for
the data-plane rollback.
