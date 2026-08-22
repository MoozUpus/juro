# Full legal corpus foundation release evidence — 2026-08-15

Status: **STAGING CORPUS BUILD IN PROGRESS — production corpus remains disabled and release gates are not met**.

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
version `4af7b441-4fd4-49cf-91d4-8f2b276a9272`. Its primary
`seed_discovery` form supplies a fixed hidden audit reason and therefore does
not require the operator to type into `Technical reason`. Manual retry,
withdrawal and publication actions continue to require a human-entered reason
because those are distinct audit events. Admin type-check, the Wrangler staging
dry-run and all six focused corpus-admin tests passed. This second bounded
redeploy followed a reported stale form that still rendered the retired seed
textarea; the protected page already sends `private, no-store` and
`Pragma: no-cache`. The current browser session had already lost its fresh-MFA admin
window, so this record does not claim a post-redeploy visual admin pass.

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

The next read-only snapshot at 2026-08-15 17:33 +05:00 showed continued bounded
progress: 292 ready documents, 396 language variants, 410 versions, 18,156
provisions and 18,194 indexed chunks. There were 406 completed jobs, 2,217
queued/retrying jobs, no running job at the instant of the query, zero terminal
jobs and zero terminal/technically-unavailable failures. Checkpoints were 8
completed, 34 queued and 2 retrying. These numbers still do not satisfy the
release floor or prove category completeness.

## Catalog completion proof and cron-window repair

