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
