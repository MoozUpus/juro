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

## Subsequent controlled staging activation

The initial inert deployment above remains the production baseline. Later on
2026-08-15, staging alone enabled official-source acquisition after separate
approval and applied staging migrations `0129–0132`. Production flags and DNS
were not changed.

Migration `0132` added the distributed Lex host pacer. Its pre-migration export
had SHA-256
`f43f54280f3debf171877e1a7a344e7dac277bbae30ae8a4a05dc62edbcc2a57`
and restored with `quick_check=ok`, zero foreign-key violations, 252 tables,
557 indexes, 343 triggers and 132 migrations. The post-migration export had
SHA-256
`1d0c4235b8c5811e11f1c00b22b97de1cc2d70055b9ab6d3be5dfc8ab1e609b8`
and restored with `quick_check=ok`, zero foreign-key violations, 253 tables,
558 indexes, 343 triggers and 133 migrations. Private staging R2 readback
matched both exports byte-for-byte:

- `legal-corpus/migrations/2026-08-15/pre-0132-20260815T082819Z/juro-staging.sql`;
- `legal-corpus/migrations/2026-08-15/post-0132-20260815T082819Z/juro-staging.sql`.

One first restore process exceeded the bounded command window and left an
incomplete local file; it was not used as evidence. A second distinct restore
target completed and supplied the figures above.

The 08:40 UTC paced batch ran for about 4 minutes 49 seconds and released its
lease before the next cron. No overlapping crawler started. By 14:11 +05:00,
staging had 54 official canonical documents and zero owner materials; an
earlier exact count recorded 390 discovered URLs, 45 canonical documents,
49 language variants, 53 immutable versions, 3,741 provisions, 3,748 chunks,
405 queued/retrying jobs and zero terminal failures. Counts continue to change
while the bounded Worker is active and are not presented as coverage success.

Staging versions after the UI, pacing and maintenance update are:

- platform: `a44f13ec-c3b8-4be9-a2ba-950f6a9312f7`;
- isolated admin: `16ff2e82-5c40-4b31-b80f-ff1d9a471db5`;
- isolated corpus: `0166a779-2d31-4884-a889-40017ca1af82`.

The platform and admin type-checks, platform lint, focused retrieval/citation/
maintenance tests, corpus dry-run and staging artifact build passed. The
artifact exposed `/api/platform/ai/citations/:messageId`, stayed within every
configured raw-size budget and deployed successfully. Post-deploy browser QA
reached the expected fresh-MFA gate; it did not claim an authenticated visual
pass after that 15-minute session expired.

At 14:36 +05:00 the continuing staging crawl contained 662 discovered URLs,
65 canonical official Lex documents, 103 language variants, 107 immutable
versions, 8,026 provisions and 8,038 chunks. There were 694 queued/retrying
jobs, one bounded running job and zero technically-unavailable terminal
failures. This remains below the canonical-document release threshold.

The ordinary authenticated staging user session loaded the AI chat after the
platform deployment. Light and dark themes rendered the empty state and the
desktop three-column layout; the dark preference survived reload. The first
visual pass exposed low-contrast conversation cards, which were corrected and
redeployed before the second screenshot. The corrected dark view retained
readable history cards and the browser log contained no console entries. This
visual check did not submit a paid provider request and did not claim a visual
pass for a source modal without a selected source-bearing answer.

## Private document grounding and admin-form recheck

Commit `d35881f4d9b833dd103cb06d19c93b81667808c8` passed GitHub Actions
run [31882271516](https://github.com/MoozUpus/juro/actions/runs/31882271516)
for both platform and website jobs. It was then deployed to the staging
platform Worker as version `6b194331-bb66-41ef-bcc2-65bbcf52e332`.

An authenticated staging user submitted one bounded provider-backed question
asking for a payment term in their uploaded documents and explicitly directing
JURO to treat the document as a fact, not as legislation. The answer extracted
the unfilled repayment-date placeholder from an indexed private document,
reported that the legal basis still required separate verification and did not
turn the document into an official source. The source card was labelled as a
private document in the protected index. Its full-document control opened one
authenticated dialog; the rendered result contained no `Open Lex.uz` link.
The test did not expose a public or signed R2 URL, object key, owner ID,
workspace ID or document hash.

The isolated staging admin Worker was redeployed from the same branch as
version `a934e14c-3d13-46b9-885d-2f995d23c482`. Its primary
`seed_discovery` form supplies a fixed hidden audit reason and therefore does
not require the operator to type into `Technical reason`. Manual retry,
withdrawal and publication actions continue to require a human-entered reason
because those are distinct audit events. Admin type-check, the Wrangler staging
dry-run and all six focused corpus-admin tests passed. The current browser
session had already lost its fresh-MFA admin window, so this record does not
claim a post-redeploy visual admin pass.

The read-only staging corpus snapshot at 2026-08-15 16:45 +05:00 contained
245 ready official documents, 335 language variants, 341 immutable versions,
15,742 provisions and 15,778 indexed chunks. It also contained 337 completed
jobs, 1,815 queued/retrying jobs, no running job at the instant of the query,
zero terminal jobs and zero terminal technical failures. Discovery checkpoints
were 7 completed, 35 queued and 2 retrying. This is still below the
1,283 / 20,296 / 22,513 release floor.

## English Lex ingestion repair

The continuing crawl surfaced one real English-only contract defect in
`https://lex.uz/en/docs/6408192`: the fetch layer accepted the official `en`
route while the normalized snapshot schema still accepted only `ru`, `uz` and
`uzc`. The valid page was therefore recorded as a generic non-retryable failure.
Commit `e31504a61f6150a1dc4fc737f4513649c3cc68a0` adds `en` to the same typed
schema and a regression that round-trips an English normalized snapshot.
Platform lint/type-check, 15 focused parser/ingestion tests and GitHub Actions
run [31883644191](https://github.com/MoozUpus/juro/actions/runs/31883644191)
passed.

Before the bounded staging repair, D1 Time Travel bookmark
`0000139b-0000526a-000050c8-52a0e849c458c453705352ac31e28991` was recorded.
The corrected corpus Worker was deployed as
`274b094f-5996-4891-8fc8-0c41e0b76861`; the platform Worker was deployed as
`d36fc836-29a3-40ab-b26a-021eeb8c7b75`. The repair statements were conditional
on the exact job ID, English language, old generic error, exact attempt count
and dead-letter state. Two early repair attempts were consumed by the already
running pre-deploy `12:10:16–12:14:56Z` invocation and are not counted as
passes. After that invocation released the distributed lease, the new Worker
completed the same job at `12:16:59Z`.

The persisted English variant is current and contains 13 unique provisions and
13 indexed chunks. A post-run read-only check returned zero terminal jobs and
zero terminal/technically-unavailable failures. At 2026-08-15 17:18 +05:00 the
whole staging corpus contained 285 ready documents, 384 language variants, 395
versions, 17,802 provisions and 17,840 indexed chunks; 391 jobs were completed,
2,162 were queued/retrying and one was running. This remains below the release
floor and does not claim complete category coverage.

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