Commit `86238616060153ccf14f3d287faa8f93a842a121` made catalog completion
provable. A checkpoint that reaches the real end of a Lex result set without a
reported total now persists its deduplicated discovered count as the expected
count; a final page that contradicts an explicit total retries instead of being
marked complete. Due retries are claimed before ordinary queued checkpoints so
they cannot starve behind a long catalog backlog. GitHub Actions run
[31885554381](https://github.com/MoozUpus/juro/actions/runs/31885554381)
passed both platform and website jobs before the staging-only corpus Worker was
deployed as `0c1586b7-7437-4862-8bc3-53d0cccc1c1a`.

Real staging timing then showed that two catalog pages plus nine ingestion jobs
took slightly longer than the five-minute cron interval. The `13:05Z` run
completed in `301.614` seconds and therefore missed the `13:10Z` tick. Commit
`7295494a65a74b77dcf6803be445fb6da3db2569` reduced the sequential ingestion
batch to eight without changing the shared 20-second Lex host pacer or adding
concurrency. Focused tests passed 13/13; platform lint, type-check and the
legal-corpus artifact dry-run passed; GitHub Actions run
[31886104901](https://github.com/MoozUpus/juro/actions/runs/31886104901)
passed both jobs.

Before that deployment, D1 Time Travel bookmark
`0000139e-0000007b-000050c8-35a3a3b70b3cc0b34ab5a28f6d892988` was recorded.
The staging-only corpus Worker was deployed as
`f9f5e2df-581c-42c6-bf1c-84781b1bb3ae`. Its first full new-code run started at
`13:15:00.083Z`, completed successfully at `13:19:47.910Z` in `287.827`
seconds and released the lease in time for the next run to start at
`13:20:00.036Z`. This proves the intended throughput correction on the real
staging scheduler; it does not relax source pacing.

The read-only snapshot at 2026-08-15 18:20 +05:00 contained 325 ready official
documents, 435 language variants, 454 immutable versions, 7,917 unique current
provisions, 18,178 indexed current chunks and 19,520 indexed chunks across all
immutable versions. There were 450 completed ingestion jobs, 2,398
queued/retrying jobs, zero terminal jobs and zero terminal or technically
unavailable failures. Catalog state was 10 completed, 33 queued and one running;
no completed checkpoint had a null expected count and no retry was overdue.
Applying the same per-checkpoint formula as the admin console produced 4/44
fully fetched, extracted and indexed category/language checkpoints. The crawl
therefore remains below both the 44/44 coverage gate and the pinned
1,283 / 20,296 / 22,513 release floor.

## Qdrant engine and snapshot-restore gate

The local Docker Desktop installation could not host Qdrant because its visible
runtime status reported `Virtualization support not detected`. No BIOS,
virtualization or Windows security setting was changed. Instead, commit
`aa4446b9d44f2c9415c61139a4b8f756a7b7d9dd` added an isolated GitHub Actions
service-container gate using official Qdrant `v1.18.2`, pinned to the amd64 OCI
digest
`sha256:da65a06bc75e42702f80c992b99c5144b0fbd675ae7a96d2991de0bf957b7071`.
Qdrant's complete Apache-2.0 text and attribution are stored in
`third_party/licenses/qdrant-Apache-2.0.txt` and `THIRD_PARTY_NOTICES.md`.

GitHub Actions run
[31887777456](https://github.com/MoozUpus/juro/actions/runs/31887777456)
passed against the real Qdrant REST API. It created a collection with named
1,536-dimensional cosine `dense` and `sparse` vectors, inserted three scoped
points, and verified the same expected first result for dense, sparse and
hybrid queries. It then created and downloaded a 118,784-byte collection
snapshot with SHA-256
`90851de58c459248d2bdf35f18460e8f5bd5278f32da347591a9f20380618a5b`,
deleted the collection, recovered the uploaded snapshot with
`priority=snapshot`, verified 3/3 restored points and repeated the hybrid query.
Artifact `qdrant-snapshot-gate-31887777456` (GitHub artifact ID `9247727317`)
retains the machine-readable evidence for 30 days.

This closes real engine-contract and snapshot-restore rehearsal only. It does
not activate dense retrieval, provision a private staging Qdrant service or
claim legal relevance from a three-point infrastructure fixture. The final
Qdrant benchmark remains bound to the frozen full corpus, the 314 reviewed
scenarios, an approved provider-pricing envelope and the same corpus snapshot
hash used by the release verifier.

## Human-review binding for the final benchmark

The owner-supplied protected export
`staging-20260814-canonical-human-review-evidence.json` is 323,133 bytes and
has SHA-256
`159c66da580010286b7b010348bf3c65ce66f136436618fc6b4e10d6d4ef4b1c`.
JURO's existing strict schema and verifier parsed all 314 records, confirmed
314 `correct` classifications, matched the canonical evaluation-corpus hash,
recomputed the export digest and validated every event hash and previous-hash
link with zero failures. The export itself is not committed because it contains
staff/session audit identifiers.

The indexed-corpus release schema now requires a cryptographic human-review
binding, not only a claimed count. The release-evidence builder validates the
protected export first and records its evaluation run, corpus hash,
attestation/event/scope/export digests and complete-file SHA-256 alongside the
frozen corpus snapshot hash. Final metrics still cannot be generated until the
full corpus is frozen and the real 314-scenario indexed benchmark runs.

## Current-head verification and staging admin refresh

Commit `512ad0ff7b516c7743ba8abbe6cff31a32b02bc8` binds the protected human-review
export to final corpus evidence. GitHub Actions run
[31888475666](https://github.com/MoozUpus/juro/actions/runs/31888475666)
passed both platform and website jobs. Qdrant gate run
[31888475668](https://github.com/MoozUpus/juro/actions/runs/31888475668)
also passed on that exact head. Its 118,784-byte snapshot had SHA-256
`3dd4056befbf3cc907eef807589a7c3a44b12f9a1c0c7e73c35620aaf2c4a0e5`;
machine-readable artifact `qdrant-snapshot-gate-31888475668` has artifact ID
`9247900399`.

The staging admin Worker was refreshed as version
`51243369-48df-4255-960f-22d5edc1495a` after an already-open browser page
displayed the retired required textarea on the primary seed action. The current
Worker supplies the primary seed audit reason as a fixed hidden value. Staging
D1 already contains all 44 category/language checkpoints, so a refreshed page
must not render the primary seed form at all. Manual retry, withdrawal and
owner-publication actions still require a human-entered technical reason. The
admin type-check and Wrangler staging dry-run passed before deployment. The
available browser session did not have a fresh admin MFA window, so no
post-refresh authenticated visual pass is claimed.

After a second stale-form report, the same source was revalidated with the
admin TypeScript check, the Wrangler staging dry-run and 18 focused
admin-domain/corpus tests (18/18 passed), then redeployed only to
`juro-admin-staging` as version
`4773f017-f9b5-45e5-91eb-3aeab74ed1a9` at 100% staging traffic. DNS resolved
and the unauthenticated route returned the expected Cloudflare Access redirect.
Browser automation policy did not permit a post-deploy capture of the protected
admin hostname, so this record still does not claim an authenticated visual
pass. Production and DNS were not changed.

The read-only staging snapshot at 2026-08-15 19:04 +05:00 contained 365 ready
official documents, 8,601 unique current provisions and 19,400 indexed current
chunks. It contained 521 completed jobs, 2,851 queued/retrying jobs, one
running job at the sampled instant, zero terminal jobs and zero terminal or
technically unavailable failures. Checkpoints were 11 completed and 33 queued.
This remains below the 44/44 coverage gate and the pinned
1,283 / 20,296 / 22,513 floor.

## Resumable dense backfill and legacy-language resolution

Commit `a45b0d1dc089d1d189067c776452fbbd9b788711` added a bounded Qdrant
backfill that remains active after Lex acquisition is frozen. D1's persisted
deterministic point IDs are the resume cursor; one scheduled invocation is
limited to four 64-chunk batches. Release evidence schema version 2 now fails
unless Qdrant's current point count equals the frozen corpus current-chunk
count, its total point count is not lower, the restored snapshot reports the
same current and total counts, and the Qdrant snapshot artifact has its own
SHA-256.

During the continuing crawl, four legacy Russian routes (`2772517`, `2772450`,
`2570005` and `2772662`) returned a short official page that explicitly states
that the act text is provided in Uzbek. The previous parser treated this as
`LEGAL_SOURCE_CONTENT_INSUFFICIENT`, producing four dead-letter jobs. Commits
`815a7bf`, `0d85dbf` and `d3e08c5` distinguish that fixed Lex notice from a
broken document, give due retries priority over the ordinary queue and detect
the warning even when Lex places it beside rather than inside `#divBody`.
JURO does not translate or synthesize the unavailable Russian text. The four
jobs were retried through corpus Worker version
`a30d9107-c4e9-41ec-bee3-063518142040` and completed with
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE`; all prior failure rows were preserved
but their resolution state became `technically_unavailable`. The ledger then
contained no terminal failure and no dead-letter ingestion job.

Exact-head CI run
[31891376925](https://github.com/MoozUpus/juro/actions/runs/31891376925)
passed on `d3e08c559dba6616c493fe3b5f3f8b204efe9c1d`. Qdrant gate run
[31891376973](https://github.com/MoozUpus/juro/actions/runs/31891376973)
also passed on that head. Its 118,784-byte engine-contract snapshot has SHA-256
`40ea6be69fb279d9501e2268cadb91ec14495d8c5674fb5f28f850a35c30f19c`;
artifact `qdrant-snapshot-gate-31891376973` has artifact ID `9248633326` and is
retained for 30 days. The admin seed-form fix was republished independently as
staging admin Worker `0c6be85d-e24a-4e7b-ae7a-1fbf6213a91a`.

The read-only staging snapshot at 2026-08-15 20:04 +05:00 contained 413
canonical documents, 557 language variants, 9,518 unique provisions, 21,313
current provisions, 21,358 current/indexed chunks and 53 historical versions.
Jobs were 608 completed, 3,394 queued and one running at the sampled instant,
with no dead-letter job. Failure evidence contained five retrying records and
13 technically-unavailable records representing four distinct documents; no
terminal record remained. Checkpoints were 12 completed and 32 queued. Applying
the release formula produced 6/44 complete checkpoints, 2,891 expected
category/language documents, 557 indexed documents and four confirmed
technically-unavailable documents. The crawl therefore remains in progress and
no full-corpus, dense-retrieval or 314-scenario benchmark claim is made.

## Private staging dense control plane and bounded ingestion redrive

Commit `8f40361252c6a4b162f98f0467f1afa61372b93c` provisioned the
staging-only dense control plane without activating retrieval. Platform Worker
version `f2e932d4-db6e-4732-a9e6-02b460a0730f` owns the provider secret and
exposes a private embedding relay through a Cloudflare service binding. Corpus
Worker version `ba4c8b37-49d1-4157-9aaa-e292df422782` reaches Qdrant only
through `qdrant.internal`; the container has no public route or Internet
egress. The server-side `QDRANT_API_KEY` exists in both staging Workers but was
never printed, copied into source control or exposed to the browser.

The Qdrant adapter now creates only the exact configured collection when it is
absent, with named 1,536-dimensional cosine `dense` and `sparse` vectors. It
then reads the collection back and refuses to delete or replace an incompatible
existing collection. Dense payloads must contain exactly 1,536 finite values;
sparse indices and values are also validated. `LEGAL_CORPUS_DENSE_ENABLED`
remains `false`, so the container is dormant: no full-corpus backfill, provider
evaluation cost or user traffic was started.

Commit `c84093300af689a845ef3508fd6848babf83ba90` added a bounded,
evidence-preserving retry for first-attempt operational ingestion failures and
deployed corpus Worker version `d61481d9-b876-4418-9d66-c699a4bfd4d2`.
Staging job `legal-corpus:97da3887b2d44f393113c4d42fc7` for the official
Uzbek-Cyrillic Lex.uz document `5748890` had failed once with the safe generic
code `LEGAL_CORPUS_INGESTION_FAILED`. The new Worker reconciled the retained
failure row to `retrying`, claimed the same job without creating a duplicate
and completed it on attempt 2 at `2026-08-15T16:06:02.669Z`; its job error was
cleared. The source was not replaced, translated or fabricated.

Exact-head GitHub Actions CI run
[31894381639](https://github.com/MoozUpus/juro/actions/runs/31894381639)
passed both application jobs on `c84093300af689a845ef3508fd6848babf83ba90`.
Qdrant gate run
[31894381637](https://github.com/MoozUpus/juro/actions/runs/31894381637)
passed on the same head. It created dense and sparse vectors, verified all three
query modes, downloaded a 118,784-byte snapshot with SHA-256
`ae1665b90e5b51919f7a8ab2fd88dd8a58d884c113b32be2c5dd8a96ac308c78`,
deleted the collection, restored the snapshot and verified 3/3 points plus the
same hybrid first result. Artifact `qdrant-snapshot-gate-31894381637` has ID
`9249386130` and is retained for 30 days.

The read-only staging snapshot at 2026-08-15 21:08 +05:00 contained 418
canonical documents, 636 language variants, 9,999 unique current provisions,
24,637 current provisions and 24,683 current/indexed chunks. Jobs were 699
completed, 3,871 queued, one running at the sampled instant and zero failed or
dead-letter jobs. Failure evidence contained zero terminal rows and 13
technically-unavailable rows representing the four previously documented
legacy Russian routes. Checkpoints remained 12 completed and 32 queued.
Applying the exact admin formula produced 7/44 release-complete checkpoints,
2,891 expected category/language documents, 3,411 discovered source entries,
636 indexed language variants and four confirmed technically-unavailable
documents. The chunk floor alone is exceeded; the canonical-document,
unique-provision and 44/44 checkpoint gates are not, so no full-corpus,
dense-retrieval or final 314-scenario benchmark claim is made.

## Ephemeral-container snapshot persistence and admin health

Commit `a673cfeebd18a730e0186ee9800ad1ce267ab266` closes the data-loss
boundary created by a Qdrant Container's ephemeral local disk. Once Lex
acquisition is frozen and one whole dense-backfill invocation begins empty,
the corpus Worker verifies exact D1/Qdrant point parity, creates a collection
snapshot, streams it directly into the private staging backup bucket with the
Qdrant SHA-256 as the R2 upload checksum, verifies object size and checksum,
stores a separately checksum-verified JSON manifest and records the immutable
snapshot ledger row. A cold or partial collection now fails closed unless it
can restore an environment- and collection-matched private-R2 snapshot. Only
post-snapshot point IDs are reset for deterministic replay after restore; the
source D1 chunks are not deleted or rewritten.

Staging platform Worker `3b103259-5f38-4f19-81b6-23dceffc5e5d` and corpus
Worker `3f6081d5-dd05-4603-beaa-b945167489af` published that lifecycle while
keeping `LEGAL_CORPUS_DENSE_ENABLED=false`. The immediate read-only D1 check
contained zero snapshot-ledger rows and zero dense vector IDs, proving that
deployment did not start a paid provider backfill or manufacture a snapshot.
Local verification passed 186/186 tests, lint, type-check, staging build,
platform artifact validation, corpus Worker dry-run and the focused snapshot
suite. Exact-head CI
[31895828352](https://github.com/MoozUpus/juro/actions/runs/31895828352)
and Qdrant gate
[31895828373](https://github.com/MoozUpus/juro/actions/runs/31895828373)
passed on `a673cfeebd18a730e0186ee9800ad1ce267ab266`. The latter retained artifact
`qdrant-snapshot-gate-31895828373` (ID `9249767609`) containing a real
118,784-byte Qdrant 1.18.2 snapshot with SHA-256
`d437647cd7b2c3d28a71bf6290380abc39019bbc77be2b273c181b4928da5ccc`.

Commit `0fe520256b0203b9394a80e70797ef469078ec83` adds a non-mutating Qdrant
health record to the isolated corpus dashboard. It distinguishes disabled,
not configured, collection missing, incompatible, unavailable and ready
states. With the current dense flag off, the dashboard does not wake the
Container or make a Qdrant request. When enabled, it validates the exact
1,536-dimensional cosine dense plus sparse collection contract and reports
exact total/current point counts without exposing the URL, collection name or
API key. Staging platform Worker `c9a2a3e8-950c-4944-b2d1-2e717b30cfe7`
and admin Worker `4337ee1c-212b-4b3c-b724-a4357f21ef14` now contain this
surface. The unauthenticated boundary still redirects to Cloudflare Access;
the connected in-app session had expired, so authenticated post-deploy visual
QA remains pending and is not claimed.

The exact-head Qdrant gate
[31896757755](https://github.com/MoozUpus/juro/actions/runs/31896757755)
passed on `0fe520256b0203b9394a80e70797ef469078ec83`. Artifact
`qdrant-snapshot-gate-31896757755` (ID `9250007931`) records a 118,784-byte
snapshot with SHA-256
`306cb8cfff40cb1b41f16a17e4f18057428bd684771114134f165305e982fe49`
and successful dense, sparse, hybrid, deletion, upload-restore and restored
hybrid checks. Exact-head application CI
[31896757760](https://github.com/MoozUpus/juro/actions/runs/31896757760)
also passed both application jobs, including 186/186 platform tests, artifact
validation, the Cloudflare environment matrix and dependency-licence policy.

Sequential read-only staging samples between 2026-08-15 21:52 and 22:01
+05:00 contained 418 canonical documents, 698 language variants, 10,272
unique current provisions, 27,489 current provisions, 27,535 current/indexed
chunks and 73 historical versions. Jobs were 771 completed, 4,307 queued, one
running at the first sampled instant and zero failed/dead-letter. The exact
admin formula still produced only 7/44 complete checkpoints: 12 checkpoint
rows had discovery status `completed`, 2,891 category/language documents were
expected, 3,851 source entries had been discovered, 711 documents were
indexed under those checkpoints and four were technically unavailable. The
crawl therefore remains below the canonical-document, unique-provision and
44/44 gates. Qdrant snapshot-ledger and dense-vector-ID counts remained zero;
no full-corpus dense or final 314-scenario claim is made.

The current release envelope is schema version 3. It no longer trusts a
dashboard `complete` boolean or a lower provider-reported expected count by
itself: for every category/language row it independently requires
`expected == discovered` and
`indexed + technically_unavailable == discovered`. It also binds a fresh
ready Qdrant dashboard probe and its exact current/total point counts to the
benchmark. Disabled, stale, incompatible, missing or count-drifted Qdrant
health therefore fails the release gate before rollout.

## Quarantined owner upload and delayed publication authorization

The isolated admin console now accepts a direct owner upload of PDF, DOCX,
TXT, safe HTML, JSON or a bounded ZIP package up to 20 MiB. It no longer asks
for an analysis ID or an empty technical-reason field on the primary path.
The browser sends the file only to the isolated admin Worker, which forwards a
bounded binary request over the existing service binding. The platform writes
the source only to private quarantine R2, validates MIME plus magic bytes and
archive/text structure, creates an immutable rights/MFA/assignment
authorization and queues the existing malware scan. Only a clean scanner
result can move the object into private primary R2 and queue extraction. The
admin table exposes status, analysis ID, safe error code and resulting corpus
document ID; it never returns file text.

Migration `0133_owner_corpus_upload_requests.sql` adds the immutable request
ledger and three mutation guards. Migration
`0134_owner_corpus_delayed_publication.sql` replaces only the owner-ingestion
insert guard so that a long scan/extraction can use the original immutable
fresh-MFA upload authorization. It does not accept an arbitrary stale MFA:
the request must match the analysis, file/hash, environment, language, reason,
actor, session and assignment, and the administrator/legal-reviewer assignment
must still be active at publication time. Manual publication and withdrawal
continue to require fresh MFA at the action time.

Staging safety evidence:

- pre-`0133` Time Travel bookmark:
  `000013a1-00000d3e-000050c8-4774be188ed9b3bd876dc6beabc0ed90`;
- the complete 868,719,406-byte pre-`0133` export restored locally with
  SHA-256 `a8c307237aec2cf538fbd3b50540934f3e95d0081b06af681fe956d374ef0e23`,
  253 tables, 558 non-internal indexes, 343 triggers and 133 migrations;
  `PRAGMA quick_check` returned `ok` and `foreign_key_check` returned zero rows;
- the verifier now streams arbitrarily large Wrangler exports rather than
  reading the whole SQL file into a size-limited JavaScript string;
- after evidence was recorded, the plaintext SQL and local restore databases
  were removed from the temporary directory;
- pre-`0134` bookmark:
  `000013a2-00000691-000050c8-34a53b1ccae13b7d27c858bce82ee160`;
- post-`0134` bookmark:
  `000013a2-0000070b-000050c8-b78dac850d94af66e77a3e86aa53c36e`;
- postflight listed 135 migrations through `0134`, the request table and all
  four expected owner-upload/publication triggers; there were zero owner-upload
  rows before authenticated use.

Focused upload, tenant, quarantine, owner publication and delayed-publication
tests passed 22/22. Migration safety passed 60/60, including application of all
migrations with zero FK violations. Platform and admin TypeScript checks and
the admin staging dry-run passed. The exact application tree from commit
`4353e67f31dc8d8d12a70dc3c754455df37337b0` was published as platform Worker
`2199de08-04f7-4d0a-8c7c-67b81fbae746`; isolated admin Worker
`0b51b249-0a57-4921-a973-2df01ebba538` remains at 100% staging traffic.
Production Workers, production D1 and DNS were not changed. The in-app browser
runtime could not navigate the protected hostname under its URL policy, so no
authenticated post-deploy visual or real-file upload pass is claimed.

The read-only staging sample at 2026-08-15 23:51 +05:00 contained 418
canonical documents, 830 language variants, 10,527 unique current provisions,
30,451 current provisions, 30,497 current/indexed chunks and 112 historical
versions. Checkpoints remained 12 completed and 32 queued. Jobs were 943
completed, 5,462 queued and two running at the sampled instant. Failure
evidence contained seven retrying and 13 technically-unavailable rows, with no
terminal state. This still fails the canonical-document, unique-provision and
44/44 gates; dense retrieval and final 314-scenario evaluation remain gated.

## Lex ZIP/PDF terminal-failure remediation

On 2026-08-16 the sequential staging monitor found two new max-attempt
dead-letter jobs for canonical Lex pages `6783170` and `6783216`. Both failed
with `LEGAL_SOURCE_CONTENT_INSUFFICIENT` because the canonical HTML contains
only the act requisites and an official `/files/<id>.zip` link. The two
allowlisted archives (`6783200.zip` and `6783246.zip`) each contained one PDF.
A bounded inspection performed after reading `robots.txt` and observing its
20-second crawl delay found that the PDF text layer exposed only the repeated
`PDF Anti-Copy` watermark: 161 characters over two pages and 242 characters
over three pages. No legal text from either PDF was treated as extractable or
indexed. The temporary inspection directory and both downloaded archives were
removed after the diagnosis; no Lex corpus payload was committed to Git.

Commit `f53bdf86f69b62d6358bfc3de3b45c89e317314a` adds a strict fallback for
short canonical Lex pages. It accepts only one exact same-origin numeric
`/files/<id>.zip` link, re-checks robots policy, uses the shared D1 host pacer,
limits the archive to 20 MiB, validates content type plus exact ZIP magic,
verifies archive structure, expansion, CRC and member magic, and permits only
one PDF for this representation profile. Extractable PDFs are normalized and
indexed while immutable HTML, archive, extracted PDF and normalized snapshots
receive separate hashes in private R2. A known anti-copy overlay is removed
from candidate text; a document with no meaningful text remaining is recorded
as `LEGAL_CORPUS_ATTACHMENT_TEXT_UNAVAILABLE` instead of indexing the
watermark. Old maxed `LEGAL_SOURCE_CONTENT_INSUFFICIENT` dead letters receive
one parser-upgrade redrive; the error code necessarily changes after that
attempt, so the mechanism cannot create an unbounded retry loop.

Local verification passed the focused 31/31 discovery, fetch and ingestion
regressions, platform lint, platform type-check, the complete 186/186 platform
suite and its bounded development build. The legal-corpus Worker staging
artifact also passed its dry-run at 3,648.65 KiB uncompressed / 803.56 KiB
gzip. Staging corpus Worker version
`4736a0ec-43b0-41b5-a414-6a6a69e46797` deployed the exact commit without
changing the production Worker, DNS, the dense flag or crawl concurrency.

The next scheduled staging run redrove both exact jobs once. Each finished at
attempt 6/6 with job status `completed` and safe code
`LEGAL_CORPUS_ATTACHMENT_TEXT_UNAVAILABLE`; all twelve immutable attempt
records for those jobs now have `retry_state=technically_unavailable`. A
sequential read-only global probe returned zero unresolved failure records and
the job status summary contained no dead-letter rows. The post-remediation
sample contained 992 canonical documents, 1,884 language variants, 12,032
unique current provisions, 44,567 current provisions, 44,726 current/indexed
chunks and 582 historical versions. Jobs were 2,488 completed, 12,814 queued
and two running; checkpoints were 13 completed and 31 queued. The chunk floor
is exceeded, but the canonical-document, unique-provision and 44/44 checkpoint
gates remain open. Dense backfill, freeze, Qdrant snapshot and the indexed
314-scenario evaluation therefore remain gated and are not claimed.

## Permanent Lex fetch failure classification remediation

The scheduled staging run that started at 2026-08-16 16:55:45 UTC exposed a
separate fetch-evidence regression. Five first-attempt `uz-Cyrl` jobs for
canonical Lex pages `1633162`, `2826514`, `2830312`, `2842473` and `2869373`
were dead-lettered as `LEGAL_SOURCE_UPSTREAM_UNAVAILABLE` without an HTTP
status. The fetcher correctly distinguished retryable and non-retryable
responses internally, but its typed error discarded the concrete response
status. Corpus ingestion therefore could not distinguish a permanent 4xx gap
from an unevidenced terminal upstream error.

Commit `4ce13b9192e2b48b7ad3489b61b638635ed4f3a5` preserves the upstream HTTP
status on the typed fetch error. A concrete non-retryable 4xx is now recorded
as `technically_unavailable`; 408, 425, 429 and 5xx responses remain bounded
retries. It also grants old, non-maxed `LEGAL_SOURCE_UPSTREAM_UNAVAILABLE`
dead letters one bounded parser/fetcher-upgrade redrive so that the current
Worker can collect the missing evidence. Tests prove both the 404 resolution
path and 503 retry path. The focused fetch/ingestion suite passed 27/27,
platform lint and type-check passed, the complete platform suite passed
186/186, and the staging Worker dry-run passed at 3,649.65 KiB uncompressed /
803.86 KiB gzip.

Staging legal-corpus Worker version
`2c0d76dd-430c-420e-bf54-185befbdc7cf` deployed that exact commit. Its first
scheduled run started at 2026-08-16 17:15:46 UTC and completed at 17:19:53 UTC.
All five jobs completed on attempt 2/5: four pages produced a current
`uz-Cyrl` variant with two indexed chunks each, while `1633162` produced the
specific safe result `LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` and no variant
or chunk. A sequential read-only global probe returned zero unresolved
failures; the job ledger contained 3,077 completed, 15,185 queued, two running
and no failed or dead-letter jobs at the sampled instant.

The same post-remediation sample contained 1,010 canonical documents, 2,226
language variants, 13,009 unique current provisions, 45,589 current
provisions, 45,755 current/indexed chunks and 813 historical versions. All 44
checkpoint rows exist, but the strict release formula marked only 10 complete:
13 discovery rows were completed and 31 remained queued. The canonical,
unique-provision and 44/44 gates therefore remain open. Freeze, dense backfill,
Qdrant snapshot and the indexed 314-scenario evaluation are still not allowed.

## Stale ingestion recovery

A sequential staging read at 2026-08-16 17:30 UTC found one historical
revision job still marked `running` from 2026-08-15 18:24 UTC even though all
subsequent corpus scheduler runs had finished. The ingestion schema has no job
lease or heartbeat, and the claim path previously selected only `queued` and
`retrying` rows. A Worker interruption could therefore strand a claimed job
indefinitely without a failure record, contradicting the resumability gate.

Commit `3716bd8211c1bcafe554c67bb7f4b56197b4adcf` adds conservative stale-run
reconciliation before each ingestion claim. A `running` job is eligible only
after 15 minutes, wider than the seven-minute scheduler lock and normal source
timeouts. The update is guarded by the exact prior `updated_at` value so a
concurrent fresh worker cannot be overwritten. A non-exhausted job returns to
bounded retry with `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`; a 5/5 job becomes a
terminal dead letter instead of looping. Focused ingestion/fetch regression
tests passed 30/30, including stale recovery, fresh-job fencing and exhausted
terminalization. Lint, type-check and the complete 186/186 platform suite
passed. The staging Worker dry-run passed at 3,651.05 KiB uncompressed /
804.14 KiB gzip.

Staging legal-corpus Worker version
`0a0599fc-6fe6-4cfc-97b3-799f64978254` deployed that exact code. Its first
scheduled run started at 2026-08-16 17:40:28 UTC and completed at 17:45:23 UTC
without an error code. It recovered historical revision job
`legal-version:39a874a47b7175affc667218db1d`, recorded one bounded retryable
timeout at attempt 1, reclaimed it as attempt 2/5 and completed it. The linked
`lexuz-family:4542880` `uz-Latn` current variant had 36 indexed chunks. A
sequential post-run read returned zero jobs older than the 15-minute running
window and zero unresolved failures.

Exact-head application CI passed the platform and website jobs, including the
environment and licence gates, and the separate Qdrant snapshot gate passed.
This recovery changes no production flag, Worker, database or DNS state. It
does not relax the strict corpus thresholds; freeze and downstream evaluation
remain gated on the final 44/44 corpus proof.

## Cron-window throughput remediation

The staging run started at 2026-08-16 17:55:28.188 UTC finished at
18:00:28.323 UTC, a measured 300,135 ms. It crossed the following five-minute
tick by 323 ms, so the distributed lock correctly rejected that overlapping
invocation and no 18:00 scheduler row was created. This proved that the prior
two-discovery plus eight-ingestion budget did not reliably fit the real
provider and D1 overhead. Periodically losing an entire invocation reduced
effective throughput despite the larger per-run count.

Commit `39e1f1c855f27d498a7ccb638ae355ad2dbd9f31` reduces the base ingestion
budget from eight to seven while retaining two discovery pages and the shared
20-second Lex host pacer. Empty discovery capacity is still reused, but the
maximum source-fetch budget is now nine rather than ten. The focused Worker
boundary suite passed 9/9; lint, type-check and the full 186/186 platform suite
passed; the staging Worker dry-run passed at 3,651.05 KiB uncompressed /
804.14 KiB gzip.

Staging Worker version `5c3ebb0b-cc3b-42b0-b82c-ef395ce2d455` deployed the
exact code. Its first full exact-version run started at
2026-08-16 18:10:28.362 UTC and finished at 18:15:14.191 UTC, a measured
285,829 ms. The next scheduled invocation started at 18:15:28.187 UTC, proving
that the tick was retained. Sequential post-run probes returned zero unresolved
failures and zero stale running jobs. The change does not relax the host crawl
delay, add concurrency or touch production state.

## Locale-prefixed Lex archive remediation

The staging run that started at 2026-08-16 18:50:28.191 UTC exposed two
first-attempt `uz-Latn` dead letters for canonical Lex pages `6783170` and
`6783216`. Both used `LEGAL_CORPUS_CONTENT_INSUFFICIENT_V2`: the short HTML
correctly stated that the document text was provided as a PDF, but the archive
parser accepted only a root `/files/<id>.zip` link. A paced read-only browser
inspection of the two official pages showed that Lex rendered the same
allowlisted representation shape below its language prefix instead:
`/uz/files/6783200.zip` and `/uz/files/6783246.zip`. The pages contained no
alternative legal text representation. The inspection waited 20 seconds
between the two official-page navigations and transmitted no JURO or user data.

Commit `4d65de7252dd23a466b9a20cf6f35192a217e00c` accepts only the known Lex
locale prefixes `ru`, `uz`, `uzc` and `en`, preserves the numeric ZIP-only and
same-origin constraints, and canonicalizes every accepted link back to the
immutable root `/files/<id>.zip` before the existing robots, pacing, size,
content-type, ZIP-magic, archive-layout and PDF checks run. Unknown locale
paths, query strings, fragments, third-party hosts and multiple different
archives remain fail-closed. The same commit grants non-maxed
`LEGAL_CORPUS_CONTENT_INSUFFICIENT_V2` jobs one bounded parser-upgrade redrive;
the redrive remains limited by the existing `max_attempts` ledger.

The focused discovery and ingestion regression suite passed 24/24, including
locale canonicalization, unknown-locale rejection and the complete automatic
dead-letter recovery path. Platform lint and type-check passed, the complete
platform suite passed 186/186 with its bounded build, and artifact validation
passed. The isolated legal-corpus Worker dry-run measured 3,651.41 KiB
uncompressed / 804.30 KiB gzip. Staging Worker version
`85af1d7c-224a-448d-95c8-95447b5e4e3a` was created at
2026-08-16 19:05:51.322 UTC from that exact commit; no production Worker,
flag, database or DNS state changed.

The first exact-version scheduled run started at 2026-08-16 19:10:28.306 UTC.
It recovered both exact jobs from attempt 1 to attempt 2/5. The localized ZIPs
were now found and fetched, proving the parser defect was removed. Both PDFs
still lacked safely extractable legal text, so the jobs completed with the
more specific safe result `LEGAL_CORPUS_ATTACHMENT_TEXT_UNAVAILABLE` at
19:11:38.882 UTC and 19:12:25.041 UTC. Each new attempt is recorded as
`technically_unavailable`; the earlier parser failure remains immutable but is
marked retrying for audit history. A sequential read-only probe then returned
zero unresolved failures. No watermark, empty text or navigation content was
indexed merely to close the gate.

Those two additional robots-paced archive fetches also exposed a scheduling
boundary that was not visible in the normal one-request-per-job path. The
`19:10Z` run finished at 19:15:44.686 UTC after 316,379 ms, so the `19:15Z`
cron tick was not retained. Commit
`f1508e607e190a75ff7dfb44b83be8d7d681ce7f` adds an authoritative 195,000 ms
start cutoff to the existing nominal seven-job batch. A job already claimed
is allowed to finish, but the Worker will not claim another ingestion job once
the elapsed cutoff is reached. This preserves the shared 20-second Lex host
pacer and avoids adding concurrency or aborting an in-flight official-source
request.

The focused scheduled-boundary suite passed 10/10, including the exact
194,999/195,000 ms boundary and invalid scheduled-time fail-closed cases.
Platform lint and type-check passed, the complete platform suite passed
186/186 with its bounded build, and the isolated Worker dry-run measured
3,652.00 KiB uncompressed / 804.43 KiB gzip. Staging Worker version
`6f562a21-8a95-43d6-a81e-943168835612` was created at
2026-08-16 19:23:40.438 UTC from the exact commit. No production Worker,
feature flag, database or DNS state changed.

The first exact-version run started at 19:25:28.341 UTC and completed
successfully at 19:29:00.390 UTC in 212,048 ms. The next run then started on
its scheduled `19:30:28Z` tick at 19:30:28.194 UTC, proving that the scheduler
slot was retained on the real staging Worker. Sequential read-only probes
returned zero terminal ingestion jobs, zero stale running jobs and zero
unresolved failure records. The same sample contained 1,012 ready canonical
documents, 2,304 current language variants, 13,119 unique current provisions,
46,122 indexed current chunks and 894 historical versions. Eleven of 44
category/language checkpoints met the strict release formula; 13 discovery
rows were completed and `government/ru` was still running at page 456 with
9,120 documents discovered. The canonical-document, unique-provision and
44/44 gates therefore remain open; freeze, dense backfill, snapshot and the
indexed 314-scenario evaluation are not claimed.

## D1 sparse-storage capacity remediation

A read-only `wrangler d1 info` probe at 2026-08-16 20:12 UTC reported a
2,539,376,640-byte staging database. Cloudflare documents a 10 GB maximum per
paid D1 database, so continuing to store every sparse vector twice was a
material capacity risk before the bounded Lex catalogue could finish. At that
sample the normalized `legal_corpus_sparse_terms` table contained 4,292,982
rows. The same weights were also duplicated as JSON in every legacy chunk.
The pre-deployment read at 20:39 UTC found 82,630 such chunks containing
332,933,044 JSON bytes and zero chunks lacking a normalized sparse row.

Commit `a7ca6a9a79a454ac8d1c51e9479756297de8c352` makes the normalized sparse
table authoritative. New official and owner-material chunks store `[]` in the
legacy JSON column while retaining the complete exportable term, title and
article frequencies in `legal_corpus_sparse_terms`. BM25 document length is
computed from those normalized rows, and the bounded Qdrant backfill loads the
same rows rather than parsing chunk JSON. The change does not remove legal
text, immutable versions, source metadata, exact quotes, R2 objects or sparse
weights.

Legacy cleanup is fail-closed and bounded to 256 chunks per scheduler run. A
chunk is eligible only when its JSON is valid and its entry count, term and all
three frequencies exactly match the normalized rows; absent, partial or
mismatched data remains untouched. SQLite can retain released pages in its
freelist, so the database file is not claimed to shrink immediately. The
capacity benefit is that later corpus writes can reuse pages instead of
continuing to grow the duplicate representation.

The focused retrieval/Qdrant/storage suite passed 10/10, including partial and
mismatched normalized-row rejection. The new storage regression passed in
isolation, platform lint and type-check passed, the complete platform suite
passed 186/186 with its bounded build, platform artifact validation passed,
and the isolated legal-corpus dry-run measured 3,655.64 KiB uncompressed /
805.20 KiB gzip.

The application was deployed first so no request could depend on JSON while
cleanup was active. Staging platform version
`e2e4be14-ee0b-4c6e-b4b1-74729103000f` and staging legal-corpus Worker version
`21525a48-9c94-4833-84c4-ce8383dcc259` contain the exact commit. The first
exact-version corpus run started at 20:45:28.345 UTC and completed without an
error at 20:49:01.035 UTC in 212,690 ms. It created 51 chunks; all 51 stored
compact JSON and all 51 had normalized sparse rows. The immediately preceding
old-version run had created 16 legacy JSON chunks. The post-run legacy count
was 82,390 and 332,339,900 bytes, proving exactly 256 cleaned chunks from the
bounded equation `82,630 + 16 - 82,390 = 256`; the missing-normalized count
remained zero. The next scheduled invocation started on its retained
20:50:28.189 UTC tick and completed without an error at 20:54:04.293 UTC in
216,103 ms. That second run created 127 chunks; all 127 used compact JSON and
all 127 had normalized sparse rows. It cleaned another exact 256 legacy rows,
reducing the count from 82,390 to 82,134 and the JSON payload from 332,339,900
to 331,318,967 bytes. Sequential post-run probes returned zero terminal jobs,
zero stale running jobs, zero unresolved failures and 68 completed,
technically-unavailable source outcomes retained for coverage accounting.

Repository-wide query inspection found that the original secondary
`legal_corpus_sparse_version_idx` on `(version_id, language, document_id)` had
no runtime consumer. Sparse lookup uses the `(term, chunk_id)` primary key and
bounded Qdrant export, replacement and cleanup use
`legal_corpus_sparse_chunk_idx`. Retaining the third index across more than
4.29 million sparse rows therefore added capacity and write amplification
without serving a query path.

Commit `144cf8db05853603beaddbbb9b89c45773b00941` adds migration
`0135_drop_unused_legal_corpus_sparse_version_index.sql` and a schema
regression that requires the primary key and chunk index while rejecting the
unused version index. Migration/storage tests passed 61/61, platform lint and
type-check passed, the full platform suite passed 186/186 and artifact
validation passed. The staging scheduler completed its preceding run at
21:18:48.122 UTC before the schema write began. Wrangler applied the single
pending migration transactionally in 9,240.52 ms and reported no remaining
migrations. A post-migration index probe returned only the required chunk
index and SQLite primary-key index.

The measured D1 size fell from 2,561,003,520 to 2,183,397,376 bytes, releasing
377,606,144 bytes (about 14.7 percent) without removing a corpus row or search
key. The next bounded scheduler invocation started normally at
21:20:30.457 UTC and completed without an error at 21:23:50.091 UTC in
199,634 ms. Its post-run D1 size was 2,181,365,760 bytes. Sequential probes
returned zero terminal jobs, zero stale running jobs, zero unresolved
failures and zero chunks missing normalized sparse data. Legacy JSON cleanup
also continued normally, leaving 80,598 bounded legacy chunks and 322,360,728
duplicate JSON bytes for subsequent runs. This is a staging-only capacity
remediation; production migrations and state were not changed.

The Cloudflare maximum used for this capacity gate is documented at
<https://developers.cloudflare.com/d1/platform/limits/>. No production Worker,
database, feature flag, DNS record or corpus state changed. This remediation
does not close the corpus thresholds or authorize freeze, evaluation or
rollout.

## Staging-only four-minute cadence evidence

After more than eight hours of post-cutoff staging runs remained between
approximately 195 and 202 seconds, commit
`5e6477b602f678b7f55663c3c89ba04b2e19bdb9` separated the staging process
schedule from the production-safe default. Development and production retain
`*/5 * * * *`; only the isolated staging legal-corpus Worker uses
`*/4 * * * *`. The 195,000 ms ingestion-start fence, seven-minute distributed
lock, seven-job ingestion budget and shared 20-second Lex host pacer are
unchanged. The production corpus flags remain false, so this source change
does not start or accelerate production ingestion.

The focused Worker boundary suite passed 11/11, including a regression that
rejects the staging cron in the production environment before D1 access.
Platform lint and type-check passed, the complete platform suite passed
186/186, platform artifact validation passed, and the isolated Worker dry-run
measured 3,655.89 KiB uncompressed / 805.25 KiB gzip. Exact-head CI passed the
platform job in 6m05s, the website job in 46s and the Qdrant snapshot-restore
gate in 37s.

Staging legal-corpus Worker version
`f6d8a07f-1b06-4d79-b607-acd7d4398e68` deployed the exact commit and reported
only the `*/4 * * * *` process trigger plus the unchanged daily seed trigger.
After normal Cloudflare trigger propagation, four consecutive exact-version
runs completed as follows:

- 05:20:28.580–05:23:47.831 UTC: 199,251 ms;
- 05:24:28.470–05:27:46.614 UTC: 198,144 ms;
- 05:28:28.590–05:31:46.351 UTC: 197,761 ms;
- 05:32:28.468–05:35:47.041 UTC: 198,573 ms.

The fifth invocation started on the retained 05:36:28.589 UTC tick. Each
completed run therefore released the lock 40–42 seconds before the next
invocation, and no overlap or missed-tick rollback condition occurred. One
independent read-only observation request returned a transient Cloudflare API
7403 response; `wrangler whoami` and the immediate repeated query succeeded,
and the durable scheduler rows show that ingestion itself was unaffected.
The sequential post-run sample contained 1,092 canonical documents, 2,905
language variants, 13,207 unique current provisions and 47,967 indexed current
chunks. Fourteen discovery checkpoints were completed, one was actively
running and the other 29 remained durably queued. The same sample returned
zero terminal ingestion jobs, zero stale running jobs, zero unresolved
failures and zero chunks missing normalized sparse data; bounded cleanup left
55,510 legacy sparse JSON rows for later invocations. This cadence evidence
improves bounded staging throughput only. The 1,283 canonical-document,
20,296 unique-provision and 44/44 checkpoint gates remain open, so it does not
authorize freeze/evaluation or change any production Worker, database,
feature flag, route or DNS state.

## Staging discovery-coverage rebalance (2026-08-17)

Commit `f60fced` reallocates the existing per-run bounded request budget from
two discovery pages plus seven ingestion jobs to three discovery pages plus six
ingestion jobs. The nominal maximum remains nine paced source requests. The
shared 20-second Lex.uz host pacer, 195,000 ms ingestion-start fence,
seven-minute distributed lock and staging-only `*/4 * * * *` schedule are
unchanged. This changes neither production code nor any production feature
flag, route, DNS record or data source.

The focused catalogue/discovery and Worker boundary suites passed 18/18 after
the change. The isolated Worker dry-run passed at 3,655.89 KiB uncompressed /
805.25 KiB gzip. Deployment of the exact staging-only Worker completed as
version `61da29e5-a379-4049-a7c7-8840c9aa9aa5`, with only the `*/4 * * * *`
process trigger and the unchanged daily seed trigger. The immediately preceding
staging run completed normally at 06:12:28.594–06:15:46.749 UTC. This evidence
does not constitute a corpus freeze or release approval: the count, 44/44
coverage, dense/Qdrant, backup/restore, indexed evaluation and authenticated
preview gates remain open.

The owner raised JURO's effective release floor on 2026-08-17 from the audited
Huquq AI reference of 1,283 canonical documents and 20,296 unique provisions
to 1,500 canonical documents and 22,000 unique provisions. The historical
figures above remain evidence of the earlier policy; all future release-gate
evidence is evaluated against the higher JURO reserve.

## Staging catalog fairness observation (2026-08-17)

Commit `f674f6868ac3d4855ae10cf56394f06895dce958` changes only the durable
catalogue-checkpoint selection order. A due retry remains first; ordinary work
then selects the lowest persisted page number before category/language
tie-breakers. The existing three-discovery-page plus six-ingestion-job budget,
20-second shared Lex.uz host pacer, 195,000 ms start fence and seven-minute
distributed lock are unchanged.

The focused catalogue and Worker-boundary suite passed 19/19, TypeScript
type-check passed, and the staging artifact dry-run was 3,656.34 KiB
uncompressed / 805.49 KiB gzip. The exact staging-only Worker deployed as
version `aae699bc-eefb-4ae4-b30e-a064efa9ab69`; it has only the retained
`*/4 * * * *` processing and `5 19 * * *` seed triggers. Its first observed
run completed at 06:56:14.222–06:59:31.884 UTC in 197.7 seconds without an
error code. It advanced `government/uz-Latn` and `international/en` from page
zero while retaining the partially discovered `government/uz-Cyrl` checkpoint
at page 173, demonstrating interleaving rather than starvation. The probe
returned zero terminal and zero stale ingestion jobs.

The immediately preceding 06:48 UTC run recorded one
`LEGAL_SOURCE_TIMEOUT`. Its bounded retry completed on attempt two; there were
no due retries or terminal jobs in the subsequent read-only probe. This is an
operational observation, not a statement that all sources are available.

This change is staging-only and does not freeze the corpus, enable dense
retrieval, approve an evaluation, alter production code/configuration/DNS, or
authorize rollout.

## Staging primary-legislation queue share (2026-08-17)

Commits `bf709d7a4b2780fe157aca2a5e1b2cb7a8de56c3` and
`7c42763b2e90d7ebac087dee4753e42c4589bea1` add a bounded selection share for
already catalogued `laws`, `oliy_majlis` and `president` sources. Due retries
remain globally first; only the first two of the existing six ingestion slots
can prefer those source families, while the remaining four preserve FIFO.
This is queue ordering only: it does not add source requests, change the
20-second host pacer, alter corpus content, or bypass retries and technical
validation.

Staging migration
`0136_legal_corpus_preferred_ingestion_lookup.sql` added only the
`legal_corpus_ingestion_document_language_ready_idx` lookup index. Wrangler
reported the index migration complete in 39.75 ms and a follow-up migration
ledger check reported no pending migrations. `EXPLAIN QUERY PLAN` confirmed
the bounded checkpoint category index → discovery primary key → new job-index
path; it did not scan the full ingestion backlog.

The final code passed 31 focused ingestion/Worker tests, TypeScript type-check
and the staging artifact dry-run (3,658.36 KiB uncompressed / 806.03 KiB gzip).
The complete GitHub CI run
[32005070514](https://github.com/MoozUpus/juro/actions/runs/32005070514) and
its Qdrant snapshot gate passed for the exact final code commit.

The staging Worker deployed as `abdabee2-6057-4f2a-8205-ec6f0e36c817`. Its
observed 07:20:15.084–07:23:34.059 UTC process run completed without an error
code. The first two completed preferred jobs were official `laws/en` sources
with canonical IDs `lexuz:8276716` and `lexuz:8315385`, recorded at
07:21:33.136 and 07:21:57.375 UTC. The subsequent read-only probe returned
zero terminal and zero due-retry jobs. This proves the bounded share operates
against actual staging queue records; it is not a claim that the release
corpus thresholds or complete coverage have been reached.

All manual read-only probes now compare queue timestamps using ISO-8601 UTC
format (`strftime('%Y-%m-%dT%H:%M:%fZ','now')`) to match the stored D1
timestamps. This corrects a diagnostic-only SQLite text-comparison mismatch;
the Worker already uses JavaScript ISO timestamps for job selection.

## Staging primary-language rotation (2026-08-17)

Commit `9b12b67` keeps the two-slot primary-legislation share and its global
retry precedence, but gives each preferred slot a deterministic target language
rotating through Uzbek Cyrillic, Russian, Uzbek Latin and English. A preferred
slot first performs the bounded checkpoint → discovery-record →
`legal_corpus_ingestion_document_language_ready_idx` lookup for that language.
If no ready job exists in that language, it falls back only to another official
language in the same `laws`, `oliy_majlis` or `president` share; ordinary FIFO
work remains after that fallback. The three discovery pages, six ingestion jobs,
single Worker lease and robots-aware host pacer are unchanged.

The focused catalog/discovery, ingestion and Worker-boundary suite passed
41/41, including both the language-target and same-category fallback
regressions. TypeScript type-check passed, and the isolated staging artifact
dry-run was 3,659.51 KiB uncompressed / 806.39 KiB gzip. The exact Worker
deployed only to staging as `24165585-1d4a-4837-ae30-983e1f428cc2`.

Its 07:32:14.026–07:35:31.520 UTC process run completed without an error code.
Read-only queue records show two completed preferred `laws/en` jobs,
`lexuz:8245378` and `lexuz:8283229`, during that run. The first selected its
scheduled English target; the second used the documented same-category fallback
because no ready primary-catalogue job existed for its next target locale.
At the subsequent probe there were no running, retrying, failed or dead-letter
ingestion jobs (4,218 completed and 21,493 queued). This verifies scheduling
behavior only; the 1,500-document, 22,000-provision, coverage, snapshot,
evaluation and release gates remain open.

The exact Draft PR head `bf8bd900daedb283e476cc009ab9527449ac6501` passed
GitHub Actions platform and website validation in
[run 32006702505](https://github.com/MoozUpus/juro/actions/runs/32006702505),
and the independent D1 snapshot-restore check in
[run 32006702507](https://github.com/MoozUpus/juro/actions/runs/32006702507).
Those checks validate this bounded scheduling change; they do not substitute
for the post-threshold snapshot, indexed evaluation, Qdrant and authenticated
preview gates.

## Staging provision-rich bootstrap refinement (2026-08-17)

The preceding sections are historical evidence for the original two-slot
implementation. Commits `9576ffd`, `84ff883` and `dd56741` supersede its
selection policy for the still-incomplete staging build. Four of the six
existing ingestion slots now prefer the provision-rich official catalogue
order `court_acts`, `laws`, `court_practice`, `oliy_majlis`, `president`; two
nominal slots remain FIFO, and a due retry remains globally first. The
three-discovery-page budget, six-job cap, 20-second shared Lex.uz host pacer,
195,000 ms start fence and distributed lock are unchanged.

The preferred query first selects a source URL without an existing official
language alias, then applies the catalogue order. This prevents a fetched
language variant from consuming another bootstrap slot merely because the
same canonical family appears in a different official locale. FIFO retains
the already-linked language variants and historical source URLs, so the change
does not discard multilingual or version history work.

Focused ingestion and Worker-boundary regressions passed 39/39, including the
unlinked-family and configured-catalogue-order cases. Type-check, lint and the
isolated staging artifact dry-run passed. The exact Draft PR head `dd56741`
passed platform and website validation in
[run 32019340172](https://github.com/MoozUpus/juro/actions/runs/32019340172),
and its independent snapshot-restore check passed in
[run 32019340247](https://github.com/MoozUpus/juro/actions/runs/32019340247).

The isolated staging Worker deployed as `9fc27a94-06b9-4b08-b422-43058ef46acd`.
Its observed 10:16:14.214–10:19:39.448 UTC run completed four preferred
`laws` jobs (Uzbek Cyrillic, Russian, Uzbek Latin and English) before a FIFO
government job, with no error code. A subsequent read-only D1 probe after the
10:28–10:31 UTC completed run reported 1,372 canonical documents, 14,241
unique provisions, 51,116 indexed chunks, 18 of 44 completed checkpoints and
zero retrying, failed or dead-letter ingestion jobs. This is staging progress,
not a claim that the 1,500-document, 22,000-provision, full-checkpoint,
snapshot, Qdrant, indexed-evaluation or preview gates are complete.

## Staging bounded-throughput calibration (2026-08-17)

Commit `1dba5f7af786275cd9948ed50fb1ca42e78367af` changes the staging
ingestion budget from six to seven jobs while retaining three catalogue
discovery pages. It does not create a parallel crawler: every Lex.uz request
still atomically claims the D1-backed host window, whose observed robots
`crawl_delay_ms` is 20,000. The 195,000 ms start fence remains authoritative;
when a slow representation fetch consumes the available window, the seventh
job is left queued rather than risking an overlapping worker.

Before the adjustment, 39 completed staging runs from 08:00 UTC had a
195,927 ms minimum, 202,464 ms average and 214,470 ms maximum duration; none
reached 235,000 ms. The focused ingestion/Worker suite passed 39/39 after the
change, along with TypeScript type-check, lint and the isolated staging
artifact dry-run. The Worker deployed only to staging as
`e5c7ef7b-e039-439a-9a36-aaee5c4a3243`.

The first post-deploy run, 11:04:14.230–11:07:35.366 UTC, completed in
201,136 ms with no error code, and the next scheduled run started normally.
A subsequent read-only probe reported 1,417 canonical documents, 14,861
unique provisions, 19 of 44 completed checkpoints and zero retrying, failed
or dead-letter ingestion jobs. This validates the bounded throughput change;
it does not claim the numeric corpus thresholds, full checkpoint coverage,
snapshot/restore, Qdrant, indexed-evaluation, preview or production gates are
complete.

## Staging target-acquisition reallocation (2026-08-17)

A read-only D1 sample for the scheduled interval `2026-08-17T11:32:14Z` to
`11:36:14Z` recorded five completed `fetch` jobs after three catalogue
discovery pages. This means the earlier nominal seven-job budget did not by
itself prove seven completed document ingestions within the four-minute staging
window: the shared 20-second Lex.uz pacing budget was first consumed by the
three discovery requests.

The follow-up staging-only implementation preserves sequential discovery, but
allocates one catalogue page and up to seven document jobs per run. It permits
at most eight primary Lex.uz requests for a normal run, or nine only when the
single discovery page is already proved empty and its request slot is reused.
The same D1-backed 20-second host pacer, 195,000 ms ingestion-start fence,
seven-minute distributed lock and staging-only `*/4 * * * *` cron remain in
force. It does not add parallel crawling, change a production binding or start
production corpus ingestion.

The boundary and ingestion suite (39 tests), TypeScript type check, lint and
staging artifact validation passed before deployment. The measurable increase
in completed documents remains an observation gate for the next completed
staging runs; this change is not evidence that the 1,500-document,
22,000-provision, 44/44 checkpoint, snapshot, Qdrant, evaluation, preview or
production gates are complete.

## Staging current-provision priority correction (2026-08-17)

The first completed run of the one-discovery configuration, scheduled at
`2026-08-17T11:48:14Z`, finished at `11:51:39Z` without an error or missed
cron. Its seven completed jobs were four `fetch` jobs and three historical
`version` jobs. A read-only queue probe at that point showed 22,976 queued
`fetch` jobs and 1,826 queued `version` jobs. Thus, preserving three FIFO
slots did not increase completed current-document fetches over the old
configuration.

The next staging-only adjustment reserves six of the existing seven sequential
ingestion slots for the established high-provision catalogue preference and one
explicitly selects the oldest queued historical `version` job, falling back to
FIFO only when no version is due; due retries remain global first. It does not
remove version handling, add a request source, increase concurrency, alter the
20-second host limit, or change production. Its benefit is explicitly pending
a completed staging run with the new Worker version and cannot be used as
evidence that any corpus or release gate is satisfied.

## Staging historical-slot ordering correction (2026-08-17)

The first run with an explicit version reservation, scheduled at
`2026-08-17T12:04:15Z`, completed without an error at `12:07:38Z` and
processed six current-document `fetch` jobs. It reached the 195,000 ms start
fence before the final, seventh reservation slot, so no `version` job was
claimed. The reservation mechanism was correct, but its final-slot ordering
did not satisfy the intended bounded history-progress guarantee when an
official source required additional representations.

The follow-up staging-only correction places the reserved `version` claim
after four preferred fetch claims and before the final two preferred claims.
If a version job is not due, that one slot still falls back safely to ordinary
FIFO work. The normal bounded budget remains six preferred fetch slots and one
historical slot; an empty catalogue page can still yield only one extra FIFO
slot. The 20-second host pacer, 195,000 ms fence, source allowlist, distributed
lock, feature flags and production-disabled state are unchanged. A terminal
staging run must confirm this ordering before it is treated as operational
evidence.

That confirmation completed on staging run `2026-08-17T12:12:15Z` to
`12:15:46Z`: five current `fetch` jobs and one historical `version` job
completed with no error code, while the final preferred fetch remained queued
at the 195,000 ms start fence. The next four-minute cron remained available.
The subsequent read-only corpus probe reported 1,504 canonical documents,
15,854 unique current provisions, 54,042 indexed chunks, zero retrying,
failed or dead-letter jobs and 19 of 44 completed checkpoints. It therefore
proves the bounded ordering behavior and meets the requested document count,
but does not meet the 22,000-provision or 44/44 coverage gates and authorizes
none of the freeze, dense, snapshot, evaluation, preview or production work.

## Staging ten-window throughput calibration (2026-08-18)

Commit `0c4eb5d` uses one additional **sequential** ingestion slot while
catalogue discovery remains at four pages per staging run. The maximum is now
ten paced Lex.uz request windows per four-minute invocation: either a network
`robots.txt` request, four catalogue pages and five ingestion jobs, or a fresh
persisted public robots policy, four catalogue pages and six ingestion jobs.
The D1-backed host pacer remains the only authority for each request window;
the observed Lex `Crawl-delay` is still 20 seconds. This does not introduce
parallel crawling, a second source, a bypass of robots policy, or a production
flag change.

The 195,000 ms ingestion-start fence and seven-minute distributed lock remain
in force. A post-deploy staging run from `2026-08-18T08:52:28.205Z` to
`2026-08-18T08:55:55.861Z` completed without an error and the next cron began
at `2026-08-18T08:56:27.984Z`, leaving a 32-second gap rather than overlapping
workers. Subsequent read-only D1 probes recorded completed ingestion jobs
advancing from 6,025 to 6,036 with zero active checkpoint, terminal or
dead-letter failures. Temporary upstream timeouts remain in the immutable run
ledger only when they were recovered by the bounded retry path; they are not
recorded as completed coverage or hidden as success.

Before deployment, the focused corpus suite passed 39/39, along with
TypeScript type-check, lint and the staging artifact dry-run. The complete
Draft PR #43 CI then passed, including Cloudflare environment matrix,
dependency audit, licence policy and Qdrant snapshot-restore. The staging-only
Worker version is `5bb31f51-8bac-4c3c-b6a2-18cc365545b0`. This calibration is
operational evidence only: it does **not** establish 44/44 coverage, an empty
ingestion queue, a frozen corpus, Qdrant backfill/snapshot, indexed evaluation,
preview or a production rollout.

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

## Lex response-body deadline correction (2026-08-18)

The staging run that began at `2026-08-18T09:20:27.986Z` was recorded as
`failed` at `09:28:28.005Z` with
`LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED`. The following scheduled invocation
claimed the lock normally, so no second crawler overlapped it. The durable
run record is retained as an incident; it is not presented as a successful
coverage result.

Commit `a4ca3fd` identifies an unbounded response-body read in two catalogue
paths: the optional cloned `robots.txt` body used only for persistence, and
the public Lex catalogue body. It adds bounded stream reads, cancels the
non-authoritative cache clone on deadline, and maps a catalogue-body expiry to
the existing retryable `LEX_CATALOG_TIMEOUT` state. This leaves the original
response, source allowlist, 20-second D1-backed host pacing, sequential
crawl, retry queue, distributed lock and all production flags unchanged.

The focused boundary suite passed 34/34 before the correction was committed;
after the strict nullable fix, the direct catalogue/pacer suite passed 21/21.
Type-check, lint and the staging Worker dry-run passed. The staging-only
Worker was then deployed as `64d7c43c-4fd6-4a5b-8e12-eba3250b75ba`. It is not
production evidence. Its first real post-deploy invocation ran from
`2026-08-18T09:40:28.191Z` to `09:43:50.242Z` (202.051 seconds), completed
without an error code, and released the lock before the next cron started at
`09:44:27.983Z`. The subsequent run was therefore distinct rather than
overlapping; no new `LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED` record appeared.
This closes the bounded-body-read incident only. It does not establish 44/44
coverage, a frozen corpus, dense retrieval, a Qdrant snapshot, the indexed
314-scenario evaluation, preview approval or production rollout.

## Scheduler lease correction (2026-08-20)

The staging run started at `2026-08-20T09:28:43.199Z` and finished at
`09:36:43.201Z` with `LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED`. Its duration was
eight minutes, while the Worker lease was seven minutes. The run had no
terminal ingestion job or failure; the scheduler lease alone expired while
bounded D1/index maintenance was still completing. This was retained as a
failed run and is not counted as successful coverage.

Commit `e68c0c5` changes the dedicated Worker lease to fifteen minutes and
keeps stale-run cleanup tied to that same durable lock. The start fence,
single sequential crawler, 20-second Lex.uz host pacer, queue boundaries and
all production-disabled flags are unchanged. The boundary suite passed 18/18,
platform type-check and lint passed, and the staging Worker dry-run passed.
The staging-only Worker was deployed as version
`f5a8164f-08b9-431b-91ad-7305405f4e87`.

The first post-deploy run started at `2026-08-20T09:44:43.383Z` and completed
at `09:50:03.710Z` with `status=completed` and `error_code=NULL`. No new lease
failure appeared. The following read-only D1 probe recorded 3,575 canonical
documents, 62,075 unique current provisions, 151,499 indexed current chunks,
44/44 completed discovery checkpoints with zero checkpoint errors, zero
terminal jobs/failures/dead letters, 38,310 queued fetch jobs, 6,280 queued
version jobs, and 7,131 live/manual queued jobs. The release gate therefore
remains open: the corpus is not yet frozen and the indexed evaluation, Qdrant
benchmark/restore, D1 backup/restore and rollout gates have not run.

## Staging ingestion window correction (2026-08-20)

The staging-only Worker was updated in commit `9fc6e15` and deployed as
version `e2356805-f9ed-404a-9d1b-5d7c93c37f82`. Production keeps the 195-second
ingestion start fence. Staging uses a bounded twelve-minute start fence under
the fifteen-minute scheduler lease, leaving time for final D1 reconciliation
and lock release. The single sequential Lex.uz stream, robots policy and
20-second host pacer are unchanged; no parallel crawl or production flag was
introduced.

The first invocation that started after this deployment began at
`2026-08-20T10:20:53.294Z` and completed at `2026-08-20T10:33:33.290Z` with
`status=completed` and `error_code=NULL` (12 minutes 39.996 seconds). It
completed eight queued version jobs and released the scheduler lease without
another `LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED` record. This is the first
post-deploy proof that the longer bounded staging window is effective; it is
not a claim that the corpus is frozen or release-ready.

The same read-only D1 probe recorded 3,575 canonical documents, 62,075 unique
current provisions and 151,499 indexed current chunks; all 44 discovery
checkpoints were completed with zero checkpoint errors; terminal jobs,
terminal failures and dead letters remained zero. Queued jobs remained
38,310 fetch and 6,258 version, with 7,110 live/manual queued jobs. The
release gate therefore remains open: ingestion is still active, and snapshot,
indexed 314-scenario evaluation, Qdrant benchmark/restore, D1 backup/restore,
preview and rollout gates have not run.

The next post-correction staging invocation started at
`2026-08-20T10:36:53.112Z` and completed at `2026-08-20T10:48:09.179Z` with
`status=completed` and `error_code=NULL` (11 minutes 15.067 seconds). It
completed nine queued version jobs and again released the fifteen-minute
lease without a scheduler-expiry record or terminal ingestion failure. The
following read-only probe showed 38,310 queued fetch jobs, 6,249 queued
version jobs and 7,101 live/manual queued jobs; terminal jobs, terminal
failures and dead letters remained zero. This confirms the bounded staging
run remains healthy while the queue drains; it does not close the freeze gate.

The following staging run started at `2026-08-20T10:56:53.114Z` and completed
at `2026-08-20T11:03:27.327Z` with `status=completed` and
`error_code=NULL` (6 minutes 34.213 seconds), completing nine version jobs.
The queue probe immediately afterwards recorded 38,310 fetch jobs, 6,231
version jobs and 7,083 live/manual jobs; terminal jobs, terminal failures and
dead letters remained zero. This confirms the scheduler continues to release
its lock cleanly across consecutive runs. The queue is still active, so no
snapshot or post-ingestion gate is claimed.

The next scheduled invocation started at `2026-08-20T11:12:53.111Z` and
completed at `2026-08-20T11:19:29.631Z` with `status=completed` and
`error_code=NULL`. The recovered revision retry did not recur as a run-level
error. The read-only probe recorded 38,310 queued fetch jobs, 6,214 queued
version jobs and 7,066 live/manual queued jobs, with zero terminal jobs,
terminal failures, dead letters, unresolved retrying jobs and unresolved
terminal jobs. Ingestion remains active and the freeze gate is still open.

## Recovered transient revision retry (2026-08-20)

The staging invocation started at `2026-08-20T11:04:53.112Z` completed at
`2026-08-20T11:11:11.141Z` with the run-level code
`LEGAL_CORPUS_INGESTION_FAILED`. Read-only inspection found one retryable
revision fetch for `lexuz:111189` at
`https://lex.uz/uz/docs/-111189?ONDATE=21.04.2022` at
`2026-08-20T11:09:19.592Z`. The job had `retry_count=1`, `retry_state=retrying`
and no HTTP status; it subsequently succeeded at
`2026-08-20T11:10:27.243Z` with `attempt_count=2`, `status=completed` and no
`last_error_code`. The immutable failure row remains marked `retrying` as
historical evidence, while the job-aware unresolved probe is
`unresolved_retrying=0` and `unresolved_terminal=0`.

This is a recovered transient, not a terminal ingestion failure. No code
change or retry-policy change was made. The final queue probe still showed
zero terminal jobs, terminal failures and dead letters; the ingestion queue
remains active and the freeze gate stays open.

## Post-retry staging recovery (2026-08-20)

The next scheduled staging invocation started at `2026-08-20T11:20:53.111Z`
and completed at `2026-08-20T11:27:30.337Z` with `status=completed` and
`error_code=NULL`. The retryable revision incident did not recur. The
read-only D1 probe recorded 44/44 completed discovery checkpoints, 38,310
queued fetch jobs, 6,205 queued version jobs and 7,057 live/manual queued
jobs; terminal jobs, terminal failures, dead letters, unresolved retrying
jobs and unresolved terminal jobs remained zero. Corpus totals remained
3,575 canonical documents, 62,075 unique current provisions and 151,499
indexed current chunks.

The release gate is still intentionally open because the source/revision
queue is not frozen. Snapshot creation, indexed 314-scenario evaluation,
Qdrant benchmark/restore, D1 backup/restore, preview and rollout are not
claimed by this run. Production remains untouched.

## Consecutive healthy staging runs (2026-08-20)

The subsequent scheduled invocation started at `2026-08-20T11:28:53.111Z`
and completed at `2026-08-20T11:35:20.786Z` with `status=completed` and
`error_code=NULL`. The following invocation started at
`2026-08-20T11:36:53.112Z` and completed at `2026-08-20T11:43:22.031Z`,
also with `status=completed` and `error_code=NULL`. The queue probe after
the latter recorded 38,310 queued fetch jobs and 6,187 queued version jobs;
live/manual queued jobs were 7,039. 44/44 discovery checkpoints remained
completed, with zero terminal jobs, terminal failures, dead letters,
unresolved retrying jobs or unresolved terminal jobs. Corpus totals remained
3,575 canonical documents, 62,075 unique current provisions and 151,499
indexed current chunks.

These consecutive clean runs confirm that the staging lease and bounded
sequential ingestion path continue to recover and drain the revision queue.
The queue is still active, so the freeze gate and all post-ingestion gates
remain open. Production remains untouched.

## Scheduler lease expiry and recovered stale job (2026-08-20)

The scheduled invocation that started at `2026-08-20T12:32:53.111Z` exceeded
the fifteen-minute scheduler lease and was reconciled at
`2026-08-20T12:48:45.510Z` as `status=failed` with
`error_code=LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED`. This is scheduler evidence,
not a terminal ingestion result. The next bounded invocation started at
`2026-08-20T12:48:45.510Z` and completed at `2026-08-20T13:00:55.594Z` with
`status=completed` and `error_code=NULL` (730 seconds).

During that recovery, the stale version job
`legal-version:8984a7940432fff1cd5f46b49095` for the official Lex revision
`https://lex.uz/docs/111189?ONDATE=18.01.1999` was requeued with
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`, then completed successfully on attempt
2. The final job-aware probe recorded zero terminal/dead-letter jobs, zero
active jobs with error codes, `unresolved_retrying=0` and
`unresolved_technical=0`; no manual D1 mutation was used and no code change
was justified by this recovered transient.

The post-run queue remained active (`38,310` queued fetch jobs and `6,122`
queued version jobs; `6,975` live/manual queued jobs). Corpus totals remained
`3,575` canonical documents, `62,075` unique current provisions and
`151,499` indexed current chunks, with 44/44 discovery checkpoints completed.
The freeze gate therefore remains open: snapshot, indexed 314-scenario
evaluation, Qdrant benchmark/restore, D1 backup/restore, preview and rollout
are not claimed. Production remains untouched.

## Post-recovery clean staging run (2026-08-20)

The next scheduled invocation started at `2026-08-20T13:04:45.510Z` and
completed at `2026-08-20T13:18:41.306Z` with `status=completed`,
`error_code=NULL` and a duration of 835 seconds. The post-run read-only D1
probe found no running, retrying, failed or dead-letter ingestion jobs;
`terminal_or_dead_letter_jobs=0`, `active_jobs_with_errors=0`,
`unresolved_retrying=0` and `unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs and 6,117 queued version
jobs, with 6,969 live/manual queued jobs. Corpus totals remained 3,575
canonical documents, 62,075 unique current provisions and 151,499 indexed
current chunks; all 44 discovery checkpoints remained completed. The queue is
still active, so the ingestion freeze gate and all downstream snapshot,
evaluation, backup/restore and rollout gates remain open. Production remains
untouched.

## Subsequent clean staging run (2026-08-20)

The subsequent scheduled invocation started at `2026-08-20T13:20:45.513Z`
and completed at `2026-08-20T13:34:53.128Z` with `status=completed`,
`error_code=NULL` and a duration of 847 seconds. Post-run read-only probes
found no running, retrying, failed or dead-letter jobs;
`terminal_or_dead_letter_jobs=0`, `active_jobs_with_errors=0`,
`unresolved_retrying=0` and `unresolved_technical=0`.

The queue contained 38,310 queued fetch jobs and 6,112 queued version jobs;
`live_manual_queued=6,964`. Corpus totals remained 3,575 canonical documents,
62,075 unique current provisions and 151,499 indexed current chunks, with all
44 discovery checkpoints completed. The queue is not frozen, so snapshot,
indexed evaluation, Qdrant/D1 backup and restore, preview and rollout remain
unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-20, 13:36Z)

The next scheduled invocation started at `2026-08-20T13:36:45.509Z` and
completed at `2026-08-20T13:50:42.542Z` with `status=completed`,
`error_code=NULL` and a duration of 837 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 6,107 queued version jobs
and 3,253 completed version jobs; `live_manual_queued=6,959`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 03:52Z)

The next scheduled invocation started at `2026-08-21T03:52:32.993Z` and
completed at `2026-08-21T03:56:41.987Z` with `status=completed`,
`error_code=NULL` and a duration of 248 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,581 queued version jobs
and 3,779 completed version jobs; `live_manual_queued=6,433`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 03:44Z)

The next scheduled invocation started at `2026-08-21T03:44:32.994Z` and
completed at `2026-08-21T03:48:40.358Z` with `status=completed`,
`error_code=NULL` and a duration of 247 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,590 queued version jobs
and 3,770 completed version jobs; `live_manual_queued=6,442`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 03:36Z)

The next scheduled invocation started at `2026-08-21T03:36:32.995Z` and
completed at `2026-08-21T03:40:42.577Z` with `status=completed`,
`error_code=NULL` and a duration of 249 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,599 queued version jobs
and 3,761 completed version jobs; `live_manual_queued=6,451`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 03:28Z)

The next scheduled invocation started at `2026-08-21T03:28:32.995Z` and
completed at `2026-08-21T03:32:47.196Z` with `status=completed`,
`error_code=NULL` and a duration of 254 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,608 queued version jobs
and 3,752 completed version jobs; `live_manual_queued=6,460`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 03:20Z)

The next scheduled invocation started at `2026-08-21T03:20:33.575Z` and
completed at `2026-08-21T03:24:49.593Z` with `status=completed`,
`error_code=NULL` and a duration of 256 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,617 queued version jobs
and 3,743 completed version jobs; `live_manual_queued=6,469`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 03:12Z)

The next scheduled invocation started at `2026-08-21T03:12:32.996Z` and
completed at `2026-08-21T03:16:46.639Z` with `status=completed`,
`error_code=NULL` and a duration of 253 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,626 queued version jobs
and 3,734 completed version jobs; `live_manual_queued=6,478`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 03:04Z)

The next scheduled invocation started at `2026-08-21T03:04:32.994Z` and
completed at `2026-08-21T03:08:47.606Z` with `status=completed`,
`error_code=NULL` and a duration of 254 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,635 queued version jobs
and 3,725 completed version jobs; `live_manual_queued=6,487`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 02:56Z)

The next scheduled invocation started at `2026-08-21T02:56:33.007Z` and
completed at `2026-08-21T03:00:48.171Z` with `status=completed`,
`error_code=NULL` and a duration of 255 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,644 queued version jobs
and 3,716 completed version jobs; `live_manual_queued=6,496`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Overnight clean staging runs and queue progress (2026-08-20/21)

Five consecutive scheduled invocations completed without a scheduler error:
`22:52:45.512Z → 23:05:27.252Z` (761 seconds),
`23:08:45.514Z → 23:21:44.632Z` (779 seconds),
`23:24:45.512Z → 23:37:38.937Z` (773 seconds),
`23:40:45.518Z → 23:50:08.910Z` (563 seconds), and
`23:52:45.517Z → 2026-08-21T00:05:32.504Z` (766 seconds). Every row had
`status=completed` and `error_code=NULL`.

The post-run read-only D1 probe at `2026-08-21T00:07:24Z` recorded 44/44
completed discovery checkpoints, no running jobs and zero failure counters:
`terminal_or_dead_letter_jobs=0`, `active_jobs_with_errors=0`,
`unresolved_retrying=0` and `unresolved_technical=0`. Queue progress was
38,310 queued fetch jobs, 5,822 queued version jobs and 3,538 completed
version jobs; `live_manual_queued=6,674`. Corpus totals remained 3,575
canonical documents, 62,075 unique current provisions and 151,499 indexed
current chunks. The queue is still active, so freeze and all downstream
snapshot, evaluation and backup/restore gates remain unclaimed. Production
remains untouched.

The first probe after the environment rollover briefly returned Cloudflare
API error `7403`; `wrangler whoami` showed the expected account and D1 scope,
and a subsequent remote `SELECT 1` plus the full read-only probes succeeded.
This was a transient probe transport issue, not a corpus ingestion failure,
and no mutation or code change was made.

## Subsequent clean staging run (2026-08-20, 13:52Z)

The next scheduled invocation started at `2026-08-20T13:52:45.509Z` and
completed at `2026-08-20T14:06:52.861Z` with `status=completed`,
`error_code=NULL` and a duration of 847 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 6,102 queued version jobs
and 3,258 completed version jobs; `live_manual_queued=6,954`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 00:08Z)

The next scheduled invocation started at `2026-08-21T00:08:45.509Z` and
completed at `2026-08-21T00:21:35.148Z` with `status=completed`,
`error_code=NULL` and a duration of 769 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,814 queued version jobs
and 3,546 completed version jobs; `live_manual_queued=6,666`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 00:24Z)

The next scheduled invocation started at `2026-08-21T00:24:45.514Z` and
completed at `2026-08-21T00:37:31.661Z` with `status=completed`,
`error_code=NULL` and a duration of 766 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,806 queued version jobs
and 3,554 completed version jobs; `live_manual_queued=6,658`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 00:40Z)

The next scheduled invocation started at `2026-08-21T00:40:33.582Z` and
completed at `2026-08-21T00:45:26.851Z` with `status=completed`,
`error_code=NULL` and a duration of 293 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,797 queued version jobs
and 3,563 completed version jobs; `live_manual_queued=6,649`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 00:48Z)

The next scheduled invocation started at `2026-08-21T00:48:32.994Z` and
completed at `2026-08-21T00:53:24.985Z` with `status=completed`,
`error_code=NULL` and a duration of 291 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,788 queued version jobs
and 3,572 completed version jobs; `live_manual_queued=6,640`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 00:56Z)

The next scheduled invocation started at `2026-08-21T00:56:32.994Z` and
completed at `2026-08-21T01:01:21.485Z` with `status=completed`,
`error_code=NULL` and a duration of 288 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,779 queued version jobs
and 3,581 completed version jobs; `live_manual_queued=6,631`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 01:04Z)

The next scheduled invocation started at `2026-08-21T01:04:32.992Z` and
completed at `2026-08-21T01:09:21.619Z` with `status=completed`,
`error_code=NULL` and a duration of 288 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,770 queued version jobs
and 3,590 completed version jobs; `live_manual_queued=6,622`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 01:12Z)

The next scheduled invocation started at `2026-08-21T01:12:32.994Z` and
completed at `2026-08-21T01:17:18.723Z` with `status=completed`,
`error_code=NULL` and a duration of 285 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,761 queued version jobs
and 3,599 completed version jobs; `live_manual_queued=6,613`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 01:20Z)

The next scheduled invocation started at `2026-08-21T01:20:33.686Z` and
completed at `2026-08-21T01:25:18.317Z` with `status=completed`,
`error_code=NULL` and a duration of 284 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,752 queued version jobs
and 3,608 completed version jobs; `live_manual_queued=6,604`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 01:28Z)

The next scheduled invocation started at `2026-08-21T01:28:32.995Z` and
completed at `2026-08-21T01:33:14.800Z` with `status=completed`,
`error_code=NULL` and a duration of 281 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,743 queued version jobs
and 3,617 completed version jobs; `live_manual_queued=6,595`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 01:36Z)

The next scheduled invocation started at `2026-08-21T01:36:32.994Z` and
completed at `2026-08-21T01:41:11.626Z` with `status=completed`,
`error_code=NULL` and a duration of 278 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,734 queued version jobs
and 3,626 completed version jobs; `live_manual_queued=6,586`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 01:44Z)

The next scheduled invocation started at `2026-08-21T01:44:32.994Z` and
completed at `2026-08-21T01:49:11.260Z` with `status=completed`,
`error_code=NULL` and a duration of 278 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,725 queued version jobs
and 3,635 completed version jobs; `live_manual_queued=6,577`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 01:52Z)

The next scheduled invocation started at `2026-08-21T01:52:32.993Z` and
completed at `2026-08-21T01:57:06.747Z` with `status=completed`,
`error_code=NULL` and a duration of 273 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,716 queued version jobs
and 3,644 completed version jobs; `live_manual_queued=6,568`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 02:00Z)

The next scheduled invocation started at `2026-08-21T02:00:36.177Z` and
completed at `2026-08-21T02:05:07.450Z` with `status=completed`,
`error_code=NULL` and a duration of 271 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,707 queued version jobs
and 3,653 completed version jobs; `live_manual_queued=6,559`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 02:08Z)

The next scheduled invocation started at `2026-08-21T02:08:32.994Z` and
completed at `2026-08-21T02:13:06.773Z` with `status=completed`,
`error_code=NULL` and a duration of 273 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,698 queued version jobs
and 3,662 completed version jobs; `live_manual_queued=6,550`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 02:16Z)

The next scheduled invocation started at `2026-08-21T02:16:32.992Z` and
completed at `2026-08-21T02:21:06.147Z` with `status=completed`,
`error_code=NULL` and a duration of 273 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,689 queued version jobs
and 3,671 completed version jobs; `live_manual_queued=6,541`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 02:24Z)

The next scheduled invocation started at `2026-08-21T02:24:32.994Z` and
completed at `2026-08-21T02:29:04.048Z` with `status=completed`,
`error_code=NULL` and a duration of 271 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,680 queued version jobs
and 3,680 completed version jobs; `live_manual_queued=6,532`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 02:32Z)

The next scheduled invocation started at `2026-08-21T02:32:32.994Z` and
completed at `2026-08-21T02:37:01.808Z` with `status=completed`,
`error_code=NULL` and a duration of 268 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,671 queued version jobs
and 3,689 completed version jobs; `live_manual_queued=6,523`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 02:40Z)

The next scheduled invocation started at `2026-08-21T02:40:33.887Z` and
completed at `2026-08-21T02:45:05.763Z` with `status=completed`,
`error_code=NULL` and a duration of 271 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,662 queued version jobs
and 3,698 completed version jobs; `live_manual_queued=6,514`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 02:48Z)

The next scheduled invocation started at `2026-08-21T02:48:32.993Z` and
completed at `2026-08-21T02:52:50.176Z` with `status=completed`,
`error_code=NULL` and a duration of 257 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,653 queued version jobs
and 3,707 completed version jobs; `live_manual_queued=6,505`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 04:00Z)

The next scheduled invocation started at `2026-08-21T04:00:37.482Z` and
completed at `2026-08-21T04:04:47.739Z` with `status=completed`,
`error_code=NULL` and a duration of 250 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,572 queued version jobs
and 3,788 completed version jobs; `live_manual_queued=6,424`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 04:08Z)

The next scheduled invocation started at `2026-08-21T04:08:32.994Z` and
completed at `2026-08-21T04:12:37.630Z` with `status=completed`,
`error_code=NULL` and a duration of 244 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,563 queued version jobs
and 3,797 completed version jobs; `live_manual_queued=6,415`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 04:16Z)

The next scheduled invocation started at `2026-08-21T04:16:32.995Z` and
completed at `2026-08-21T04:20:51.345Z` with `status=completed`,
`error_code=NULL` and a duration of 258 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,554 queued version jobs
and 3,806 completed version jobs; `live_manual_queued=6,406`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 04:24Z)

The next scheduled invocation started at `2026-08-21T04:24:32.994Z` and
completed at `2026-08-21T04:29:23.763Z` with `status=completed`,
`error_code=NULL` and a duration of 290 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,545 queued version jobs
and 3,815 completed version jobs; `live_manual_queued=6,397`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Verified scheduled-run history (2026-08-21, 04:32Z–05:28Z)

The durable `scheduled_runs` history records the following additional
`legal-corpus-worker` invocations, each with `status=completed` and
`error_code=NULL`: 04:32:32.994Z–04:37:22.024Z (289 seconds),
04:40:33.793Z–04:45:26.681Z (292 seconds), 04:48:32.992Z–04:53:24.040Z
(291 seconds), 04:56:32.995Z–05:01:21.720Z (288 seconds),
05:04:32.995Z–05:09:27.910Z (294 seconds), 05:12:32.995Z–05:17:31.049Z
(298 seconds), 05:20:34.192Z–05:25:32.480Z (298 seconds), and
05:28:32.995Z–05:33:25.092Z (292 seconds). The counters below are asserted
from the dedicated post-run probe for the subsequent 05:36Z cycle; no
retroactive queue counts are inferred for this history-only interval.

## Subsequent clean staging run (2026-08-21, 05:36Z)

The next scheduled invocation started at `2026-08-21T05:36:32.995Z` and
completed at `2026-08-21T05:41:26.294Z` with `status=completed`,
`error_code=NULL` and a duration of 293 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,464 queued version jobs
and 3,896 completed version jobs; `live_manual_queued=6,316`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 05:44Z)

The next scheduled invocation started at `2026-08-21T05:44:32.996Z` and
completed at `2026-08-21T05:49:26.418Z` with `status=completed`,
`error_code=NULL` and a duration of 293 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,455 queued version jobs
and 3,905 completed version jobs; `live_manual_queued=6,307`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 05:52Z)

The next scheduled invocation started at `2026-08-21T05:52:32.995Z` and
completed at `2026-08-21T05:57:14.336Z` with `status=completed`,
`error_code=NULL` and a duration of 281 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,446 queued version jobs
and 3,914 completed version jobs; `live_manual_queued=6,298`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 06:00Z)

The next scheduled invocation started at `2026-08-21T06:00:41.597Z` and
completed at `2026-08-21T06:05:31.030Z` with `status=completed`,
`error_code=NULL` and a duration of 289 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,437 queued version jobs
and 3,923 completed version jobs; `live_manual_queued=6,289`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 06:08Z)

The next scheduled invocation started at `2026-08-21T06:08:32.995Z` and
completed at `2026-08-21T06:13:25.979Z` with `status=completed`,
`error_code=NULL` and a duration of 292 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,428 queued version jobs
and 3,932 completed version jobs; `live_manual_queued=6,280`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 06:16Z)

The next scheduled invocation started at `2026-08-21T06:16:32.995Z` and
completed at `2026-08-21T06:21:22.271Z` with `status=completed`,
`error_code=NULL` and a duration of 289 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,419 queued version jobs
and 3,941 completed version jobs; `live_manual_queued=6,271`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 06:24Z)

The next scheduled invocation started at `2026-08-21T06:24:32.998Z` and
completed at `2026-08-21T06:29:16.524Z` with `status=completed`,
`error_code=NULL` and a duration of 283 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,410 queued version jobs
and 3,950 completed version jobs; `live_manual_queued=6,262`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Subsequent clean staging run (2026-08-21, 06:32Z)

The next scheduled invocation started at `2026-08-21T06:32:02.582Z` and
completed at `2026-08-21T06:38:51.446Z` with `status=completed`,
`error_code=NULL` and a duration of 408 seconds. The post-run read-only D1
probe recorded 44/44 discovery checkpoints completed and no running jobs.
Failure counters were all zero: `terminal_or_dead_letter_jobs=0`,
`active_jobs_with_errors=0`, `unresolved_retrying=0` and
`unresolved_technical=0`.

The queue probe recorded 38,310 queued fetch jobs, 5,401 queued version jobs
and 3,959 completed version jobs; `live_manual_queued=6,253`. Corpus totals
remained 3,575 canonical documents, 62,075 unique current provisions and
151,499 indexed current chunks. Ingestion is still not frozen, so the
snapshot, indexed 314-scenario evaluation, Qdrant/D1 backup and restore,
preview and rollout gates remain unclaimed. Production remains untouched.

## Sparse-capacity guard and post-deploy diagnostics (2026-08-21, 07:12–07:36Z)

The `07:12:02Z` scheduled run was already in flight before commit `fdae5fd5`
(`fix: gate compressed sparse backfill by capacity flag`) reached staging and
ended with `LEGAL_CORPUS_SPARSE_BACKFILL_FAILED` at `07:16:16Z`. The next
invocations on version `5a73f277` (`07:20:02Z`, `07:24:02Z` and `07:28:02Z`)
ended with the generic `LEGAL_CORPUS_WORKER_FAILED` code. No terminal or
dead-letter ingestion jobs were created; the unresolved retrying work was
limited to the existing Lex historical-version queue.

Commit `0fa77933` added a safe error-code classifier that exposes only
allow-listed `LEGAL_*`/`SQLITE_*` tokens (never URLs, SQL or source text) in
the run ledger. Commit `bc6d19cd` then put both optional sparse compaction and
compressed-index backfill behind the same
`LEGAL_CORPUS_SPARSE_COMPRESSION_ENABLED` capacity flag. Both commits passed
the focused tests, type-check, lint and artifact dry-run; staging was deployed
as version `4a10213e-74ba-4fb8-bfb7-8c525d033e78` at `07:35:49Z` with the flag
explicitly `false`. A new post-deploy scheduled invocation has not yet been
observed, so no clean-run claim is made here.

At the latest read-only probe, D1 `size_after` was `9,999,978,496` bytes,
44/44 discovery checkpoints were completed, totals were 3,575 canonical
documents / 62,075 current provisions / 151,499 indexed chunks, and the
queue remained unfrozen (38,310 fetch + 5,376 version queued, one retrying
version job). The release snapshot, indexed 314-scenario evaluation, Qdrant
benchmark/restore, D1 backup/restore, preview and rollout gates remain
unclaimed. Production remains untouched.

## Post-deploy staging observation (2026-08-21, 07:42Z)

No new `scheduled_runs` row was observed after version
`4a10213e-74ba-4fb8-bfb7-8c525d033e78` was deployed at `07:35:49Z`; the latest
run still visible is the pre-deploy `07:28:02Z` generic failure. The read-only
probe therefore does not claim that the capacity guard has passed. Current
queue state is 38,310 fetch queued, 5,373 version queued, 3 version jobs
running and 3,984 completed; `live_manual_queued=6,228`. Terminal/dead-letter
jobs remain zero, but two retrying jobs still carry errors. Totals remain
3,575 canonical documents / 62,075 unique current provisions / 151,499
indexed current chunks and D1 `size_after=9,999,978,496` bytes. Snapshot,
evaluation, backup/restore, preview, rollout and CI gates remain unclaimed.

## D1 hard-cap failure containment (2026-08-21, 07:40Z)

The staging tail captured the first post-guard invocation failure:
`D1_ERROR: Exceeded maximum DB size`, thrown by the initial `claimRun` batch
at `07:40:02Z` before a scheduler row could be written. This confirms the
remaining blocker is the managed D1 hard ceiling, not a Lex source condition.

Commit `59a00df6` makes scheduler claim failure fail closed: it records only
the safe `D1_ERROR` token, calls `controller.noRetry()`, and returns without
starting discovery, fetching, sparse maintenance or any other source work.
The focused tests, type-check, lint and artifact dry-run pass; staging deploy
version `87c59531-b6ed-4e02-8ad6-efe8b74c0bb7` completed at `07:47Z`.
Production is unchanged. A post-deploy scheduled observation is still
required; no release-gate success is claimed.

## Fail-closed claim verification (2026-08-21, 07:52Z)

The first scheduled tick observed on staging version
`87c59531-b6ed-4e02-8ad6-efe8b74c0bb7` emitted
`legal_corpus.claim_failed` with safe `errorCode=D1_ERROR`, had no uncaught
exception (`outcome=ok`), and performed no scheduler write or source fetch.
This proves the D1 hard-cap containment is active. It does not satisfy the
release gate: the ingestion queue remains non-empty and two retrying jobs are
still unresolved, so snapshot/evaluation/restore/CI gates remain pending.

## Current release audit (2026-08-21, 07:53Z)

The branch remains clean at `9152c442` and Draft PR #43 is open, draft and
points from `feature/full-legal-corpus` to `main`; no CI checks are reported
for this branch yet. Read-only Wrangler deployment history confirms the
production legal-corpus Worker is still version
`ca9f9b82-1430-4bae-80ce-94e1194d420a` from `2026-08-14`; no production deploy
was performed by this integration.

A fresh machine-captured staging capacity artifact was generated with
`npm run capture:legal-corpus:d1-capacity -- --config wrangler.legal-corpus.jsonc
--output dist/legal-corpus-worker/staging-d1-capacity.json` at
`2026-08-21T08:00:10.835Z`. It binds database
`bb716a96-b2fb-4823-90d6-6c228fed181a` / `juro-staging` to
`databaseSizeBytes=9,999,998,976`; the 8 GB release-reserve check therefore
remains a proven failure, not an inferred or stale value.

## Staging D1 replacement and ingestion restart (2026-08-21)

The original `juro-staging` database reached Cloudflare's 10 GB per-database
limit and was preserved unchanged. The owner created a separate staging
database `juro-staging-corpus-v2` with UUID
`62620fb3-3da3-4c76-a8e9-aa60858c1063`. The staging-only Wrangler binding
`DB` now points to that UUID; the production `DB` binding, production flags and
production Worker were not changed. The staging Qdrant collection was also
separated as `juro_legal_staging_v2` so an empty replacement database cannot
read vectors belonging to the retired staging ledger.

The new database received all 142 staging migrations, including evidence
migrations `0122–0123`, legal-corpus migrations `0124–0140`, and the robots
policy migration `0141`. Artifact dry-run confirmed the new D1/R2/service
bindings and all staging flags. The dedicated legal-corpus Worker was deployed
staging-only as version `8b7fd349-9cfd-4391-a0b8-2502bdf84233`.

Sequential read-only probes after the first cron ticks showed 44 discovery
checkpoints seeded, no terminal/dead-letter failure rows, and ingestion
progressing on the replacement database. The latest probe recorded 1 completed,
507 queued and 1 running ingestion jobs, 1 canonical document, and 968 active
provisions. The database size was 19,861,504 bytes. These are restart
observations, not release-gate success: the replacement corpus is empty and
still must complete discovery, ingestion, indexing, queue freeze, snapshot,
314-scenario indexed evaluation, Qdrant/D1 restore and CI gates.
## Replacement staging progress probe (2026-08-21, 10:57Z)

A sequential read-only probe of `juro-staging-corpus-v2` recorded database size
`171,651,072` bytes, 22 completed, 847 queued and 1 running ingestion jobs,
and no rows in `legal_corpus_failures`. All 44 discovery checkpoints remain
queued while the bounded Worker continues its initial acquisition/indexing
window. Current materialized totals are 2 canonical documents, 3,342 active
provisions and 19,048 corpus chunks. The replacement database is healthy and
well below its capacity limit, but these early restart counts are not release
evidence; checkpoint completion, the 1,500/22,000/22,513 floors, queue freeze,
snapshot, indexed evaluation, restore and CI gates remain pending.

## Version-debt starvation fix and post-deploy probe (2026-08-21, 11:10Z)

The replacement queue exposed a scheduler starvation condition: 825 queued
historical `version` jobs caused the previous catch-up policy to reserve all
ten bounded ingestion slots, while twelve core-code fetch jobs were still
awaiting ingestion. This kept generic catalogue discovery behind unresolved
core-code work. Commit `698c1004` retains one current-corpus fetch slot and
uses the other nine slots for version catch-up when the debt threshold is
exceeded. The focused worker-boundary tests, type-check, lint and artifact
dry-run passed; staging was deployed only as Worker version
`f747ea7f-d86e-458c-9ee7-3498b2a93026` with the existing v2 D1 and Qdrant
bindings.

A sequential read-only probe after deployment recorded 4 completed and 16
queued fetch jobs, 27 completed, 823 queued and 1 running version jobs, 2
indexed and 12 awaiting-ingestion core-code targets, 44 queued checkpoints,
2 documents, 27,681 provisions/chunks, and no rows in
`legal_corpus_failures`. The one retained fetch slot is now making progress,
but the release gate remains open: checkpoint completion, 1,500 canonical
documents, queue freeze, snapshot, indexed 314-scenario evaluation, Qdrant/D1
restore and CI evidence are not yet proven.

## Post-fix ingestion probe (2026-08-21, 11:21Z)

The first full scheduled invocation on Worker version
`f747ea7f-d86e-458c-9ee7-3498b2a93026` completed the retained current-corpus
slot: the read-only D1 probe now records 5 completed and 18 queued fetch jobs,
35 completed and 861 queued version jobs, 3 canonical documents, 5 language
variants, 1,136 unique current provisions, 3,570 current provisions and
3,572 indexed chunks. `wrangler d1 info` reports
`database_size=303,796,224` bytes for the replacement D1, well below the
release reserve. The core-code reconciliation is still pending its next
cycle (`12 awaiting_ingestion`, `2 indexed`, `1 queued`, `4 retrying`), and
all 44 discovery checkpoints remain queued. The scheduled run ended with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`; no terminal/dead-letter rows
were created. This is progress evidence only; all release floors, checkpoint
completion, queue freeze, snapshot, evaluation, restore and CI gates remain
open.

## Core-code reconciliation probe (2026-08-21, 11:25Z)

The next sequential read-only probe observed the replacement Worker in its
11:24 UTC run: 3 core-code targets are now `indexed` and 11 remain
`awaiting_ingestion`; 44 discovery checkpoints are still queued. The job
ledger had 5 completed, 17 queued and 1 running fetch jobs, 35 completed and
861 queued version jobs, and no rows in `legal_corpus_failures`. The run was
still active at probe time, so no completion or release-gate claim is made.

## Replacement corpus progress probe (2026-08-21, 11:26Z)

While the 11:24 UTC scheduled run was still active, a sequential read-only
probe recorded 4 canonical documents, 6 language variants, 1,642 unique
current provisions, 4,627 current provisions and 4,629 indexed chunks. Three
core-code targets were indexed and 11 remained awaiting ingestion; all 44
discovery checkpoints were queued with zero attempts. The ingestion ledger
contained 6 completed and 20 queued fetch jobs plus 36 completed, 895 queued
and 1 running version jobs. `legal_corpus_failures` remained empty. These
counts are progress evidence only and do not satisfy the release gate.

## Completed-cycle reconciliation probe (2026-08-21, 11:29Z)

The 11:24 UTC scheduled run completed without an actionable run error. The
latest read-only D1 totals remain 4 canonical documents, 1,642 unique current
provisions and 4,629 indexed chunks. Core-code targets are split as 3
`indexed`, 11 `awaiting_ingestion`, 1 `queued` and 4 `retrying`; all 44
catalogue checkpoints remain queued. The job ledger contains 6 completed and
20 queued fetch jobs, 39 completed and 893 queued version jobs, and the
failure ledger remains empty. Release floors and all downstream gates remain
unproven.

## Core-code reconciliation probe (2026-08-21, 11:33Z)

During the 11:32 UTC scheduled run, sequential read-only D1 checks showed 4
core-code targets `indexed`, 10 `awaiting_ingestion`, 1 `queued` and 4
`retrying`. All 44 discovery checkpoints remained queued and the failure
ledger remained empty. The scheduled run was still active at probe time; no
release-gate or completion claim is made.

## Replacement corpus progress probe (2026-08-21, 11:37Z)

After the 11:32 UTC scheduled run, the sequential D1 probe recorded 5
canonical documents, 2,045 unique provisions and 5,034 indexed chunks. The
job ledger contained 7 completed and 21 queued fetch jobs, plus 43 completed
and 1,048 queued version jobs. Core-code targets remained 4 `indexed`, 10
`awaiting_ingestion`, 1 `queued` and 4 `retrying`; all 44 catalogue
checkpoints remained queued. The run ended with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`, while `legal_corpus_failures` remained empty. No
release-gate claim is made.

## Completed replacement cycle (2026-08-21, 11:53Z)

The 11:48:02Z scheduled invocation completed at 11:53:26Z with
`status=completed` and `error_code=NULL`. Sequential read-only D1 probes after
the run recorded 9 completed and 23 queued fetch jobs, plus 51 completed and
1,212 queued version jobs. All 44 discovery checkpoints remained `queued`
with zero attempts and zero checkpoint errors. The failure ledger returned no
rows: terminal, technically-unavailable and dead-letter counts are all zero.

The materialized replacement-corpus totals advanced to 7 canonical documents,
9 language variants, 3,007 unique current provisions and 6,711 indexed current
chunks; D1 reported `size_after=450,928,640` bytes. Core-code reconciliation
advanced to 6 `indexed`, 8 `awaiting_ingestion`, 1 `queued` and 4 `retrying`
targets. This is verified staging progress only: the 1,500/22,000/22,513
floors, 44 completed checkpoints, queue freeze, snapshot, indexed evaluation,
Qdrant/D1 restore and CI gates remain unproven. Production remains untouched.

## Replacement cycle with retryable catalog timeout (2026-08-21, 12:03Z)

The 11:56:13Z scheduled invocation finished at 12:03:12Z with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. Sequential post-run D1 probes
showed no rows in `legal_corpus_failures`; ingestion jobs contained 10
completed and 25 queued fetch jobs plus 55 completed and 1,241 queued version
jobs, all without `last_error_code`. All 44 discovery checkpoints remained
`queued` with zero attempts and zero errors.

The replacement corpus nevertheless advanced to 8 canonical documents, 10
language variants, 3,226 unique current provisions and 6,931 indexed current
chunks (`size_after=483,028,992` bytes). The timeout therefore did not create a
terminal/dead-letter condition and no code change is justified by this
transient run-level failure. Release floors, checkpoint completion, queue
freeze, snapshot, evaluation, restore and CI gates remain open; production is
untouched.

## Replacement cycle with retryable catalog timeout (2026-08-21, 12:11Z)

The 12:04:13Z scheduled invocation finished at 12:11:34Z with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. Sequential read-only D1 probes
after completion recorded no terminal or technically-unavailable failure rows,
no dead-letter jobs and no active job errors. The ingestion ledger contained
11 completed and 26 queued fetch jobs plus 59 completed and 1,295 queued
version jobs, all without `last_error_code`.

All 44 discovery checkpoints remained `queued` with zero attempts and zero
errors. Materialized totals were 9 canonical documents, 11 language variants,
3,611 unique current provisions and 7,448 indexed current chunks; D1 reported
`size_after=517,181,440` bytes. This remains staging progress only: release
floors, completed checkpoints, queue freeze, snapshot, evaluation, restore and
CI gates are unproven. Production remains untouched.

## Replacement cycle with retryable catalog timeout (2026-08-21, 12:19Z)

The 12:12:13Z scheduled invocation finished at 12:19:35Z with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. Sequential post-run D1 probes
recorded no terminal or technically-unavailable failure rows, no dead-letter
jobs and no active job errors. The ingestion ledger contained 12 completed and
26 queued fetch jobs plus 63 completed and 1,349 queued version jobs, all
without `last_error_code`.

All 44 discovery checkpoints remained `queued` with zero attempts and zero
errors. Materialized totals were 9 canonical documents, 12 language variants,
3,611 unique current provisions and 7,965 indexed current chunks; D1 reported
`size_after=550,313,984` bytes. This remains staging progress only: release
floors, completed checkpoints, queue freeze, snapshot, evaluation, restore and
CI gates are unproven. Production remains untouched.

## Replacement cycle with retryable catalog timeout (2026-08-21, 12:27Z)

The 12:20:13Z scheduled invocation finished at 12:27:52Z with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. Sequential post-run D1 probes
recorded no terminal or technically-unavailable failure rows, no dead-letter
jobs and no active job errors. The ingestion ledger contained 13 completed and
25 queued fetch jobs plus 67 completed and 1,403 queued version jobs, all
without `last_error_code`.

All 44 discovery checkpoints remained `queued` with zero attempts and zero
errors. Materialized totals were 9 canonical documents, 13 language variants,
3,611 unique current provisions and 8,482 indexed current chunks; D1 reported
`size_after=583,974,912` bytes. This remains staging progress only: release
floors, completed checkpoints, queue freeze, snapshot, evaluation, restore and
CI gates are unproven. Production remains untouched.

## Replacement cycle with retryable catalog timeout (2026-08-21, 12:36Z)

The 12:28:13Z scheduled invocation finished at 12:36:59Z with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. Sequential post-run D1 probes
recorded no terminal or technically-unavailable failure rows, no dead-letter
jobs and no active job errors. The ingestion ledger contained 14 completed and
26 queued fetch jobs plus 71 completed and 1,471 queued version jobs, all
without `last_error_code`.

All 44 discovery checkpoints remained `queued` with zero attempts and zero
errors. Materialized totals were 10 canonical documents, 14 language variants,
4,123 unique current provisions and 10,629 indexed current chunks; D1 reported
`size_after=630,329,344` bytes. Core-code reconciliation was 9 `indexed`, 5
`awaiting_ingestion`, 2 `queued` and 3 `retrying`. This remains staging
progress only: release floors, completed checkpoints, queue freeze, snapshot,
evaluation, restore and CI gates are unproven. Production remains untouched.

## Active replacement cycle probe (2026-08-21, 12:55Z)

The 12:52:13Z scheduled invocation was still `running` at the sequential
12:55Z read-only probe. Its distributed lock was renewed through 13:08:25Z,
so the worker was active and no concurrent crawler was started. The job ledger
contained 15 completed, 25 queued and 1 running fetch jobs plus 75 completed
and 1,555 queued version jobs; no ingestion job carried `last_error_code`.

The failure ledger remained empty (zero terminal/technically-unavailable rows
and zero dead-letter rows). All 44 discovery checkpoints were still `queued`
with zero attempts and zero errors. Materialized totals were 10 canonical
documents, 16 language variants, 4,123 unique current provisions and 14,924
indexed current chunks. Core-code reconciliation was 10 `indexed`, 4
`awaiting_ingestion`, 1 `queued` and 4 `retrying`; the retrying targets remain
retryable source conditions, not terminal ingestion failures. This is staging
progress only: the release floors, completed checkpoints, queue freeze,
snapshot, evaluation, restore and CI gates are unproven. Production remains
untouched.

## Active replacement cycle continuation (2026-08-21, 13:00Z)

The same 12:52:13Z scheduled invocation remained `running` at the next
sequential probe; its lease was renewed through 13:15:05Z. The ingestion
ledger advanced to 16 completed and 25 queued fetch jobs plus 79 completed
and 1,607 queued version jobs, with no job-level error codes. The failure
ledger remained empty and all 44 discovery checkpoints remained queued with
zero attempts and zero errors. Materialized totals were unchanged at 10
canonical documents, 4,123 unique current provisions and 14,924 indexed
current chunks. This remains staging progress only; no release-gate or
production claim is made.

## Completed replacement cycle (2026-08-21, 13:01Z)

The 12:52:13Z scheduled invocation completed at 13:01:00Z with
`status=completed` and `error_code=NULL`. Sequential post-run probes found
zero ingestion failure rows, zero terminal/technically-unavailable rows and
zero dead-letter jobs; all job groups had no `last_error_code`. The next
13:04:13Z invocation was already running under the distributed lock, so no
parallel crawler was started.

The replacement corpus advanced to 11 canonical documents and 17 language
variants, with 4,123 unique current provisions and 14,924 indexed current
chunks. All 44 discovery checkpoints remained `queued` with zero attempts and
zero errors. Core-code reconciliation was 10 `indexed`, 4
`awaiting_ingestion`, 1 `queued` and 4 `retrying`; the retrying rows are
retryable source conditions, not terminal ingestion failures. Release floors,
checkpoint completion, queue freeze, snapshot, evaluation, restore and CI
gates remain unproven. Production remains untouched.

## Active replacement cycle probe (2026-08-21, 13:06Z)

The 13:04:13Z scheduled invocation was still `running` at the sequential
13:06Z probe under the distributed lock. The ledger contained 17 completed
and 26 queued fetch jobs plus 79 completed, 1 running and 1,617 queued version
jobs; no ingestion job carried `last_error_code`. The failure ledger remained
empty (zero terminal/technically-unavailable rows and zero dead-letter jobs),
and all 44 discovery checkpoints remained `queued` with zero attempts and
zero errors.

Materialized totals advanced to 11 canonical documents, 17 language variants,
4,704 unique current provisions and 15,598 indexed current chunks. Core-code
reconciliation remained 10 `indexed`, 4 `awaiting_ingestion`, 1 `queued` and
4 `retrying`; these are retryable source conditions, not terminal ingestion
failures. Release floors, queue freeze, snapshot, evaluation, restore and CI
gates remain unproven. Production remains untouched.

## Active replacement cycle probe (2026-08-21, 13:10Z)

The 13:04:13Z scheduled invocation remained `running` at the sequential
13:10Z probe and continued renewing its distributed lock. The ledger contained
17 completed and 26 queued fetch jobs plus 82 completed, 1 running and 1,614
queued version jobs; no ingestion job carried `last_error_code`. The failure
ledger remained empty (zero terminal/technically-unavailable rows and zero
dead-letter jobs), while all 44 discovery checkpoints stayed `queued` with
zero attempts and zero errors.

Materialized totals remained 11 canonical documents, 17 language variants,
4,704 unique current provisions and 15,598 indexed current chunks. Core-code
reconciliation is still 10 `indexed`, 4 `awaiting_ingestion`, 1 `queued` and
4 `retrying`. This is staging progress only; release floors, queue freeze,
snapshot, evaluation, restore and CI gates remain unproven. Production remains
untouched.

## Completed replacement cycle (2026-08-21, 13:11Z)

The 13:04:13Z scheduled invocation completed at 13:11:24Z with
`status=completed` and `error_code=NULL`. Sequential post-run probes found
zero terminal/technically-unavailable failures, zero dead-letter jobs and no
ingestion jobs with `last_error_code`. The next 13:12:13Z invocation was
already running under the distributed lock.

The replacement corpus remained at 11 canonical documents, 17 language
variants, 4,704 unique current provisions and 15,598 indexed current chunks;
all 44 discovery checkpoints remained queued with zero attempts and zero
errors. Release floors, checkpoint completion, queue freeze, snapshot,
evaluation, restore and CI gates remain unproven. Production remains
untouched.

## Active replacement cycle probe (2026-08-21, 13:14Z)

The 13:12:13Z scheduled invocation remained `running` at the sequential
13:14Z probe and renewed its distributed lock. The ledger contained 18
completed and 27 queued fetch jobs plus 83 completed, 1 running and 1,655
queued version jobs; no ingestion job carried `last_error_code`. The failure
ledger remained empty (zero terminal/technically-unavailable rows and zero
dead-letter jobs), and all 44 discovery checkpoints remained `queued` with
zero attempts and zero errors.

Materialized totals advanced to 12 canonical documents, 18 language variants,
4,814 unique current provisions and 15,812 indexed current chunks. Core-code
reconciliation was 11 `indexed`, 3 `awaiting_ingestion`, 1 `queued` and 4
`retrying`; retrying rows are source retries, not terminal ingestion failures.
Release floors, queue freeze, snapshot, evaluation, restore and CI gates
remain unproven. Production remains untouched.

## Active replacement cycle probe (2026-08-21, 13:16Z)

The 13:12:13Z scheduled invocation remained `running` at the sequential
13:16Z probe and continued renewing its distributed lock. The ledger contained
18 completed and 27 queued fetch jobs plus 85 completed, 1 running and 1,653
queued version jobs; no ingestion job carried `last_error_code`. The failure
ledger remained empty and all 44 discovery checkpoints remained `queued` with
zero attempts and zero errors.

Materialized totals remained 12 canonical documents, 18 language variants,
4,814 unique current provisions and 15,812 indexed current chunks. Core-code
reconciliation remained 11 `indexed`, 3 `awaiting_ingestion`, 1 `queued` and
4 `retrying`; retrying rows are source retries, not terminal failures. Release
floors, queue freeze, snapshot, evaluation, restore and CI gates remain
unproven. Production remains untouched.

## Completed replacement cycle with retryable catalog timeout (2026-08-21, 13:19Z)

The 13:12:13Z scheduled invocation finished at 13:19:09Z with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. Sequential post-run probes found
zero terminal/technically-unavailable failure rows, zero dead-letter jobs and
no ingestion jobs with `last_error_code`; the next 13:20:13Z invocation was
already running under the distributed lock.

The replacement corpus advanced to 13 canonical documents and 19 language
variants, while unique current provisions remained 4,814 and indexed current
chunks 15,812. All 44 discovery checkpoints remained queued with zero
attempts and zero errors. Core-code reconciliation was 12 `indexed`, 2
`awaiting_ingestion`, 1 `queued` and 4 `retrying`; the retrying rows remain
retryable source conditions. Release floors, queue freeze, snapshot,
evaluation, restore and CI gates remain unproven. Production remains
untouched.

## Active replacement cycle probe (2026-08-21, 13:22Z)

The 13:20:13Z scheduled invocation was still `running` at the sequential
13:22Z probe under the distributed lock. The ledger contained 19 completed
and 29 queued fetch jobs plus 87 completed, 1 running and 1,660 queued version
jobs; no ingestion job carried `last_error_code`. The failure ledger remained
empty (zero terminal/technically-unavailable rows and zero dead-letter jobs),
and all 44 discovery checkpoints remained `queued` with zero attempts and
zero errors.

Materialized totals advanced to 13 canonical documents, 19 language variants,
4,929 unique current provisions and 15,939 indexed current chunks. Core-code
reconciliation was 12 `indexed`, 2 `awaiting_ingestion`, 1 `queued` and 4
`retrying`; these remain retryable source conditions. Release floors, queue
freeze, snapshot, evaluation, restore and CI gates remain unproven.
Production remains untouched.

## Post-continuation observation: customs indexed and catalog discovery opened (2026-08-21, 16:40–17:09Z)

The first two invocations after Worker version `b429f8d3-ced7-4edc-864c-534665d015c7`
completed without a run-level error (`07fc8b47-da27-4079-a2b5-723d755ec824`
and `b7eee862-f6dd-4e9e-980b-cdc75e92aac7`). The second invocation fetched the
customs source as `https://lex.uz/ru/docs/2876352`; the following reconciliation
now reports all 19 core-code targets as `indexed` and no non-indexed core target.

The next scheduled invocation (`9e21b446-4c3e-43ba-a0ab-972f70aa3099`,
17:00:13.677Z–17:09:26.695Z) completed with the bounded, retryable
`LEX_CATALOG_TIMEOUT` condition while processing the first laws catalogue pages;
this is recorded as incomplete discovery evidence, not as a successful catalog
checkpoint. It left three laws language checkpoints with page-one discovery
evidence (20 URLs each) and the remaining catalog checkpoints queued. At the
post-run read-only probe, staging held 20 canonical Lex documents, 18,938 active
provisions and 152,821 indexed chunks. Ingestion had 200 completed and 2,080
queued jobs. `legal_corpus_failures` still contained only retrying historical
rows; terminal/dead-letter failures were 0 and dead-letter checkpoints were 0.
No snapshot, queue freeze, evaluation, restore, human legal review or release
gate is claimed. Production remains untouched.

The following run (`4d2ab640-1414-4648-a0fc-a7b84f371e6c`,
17:12:13.672Z–17:19:49.102Z) continued the laws catalog. It completed with the
same bounded retryable `LEX_CATALOG_TIMEOUT` condition for the English laws
checkpoint; the checkpoint remains `retrying` with its page-one ledger intact
(20 discovered URLs), while RU and Uzbek Cyrillic remain at page two (40 URLs)
and Uzbek Latin is being retried from page one. The subsequent run
(`76df3b56-2087-40a5-8996-06b160b13726`, started 17:20:13.677Z) holds the
distributed lease and is still processing. The latest read-only materialized
totals are 21 canonical documents, 18,987 active provisions and 155,102
indexed chunks; 205 ingestion jobs are completed and 2,154 are queued. The
failure ledger has only retrying historical rows; terminal/dead-letter counts
remain zero. Checkpoints are not yet complete and ingestion is not frozen.

The same bounded invocation (`76df3b56-2087-40a5-8996-06b160b13726`,
17:20:13.677Z–17:28:27.135Z) later completed with retryable
`LEX_CATALOG_TIMEOUT`; it did not create a terminal or dead-letter row. Laws
page evidence remained durable (RU page 3, Uzbek Latin and Uzbek Cyrillic page
2, English page 1). The post-run read-only probe showed 22 canonical documents,
19,026 active provisions and 157,334 indexed chunks, with 210 completed and
2,169 queued ingestion jobs. All 44 checkpoints remained incomplete and the
queue was not frozen. Production remains untouched.

## Active replacement cycle long-running version probe (2026-08-21, 13:30Z)

The 13:20:13Z scheduled invocation remained `running` with the distributed
lock valid through 13:38:23Z. One version job (`legal-version:036a5d26…`)
has remained `running` since its last durable update at 13:23:02Z; this is a
long-running ingestion operation, not a terminal/dead-letter row, so it was
not interrupted. Sequential D1 checks still show zero failure rows, zero
terminal/technically-unavailable rows and zero dead-letter jobs; all 44
discovery checkpoints remain queued with zero attempts and zero errors.

Totals remain 13 canonical documents, 4,929 unique current provisions and
15,939 indexed current chunks. Release floors, queue freeze, snapshot,
evaluation, restore and CI gates remain unproven. Production remains
untouched.

## Scheduler lease-expiry finding and staging fix (2026-08-21, 13:40–14:45Z)

The 13:20:13Z scheduled invocation was terminated at 13:40:13.676Z with
`LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED`. The durable run record showed one
long-running version job (`legal-version:036a5d26f630e54aacacacb36f40`) whose
last durable update was 13:23:02.122Z; the worker renewed the scheduler lease
only between jobs, not during a large sequence of D1 writes. This was an
actionable run-level failure, distinct from the legal corpus failure ledger.

The staging-only fix renews the scheduler lease from the ingestion layer every
eight D1 write batches and threads that heartbeat through the worker. It is
covered by `large version writes renew the scheduler lease between D1 batches`
in `apps/platform/tests/legal-corpus-ingestion.test.ts` (35 ingestion tests
passed, including the new regression), plus 20 worker-boundary tests passed.
`npm run type-check`, `npm run lint`,
`npm run validate:legal-corpus:artifact`, and `git diff --check` all passed.
The fix is commit `847edd7f` and was deployed only to the staging legal-corpus
Worker as version `9e795d70-ae97-4f21-8341-3fd4661a0993`; production bindings,
flags and deployments remain unchanged.

After deployment, the 14:40:13.669Z invocation was still running at the
14:45Z sequential probe. Its scheduler lock was renewed through 15:00:02.450Z,
confirming lease heartbeats during the long-running write. The job ledger was
23 completed and 36 queued fetch jobs, 121 completed and 1,934 queued version
jobs, and one running version job, with no job `last_error_code`. The failure
ledger contained one allow-listed retrying `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`
row (retry_count=1), with zero terminal/technically-unavailable rows. All 44
discovery checkpoints remained queued (0 attempts, 0 errors). Materialized
totals were 16 canonical documents, 22 language variants, 5,315 unique current
provisions and 16,330 indexed current chunks. Release floors, queue freeze,
snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain unproven.
Production remains untouched.

The 14:40:13.669Z run later completed at 14:47:02.981Z with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`, not a lease-expiry or terminal
ingestion failure. The next scheduled invocation is expected to retry the
catalog path; this source timeout remains an explicit release blocker for
queue freeze, while the lease-renewal regression itself is fixed and observed
to renew during the long-running write.

## Core-code title-search timeout mitigation (2026-08-21, 15:00Z)

Read-only staging inspection found a repeatable source-path condition: the
three unresolved core-code targets (`customs`, `economic_procedure` and
`housing`) had each accumulated `LEX_CATALOG_TIMEOUT` on their fixed Lex title
search, while 16 of 19 core-code targets were already indexed. A single
bounded direct request to the customs title-search URL completed with HTTP 200
in 219ms outside the Worker, so the failure was isolated to the Worker
response deadline rather than an invalid URL or an allowed-source policy
change.

Commit `a97d6839` extends the deadline only for the one-per-run core-code title
lookup to a bounded 45 seconds (`CORE_CODE_TIMEOUT_MS`); the normal catalogue
deadline remains 20 seconds and the robots 20-second crawl delay, sequential
pacer and distributed lock are unchanged. The focused catalog/core-code suite
passed 28/28, followed by type-check, lint, artifact dry-run and diff checks.
The staging-only deployment is Worker version
`703677e4-0236-4b21-8c0f-628775deffc4`; production was not deployed or changed.

The first run using the new version started at 15:04:13.885Z. At the
15:05Z read-only probe, `economic_procedure` had advanced to attempt 7 with
`last_error_code=NULL` (its prior repeated timeout no longer recurred on that
lookup), while `customs` and `housing` remain retrying and are awaiting their
rotated bounded attempts. The run is still active; no completion or release
gate is claimed. Current core-code and checkpoint completion, queue freeze,
snapshot, evaluation, restore and CI gates remain unproven.

At the 15:16Z sequential D1 probe, the economic-procedure fetch had
materialized one additional canonical document. Totals were 17 canonical
documents, 23 language variants, 5,701 unique current provisions and 17,393
indexed current chunks. The job ledger was 24 completed and 39 queued fetch
jobs, 140 completed, one running and 1,954 queued version jobs. The 15:12Z
scheduled run still held a renewed lock without a run-level error; `customs`
and `housing` remained retrying core-code targets and the economic target was
awaiting reconciliation. Terminal/dead-letter counts remain zero, while the
queue, checkpoint, snapshot, evaluation, restore and CI gates remain open.

The 15:20:13.672Z staging run reconciled `economic_procedure` to indexed and
then advanced the `customs` title pager with the extended core-code deadline:
at the 15:21Z probe it was on page 1 with a valid Lex postback target and
`last_error_code=NULL` (attempt 10). `housing` is the only remaining core-code
target still carrying the historical timeout row. The run remains active
under the renewed distributed lock with no run-level error. This confirms the
timeout mitigation is progressing the previously blocked core-code phase; it
does not establish 44/44 checkpoints or the release gate.

The same run completed the `economic_procedure` title pager at
15:12:13.000Z and moved that target to `awaiting_ingestion` with official
source `https://lex.uz/ru/docs/3523895` (`lexuz:3523895`), with no error code.
The corresponding fetch job completed at 15:13:03.119Z and produced only
queued version work; it will be reconciled to `indexed` on a subsequent run.
At 15:15Z the 15:12:13.670Z scheduled run remained active with a renewed
lease and no run-level error. `customs` and `housing` remain the only
unresolved core-code title targets. This is measurable staging progress, not
a claim of checkpoint completion or release readiness.

## Lease-expiry follow-up: long ingestion phases and staging redeploy (2026-08-21, 15:40–15:56Z)

The 15:20:13.672Z run was terminalized by the scheduler at 15:40:13.685Z
with `LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED`. Its long-running historical job
`legal-version:80ba4b348949078aeb17b4bbd347`
(`https://lex.uz/ru/docs/97664?ONDATE=13.09.2019`) had no durable update after
15:23:28.712Z. The earlier batch-level heartbeat fix did not cover the
pre-batch provision/chunk hashing and language/revision queue phases, so this
was recorded as a new actionable scheduler failure rather than treated as a
successful run.

Commit `e6ea7ef4` adds bounded heartbeat calls after fetch, normalization,
parsing, R2/header writes and D1 batches, plus every 64 provision/chunk hashes
and every four language/revision queue operations. The historical regression
now asserts phase/queue heartbeat activity. `apps/platform/tests/legal-corpus-ingestion.test.ts`
passed 35/35 and `apps/platform/tests/legal-corpus-worker-boundary.test.ts`
passed 20/20; type-check, lint, staging artifact dry-run and `git diff --check`
also passed. The commit was pushed to `feature/full-legal-corpus` and deployed
only to staging Worker version `e9e2b6a2-96dc-4a94-aa6a-db9a0e625f24`.

The first post-deploy run (`b03b1e81-6e73-4b37-a962-b0cecb2a6af2`,
15:48:13.666Z) completed at 15:54:45.852Z without a run-level error; its
distributed lease was renewed through 16:09Z while the historical job was
processed. Staging now has 178 completed and 2,011 queued ingestion jobs, no
running job, and zero terminal/dead-letter jobs. The failure ledger still has
three retrying evidence rows (one generic ingestion retry and two prior stale
running timeouts), so unresolved-failure and queue-freeze gates remain open.

The materialized read-only totals are 18 canonical documents, 17,524 active
provisions and 139,703 indexed chunks. Core-code reconciliation is 17
`indexed`, one `awaiting_ingestion` and `customs` still `retrying` at pager
page 1 with valid postback state; all 44 discovery checkpoints remain
`queued`. These counts are progress only: release floors, 44/44 checkpoints,
zero unresolved failures, queue freeze, snapshot, indexed evaluation,
Qdrant/D1 restore and CI gates remain unproven. Production remains untouched.

The following scheduled run (`2f68c2fa-4b35-4b51-a34a-241a983227dd`,
15:56:13.861Z) processed another bounded historical batch for 12 minutes and
completed cleanly at 16:08:29.104Z. Its lease heartbeat remained valid through
the entire run; no new scheduler-expiry or terminal/dead-letter row appeared.
The queue is now 182 completed and 2,007 queued jobs. This second long-run
observation confirms the phase-level heartbeat fix across consecutive staging
invocations; it does not change the open customs/checkpoint, queue-freeze,
snapshot, evaluation, restore or CI gates.

## Core-code customs pager continuation fix (2026-08-21, 16:12–16:35Z)

The customs title search was independently reproduced against Lex.uz with its
robots policy and one sequential ASP.NET session: the exact current title is
not on page 1, appears on page 3 as `/ru/docs/2876352` (the older exact-title
result is `/ru/docs/184744`), and page 4 contains the adoption act
`/ru/docs/90324`. The staging target repeatedly reached page 1, then the
15-minute source-session expired before the next cron invocation became free
after a long historical batch; the pager was reset and checkpoints could not
unlock. This is a repeatable scheduler/source-session interaction, not a
terminal legal-source failure.

Commit `ae32d4a8` adds a bounded continuation request inside the same
sequential Worker run when a core-code pager is live. One of the existing
document-ingestion slots is reserved for that continuation, so the total
source-request budget is unchanged and no parallel crawl is introduced. The
regression is covered by the new worker-boundary test; the focused suites pass
21/21 worker tests and 35/35 ingestion tests, followed by type-check, lint,
staging artifact dry-run and diff checks. The fix was pushed to
`feature/full-legal-corpus` and deployed only to staging Worker version
`b429f8d3-ced7-4edc-864c-534665d015c7`.

The 16:12:13.903Z run was already executing the previous Worker version when
the deploy completed and remained active at the 16:34Z probe; its old lease is
still bounded through 16:37:42.662Z. No result from that run is attributed to
the continuation fix. The next available staging invocation must be observed
for page 2/page 3 progress before checkpoints or release readiness can be
claimed. Production remains untouched.

## Sequential laws-catalog progress (2026-08-21, 17:32–17:51Z)

Read-only D1 probes observed the bounded staging worker continuing under its
distributed lease. Runs `0e1a1462-f7ff-4507-9cad-f5e49c542ac7` and
`76df3b56-2087-40a5-8996-06b160b13726` completed with retryable
`LEX_CATALOG_TIMEOUT`; the subsequent `b2b94900-e9ab-46c2-890b-e92c69988fde`
run also ended with that retryable code, and `b200ce4a-5d08-4990-9e8f-7e78324b7b72`
was running at the latest probe. The lease was refreshed throughout; no
terminal or dead-letter failure was recorded.

The laws catalogue has durable progress in all four language checkpoints:
Russian 60 documents/page 2, English 60/page 3, Uzbek Cyrillic 60/page 3 and
Uzbek Latin 60/page 1. The Cyrillic and Russian rows each retain a
`LEX_CATALOG_DUPLICATE_PAGE` marker while their undeclared pagers are retried;
this is not a terminal failure and the immutable discovery ledger remains the
source of truth. Other 40 checkpoints remain queued, so the required 44/44
completion gate is open.

The latest materialized totals were 24 canonical documents, 30 language
variants, 6,383 distinct current provisions (18,253 current provision rows),
18,263 indexed current chunks and 2,006 queued/retrying live-or-manual jobs.
The failure ledger contained one `LEGAL_CORPUS_INGESTION_FAILED` and three
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows, all `retrying`; terminal/dead-letter
count was zero. Queue freeze, release floors, snapshot, indexed 314-scenario
evaluation, Qdrant/D1 restore and CI gates remain unproven. Production was not
changed.

## Laws checkpoint completion progress (2026-08-21, 17:55–17:58Z)

The `b200ce4a-5d08-4990-9e8f-7e78324b7b72` run completed at 17:55:34Z with
retryable `LEX_CATALOG_TIMEOUT`; the next sequential run
`39ec64a7-9807-4fd3-b64f-580c321d20e4` was active at the latest probe. The
Russian laws checkpoint completed at 17:57:32Z after its undeclared pager
reached page 3 (60 durable discovery records). English was processing its
page-one retry with a transient timeout marker; Uzbek Cyrillic and Uzbek Latin
remain queued with 60 durable records each. Thus 1/44 checkpoints is complete,
43 remain open, and no terminal/dead-letter failure exists.

The materialized totals remain 25 canonical documents, 31 language variants,
6,399 distinct current provisions (18,285 current provision rows) and 18,295
indexed current chunks. The live/manual queue is 2,002 jobs. The failure ledger
contains one retrying `LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter count is zero.
Release floors, queue freeze, snapshot, evaluation, Qdrant/D1 restore and CI
remain unproven. Production remains untouched.

## Second laws checkpoint completed (2026-08-21, 18:04–18:07Z)

The sequential run `39ec64a7-9807-4fd3-b64f-580c321d20e4` completed with its
retryable `LEX_CATALOG_TIMEOUT`; run `da054cf6-e3cf-45ed-92c6-1c0ea0cd0c78`
then acquired the distributed lease. During that transition the Uzbek Latin
laws checkpoint completed at page 3 with 60 durable discovery records. The
English and Uzbek Cyrillic checkpoints each retain a retryable duplicate-page
marker while their undeclared pagers resume; Russian remains completed.

The checkpoint ledger is now 2 completed and 42 queued. Materialized totals
are 27 canonical documents, 6,441 distinct current provisions (18,343 current
provision rows), 18,353 indexed current chunks and 1,997 queued/retrying
live-or-manual jobs. The failure ledger is unchanged at one retrying
`LEGAL_CORPUS_INGESTION_FAILED` plus three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter count remains
zero. The release thresholds, queue freeze and all post-ingestion gates remain
open; production is untouched.

## Clean sequential ingestion run (2026-08-21, 18:04–18:11Z)

Run `da054cf6-e3cf-45ed-92c6-1c0ea0cd0c78` completed at 18:11:25.996Z with
no run-level error after processing the historical/version queue under the
phase heartbeat. The laws checkpoint ledger remained 2 completed and 42
queued: Russian and Uzbek Latin completed; English and Uzbek Cyrillic retain
retryable duplicate-page state. No terminal or dead-letter failure appeared.

The latest materialized totals were 27 canonical documents, 6,441 distinct
current provisions, 18,343 current provision rows and 18,353 indexed chunks;
1,994 live-or-manual jobs remained queued/retrying. The failure ledger still
contained only one retrying `LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows. Queue freeze, release floors,
remaining checkpoints, snapshot/evaluation, Qdrant/D1 restore and CI gates
remain open. Production was not changed.

## Third laws checkpoint completed (2026-08-21, 18:12–18:14Z)

Run `41318e3b-570d-4c6b-90a0-3ca74b29705c` acquired the lease after the clean
prior run. The Uzbek Cyrillic laws checkpoint completed at page 3 with 60
durable records, bringing the laws-family progress to three completed
checkpoints (Russian, Uzbek Latin and Uzbek Cyrillic). English is retrying a
transient `LEX_CATALOG_TIMEOUT` from page 2; its immutable discovery ledger is
preserved for the next bounded attempt. Forty other checkpoints remain queued.

The latest totals are 28 canonical documents, 6,441 distinct current
provisions, 18,343 current provision rows and 18,353 indexed chunks, with
1,994 live-or-manual jobs queued/retrying. The failure ledger still has one
retrying `LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter count is zero.
Release floors, queue freeze, the final checkpoint, post-ingestion gates and
CI remain unproven. Production remains untouched.

## Laws family complete; government family opened (2026-08-21, 18:24–18:26Z)

The next scheduled run `1b24e10b-9c5c-4327-bc7b-b9b34ab4d64d` resumed the
previous English pager retry. The English laws checkpoint completed at page 3
with 60 durable discovery records, so all four laws language checkpoints are
now `completed` (4/44). The worker then opened the next approved priority
family, `government`, with the English checkpoint running; this is the Cabinet
and government-acts stage in the configured Lex catalogue order.

The materialized totals at the transition were 28 canonical documents, 6,457
distinct current provisions, 18,391 current provision rows and 18,401 indexed
chunks, with 1,988 live-or-manual jobs queued/retrying. No terminal or
dead-letter failure was recorded; the existing retrying ingestion rows remain
bounded and unchanged. Queue freeze, remaining 40 checkpoints, release floors,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain open. Production was
not changed.

## Government/PKM discovery progress (2026-08-21, 18:32–18:37Z)

Run `21a69220-2281-40d7-819a-2e4a05b57b5f` moved the approved government
family forward after the laws family closed. Its four language checkpoints
have each discovered 20 page-one records; the run is still processing the
bounded fetch/version queue, so none of the government checkpoints is complete
yet. The staging ledger is 4 completed and 40 queued checkpoints.

Materialized totals reached 30 canonical documents, 6,520 distinct current
provisions, 18,490 current provision rows and 18,500 indexed chunks. The
live-or-manual queue is 1,981 jobs. The failure ledger remains one retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows, with zero terminal/dead-letter
failures. Release floors, queue freeze and all post-ingestion gates remain
open; production was not changed.

## Government/PKM sequential continuation (2026-08-21, 18:40–18:52Z)

The bounded government-family runs continued under the single distributed
lease. Run `754e344f-43c6-43c3-abc4-0e307073e6fc` ended at 18:47:27.771Z with
the allow-listed retryable `LEX_CATALOG_TIMEOUT`; the next run
`617d6764-e0f5-4e47-a6f9-a0cd21ebd40a` was active at the final probe. Russian
and English government checkpoints advanced to page 2 (40 discovered records
each); Uzbek Latin and Uzbek Cyrillic remain at page 2 with 40 records each.
No checkpoint was marked complete prematurely.

The latest read-only totals are 32 canonical documents, 6,564 distinct
current provisions, 18,553 indexed current chunks and 1,975 live-or-manual
jobs queued/retrying. The failure ledger still contains one retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter count remains
zero. The release floors, 44-checkpoint completion, queue freeze, snapshot,
314-scenario evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 01:24–01:29Z)

Run `7f48486a-8d73-482c-a2cf-8f470f287bd0` completed normally from
`2026-08-22T01:24:56.208Z` to `2026-08-22T01:29:10.310Z` with no run-level
error. The bounded sequential worker advanced the non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru`, `uz-Cyrl`, and
`uz-Latn` each reached page 30 with 600 discovered documents. The empty `en`
checkpoint remains completed with zero discovered documents; the three
non-empty language checkpoints remain queued for their next bounded
continuation.

Final read-only totals were 80 canonical documents, 86 language variants,
7,610 current unique provisions, 21,071 indexed chunks, and 1,785 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 01:16–01:21Z)

Run `8acc97b6-a9af-40ea-a4f7-f6544536bdbd` completed from
`2026-08-22T01:16:56.203Z` to `2026-08-22T01:21:01.096Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`; no terminal run failure was
recorded. The bounded sequential worker advanced the non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru` and `uz-Latn` each
reached page 29 with 580 discovered documents, while `uz-Cyrl` reached page 28
with 560 discovered documents. The empty `en` checkpoint remains completed
with zero discovered documents; the three non-empty language checkpoints
remain queued for their next bounded continuation.

Final read-only totals were 79 canonical documents, 85 language variants,
7,467 current unique provisions, 20,089 indexed chunks, and 1,789 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 01:08–01:12Z)

Run `e95d4f13-7b3e-4eff-97d8-f8c510e89c69` completed normally from
`2026-08-22T01:08:56.204Z` to `2026-08-22T01:12:59.495Z` with no run-level
error. The bounded sequential worker advanced the non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru` reached page 28 with
560 discovered documents, `uz-Cyrl` reached page 27 with 540 discovered
documents, and `uz-Latn` reached page 28 with 560 discovered documents. The
empty `en` checkpoint remains completed with zero discovered documents; the
three non-empty language checkpoints remain queued for their next bounded
continuation.

Final read-only totals were 78 canonical documents, 84 language variants,
7,456 current unique provisions, 20,073 indexed chunks, and 1,793 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 01:00–01:05Z)

Run `744c888c-3b99-4bf6-a760-1c99f1bd0ba4` completed from
`2026-08-22T01:00:56.371Z` to `2026-08-22T01:05:00.531Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`; no terminal run failure was
recorded. The bounded sequential worker advanced the non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru` reached page 27 with
540 discovered documents, while `uz-Cyrl` and `uz-Latn` each reached page 26
with 520 discovered documents. The empty `en` checkpoint remains completed
with zero discovered documents; the three non-empty language checkpoints
remain queued for their next bounded continuation.

Final read-only totals were 77 canonical documents, 83 language variants,
7,445 current unique provisions, 20,050 indexed chunks, and 1,797 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 00:52–00:56Z)

Run `6daee949-734a-4069-8746-48b78bd95611` completed normally from
`2026-08-22T00:52:56.205Z` to `2026-08-22T00:56:59.316Z` with no run-level
error. The bounded sequential worker advanced the non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru` reached page 26 with
520 discovered documents, while `uz-Cyrl` and `uz-Latn` each reached page 25
with 500 discovered documents. The empty `en` checkpoint remains completed
with zero discovered documents; the three non-empty language checkpoints
remain queued for their next bounded continuation.

Final read-only totals were 76 canonical documents, 82 language variants,
7,439 current unique provisions, 20,040 indexed chunks, and 1,801 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 00:44–00:49Z)

Run `22dc6841-313b-4834-abc5-6d77816e5afe` completed normally from
`2026-08-22T00:44:56.206Z` to `2026-08-22T00:49:00.026Z` with no run-level
error. The bounded sequential worker advanced the non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru`, `uz-Cyrl`, and
`uz-Latn` each reached page 24 with 480 discovered documents. The empty `en`
checkpoint remains completed with zero discovered documents; the three
non-empty language checkpoints remain queued for their next bounded
continuation.

Final read-only totals were 75 canonical documents, 81 language variants,
7,430 current unique provisions, 20,020 indexed chunks, and 1,804 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 00:36–00:41Z)

Run `8c733c1b-2a02-4eca-9d32-5b56f3d50994` completed from
`2026-08-22T00:36:56.208Z` to `2026-08-22T00:41:00.370Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`; no terminal run failure was
recorded. The bounded sequential worker advanced the non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru` and `uz-Cyrl` each
reached page 23 with 460 discovered documents, while `uz-Latn` reached page 22
with 440 discovered documents. The empty `en` checkpoint remains completed
with zero discovered documents; the three non-empty language checkpoints
remain queued for their next bounded continuation.

Final read-only totals were 74 canonical documents, 80 language variants,
7,415 current unique provisions, 20,001 indexed chunks, and 1,808 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 00:28–00:33Z)

Run `ff8221dc-24d6-4aa6-b248-33310824fb41` completed normally from
`2026-08-22T00:28:56.205Z` to `2026-08-22T00:33:02.157Z` with no run-level
error. The bounded sequential worker advanced the non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru` and `uz-Cyrl` each
reached page 22 with 440 discovered documents, while `uz-Latn` reached page 21
with 420 discovered documents. The empty `en` checkpoint remains completed
with zero discovered documents; the three non-empty language checkpoints
remain queued for their next bounded continuation.

Final read-only totals were 73 canonical documents, 79 language variants,
7,407 current unique provisions, 19,987 indexed chunks, and 1,812 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 00:20–00:25Z)

Run `9de04d8f-b7e5-410b-928f-fe2ff818dd4f` completed from
`2026-08-22T00:20:56.216Z` to `2026-08-22T00:25:02.637Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`; no terminal run failure was
recorded. The bounded sequential worker advanced the non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru` reached page 21 with
420 discovered documents, while `uz-Cyrl` and `uz-Latn` each reached page 20
with 400 discovered documents. The empty `en` checkpoint remains completed
with zero discovered documents; the three non-empty language checkpoints
remain queued for their next bounded continuation.

Final read-only totals were 72 canonical documents, 78 language variants,
7,341 current unique provisions, 19,896 indexed chunks, and 1,815 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 00:12–00:17Z)

Run `37d36564-b8ac-46a2-b406-33d574695560` completed normally from
`2026-08-22T00:12:56.209Z` to `2026-08-22T00:17:02.427Z` with no run-level
error. The bounded sequential worker advanced the non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru` reached page 20 with
400 discovered documents, while `uz-Cyrl` and `uz-Latn` each reached page 19
with 380 discovered documents. The empty `en` checkpoint remains completed
with zero discovered documents; the three non-empty language checkpoints
remain queued for their next bounded continuation.

Final read-only totals were 71 canonical documents, 77 language variants,
7,333 current unique provisions, 19,885 indexed chunks, and 1,819 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 00:04–00:09Z)

Run `6693b73a-2be4-4938-bd13-370cb5784fcc` completed normally from
`2026-08-22T00:04:56.205Z` to `2026-08-22T00:09:03.367Z` with no run-level
error. The bounded sequential worker advanced all three non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru`, `uz-Cyrl`, and
`uz-Latn` each reached page 18 with 360 discovered documents. The empty `en`
checkpoint remains completed with zero discovered documents; the three
non-empty language checkpoints remain queued for their next bounded
continuation.

Final read-only totals were 70 canonical documents, 76 language variants,
7,324 current unique provisions, 19,870 indexed chunks, and 1,822 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-21, 23:56–2026-08-22 00:01Z)

Run `213f7c1b-e0f1-4822-9560-743962a8cc5e` completed from
`2026-08-21T23:56:56.210Z` to `2026-08-22T00:01:04.109Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The bounded sequential worker
advanced the Oliy Majlis catalogues without force-completing checkpoints: `ru`
reached page 17 (340 discovered), `uz-Cyrl` page 16 (320 discovered), and
`uz-Latn` page 17 (340 discovered). The empty `en` checkpoint remains
completed with zero discovered documents; the three non-empty language
checkpoints remain queued for their next bounded continuation.

Final read-only totals were 69 canonical documents, 75 language variants,
7,288 current unique provisions, 19,810 indexed chunks, and 1,825 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-21, 23:48–23:53Z)

Run `55ed4360-b78d-4758-a185-f3f97f9c86cd` completed normally from
`2026-08-21T23:48:56.206Z` to `2026-08-21T23:53:03.075Z` with no run-level
error. The bounded sequential worker advanced the Oliy Majlis catalogues
without force-completing checkpoints: `ru` and `uz-Latn` each reached page 16
with 320 discovered documents, while `uz-Cyrl` reached page 15 with 300.
The empty `en` checkpoint remains completed with zero discovered documents;
the three non-empty language checkpoints remain queued for their next bounded
continuation.

Final read-only totals were 68 canonical documents, 74 language variants,
7,272 current unique provisions, 19,786 indexed chunks, and 1,829 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-21, 23:40–23:45Z)

Run `47882d2d-0456-4c49-8c52-fec04105625b` completed from
`2026-08-21T23:40:56.224Z` to `2026-08-21T23:45:03.154Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The bounded sequential worker
advanced the Oliy Majlis catalogues without force-completing checkpoints: `ru`
reached page 15 (300 discovered), while `uz-Cyrl` and `uz-Latn` each reached
page 14 (280 discovered). The empty `en` checkpoint remains completed with
zero discovered documents; the three non-empty language checkpoints remain
queued for their next bounded continuation.

Final read-only totals were 67 canonical documents, 73 language variants,
7,248 current unique provisions, 19,750 indexed chunks, and 1,833 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-21, 23:32–23:37Z)

Run `dd895691-ccf6-4347-bb0f-d2f0937387ae` completed normally from
`2026-08-21T23:32:56.208Z` to `2026-08-21T23:37:02.432Z` with no run-level
error. The sequential worker advanced the Oliy Majlis catalogues without
force-completing checkpoints: `ru` reached page 14 (280 discovered), while
`uz-Cyrl` and `uz-Latn` each reached page 13 (260 discovered). The empty `en`
checkpoint remains completed with zero discovered documents; all three
non-empty language checkpoints remain queued for their next bounded
continuation.

Final read-only totals were 66 canonical documents, 72 language variants,
7,247 current unique provisions, 19,749 indexed chunks, and 1,837 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-21, 23:24–23:29Z)

Run `1b6b19a8-09ca-4677-bf76-72417d8fcd1f` completed normally from
`2026-08-21T23:24:56.211Z` to `2026-08-21T23:29:04.053Z` with no run-level
error. The bounded sequential worker advanced the Oliy Majlis catalogues
without force-completing checkpoints: `ru`, `uz-Cyrl`, and `uz-Latn` each
reached page 12 with 240 discovered documents; the empty `en` checkpoint
remains completed with zero discovered documents. The three non-empty language
checkpoints remain queued for their next bounded continuation.

Final read-only totals were 65 canonical documents, 71 language variants,
7,241 current unique provisions, 19,736 indexed chunks, and 1,841 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-21, 23:16–23:21Z)

Run `6db0fe9a-92a6-4af5-bb1a-3e5d02d8afc3` completed from
`2026-08-21T23:16:56.207Z` to `2026-08-21T23:21:05.545Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The sequential worker advanced
the Oliy Majlis catalogues without force-completing checkpoints: `ru` reached
page 11 (220 discovered), `uz-Cyrl` page 11 (220 discovered), and `uz-Latn`
page 10 (200 discovered). The empty `en` checkpoint remains completed with
zero discovered documents; all three non-empty language checkpoints remain
queued for their next bounded continuation.

Final read-only totals were 64 canonical documents, 70 language variants,
7,235 current unique provisions, 19,730 indexed chunks, and 1,845 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-21, 23:08–23:13Z)

Run `fb68ed6d-63dd-482e-a049-6eba52c600a1` completed normally from
`2026-08-21T23:08:56.211Z` to `2026-08-21T23:13:08.759Z` with no run-level
error. The sequential worker advanced the Oliy Majlis catalogues without
force-completing checkpoints: `ru` reached page 10 (200 discovered),
`uz-Cyrl` page 10 (200 discovered), and `uz-Latn` page 9 (180 discovered).
The empty `en` checkpoint remains completed with zero discovered documents;
the three non-empty language checkpoints remain queued for their next bounded
continuation.

Final read-only totals were 63 canonical documents, 69 language variants,
7,197 current unique provisions, 19,687 indexed chunks, and 1,849 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-21, 23:00–23:05Z)

Run `57f091da-6528-40c0-8759-195d227b6cad` completed from
`2026-08-21T23:00:56.355Z` to `2026-08-21T23:05:08.795Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The bounded sequential worker
advanced Oliy Majlis catalogues without force-completing checkpoints: `ru`
reached page 9 (180 discovered), `uz-Cyrl` page 8 (160 discovered), and
`uz-Latn` page 8 (160 discovered). The empty `en` checkpoint remains completed
with zero discovered documents; all three non-empty language checkpoints
remain queued for their next bounded continuation.

Final read-only totals were 62 canonical documents, 68 language variants,
7,152 current unique provisions, 19,584 indexed chunks, and 1,853 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-21, 22:52–22:57Z)

Run `2267810b-e402-4c79-8b79-c248783487b8` completed normally from
`2026-08-21T22:52:56.208Z` to `2026-08-21T22:57:07.772Z` with no run-level
error. The sequential worker advanced the Oliy Majlis catalogues without
force-completing checkpoints: `ru` reached page 8 (160 discovered), while
`uz-Cyrl` and `uz-Latn` each reached page 7 (140 discovered). The empty `en`
checkpoint remains completed with zero discovered documents; the three
non-empty language checkpoints remain queued for their next bounded
continuation.

Final read-only totals were 61 canonical documents, 67 language variants,
7,147 current unique provisions, 19,576 indexed chunks, and 1,857 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-21, 22:44–22:49Z)

Run `f7f03f93-7ed9-40b0-bdfe-e8b93b94e9f6` completed normally from
`2026-08-21T22:44:56.212Z` to `2026-08-21T22:49:08.994Z` with no run-level
error. The bounded sequential worker advanced all three non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru`, `uz-Cyrl`, and
`uz-Latn` each reached page 6 with 120 discovered documents; the empty `en`
checkpoint remains completed with zero discovered documents. The three active
language checkpoints remain queued for their next bounded continuation.

Final read-only totals were 60 canonical documents, 66 language variants,
7,129 current unique provisions, 19,539 indexed chunks, and 1,861 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-21, 22:36–22:41Z)

Run `998f3c97-da6b-4307-8976-fe68466be481` completed from
`2026-08-21T22:36:56.207Z` to `2026-08-21T22:41:09.576Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The sequential worker advanced
the Oliy Majlis catalogue without force-completing checkpoints: `ru` reached
page 5 (100 discovered), `uz-Cyrl` page 4 (80 discovered), and `uz-Latn` page 5
(100 discovered); the empty `en` checkpoint remains completed with zero
discovered documents. All three non-empty checkpoints remain queued pending
their bounded continuation.

Final read-only totals were 59 canonical documents, 65 language variants,
7,113 current unique provisions, 19,512 indexed chunks, and 1,865 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-21, 22:28–22:33Z)

Run `ed9bdab1-150a-4b5e-af10-ee52b2910854` completed normally from
`2026-08-21T22:28:56.210Z` to `2026-08-21T22:33:10.384Z` with no run-level
error. The sequential worker advanced the Oliy Majlis catalogue without
force-completing any checkpoint: `ru` remained queued after page 4 (80
discovered), `uz-Cyrl` remained queued after page 3 (60 discovered), and
`uz-Latn` remained queued after page 4 (80 discovered); the previously empty
`en` checkpoint remains completed with zero discovered documents.

The final read-only totals were 58 canonical documents, 64 language variants,
7,112 current unique provisions, 19,511 indexed chunks, and 1,869 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze are therefore still unproven;
snapshot, evaluation, Qdrant/D1 restore gates and CI remain blocked by the
release gate. Production flags, corpus ingestion and deployment were not
changed.

## Oliy Majlis bounded run closure (2026-08-21, 22:20–22:25Z)

Run `c73660c7-263a-4f76-ad46-2d7a00d28af5` completed at 22:25:10.339Z with
the allow-listed retryable `LEX_CATALOG_TIMEOUT`. The Oliy Majlis Uzbek
Cyrillic ledger was preserved without force-completing a checkpoint.

The final read-only totals are 57 canonical documents, 63 language variants,
7,105 distinct current provisions and 19,498 indexed chunks, with 1,873
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-21, 22:12–22:17Z)

Run `c5e6786e-d1da-499a-bc3a-cc878212fc92` completed at 22:17:11.784Z with
no run-level error. The bounded worker preserved the Oliy Majlis catalogue
ledger and ingestion queue without force-completing a checkpoint.

The final read-only totals are 56 canonical documents, 62 language variants,
7,099 distinct current provisions and 19,492 indexed chunks, with 1,877
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## President and Oliy Majlis checkpoint completions (2026-08-21, 22:04–22:09Z)

Run `dd53b732-ac56-4a31-868f-c9778ebeff67` completed at 22:09:12.769Z with
no run-level error. Its bounded sequential work completed `president/ru` at
page 3 with 60 discovered records and completed `oliy_majlis/en` at page 1
with zero catalogue records; the latter is recorded as an empty source result,
not as fabricated coverage. No other queued checkpoint was force-completed.

The final read-only totals are 55 canonical documents, 61 language variants,
7,027 distinct current provisions and 19,365 indexed chunks, with 1,880
live-or-manual queued/retrying jobs. The checkpoint ledger is 13 completed
and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## President bounded run closure (2026-08-21, 21:56–22:02Z)

Run `d916c9f5-b8a1-4d5d-b5a5-daede7e1b5fb` completed at 22:02:00.754Z with
the allow-listed retryable `LEX_CATALOG_TIMEOUT`. The `president/ru`
checkpoint retained its page-two ledger and remains retrying; no checkpoint
was force-completed and the single sequential lease was preserved.

The final read-only totals are 54 canonical documents, 60 language variants,
7,017 distinct current provisions and 19,355 indexed chunks, with 1,883
live-or-manual queued/retrying jobs. The checkpoint ledger is 11 completed,
32 queued and 1 retrying. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## President checkpoint completions (2026-08-21, 21:48–21:53Z)

Run `ba09832d-c148-498c-a16e-cfac6f40d4df` completed at 21:53:12.817Z with
no run-level error. Its bounded sequential work completed the `president/en`
and `president/uz-Latn` checkpoints at page 3 with 60 discovered records each;
the remaining president language ledger was not force-completed.

The final read-only totals are 53 canonical documents, 59 language variants,
7,009 distinct current provisions and 19,340 indexed chunks, with 1,889
live-or-manual queued/retrying jobs. The checkpoint ledger is 11 completed
and 33 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## President bounded run closure (2026-08-21, 21:40–21:45Z)

Run `cae6ec00-70d0-4e61-b0ff-81929bd986fd` completed at 21:45:11.391Z with
the allow-listed retryable `LEX_CATALOG_TIMEOUT`. The single sequential lease
was preserved; no queued president checkpoint was force-completed.

The final read-only totals are 52 canonical documents, 58 language variants,
6,982 distinct current provisions and 19,289 indexed chunks, with 1,892
live-or-manual queued/retrying jobs. The checkpoint ledger remains 9
completed and 35 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## President checkpoint completion (2026-08-21, 21:32–21:37Z)

Run `5a405f0e-6459-4c84-b930-71d5aa60598d` completed at 21:37:10.162Z with
the allow-listed retryable `LEX_CATALOG_TIMEOUT`. Its bounded sequential work
completed the `president/uz-Cyrl` checkpoint at page 3 with 60 discovered
records; the other three president language checkpoints remain queued and were
not force-completed.

The final read-only totals are 51 canonical documents, 57 language variants,
6,977 distinct current provisions and 19,282 indexed chunks, with 1,896
live-or-manual queued/retrying jobs. The checkpoint ledger is 9 completed and
35 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## President bounded run closure (2026-08-21, 21:24–21:29Z)

Run `a6226e1a-33a4-4e88-b298-4ab838060497` completed at 21:29:12.252Z with
no run-level error. It preserved the single sequential lease and did not
force-complete any discovery checkpoint.

The final read-only totals are 50 canonical documents, 56 language variants,
6,975 distinct current provisions and 19,280 indexed chunks, with 1,900
live-or-manual queued/retrying jobs. The checkpoint ledger remains 8
completed and 36 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## President bounded run closure (2026-08-21, 21:16–21:21Z)

Run `7f9f33ae-c016-486c-a174-bd0a0d4149a2` closed at 21:21:14.884Z with
the allow-listed retryable `LEX_CATALOG_TIMEOUT`. It preserved the single
sequential lease and did not force-complete the president checkpoint.

The final read-only totals remain 49 canonical documents, 55 language
variants, 6,960 distinct current provisions and 19,260 indexed chunks, with
1,904 live-or-manual queued/retrying jobs. The checkpoint ledger is 8
completed and 36 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## President run closure (2026-08-21, 21:08–21:13Z)

Run `ae75c826-6892-4f48-aef8-0b65171da4f8` completed at 21:13:14.548Z with
no run-level error. It retained the single bounded lease and drained the
available ingestion work without force-completing a discovery checkpoint.

The final read-only probe remains at 48 canonical documents, 54 language
variants, 6,953 distinct current provisions and 19,240 indexed chunks, with
1,908 live-or-manual queued/retrying jobs. The checkpoint ledger is 8
completed and 36 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## President ingestion materialized continuation (2026-08-21, 21:00–21:05Z)

Run `568315c0-5105-4bef-9644-e31d72373e5a` closed at 21:05:15.708Z with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The bounded worker materialized
one additional canonical document and preserved the president discovery
ledger; no checkpoint was force-completed. At the final read-only probe, the
checkpoint ledger was 8 completed and 36 queued, with no running checkpoint.

Read-only totals reached 47 canonical documents, 53 language variants, 6,944
distinct current provisions and 19,216 indexed chunks, with 1,912
live-or-manual queued/retrying jobs. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## President page-two continuation (2026-08-21, 21:00–21:03Z)

Run `568315c0-5105-4bef-9644-e31d72373e5a` acquired the single distributed
lease at 21:00:56.276Z and remained active at the 21:02:23.577Z probe. The
president Uzbek Cyrillic checkpoint advanced to page 2 with 40 discovered
records and remains running for the bounded next page. English retained its
allow-listed `LEX_CATALOG_TIMEOUT` retry marker; neither state was force-
completed.

Read-only totals remain 46 canonical documents, 52 language variants, 6,924
distinct current provisions and 19,192 indexed chunks, with 1,916
live-or-manual queued/retrying jobs. The global checkpoint ledger is 8
completed, 35 queued and 1 running. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## President ingestion materialized continuation (2026-08-21, 20:48–20:57Z)

Run `36c9e777-bfe0-42b3-9f98-9d070f8a7e71` remained under the single
distributed lease through the 20:56:29.246Z probe. Discovery checkpoint rows
were not running or retrying at the final probe; the worker continued the
bounded ingestion/version queue without force-completing any catalogue state.

Read-only totals reached 46 canonical documents, 52 language variants, 6,924
distinct current provisions and 19,192 indexed chunks, with 1,916
live-or-manual queued/retrying jobs. The global checkpoint ledger remains 8
completed and 36 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## President ingestion materialized progress (2026-08-21, 20:36–20:41Z)

Run `390469ab-17c6-4b25-bd0a-0fb0fcbe3524` remained under the single
distributed lease through the 20:40:29.485Z probe. The four president
language ledgers retain their page-one markers while the bounded fetch and
version queue materialized additional records; no page marker was force-
completed.

Read-only totals reached 45 canonical documents, 51 language variants, 6,923
distinct current provisions and 19,191 indexed chunks, with 1,922
live-or-manual queued/retrying jobs. The global checkpoint ledger remains 8
completed and 36 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## President multilingual page progress (2026-08-21, 20:36–20:40Z)

Run `390469ab-17c6-4b25-bd0a-0fb0fcbe3524` remained under the single
distributed lease through the 20:39:24.514Z probe. The president catalogue
now has 20 discovered records on page 1 in each of RU, Uzbek Cyrillic, Uzbek
Latin and English. All four ledgers remain queued for their next bounded page;
the Russian timeout was preserved as retryable and no checkpoint was force-
completed.

Read-only totals remain 44 canonical documents, 50 language variants, 6,913
distinct current provisions and 19,165 indexed chunks, with 1,924
live-or-manual queued/retrying jobs. The global checkpoint ledger remains 8
completed and 36 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## President catalogue materialized progress (2026-08-21, 20:28–20:34Z)

Run `699ddffa-e87d-4f84-8b01-4f51d4bd8fb2` remained under the single
distributed lease through the 20:33:32.747Z probe. The president English
checkpoint advanced through its first page with 20 discovered records and
returned to queued state for the next bounded page; no timeout or duplicate
response was force-completed.

Read-only totals reached 44 canonical documents, 50 language variants, 6,913
distinct current provisions and 19,165 indexed chunks, with 1,926
live-or-manual queued/retrying jobs. The global checkpoint ledger remains 8
completed and 36 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## Government-to-president checkpoint transition (2026-08-21, 20:28–20:31Z)

Run `699ddffa-e87d-4f84-8b01-4f51d4bd8fb2` acquired the single distributed
lease at 20:28:13.665Z and remained active at the 20:30:44.093Z probe. The
government Uzbek Cyrillic checkpoint completed after its preserved page-six
retry. The next priority family, `president/en`, is now running from page 0;
no duplicate or timeout state was force-completed.

Read-only totals remain 43 canonical documents, 49 language variants, 6,901
distinct current provisions and 19,130 indexed chunks, with 1,928
live-or-manual queued/retrying jobs. The global checkpoint ledger is now 8
completed and 35 queued, with the president English checkpoint running. The
failure ledger remains two retrying `LEGAL_CORPUS_INGESTION_FAILED` and three
retrying `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter
remains zero. Release floors, queue freeze, snapshot/evaluation, Qdrant/D1
restore and CI gates remain unproven; production is untouched.

## Government/PKM materialized progress (2026-08-21, 20:16–20:18Z)

Run `f1853ca2-ff74-495e-ad67-9595ba1b37bb` acquired the single distributed
lease at 20:16:13.664Z and remained active at the 20:17:48.221Z probe. The
government Uzbek Cyrillic checkpoint is retrying its preserved page-six
catalogue after the allow-listed `LEX_CATALOG_TIMEOUT`; this is not a terminal
failure and was not force-completed.

Read-only totals reached 43 canonical documents, 49 language variants, 6,901
distinct current provisions and 19,130 indexed chunks, with 1,934
live-or-manual queued/retrying jobs. The global checkpoint ledger is 7
completed, 36 queued and 1 retrying. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## Government/PKM materialized progress (2026-08-21, 20:08–20:14Z)

The same bounded run `e1183cbb-a470-446d-8df3-b152fb4e1262` remained under
the single distributed lease through the 20:13:03.162Z probe. Its English
government checkpoint is complete; Uzbek Cyrillic retains page 6 with 120
discovered records for the next attempt. No duplicate or timeout response was
force-completed.

Read-only totals reached 42 canonical documents, 48 language variants, 6,839
distinct current provisions and 19,045 indexed chunks, with 1,936
live-or-manual queued/retrying jobs. The global checkpoint ledger remains 7
completed and 37 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## Government/PKM checkpoint advancement (2026-08-21, 20:08–20:11Z)

Run `e1183cbb-a470-446d-8df3-b152fb4e1262` acquired the single distributed
lease at 20:08:13.666Z and remained active at the final 20:10:39.529Z probe.
The English government checkpoint completed at page 3. Uzbek Cyrillic
advanced to page 6 with 120 discovered records and remains queued for the
next bounded attempt; its page marker was preserved rather than treated as a
successful completion. The global checkpoint ledger is now 7 completed and 37
queued.

Read-only totals remain 41 canonical documents, 47 language variants, 6,833
distinct current provisions and 19,036 indexed chunks, with 1,939
live-or-manual queued/retrying jobs. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## Government/PKM materialized continuation (2026-08-21, 20:00–20:05Z)

Run `592ce653-8d10-437d-ab7b-90deb2d47eb3` acquired the single distributed
lease at 20:00:13.672Z and remained active at the 20:04:40.377Z probe. It
continued the preserved government page markers; English and Uzbek Cyrillic
remain queued after duplicate-page handling, so no checkpoint was force-
completed.

Read-only totals reached 41 canonical documents, 47 language variants, 6,833
distinct current provisions and 19,036 indexed chunks, with 1,941
live-or-manual queued/retrying jobs. The global checkpoint ledger remains 6
completed and 38 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## Government/PKM checkpoint progress (2026-08-21, 19:52–19:55Z)

Run `51198d26-2b64-454c-8532-6179cc9ec1c1` acquired the distributed lease at
19:52:13.665Z and remained active at the final probe. Its bounded catalogue
work completed the Russian and Uzbek Latin government checkpoints at page 3;
the English and Uzbek Cyrillic ledgers remain queued for their preserved page
markers. The global checkpoint ledger is now 6 completed and 38 queued (all
four laws languages plus two government languages); no duplicate or timeout
was force-completed.

Read-only totals reached 40 canonical documents, 46 language variants, 6,827
distinct current provisions and 19,025 indexed chunks, with 1,946
live-or-manual queued/retrying jobs. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## Government/PKM materialized progress (2026-08-21, 19:43–19:49Z)

Run `000c4a9a-a0e6-4c0c-9e27-52d13508a132` closed at 19:43:11.648Z with
the allow-listed retryable `LEX_CATALOG_TIMEOUT`; run
`cd661ead-68e5-4fc4-a6c6-76e68ba9efba` then acquired the single distributed
lease and was still running at the final 19:49:35.376Z probe. The four
government language ledgers each retain 60 discovered records (pages 2–3,
with duplicate-page markers preserved), while the global checkpoint ledger is
4 completed and 40 queued. No retryable catalogue state was force-completed.

Read-only totals reached 39 canonical documents, 45 language variants, 6,821
distinct current provisions and 19,016 indexed chunks, with 1,949
live-or-manual queued/retrying jobs. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## Government/PKM run transition (2026-08-21, 19:35–19:37Z)

Run `690b1beb-d449-4b90-a0ee-dc3739874be9` closed at 19:35:18.244Z with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The next run
`000c4a9a-a0e6-4c0c-9e27-52d13508a132` acquired the single distributed lease
and started the Russian government checkpoint from its preserved page-three
ledger. The checkpoint ledger is 4 completed, 1 running and 39 queued; no
retryable catalogue state was force-completed and terminal/dead-letter remains
zero.

Read-only totals remain 37 canonical documents, 43 language variants, 6,748
distinct current provisions and 18,917 indexed chunks, with 1,954
live-or-manual queued/retrying jobs. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI remain unproven; production is
untouched.

## Government/PKM continued cataloguing (2026-08-21, 19:28–19:32Z)

Run `690b1beb-d449-4b90-a0ee-dc3739874be9` continued the single sequential
government stream. Uzbek Latin reached page 3 with 60 durable records; the
English ledger is at page 1, Uzbek Cyrillic is queued with its duplicate-page
marker, and Russian retains page 3. All four laws checkpoints remain
completed, and no retryable catalogue response was treated as completion.

The latest read-only totals are 37 canonical documents, 43 language variants,
6,748 distinct current provisions and 18,917 indexed chunks, with 1,957
live-or-manual queued/retrying jobs. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter is zero. The
release floors, queue freeze and post-ingestion gates remain unproven;
production is untouched.

## Government/PKM run closure and retry preservation (2026-08-21, 19:27–19:29Z)

Run `b6fe86c1-8432-443e-b6ec-bb6fc3977a8b` closed at 19:27:31.266Z with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The next run
`690b1beb-d449-4b90-a0ee-dc3739874be9` acquired the single lease; its Uzbek
Cyrillic government checkpoint is running and English remains retrying from a
preserved timeout. No checkpoint was force-completed and no terminal/dead-letter
row was written.

The post-run totals remain 36 canonical documents, 42 language variants, 6,735
distinct current provisions and 18,877 indexed chunks, with 1,958
live-or-manual queued/retrying jobs. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI remain unproven; production is
untouched.

## Government/PKM page-three progress (2026-08-21, 19:20–19:24Z)

The bounded run `b6fe86c1-8432-443e-b6ec-bb6fc3977a8b` advanced the Russian
government checkpoint to page 3 with 60 durable discovery records. The other
government language ledgers remain queued or retryable with their page markers
preserved; none was force-completed. The four laws checkpoints remain
completed.

The latest D1 totals are 36 canonical documents, 42 language variants, 6,735
distinct current provisions and 18,877 indexed chunks, with 1,961
live-or-manual queued/retrying jobs. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter is zero. The
release floors, queue freeze and all post-ingestion gates remain unproven;
production is untouched.

## Government/PKM continuation (2026-08-21, 19:20–19:22Z)

Run `b6fe86c1-8432-443e-b6ec-bb6fc3977a8b` acquired the next distributed
lease. The Russian government checkpoint is running at its preserved page-two
ledger; Uzbek Cyrillic is retrying a bounded `LEX_CATALOG_TIMEOUT`, while the
other government checkpoints retain their page markers. No retryable response
was promoted to a completed checkpoint.

The latest read-only totals are 35 canonical documents, 41 language variants,
6,709 distinct current provisions, 18,767 current provision rows and 18,780
indexed chunks, with 1,961 live-or-manual queued/retrying jobs. The failure
ledger remains two retrying `LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter is zero. The
release floors, queue freeze and all post-ingestion gates remain unproven;
production is untouched.

## Historical version retry resolved (2026-08-21, 19:14–19:18Z)

The newly observed retryable version job
`legal-version:b893bc40975146c8b403fcde55fd` for the historical Russian
representation of `lexuz:97664` completed on attempt 2 at 19:16:35.429Z. No
terminal/dead-letter conversion occurred; the retry ledger remains durable
historical evidence rather than an active failed job. The single sequential
run `5165ca88-180c-49d9-a838-361a38380b6e` remains active on the government
catalogue.

The latest totals are 35 canonical documents, 41 language variants, 6,709
distinct current provisions and 18,780 indexed chunks, with 1,961
live-or-manual queued/retrying jobs. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI remain unproven; production is
untouched.

## Government/PKM run closure (2026-08-21, 19:11Z)

Run `c53f796c-72e9-4d48-b2d3-debaefa29b9f` closed at 19:11:21.722Z with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The government page ledgers and
the four completed laws checkpoints were preserved; no checkpoint was
force-completed and no terminal/dead-letter row was created.

The post-run read-only totals are 34 canonical documents, 40 language
variants, 6,650 distinct current provisions and 18,704 indexed chunks, with
1,964 live-or-manual queued/retrying jobs. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI remain unproven; production is
untouched.

## Government/PKM ingestion progress (2026-08-21, 19:04–19:08Z)

The sequential run `c53f796c-72e9-4d48-b2d3-debaefa29b9f` continued the
government family after the preserved page markers. No checkpoint was marked
complete on a retryable duplicate or timeout; all four laws checkpoints remain
completed and the government ledger remains resumable.

The latest D1 totals are 34 canonical documents, 40 language variants, 6,650
distinct current provisions and 18,704 indexed chunks, with 1,966
live-or-manual jobs queued/retrying. The failure ledger remains one retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`; terminal/dead-letter is zero. Release
floors, queue freeze and all post-ingestion gates remain unproven; production is
untouched.

## Next government/PKM run started (2026-08-21, 19:04–19:06Z)

Run `c53f796c-72e9-4d48-b2d3-debaefa29b9f` acquired the lease for the next
sequential invocation. The English government checkpoint is running from its
preserved page-one ledger after a retryable timeout; Russian resumed at page 1,
while Uzbek Cyrillic and Uzbek Latin retain their page-two duplicate-page
markers. The worker keeps all four laws checkpoints completed and does not
advance a checkpoint on a duplicate or timeout response.

Read-only totals remain 33 canonical documents, 39 language variants, 6,608
distinct current provisions and 18,612 indexed chunks, with 1,968
live-or-manual queued/retrying jobs. Failure rows remain one retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`; terminal/dead-letter is zero. Release
floors, queue freeze and post-ingestion gates remain unproven; production is
untouched.

## Government/PKM run closure (2026-08-21, 19:03Z)

Run `2b12acc2-22c7-44bf-bc70-bfb58ade5a1d` closed at 19:03:29.754Z with the
same allow-listed retryable `LEX_CATALOG_TIMEOUT`. Its durable checkpoint
records were preserved: four laws checkpoints remain completed, while all
government checkpoints remain queued for the next bounded invocation. No
terminal/dead-letter row or destructive reset was produced.

The post-run read-only totals are 33 canonical documents, 39 language
variants, 6,608 distinct current provisions, 18,612 indexed chunks and 1,968
live-or-manual queued/retrying jobs. The release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain open; production is
untouched.

## Government/PKM page continuation (2026-08-21, 18:56–19:00Z)

The same bounded run `2b12acc2-22c7-44bf-bc70-bfb58ade5a1d` continued under
the distributed lease. The government Uzbek Latin checkpoint advanced through
its second page and retained the allow-listed `LEX_CATALOG_DUPLICATE_PAGE`
marker for a later pager attempt; the ledger still records 40 discovered
documents and remains queued rather than being marked complete. Uzbek Cyrillic
returned to queued state at page 1 after its timeout retry, while Russian and
English remain at page 2. The four completed laws checkpoints remain intact.

Read-only materialized totals are now 33 canonical documents, 39 language
variants, 6,608 distinct current provisions and 18,612 indexed chunks, with
1,971 live-or-manual jobs queued/retrying. Failure rows are unchanged (one
retrying `LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`); terminal/dead-letter remains zero.
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
remain unproven; production is untouched.

## Government/PKM retry-preserving continuation (2026-08-21, 18:56–18:58Z)

Run `2b12acc2-22c7-44bf-bc70-bfb58ade5a1d` acquired the distributed lease and
continued the government family sequentially. `government/uz-Latn` is running
at page 1. `government/uz-Cyrl` retained 40 discovered records and moved to
`retrying` with the bounded, allow-listed `LEX_CATALOG_TIMEOUT`; its discovery
ledger remains intact for the next sequential attempt. The run did not mark
the checkpoint complete on a timeout.

The latest read-only totals are 32 canonical documents, 38 language variants,
6,564 distinct current provisions, 18,543 current provision rows and 18,553
indexed chunks. There are 1,972 live-or-manual queued/retrying jobs. The
failure ledger remains one retrying `LEGAL_CORPUS_INGESTION_FAILED` and three
retrying `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter is
zero. Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore
and CI remain unproven; production is untouched.
