# Full legal corpus foundation release evidence — 2026-08-15

Status: **STAGING CORPUS BUILD IN PROGRESS — production corpus remains disabled and release gates are not met**.

## Batch cadence diagnosis and elapsed-time fence correction (2026-08-26, 09:32–10:49Z)

Run `d4f502c5-b588-47dc-96e9-76cfe3893f4e` started before the batch-22
deployment and was therefore the third batch-24 run. It closed normally from
`09:32:39.947Z` to `09:44:57.805Z` with `status=completed` and
`error_code=NULL`. The lock-free snapshot recorded 850 canonical documents,
1,088 language variants, **9,793 unique current provisions** by the checked-in
dashboard formula, 43,660 physical current provision rows, and
43,729/43,729 current/indexed chunks. Queue composition was 1,040 completed /
25,607 queued fetch jobs and 537 completed / 2,946 queued version jobs.

The three batch-24 runs started at `09:00:39.950Z`, `09:16:39.947Z` and
`09:32:39.947Z`. Their approximately 12-minute-15-second runtimes crossed the
12-minute start slot, so each next usable four-minute cron tick was 16 minutes
after the previous start. The nominal cadence was therefore only 24/16 = 1.5
jobs per minute. The functional and integrity checks were healthy, but the
larger batch did not improve throughput.

A bounded batch-22 trial was then deployed as identical Worker versions
`d3979813-445b-4231-83f3-32c5826fa503` and
`97ab6904-07fe-400b-921a-bf0c861201e9`. Its first run,
`3f1a0b8c-177b-4a8d-9e0f-a82e328e57a6`, also crossed the boundary, running
from `09:48:40.151Z` to `10:00:59.442Z`. The hypothesis that 22 jobs would fit
the slot was therefore rejected from live evidence rather than retained.

Commit `1163a3f2` restored and hard-capped the sequential batch at 20 for a
controlled live test. That test rejected the remaining batch-size hypothesis:
run `b79fc4fe-3e32-4dc9-a937-1c17e8510eee` took 791.4 seconds
(`10:04:40.103Z`–`10:17:51.462Z`) and run
`a88e8344-267c-476f-bad0-ca82c54d88f5` took 795.9 seconds
(`10:20:39.948Z`–`10:33:55.893Z`). Both completed without an error but still
crossed the twelve-minute slot. Job timestamps showed the cause: the old
twelve-minute claim fence admitted one last version job at the boundary, and
that job needed approximately 75 additional seconds.

Commit `4dd3beef` moved the staging claim fence to ten minutes while retaining
the 20-job hard cap. This leaves two minutes for the last already-claimed
sequential source job and D1 finalization. The focused config/Worker boundary
suite passed 24/24 and the Wrangler dry-run preserved the exact shard-2 D1 and
staging-only bindings. Worker version
`66b9a8b1-88e1-4c26-a2a8-ad77708d6500` was then deployed with the same
20-second Lex pacing, one-stream lock, shadow mode and disabled dense/sparse-
compression flags.

The first corrected run, `c63df720-8d55-47b4-a799-1e9cc83bd5d9`, completed
without an error in 669.6 seconds (`10:36:39.947Z`–`10:47:49.517Z`), releasing
the lock 50.4 seconds before the twelve-minute boundary. The second corrected
run, `8cc47386-ccaa-493c-801d-73875481912b`, completed without an error in
662.2 seconds (`10:48:39.947Z`–`10:59:42.142Z`), leaving 57.8 seconds. The
third run, `d52a37fb-ecc7-40d5-ba84-057903fc2231`, started at
`11:00:40.179Z`. Consecutive start intervals were therefore 12:00.000 and
12:00.232, rather than the regressed 16 minutes. This is repeatable live
cadence evidence, not a release gate shortcut.

The lock-free snapshot after the second corrected run contained 900 canonical
documents, 1,139 variants, **9,980 unique current provisions**, 43,865 physical
current provision rows, and 43,935/43,935 current/indexed chunks. Fetch jobs
were 1,091 completed / 25,607 queued and version jobs were 564 completed /
2,919 queued. The failure ledger remained at five historical retry rows, with
zero terminal or technically unavailable failures, zero running/failed/dead-
letter ingestion jobs and zero current unindexed chunks. Acquisition remained
`active`, the queues remained open, and D1 size was 3,056,062,464 bytes.

This remains progress evidence only: the document floor is 900/1,500 and the
exact unique-provision floor is 9,980/22,000. Federation, queue/acquisition
freeze, snapshot, indexed 314-scenario evaluation, Qdrant/D1 restore gates,
CI, release and production remain closed.

## Batch-24 staging verification while acquisition remains open (2026-08-26, 09:00–09:29Z)

Deployment `d38bd8fd-5f4a-427c-8911-f99ec07694c7` put staging Worker
version `e9153f7c-7510-4eca-9ed4-f19c9818e3a9` at 100%. A live
`versions view` recheck showed the exact shard-2 D1 binding
`36fa1cfe-6d00-47b7-a980-864020028d86`,
`LEGAL_CORPUS_STAGING_INGESTION_JOBS_PER_RUN=24`, shadow mode enabled,
dense retrieval disabled, and the same private service bindings. The config
and Worker boundary suite passed 24/24, including staging-only isolation,
bounded lease renewal and production fail-closed behavior. The change does not
reduce the 20-second Lex pacing and does not create another stream.

The first two runs that were definitely served by that version closed
normally: `64a22c06-5c8b-42ec-8e3d-5c48d5e298d7` ran from
`09:00:39.950Z` to `09:12:50.896Z`, and
`c56c55e3-5d90-4b22-9ea2-9a2537380657` ran from `09:16:39.947Z` to
`09:28:56.942Z`. Both finished with `status=completed` and
`error_code=NULL`; their durable leases renewed throughout and were absent
before and after the final sequential snapshot.

Against the lock-free pre-deployment baseline of 817 canonical documents,
9,660 exact unique provisions, 1,007 completed fetch jobs and 522 completed
version jobs, the two post-deployment runs added 22 documents, 87 exact unique
provisions, 22 completed fetch jobs and 10 completed version jobs. The final
snapshot contained 839 canonical documents, 1,077 language variants,
**9,747 unique current provisions** by the checked-in dashboard formula,
43,614 physical current provision rows, and 43,682/43,682 current/indexed
chunks. It also recorded 818 active documents, zero repealed documents, 534
historical versions, 747 variants fetched today, 4,354 live/manual queued
jobs, and 50 unversioned variants.

Discovery remained 44/44 completed and count-aligned and the core-code set
remained 19/19 indexed. The queues remained open at 1,029 completed / 25,607
queued fetch jobs and 532 completed / 2,951 queued version jobs. There were
zero running, failed or dead-letter jobs, zero terminal or technically
unavailable failures, zero broken non-null current-version references, zero
orphan provisions/chunks, and zero current unindexed chunks. The failure
ledger was unchanged at five historical retrying rows across four currently
completed jobs, all with `last_error_code=NULL`. `wrangler d1 info` reported
2,859,843,584 bytes, still below the 8 GB rollover reserve and Cloudflare's
10 GB per-database boundary.

This verifies functional and integrity safety of the batch-24 trial, but the
later cadence comparison above shows that it reduced effective throughput and
has been superseded by the proven batch-20 cap. It never authorized a release.

## First 800-document milestone while acquisition remains open (2026-08-26, 08:00–08:47Z)

Four consecutive single-stream staging runs closed normally in this interval:
`2c333b04-3cf3-4eb1-9ee4-b300fb79cf40` ran from `08:00:49.880Z` to
`08:10:20.262Z`, `b4936ddd-a4e7-4438-a82f-9c20e28ed97b` ran from
`08:12:47.390Z` to `08:22:15.549Z`,
`49736de2-ee01-4874-a2c1-179877b502dd` ran from `08:24:47.388Z` to
`08:34:20.792Z`, and `4fc9c300-7551-4fda-8a94-14de6b7855a8` ran from
`08:36:47.390Z` to `08:46:30.090Z`. All four finished with
`status=completed` and `error_code=NULL`. The `legal-corpus-worker` lock was
empty before the final read-only snapshot and remained empty after the totals,
integrity, queue and failure-ledger queries. The shard-control row remained
`active`, and the staging Worker remained version
`1fb18209-c95f-46c5-abf5-6400a6442879` at 100% with the exact shard-2 D1
binding.

One read-only polling request during the final run returned a transient
Cloudflare API authentication error (`10000`). `wrangler whoami` immediately
confirmed the existing OAuth account and D1 permission, the next identical
probe succeeded, and the same Worker run continued renewing its lease before
closing normally. This was a monitoring-request failure, not an ingestion-run
failure.

The final lock-free snapshot recorded 44/44 completed and count-aligned
discovery checkpoints, 19/19 indexed core-code targets, zero failed or
dead-letter ingestion jobs, zero running jobs, and zero terminal or
technically unavailable failure records. The failure ledger remained unchanged
at five historical retrying rows across four currently completed jobs: four
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows across three fetch jobs and one
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` alternate-language redirect row.
Every current job has `last_error_code=NULL`. Queue composition was 991
completed and 25,610 queued fetch jobs, plus 514 completed and 2,969 queued
version jobs.

Using the exact checked-in dashboard formula, shard 2 contained 804 canonical
documents, 1,039 language variants, **9,599 unique current provisions**,
43,466 physical current provision rows, and 43,533 current/indexed chunks. All
current chunks were indexed. Fifty newly discovered variants still had no
current version and remained in the open ingestion pipeline; there were zero
broken non-null current-version references, zero orphan provisions, and zero
orphan chunks. `wrangler d1 info` reported 2,745,708,544 bytes, below the 8 GB
rollover reserve and Cloudflare's 10 GB per-database boundary.

This is the first verified lock-free snapshot above 800 canonical documents,
but it is progress evidence only. The document floor remains 804/1,500, the
exact unique-provision floor remains 9,599/22,000, acquisition is active, and
both queues remain open. The indexed-chunk floor alone is crossed. Federation
freeze, snapshot, the indexed 314-scenario evaluation, Qdrant/D1 restore
gates, CI, release and production therefore remain unauthorized.

## First 750-document milestone while acquisition remains open (2026-08-26, 07:24–07:59Z)

Three consecutive single-stream staging runs closed normally in this interval:
`d4f2d31f-5113-470c-a19f-b3c4f4c118a5` ran from `07:24:47.389Z` to
`07:34:18.026Z`, `30eb6a9b-a79c-40ae-bcbb-2a1a776a4570` ran from
`07:36:47.389Z` to `07:46:20.454Z`, and
`921fe2f0-6a2d-460a-8926-9b8cb18b09bb` ran from `07:48:47.390Z` to
`07:58:26.121Z`. All three finished with `status=completed` and
`error_code=NULL`. The `legal-corpus-worker` lock was empty before the final
read-only snapshot and remained empty after the totals, integrity, queue and
failure-ledger queries. The shard-control row remained `active`, and the
staging Worker remained version `1fb18209-c95f-46c5-abf5-6400a6442879` at
100% with the exact shard-2 D1 binding.

The final lock-free snapshot recorded 44/44 completed and count-aligned
discovery checkpoints, 19/19 indexed core-code targets, zero failed or
dead-letter ingestion jobs, zero running jobs, and zero terminal or
technically unavailable failure records. The failure ledger contained five
historical retrying rows across four jobs: four
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows across three fetch jobs and one
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` row for an official alternate-language
redirect. Every current job is `completed` with `last_error_code=NULL`; no new
failure row appeared in the two normal runs after that redirect. The bounded
alternate-language recovery and parser behavior passed 52/52 focused tests.
Queue composition was 927 completed and 25,622 queued fetch jobs, plus 482
completed and 3,001 queued version jobs.

Using the exact checked-in dashboard formula, shard 2 contained 752 canonical
documents, 975 language variants, **9,392 unique current provisions**, 43,228
physical current provision rows, and 43,295 current/indexed chunks. All current
chunks were indexed. Fifty newly discovered variants still had no current
version and remained in the open ingestion pipeline; there were zero broken
non-null current-version references, zero orphan provisions, and zero orphan
chunks. `wrangler d1 info` reported 2,624,618,496 bytes, below the 8 GB
rollover reserve and Cloudflare's 10 GB per-database boundary.

This is the first verified lock-free snapshot above 750 canonical documents,
but it is progress evidence only. The document floor remains 752/1,500, the
exact unique-provision floor remains 9,392/22,000, acquisition is active, and
both queues remain open. The indexed-chunk floor alone is crossed. Federation
freeze, snapshot, the indexed 314-scenario evaluation, Qdrant/D1 restore
gates, CI, release and production therefore remain unauthorized.

## First 700-document milestone while acquisition remains open (2026-08-26, 06:24–07:11Z)

Four consecutive single-stream staging runs closed normally in this interval:
`02403992-2a4c-4b6d-9fc7-75ee0f42f64d` ran from `06:24:47.388Z` to
`06:34:30.533Z`, `f6ec2853-2e02-4a67-8638-0f8c3d3341ef` ran from
`06:36:47.390Z` to `06:46:22.638Z`,
`498ec0ce-7437-4848-a8cc-351b26ab6304` ran from `06:48:47.387Z` to
`06:58:23.972Z`, and `4feaab8e-3369-4d53-bda4-a2e793b8fd76` ran from
`07:00:48.196Z` to `07:10:24.557Z`. All four finished with
`status=completed` and `error_code=NULL`. The `legal-corpus-worker` lock was
empty before the final read-only snapshot and remained empty after the
totals, integrity, queue, failure-ledger and capacity queries. The
shard-control row remained `active`, and the staging Worker remained version
`1fb18209-c95f-46c5-abf5-6400a6442879` at 100% with the exact shard-2 D1
binding.

The final lock-free snapshot recorded 44/44 completed and count-aligned
discovery checkpoints, 19/19 indexed core-code targets, zero failed or
dead-letter ingestion jobs, zero running jobs, and zero terminal or
technically unavailable failure records. The failure ledger still contained
only four historical retrying `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows across
three fetch jobs; all three current jobs are `completed`, their
`last_error_code` values are cleared, and no new retry row appeared in this
interval. Queue composition was 863 completed and 25,634 queued fetch jobs,
plus 451 completed and 3,032 queued version jobs.

Using the exact checked-in dashboard formula, shard 2 contained 700 canonical
documents, 911 language variants, **9,150 unique current provisions**, 42,900
current provision rows, and 42,967 current/indexed chunks. All current chunks
were indexed. Fifty newly discovered variants still had no current version
and remained in the open ingestion pipeline; there were zero broken non-null
current-version references, zero orphan provisions, and zero orphan chunks.
`wrangler d1 info` reported 2,497,052,672 bytes, below the 8 GB rollover
reserve and Cloudflare's 10 GB per-database boundary.

This is the first verified lock-free snapshot at 700 canonical documents, but
it is progress evidence only. The document floor remains 700/1,500, the exact
unique-provision floor remains 9,150/22,000, acquisition is active, and both
queues remain open. The indexed-chunk floor alone is crossed. Federation
freeze, snapshot, the indexed 314-scenario evaluation, Qdrant/D1 restore
gates, CI, release and production therefore remain unauthorized.

## First 650-document milestone while acquisition remains open (2026-08-26, 05:36–06:23Z)

Four consecutive single-stream staging runs closed normally in this interval:
`7038f034-8212-486b-9ae2-2a8eb655e0aa` ran from `05:36:47.390Z` to
`05:46:26.725Z`, `7841a4b1-b661-4cb2-b208-488a6dac3722` ran from
`05:48:47.388Z` to `05:58:27.867Z`,
`59d9986d-7836-4b76-86b0-b7373811df8e` ran from `06:00:48.578Z` to
`06:10:26.472Z`, and `cc943f5f-246e-4819-a589-492e1e7e1138` ran from
`06:12:47.388Z` to `06:22:29.815Z`. All four finished with
`status=completed` and `error_code=NULL`. The `legal-corpus-worker` lock was
empty before the final read-only snapshot and remained empty after the
totals, integrity, queue, failure-ledger and capacity queries. The
shard-control row remained `active`, and the staging Worker remained version
`1fb18209-c95f-46c5-abf5-6400a6442879` at 100% with the exact shard-2 D1
binding.

The final lock-free snapshot recorded 44/44 completed and count-aligned
discovery checkpoints, 19/19 indexed core-code targets, zero failed or
dead-letter ingestion jobs, zero running jobs, and zero terminal or
technically unavailable failure records. The failure ledger still contained
only four historical retrying `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows across
three fetch jobs; all three current jobs are `completed`, their
`last_error_code` values are cleared, and no new retry row appeared in this
interval. Queue composition was 799 completed and 25,648 queued fetch jobs,
plus 419 completed and 3,064 queued version jobs.

Using the exact checked-in dashboard formula, shard 2 contained 652 canonical
documents, 847 language variants, **8,914 unique current provisions**, 41,868
current provision rows, and 41,934 current/indexed chunks. All current chunks
were indexed. Fifty newly discovered variants still had no current version
and remained in the open ingestion pipeline; there were zero broken non-null
current-version references, zero orphan provisions, and zero orphan chunks.
`wrangler d1 info` reported 2,346,958,848 bytes, below the 8 GB rollover
reserve and Cloudflare's 10 GB per-database boundary.

This is the first verified lock-free snapshot above 650 canonical documents,
but it is progress evidence only. The document floor remains 652/1,500, the
exact unique-provision floor remains 8,914/22,000, acquisition is active, and
both queues remain open. The indexed-chunk floor alone is crossed. Federation
freeze, snapshot, the indexed 314-scenario evaluation, Qdrant/D1 restore
gates, CI, release and production therefore remain unauthorized.

## First 600-document milestone while acquisition remains open (2026-08-26, 05:00–05:35Z)

Three consecutive single-stream staging runs closed normally in this interval:
`39b7837c-9176-457d-932f-7e26a1c2c79b` ran from `05:00:47.581Z` to
`05:10:32.382Z`, `866c9030-4510-490e-b9a9-8b443fafccb7` ran from
`05:12:47.388Z` to `05:22:32.222Z`, and
`394379d8-e4b0-4793-b9c7-011b368b7f54` ran from `05:24:47.387Z` to
`05:34:33.589Z`. All three finished with `status=completed` and
`error_code=NULL`. The `legal-corpus-worker` lock was empty before the final
read-only snapshot and remained empty after the totals, integrity, queue,
failure-ledger and capacity queries. The shard-control row remained `active`,
and the staging Worker remained version
`1fb18209-c95f-46c5-abf5-6400a6442879` at 100% with the exact shard-2 D1
binding.

The final lock-free snapshot recorded 44/44 completed and count-aligned
discovery checkpoints, 19/19 indexed core-code targets, zero failed or
dead-letter ingestion jobs, zero running jobs, and zero terminal or
technically unavailable failure records. The failure ledger still contained
only four historical retrying `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows across
three fetch jobs; all three current jobs are `completed`, their
`last_error_code` values are cleared, and no new retry row appeared in this
interval. Queue composition was 735 completed and 25,653 queued fetch jobs,
plus 387 completed and 3,096 queued version jobs.

Using the exact checked-in dashboard formula, shard 2 contained 605 canonical
documents, 783 language variants, **8,648 unique current provisions**, 41,020
current provision rows, and 41,083 current/indexed chunks. All current chunks
were indexed. Fifty newly discovered variants still had no current version
and remained in the open ingestion pipeline; there were zero broken non-null
current-version references, zero orphan provisions, and zero orphan chunks.
`wrangler d1 info` reported 2,163,359,744 bytes, below the 8 GB rollover reserve
and Cloudflare's 10 GB per-database boundary.

This is the first verified lock-free snapshot above 600 canonical documents,
but it is progress evidence only. The document floor remains 605/1,500, the
exact unique-provision floor remains 8,648/22,000, acquisition is active, and
both queues remain open. The indexed-chunk floor alone is crossed. Federation
freeze, snapshot, the indexed 314-scenario evaluation, Qdrant/D1 restore
gates, CI, release and production therefore remain unauthorized.

## First 550-document milestone and recovered long-page leases (2026-08-26, 02:24–04:47Z)

Single-stream staging run `ecbb1a8c-1808-43f1-8910-f72eb8908db1` started at
`04:36:47.388Z` and completed at `04:46:34.835Z` with `error_code=NULL`.
The `legal-corpus-worker` lock was empty before and after the read-only
evidence queries. The shard-control row remained `active`, and the staging
Worker remained version `1fb18209-c95f-46c5-abf5-6400a6442879` at 100% with
the exact shard-2 D1 binding.

Two earlier long-page runs in this interval exhausted their scheduler leases:
run `45dac2c1-1e31-4603-9e17-0fc149fc3926` for
`https://lex.uz/uz/docs/-8188275`, and run
`a03ec5e0-3154-42ba-af1b-2c5aecae6039` for
`https://lex.uz/ru/docs/8102027`. Each durable run was closed as
`LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED`; each affected fetch job was reclaimed
once as `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` and then completed on attempt
2/5 with `last_error_code=NULL`. These are auditable retry recoveries, not
terminal or dead-letter failures. No second ingestion stream was opened and
no lock or job state was changed manually.

The lock-free snapshot recorded 44/44 completed and count-aligned discovery
checkpoints, 19/19 indexed core-code targets, zero failed or dead-letter
ingestion jobs, zero running jobs, and zero terminal or technically
unavailable failure records. The failure ledger contained four historical
retrying `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows across three fetch jobs;
all three current jobs are `completed`. Queue composition was 671 completed
and 25,669 queued fetch jobs, plus 355 completed and 3,128 queued version
jobs.

Using the exact checked-in dashboard formula, shard 2 contained 560 canonical
documents, 719 language variants, **8,430 unique current provisions**, 40,712
current provision rows, and 40,774 current/indexed chunks. All current chunks
were indexed. Fifty newly discovered variants still had no current version
and remained in the open ingestion pipeline; there were zero broken non-null
current-version references, zero orphan provisions, and zero orphan chunks.
`wrangler d1 info` reported 1,959,555,072 bytes, below the 8 GB rollover
reserve and Cloudflare's 10 GB per-database boundary.

This is the first verified lock-free snapshot above 550 canonical documents,
but it is progress evidence only. The document floor remains 560/1,500, the
exact unique-provision floor remains 8,430/22,000, acquisition is active, and
both queues remain open. The indexed-chunk floor alone is crossed. Federation
freeze, snapshot, the indexed 314-scenario evaluation, Qdrant/D1 restore
gates, CI, release and production therefore remain unauthorized.

## First 400-document milestone while acquisition remains open (2026-08-26, 01:24–01:35Z)

Single-stream staging run `d3278097-1476-4989-8a08-0b5803188d9b` started at
`01:24:47.386Z` and completed at `01:34:41.675Z` with `error_code=NULL`.
The post-run `legal-corpus-worker` lock was empty before the snapshot and after
the read-only evidence queries. The shard-control row remained `active`, and the
staging Worker remained version `1fb18209-c95f-46c5-abf5-6400a6442879` at
100% with the exact shard-2 D1 binding.

The lock-free snapshot recorded 44/44 completed and count-aligned discovery
checkpoints, 19/19 indexed core-code targets, zero failed or dead-letter
ingestion jobs, zero running jobs, and zero terminal or technically
unavailable failure records. The two failure-ledger rows remained historical
retrying `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records for one fetch job whose
current status is `completed`. Queue composition was 455 completed and 25,707
queued fetch jobs, plus 246 completed and 3,237 queued version jobs.

Using the exact checked-in dashboard formula, shard 2 contained 407 canonical
documents, 503 language variants, **7,920 unique current provisions**, 40,009
current provision rows, and 40,066 current/indexed chunks. All current chunks
were indexed. Fifty newly discovered variants still had no current version and
remained in the open ingestion pipeline; there were zero broken non-null
current-version references, zero orphan provisions, and zero orphan chunks.
`wrangler d1 info` reported 1,143,541,760 bytes.

This is the first verified lock-free snapshot above 400 canonical documents,
but it is progress evidence only. The document floor remains 407/1,500, the
exact unique-provision floor remains 7,920/22,000, acquisition is active, and
both queues remain open. The indexed-chunk floor alone is crossed. Federation
freeze, snapshot, the indexed 314-scenario evaluation, Qdrant/D1 restore
gates, CI, release and production therefore remain unauthorized.

## Provision-metric correction and first 375-document milestone (2026-08-26, 00:48–01:00Z)

The prior shard-2 milestones from the 123-document snapshot through the
361-document snapshot mislabeled the count of current provision rows as
"unique current provisions". That row count is not the release-gate metric:
it counts every current language/version provision row. The authoritative
dashboard and release gate instead count distinct current
`document_id + normalized article number` keys, falling back to sequence only
when an article number is absent. Consequently, the earlier claim that the
22,000 unique-provision floor had crossed is withdrawn. The underlying run,
document, chunk, queue, lock and capacity observations in those sections are
unchanged; only their provision label and floor conclusion were wrong.

Single-stream staging run `57a3695b-b860-48b0-bb82-ab88e0cb2a6f` started at
`00:48:47.388Z` and completed at `00:57:36.145Z` with `error_code=NULL`.
The post-run lock was empty. The shard-control row remained `active`, and the
staging Worker remained version `1fb18209-c95f-46c5-abf5-6400a6442879` at
100% with the exact shard-2 D1 binding.

The lock-free read-only snapshot recorded 44/44 completed and count-aligned
discovery checkpoints, 19/19 indexed core-code targets, zero failed or
dead-letter ingestion jobs, and no terminal failure record. The two failure
ledger rows remained historical retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records whose current fetch job is
`completed`. Queue composition was 407 completed and 25,722 queued fetch
jobs, plus 222 completed and 3,259 queued version jobs.

Using the exact checked-in dashboard formula, shard 2 contained 375 canonical
documents, 446 language variants, **7,794 unique current provisions**, 39,844
current provision rows, and 39,899 current/indexed chunks. All current chunks
were indexed; no current-version reference or provision-to-document orphan was
found. `wrangler d1 info` reported 1,033,568,256 bytes. The document and unique
provision floors remain open, acquisition is active, and both queues remain
open. The indexed-chunk floor alone is crossed. This is corrective progress
evidence, not authorization for federation freeze, snapshot, the indexed
314-scenario evaluation, Qdrant/D1 restore gates, CI, release, or production.

## First 350-document milestone while acquisition remains open (2026-08-26, 00:36–00:45Z)

Single-stream staging run `43a1e17a-2ab4-443c-9ab8-92cb05fd0116`
started at `00:36:47.387Z` and completed at `00:45:35.387Z` with
`error_code=NULL`. Its distributed lock was empty at the measurement boundary.
The staging Worker remains version `1fb18209-c95f-46c5-abf5-6400a6442879` at
100% with the unchanged shard-2 binding. No code, migration, flag, DNS or
production state changed in this monitoring interval.

One read-only SQL snapshot at that empty-lock boundary recorded active
acquisition, 44/44 completed discovery checkpoints, 19/19 indexed core-code
targets, zero failed/dead-letter ingestion jobs and zero terminal failure
records. Queue composition was 391 completed and 25,720 queued fetch jobs,
plus 214 completed and 3,267 queued version jobs. The only failure-ledger rows
remained two historical retrying `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records
for one fetch job that is now `completed`.

The same snapshot recorded 361 canonical documents, 39,804 current provision
rows and 39,859 indexed current chunks. `wrangler d1 info` reported
1,029,378,048 bytes, well below the documented rollover reserve. This is the
first verified lock-free snapshot above 350 canonical documents, but it is a
progress milestone only: the document floor remains 361/1,500, the unique
provision floor was not measured by this snapshot, acquisition is active, and
both queues are open. Federation freeze, snapshot, indexed
314-scenario evaluation, Qdrant/D1 restore gates, CI and release therefore
remain unauthorized.

## First 300-document milestone while acquisition remains open (2026-08-26, 00:00–00:09Z)

Single-stream staging run `d4cd70e9-963c-44f1-85a9-1cde43b7581b`
started at `00:00:47.689Z` and completed at `00:09:59.552Z` with
`error_code=NULL`. Its distributed lock was empty at the measurement boundary.
The staging Worker remains version `1fb18209-c95f-46c5-abf5-6400a6442879` at
100% with the unchanged shard-2 binding. No code, migration, flag, DNS or
production state changed in this monitoring interval.

One read-only SQL snapshot at that empty-lock boundary recorded active
acquisition, 44/44 completed discovery checkpoints, 19/19 indexed core-code
targets, zero failed/dead-letter ingestion jobs and zero terminal failure
records. Queue composition was 343 completed and 25,724 queued fetch jobs,
plus 190 completed and 3,291 queued version jobs. The only failure-ledger rows
remained two historical retrying `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records
for one fetch job that is now `completed`.

The same snapshot recorded 306 canonical documents, 39,371 current provision
rows and 39,426 indexed current chunks. `wrangler d1 info` reported
996,372,480 bytes, well below the documented rollover reserve. This is the
first verified lock-free snapshot above 300 canonical documents, but it is a
progress milestone only: the document floor remains 306/1,500, the unique
provision floor was not measured by this snapshot, acquisition is active, and
both queues are open. Federation freeze, snapshot, indexed
314-scenario evaluation, Qdrant/D1 restore gates, CI and release therefore
remain unauthorized.

## First 250-document milestone while acquisition remains open (2026-08-25, 23:24–23:34Z)

Single-stream staging run `548d3ae0-3f37-4e22-ad06-803ae1cb3580`
started at `23:24:47.389Z` and completed at `23:34:27.667Z` with
`error_code=NULL`. Its distributed lock was empty at the measurement boundary.
The staging Worker remains version `1fb18209-c95f-46c5-abf5-6400a6442879` at
100% with the unchanged shard-2 binding. No code, migration, flag, DNS or
production state changed in this monitoring interval.

One read-only SQL snapshot at that empty-lock boundary recorded active
acquisition, 44/44 completed discovery checkpoints, 19/19 indexed core-code
targets, zero failed/dead-letter ingestion jobs and zero terminal failure
records. Queue composition was 295 completed and 25,732 queued fetch jobs,
plus 166 completed and 3,124 queued version jobs. The only failure-ledger rows
remained two historical retrying `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records
for one fetch job that is now `completed`.

The same snapshot recorded 253 canonical documents, 34,076 current provision
rows and 34,128 indexed current chunks. `wrangler d1 info` reported
901,804,032 bytes, well below the documented rollover reserve. This is the
first verified lock-free snapshot above 250 canonical documents, but it is a
progress milestone only: the document floor remains 253/1,500, the unique
provision floor was not measured by this snapshot, acquisition is active, and
both queues are open. Federation freeze, snapshot, indexed
314-scenario evaluation, Qdrant/D1 restore gates, CI and release therefore
remain unauthorized.

## First 200-document milestone while acquisition remains open (2026-08-25, 22:36–22:46Z)

Single-stream staging run `3c6925e2-6370-40c4-a5ab-f71ed6ae0359`
started at `22:36:47.387Z` and completed at `22:46:04.245Z` with
`error_code=NULL`. Its distributed lock was empty at the measurement boundary.
The staging Worker remains version `1fb18209-c95f-46c5-abf5-6400a6442879` at
100% with the unchanged shard-2 binding. No code, migration, flag, DNS or
production state changed in this monitoring interval.

One read-only SQL snapshot at that empty-lock boundary recorded active
acquisition, 44/44 completed discovery checkpoints, 19/19 indexed core-code
targets, zero failed/dead-letter ingestion jobs and zero terminal failure
records. Queue composition was 231 completed and 25,749 queued fetch jobs,
plus 134 completed and 3,063 queued version jobs. The only failure-ledger rows
remained two historical retrying `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records
for one fetch job that is now `completed`.

The same snapshot recorded 201 canonical documents, 32,268 current provision
rows and 32,292 indexed current chunks. `wrangler d1 info` reported
759,193,600 bytes, well below the documented rollover reserve. This is the
first verified lock-free snapshot above 200 canonical documents, but it is a
progress milestone only: the document floor remains 201/1,500, the unique
provision floor was not measured by this snapshot, acquisition is active, and
both queues are open. Federation freeze, snapshot, indexed
314-scenario evaluation, Qdrant/D1 restore gates, CI and release therefore
remain unauthorized.

## Current-provision row and chunk counts crossed while release gates remain open (2026-08-25, 21:36–21:48Z)

Single-stream staging run `93e0dd9a-3101-4e80-9419-d41103048d1c`
started at `21:36:47.387Z` and completed at `21:47:15.871Z` with
`error_code=NULL`. Its distributed lock was empty at the measurement boundary.
The staging Worker remains version `1fb18209-c95f-46c5-abf5-6400a6442879` at
100% with the unchanged shard-2 binding. No code, migration, flag, DNS or
production state changed in this monitoring interval.

One read-only SQL snapshot at that empty-lock boundary recorded active
acquisition, 44/44 completed discovery checkpoints, 19/19 indexed core-code
targets, zero failed/dead-letter ingestion jobs and zero terminal failure
records. Queue composition was 151 completed and 25,768 queued fetch jobs,
plus 94 completed and 2,134 queued version jobs. The only failure-ledger rows
remained two historical retrying `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records
for one fetch job that is now `completed`.

The same snapshot recorded 136 canonical documents, 25,046 current provision
rows and 25,065 indexed current chunks. A separate per-document distribution
check used distinct provision row IDs against each variant's exact
current-version pointer; the increase was concentrated in genuinely large code
documents rather than a many-to-many join expansion. The largest current
contributors were the Tax Code (6,435 provisions), Civil Procedure Code
(4,336), Administrative Judicial Procedure Code (2,932) and Administrative
Responsibility Code (2,634). `wrangler d1 info` reported 529,321,984 bytes,
well below the documented rollover reserve.

The current-row count is not the unique-provision release metric. This
snapshot therefore proved only that the indexed-chunk floor had crossed; it did
not prove the unique-provision floor. The document floor remained 136/1,500,
acquisition was active, and both queues were open. Federation freeze, snapshot,
indexed 314-scenario evaluation, Qdrant/D1 restore gates, CI and release
therefore remained unauthorized.

## Post-core shard-2 ingestion progression (2026-08-25, 21:12–21:35Z)

The next two single-stream staging runs completed without an error. Run
`ed4e530c-c792-43b2-93c9-016e7ed57530` ran from `21:12:47.393Z` through
`21:22:11.046Z`; run `deda49fe-1da7-4b2e-ae8e-c88bb15bc28e` ran from
`21:24:47.388Z` through `21:34:42.016Z`. Both durable scheduler records are
`completed` with `error_code=NULL`, and the distributed lock was empty at the
post-run measurement boundary. The staging Worker remains version
`1fb18209-c95f-46c5-abf5-6400a6442879` at 100% with the unchanged shard-2
binding. No code, migration, flag, DNS or production state changed in this
monitoring interval.

A single read-only SQL snapshot at that empty-lock boundary recorded active
acquisition, 44/44 completed discovery checkpoints, 19/19 indexed core-code
targets, zero failed/dead-letter ingestion jobs and zero terminal failure
records. The queue contained 135 completed and 25,772 queued fetch jobs, plus
86 completed and 2,070 queued version jobs. The only failure-ledger rows were
two historical retrying `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records for one
fetch job that is now `completed`; they are recovery evidence, not an active
or terminal job.

The same snapshot recorded 123 canonical documents, 21,714 current provision
rows and 21,731 indexed current chunks. `wrangler d1 info` reported
465,821,696 bytes. The document and indexed-chunk floors remained open; the
unique-provision release metric was not measured by this snapshot. Acquisition
and both queues remained active. These values therefore did not authorize
federation freeze, snapshot, the indexed 314-scenario evaluation, Qdrant/D1
restore gates, CI or release.

## Core-code pager continuity and 19/19 settlement (2026-08-25, 19:52–21:11Z)

Live staging timings showed that the prior 15-minute private metadata expiry
for the public unauthenticated Lex.uz ASP.NET pager could elapse between two
eligible Worker invocations: a bounded ingestion batch normally held the
scheduler lock for 12–13 minutes and the next free four-minute tick could land
after expiry. This repeatedly returned the `customs` exact-title search to page
one. Commit `647f793f` changes only the core-code pager metadata TTL to a
bounded 30 minutes, enough to span the 15-minute scheduler lease plus cadence
and response-latency margin. The pager cookie remains private operational
metadata and is cleared immediately when the target is found, deferred or
reset.

The regression now resumes the source-issued pager after a simulated
16-minute full-batch gap and passed in the 9/9 core-code suite. Worker boundary
tests passed 22/22; platform type-check, lint, both canonical and shard-2
Wrangler artifact dry-runs and the full `npm test` command passed. Staging-only
Worker version `1fb18209-c95f-46c5-abf5-6400a6442879` was deployed at 100%
with the unchanged shard-2 D1 binding and staging flags. Production remained
untouched.

The first new-version run created a `customs` pager session at
`2026-08-25T19:52:44.000Z` with expiry `20:22:44.000Z`, advanced it to page 2
inside the same batch and completed normally. The next free run
`bf687651-49bb-4a32-a9e8-90ee911dffe8` started at `20:08:44.901Z`, reused that
still-valid session rather than resetting it, found official target
`lexuz:2876352` (`https://lex.uz/ru/docs/2876352`) and completed its preferred
fetch without error. `customs` reconciled to `indexed` at `20:24:44.000Z`.

The final `economic_procedure` pager then created a 30-minute session, found
official target `lexuz:3523895` (`https://lex.uz/ru/docs/3523895`) on its second
bounded page, and the next run completed its preferred fetch against ready
internal family `lexuz-family:3523891`. Run
`603b60f7-4bb4-48f2-b888-4e9ce6d05a4d` reconciled the target at
`20:56:44.000Z` and completed at `21:09:02.762Z` with `error_code=NULL`; its
distributed lock was released. The durable core-code ledger is now 19/19
`indexed`, with no queued, retrying, awaiting-ingestion or technically
unavailable target.

The immediate post-run read-only snapshot remains 44/44 completed discovery
checkpoints, zero failed/dead-letter ingestion jobs and only two retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` recovery records. Queue composition is
103 completed and 25,780 queued fetch jobs, plus 70 completed and 1,936 queued
version jobs. Shard 2 contains 97 canonical documents, 6,690 unique current
provisions and 18,699 indexed current chunks; `wrangler d1 info` reports
403,701,760 bytes. This closes only the core-code bootstrap gate. The active
queue is not frozen, so federated deduplication, snapshot, 314-scenario
evaluation, Qdrant/D1 restore and CI release gates remain closed.

## Remapped core-code alias reconciliation (2026-08-25, 19:19–19:34Z)

The `administrative_responsibility` code target was discovered from the
official URL `https://lex.uz/ru/docs/97664` with provider identity
`lexuz:97664`, while Lex.uz resolved the ingested official family to internal
document `lexuz-family:97661` and variant URL
`https://lex.uz/ru/docs/97661`. The prior exact-URL-only reconciliation could
therefore leave a successfully ingested code in `awaiting_ingestion`
indefinitely. Commit `84d4f1e6` keeps reconciliation fail-closed but also
accepts an exact append-only `legal_corpus_source_aliases.provider_source_id`
binding to the ready official variant's internal document. It does not use
titles, fuzzy URLs or unverified identity inference.

The regression suite for core-code discovery passed 9/9, the corpus Worker
boundary suite passed 22/22, the ingestion suite passed 40/40, platform
type-check and lint passed, both the canonical and shard-2 Wrangler artifact
dry-runs passed, and the full `npm test` command exited successfully. The
staging-only deployment produced Worker version
`53d1726c-b772-47d2-9b7f-c889a60720e6`, distributed at 100% with the unchanged
`juro-staging-corpus-shard-2` D1 binding and existing staging flags. No
production binding, migration, flag, DNS or data was changed.

The first post-deploy run `54d47f98-4e6c-403a-8f7c-0513bdd26759` started at
`2026-08-25T19:20:45.045Z`, renewed its durable heartbeat during the batch and
completed at `19:33:11.960Z` with `error_code=NULL`. Its Worker event reported
17/17 claimed ingestion jobs, the expected bounded start-cutoff stop and
`errorCode=NULL`. Intervening cron ticks emitted `duplicate_or_busy`, so no
parallel ingestion stream was started. The live D1 target row changed to
`status=indexed` with `resolved_at=2026-08-25T19:20:44.000Z`; the post-run core
ledger is 17 indexed targets, one resumable `customs` pager in `retrying` and
one queued `economic_procedure` target.

The post-run read-only gate probe found the distributed lock released, shard 2
still `acquisition_state=active`, all 44 discovery checkpoints completed and
zero failed/dead-letter ingestion jobs. Queue composition is 43 completed and
25,786 queued fetch jobs, plus 28 completed and 1,976 queued version jobs. The
failure ledger contains only two retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` recovery records. Shard 2 contains 37
canonical documents, 5,521 unique current provisions and 16,549 indexed
current chunks; `wrangler d1 info` reports 273,178,624 bytes, well below the
8 GB rollover reserve. The queue and core-code phase are not frozen, so
cross-shard deduplication, snapshot, 314-scenario evaluation, Qdrant/D1
restore and CI release gates remain closed.

## Read-only federated progress snapshot (2026-08-25, 18:30–18:35Z)

Sequential remote D1 aggregates recorded the following current-corpus rows:

- frozen `juro-staging-corpus-v2`: 599 canonical documents, 15,899 unique
  current provisions and 55,814 indexed current chunks;
- frozen `juro-staging-corpus-shard-1`: 1,635 canonical documents, 18,724
  unique current provisions and 52,370 indexed current chunks; and
- active `juro-staging-corpus-shard-2`: 9 canonical documents, 3,613 unique
  current provisions and 7,456 indexed current chunks.

The provisional per-database arithmetic is therefore 2,243 canonical
documents, 38,236 per-shard-unique current provisions and 115,640 indexed
current chunks. This exceeds the numerical release floors, but it is progress
only: the arithmetic is not the required cross-shard sorted-ID deduplication
manifest or restored-snapshot evidence and cannot approve a federated release.

The live fence check found shard 1 `acquisition_state=frozen`, handoff
`3ccc2e81-403d-4f2a-a7b8-0a91f269ea95`, zero active jobs, zero terminal jobs
and zero scheduler locks. Shard 2 alone remained `acquisition_state=active`
with one scheduler lock and run `c602399f-60d1-44b9-85a2-f157fcdad1ee`
renewing normally. It still had 27,653 queued/retrying/running jobs at the
captured aggregate. Queue freeze, cross-shard deduplication, snapshot,
314-scenario evaluation, Qdrant/D1 restore and CI gates remain open;
production is untouched.

## Shard-2 stream-heartbeat amplification fix (2026-08-25, 16:56–18:14Z)

The first shard-2 fetch job, `legal-corpus:109bff9d41820f474df91ad3789a`
(`lexuz:97664`, `https://lex.uz/ru/docs/97664`), repeatedly consumed the
15-minute Worker invocation while reading a valid but large official Lex.uz
page. In-app Browser inspection confirmed a live page with approximately
4.7 million HTML characters. A controlled local profile of the same official
response read 528,313 compressed bytes and parsed 3,484 blocks in about one
second, excluding the upstream page and parser as the source of the 15-minute
delay.

The bounded response reader was invoking its scheduler heartbeat once per
decompressed stream chunk. Each corpus heartbeat performs durable D1 updates
for both the ingestion job and scheduled-run lease, so transport chunking
amplified one response into thousands of sequential remote D1 writes. Commit
`b80f76d` retains the per-chunk body-size and ten-second stall fences but
throttles body heartbeats to a 30-second interval, with explicit heartbeats at
the body boundaries. A regression response containing more than 4,096
one-byte chunks now produces exactly four heartbeats independent of chunk
count. The focused source-fetch suite passed 16/16; platform type-check, lint,
the shard Wrangler dry-run, the full 857-test core suite and the 186-test
Cloudflare suite passed.

The final staging-only deployment is Worker version
`737c8623-7af1-482b-839a-46672decd16c`, bound only to
`juro-staging-corpus-shard-2` (`36fa1cfe-6d00-47b7-a980-864020028d86`) and
Qdrant collection `juro_legal_staging_shard_2`; dense and sparse-compression
flags remained disabled and shadow mode remained enabled. The pre-deploy
invocation `ea7c63cd-e1ae-4f05-8326-12b3ba1f4367` reached the platform's
15-minute execution fence, and its last heartbeat left the fail-closed
distributed lease valid until `2026-08-25T17:58:44.816Z`. Intervening cron
ticks correctly emitted `legal_corpus.duplicate_or_busy`; no parallel crawler
was started and no lock row was manually changed.

The first safe takeover, run `65c20ba2-84ac-44d1-b6b1-219f411cbd38`, began
at `2026-08-25T18:00:44.925Z`. It reclaimed the target job on attempt 3 and
completed that job at `18:03:52.706Z` with `last_error_code=NULL`, rather than
stalling for another 15 minutes. The entire scheduled batch emitted
`legal_corpus.process_completed` from version `737c8623` with
`errorCode=NULL`, 7/7 claimed ingestion jobs and an expected start-cutoff
stop; it completed at `18:13:05.423Z` after 740,689 ms and released the
distributed lock. The durable post-run ledger contains five completed fetch
jobs, two completed version jobs, zero running jobs and zero terminal or
dead-letter jobs. Shard 2 contains 3 canonical documents, 4,560 provision
rows, 4,562 chunk rows and 11 source aliases; all 44 discovery checkpoints
remain completed.

This closes the shard-2 response-stream stall only. The queue remains active
and unfrozen with 25,799 queued fetch jobs, 1,861 queued version jobs and two
retrying recovery-evidence rows. Federated release floors, queue freeze,
snapshot, 314-scenario evaluation, Qdrant/D1 restore and CI gates therefore
remain open. No production binding, data, DNS or feature flag was touched.

## Historical-version lease recovery (2026-08-24, 19:56–19:58Z)

The long-running scheduled invocation `a103194e-d09d-4d9b-b272-0f696e0790dd`
was reclaimed at `2026-08-24T19:56:17.593Z` with
`LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED` after its last durable heartbeat at
`19:39:10.167Z`. The stale-running reconciliation recorded one retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` entry for the historical version job
`legal-version:761d756a8704c1085e59c001f88e` (`lexuz:149947`,
`?ONDATE=05.04.2019`); the job was subsequently marked `completed` on attempt
2 by the replacement invocation. The replacement run
`60f9db7c-2abe-4f29-af8d-3c6291dfa7fe` started at `19:56:17.593Z` and had a
fresh heartbeat at `19:58:52.446Z`, extending the distributed lock to
`20:13:52.446Z`.

The post-reclaim read-only probe recorded 315 canonical documents, 11,588
unique current provisions and 39,732 indexed chunks, with all 44 discovery
checkpoints completed. The ingestion ledger contained 759 completed, 26,989
queued and one running fetch job, plus 101 completed and 2,110 queued version
jobs. Explicit `failed`/`dead_letter`/`terminal`/`dead_lettered` job queries
remain empty. The failure ledger now has six retrying stale-running records
(including this recovered historical job), three retrying generic ingestion
records, six retrying language-text records and the same eight technically
unavailable source records. Release floors, queue freeze and all snapshot,
evaluation, Qdrant/D1-restore and CI gates remain open; production is
untouched.

## Post-fix shard run closure (2026-08-24, 19:08Z)

The post-deploy run `bec64037-61b1-461c-939b-508e8c5481d8` completed at
`2026-08-24T19:08:36.058Z` with `status=completed` and `error_code=NULL`.
Heartbeat updates were observed during the run after commit `9f0d4fc0` and
staging Worker version `e20bfa55-f8b6-4f7f-ae6e-d94a52dce52a` were deployed.
The read-only post-run aggregate is 290 canonical documents, 11,165 unique
current provisions and 36,893 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen (`fetch`: 715 completed,
27,000 queued; `version`: 99 completed, 2,112 queued). Jobs with status
`failed` or `dead_letter` remain zero. The failure ledger remains limited to
three retrying `LEGAL_CORPUS_INGESTION_FAILED`, five retrying stale-running
records, six retrying language-text records and six
`technically_unavailable` official-text records. Release floors, queue freeze
and all snapshot/evaluation/Qdrant/D1-restore/CI gates remain open; production
is untouched.

## Source-availability audit (2026-08-24, 19:14Z)

The next sequential run recorded one additional concrete source condition for
`lexuz:8264178` (`https://lex.uz/en/docs/8264178`, `president:en`):
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE`, `retryable=0`, `retry_count=1`,
`retry_state=technically_unavailable`. The corresponding fetch job is already
`status=completed` with `last_error_code` set to the same code; it is not a
`failed` or `dead_letter` job. A read-only alias lookup found no alternate
language source for this canonical ID. This is retained as an explicit source
availability limitation rather than hidden or retried indefinitely. The
failure ledger now has seven technically-unavailable official-text records;
terminal/dead-letter jobs remain zero and release floors/queue freeze remain
open.

## Source-availability audit (2026-08-24, 19:23Z)

The active run recorded one concrete upstream source condition for
`lexuz:5193832` (`https://lex.uz/en/docs/5193832`, `ministries:en`):
`LEGAL_SOURCE_UPSTREAM_UNAVAILABLE` with `http_status=404`, `retryable=0`,
`retry_count=1` and `retry_state=technically_unavailable`. The corresponding
fetch job is `status=completed` with the same `last_error_code`, not `failed`
or `dead_letter`; a read-only alias lookup found no alternate language source
for this canonical ID. The condition is therefore retained as a truthful
source limitation and is not retried indefinitely. Failure-ledger grouping now
contains one technically-unavailable upstream 404 in addition to the seven
official-text records; terminal/dead-letter jobs remain zero.

## Scheduler lease heartbeat fix and staging verification (2026-08-24, 18:56–19:01Z)

The scheduled run `b15ba697-378a-4ffa-baed-ac0e72486f92` stopped renewing its
lease while a Lex response body was being read and was reclaimed by the next
invocation at `2026-08-24T18:56:17.593Z` with
`LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED`. This was a scheduler-stall recovery,
not a terminal ingestion job: the explicit `failed`/`dead_letter` job query
remained empty. Commit `9f0d4fc0` forwards the scheduler heartbeat through
bounded Lex HTML/PDF/archive response reads and redirects, with a regression
test. The targeted source-fetch suite passed 15/15, platform type-check and
lint passed, and the legal-corpus artifact dry-run passed.

The staging-only deployment produced Worker version
`e20bfa55-f8b6-4f7f-ae6e-d94a52dce52a`. The next run
`bec64037-61b1-461c-939b-508e8c5481d8` started at `2026-08-24T18:56:17.593Z`
and had a fresh heartbeat at `2026-08-24T19:01:25.506Z`, confirming the fix
is active. Its read-only state is 286 canonical documents, 10,747 unique
current provisions and 35,202 indexed chunks; all 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen (`fetch`: 704 completed,
26,999 queued, one running; `version`: 98 completed, 2,113 queued). Jobs with
status `failed` or `dead_letter` remain zero. The failure ledger contains
three retrying `LEGAL_CORPUS_INGESTION_FAILED`, five retrying stale-running
records (including the reclaimed run), six retrying language-text records and
six `technically_unavailable` official-text records. Release floors, queue
freeze and all snapshot/evaluation/Qdrant/D1-restore/CI gates remain open;
production is untouched.

## Capacity guard verification after staging deploy (2026-08-24, 01:28Z)

Commit `7f4106b0` classified Cloudflare's hard D1-size wording as the safe
operational code `LEGAL_CORPUS_D1_CAPACITY_EXHAUSTED`, without persisting raw
provider details. Focused worker tests (21/21), type-check, lint and the
staging artifact dry-run passed. The staging-only deploy produced Worker
version `ec30b7c9-6727-4e05-91b0-69e9b3d41879` with the existing v2 D1 binding;
no flags, data, Qdrant collection or production binding changed.

The next cron invocation at `2026-08-24T01:28:20.192Z` emitted
`legal_corpus.claim_failed` with `errorCode=LEGAL_CORPUS_D1_CAPACITY_EXHAUSTED`.
The claim failed before a durable `scheduled_runs` row could be inserted, so
the prior two `D1_ERROR` rows remain the last persisted run records. The
read-only post-deploy probe still shows an empty distributed lock, 44/44
completed checkpoints, zero terminal/dead-letter jobs, 15 generic retrying
failures plus the same language/stale/official/timeout ledger, and unchanged
totals of 599 documents, 15,899 distinct current provisions and 55,814 indexed
current chunks. D1 size remains `9,999,998,976` bytes. The capacity diagnosis
is now directly confirmed by the Worker log, but the corpus floors and queue
freeze remain unmet; no snapshot, evaluation, restore or CI release gate is
claimed.

Cloudflare's current D1 limits document states that a single D1 database is
limited to 10 GB and that this per-database limit cannot be increased; it
recommends horizontal scale-out across multiple smaller databases. This is an
external platform constraint, not a release-gate relaxation:
<https://developers.cloudflare.com/d1/platform/limits/>.

## Post-resume read-only probe (2026-08-24, 05:17Z)

After the goal was resumed, a sequential read-only probe of the active v2
database used the release-gate aggregate from `admin-operations.ts`. It still
reports 599 canonical documents, 1,049 language variants, 15,899 distinct
current provisions, 55,814 current chunks and 55,814 indexed current chunks.
The ingestion ledger contains 2,674 completed, 27,686 queued, one retrying and
two running jobs; it contains zero `failed` or `dead_letter` jobs. All 44
discovery checkpoints are `completed`, and `scheduled_locks` is empty. The
last durable scheduler rows remain the earlier `D1_ERROR` records because the
capacity guard rejects the claim before a new row can be inserted.

The same probe verified the sparse-capacity transition is complete: the
compressed index contains 1,308,850 chunk keys and 64,936,933 postings, while
the legacy posting table is empty and all 1,308,850 chunk JSON payloads are
compacted to `[]`. This is a read-only observation, not permission to drop
the compressed index or to claim that D1 capacity has been recovered. D1
remains `9,999,998,976` bytes, so the document/provision floors and queue-freeze
gate remain unmet and snapshot, evaluation, restore and CI gates stay closed.

## Legacy/v2 capacity comparison (2026-08-24, read-only)

The active release source remains the isolated v2 database; no records are
copied or federated from the legacy database. A sequential read-only probe of
`juro-staging-corpus-v2` reports 599 canonical documents, 15,899 distinct
current provisions, 55,814 indexed current chunks, 44/44 completed discovery
checkpoints, zero terminal/dead-letter ingestion jobs, 27,097 queued fetch
jobs and 589 queued version jobs. `wrangler d1 info` reports
`databaseSizeBytes=9,999,998,976`.

For comparison only, the preserved legacy `juro-staging` database reports
3,575 canonical documents, 62,075 distinct current provisions and 151,499
indexed current chunks, but it also reports 38,310 queued fetch jobs and 5,373
queued version jobs. Its D1 size is likewise `9,999,998,976` bytes. It is not
a release substitute: its queue is not frozen, and its capacity evidence would
also fail the release reserve. The two ledgers therefore remain separate;
switching the binding would not prove the current release gate.

## Capacity-boundary continuation (2026-08-24, 01:12–01:15Z)

The subsequent scheduled run `e9844dfc-9245-4343-8e71-4c49d450c0ed` started at
`2026-08-24T01:12:20.191Z` and finished at `2026-08-24T01:13:00.605Z` with
`status=failed` and `error_code=D1_ERROR`. The read-only terminal/dead-letter
filter remains empty, so this is not a terminal ingestion result. Discovery is
still 44/44 `completed`; the distributed lock is empty. Queue composition is
unchanged at 1,055 completed and 27,097 queued fetch jobs, plus 1,619
completed, 589 queued, one retrying and two running version jobs. The failure
ledger remains 15 generic ingestion retries, seven language-text retries, four
stale-running retries, one official-text retry, one source-timeout retry and
five technically unavailable rows.

The release-gate aggregate remains 599 canonical documents, 1,049 language
variants, 15,899 distinct current provisions and 55,814 indexed current chunks.
The v2-only capacity capture at `2026-08-24T01:14:47.669Z` again reports
`databaseSizeBytes=9,999,998,976` for database ID
`62620fb3-3da3-4c76-a8e9-aa60858c1063`; the artifact SHA-256 is
`EAEA0E917AD9DE5CF8C51258985ED392A3C27E1CC133F3E23D3576147E99B6C2`.
The release floors and queue freeze remain unmet; snapshot, evaluation,
Qdrant/D1 restore and CI gates remain closed. No code redeploy, destructive
compaction, new database or production change was made.

## Capacity-boundary continuation (2026-08-24, 01:08–01:13Z)

The next scheduled run `2be43674-86be-4cd8-8e30-32d0a3a5a7d8` started at
`2026-08-24T01:08:20.192Z` and finished at `2026-08-24T01:09:32.002Z` with
`status=failed` and `error_code=D1_ERROR`. This is a scheduler/D1 error, not a
terminal or dead-letter ingestion job: the read-only terminal/dead-letter
filter remains empty. Discovery remains 44/44 `completed`, and the distributed
lock table is empty after the run. Queue composition is 1,055 completed and
27,097 queued fetch jobs, plus 1,619 completed, 589 queued, two retrying and
one running version job. The failure ledger contains 15
`LEGAL_CORPUS_INGESTION_FAILED` retries, seven language-text retries, four
stale-running retries, one official-text retry, one source-timeout retry and
five technically unavailable rows.

The release-gate aggregate remains 599 canonical documents, 1,049 language
variants, 15,899 distinct current provisions and 55,814 indexed current chunks.
An independent v2-only capacity capture at `2026-08-24T01:13:02.282Z` reports
`databaseSizeBytes=9,999,998,976` for database ID
`62620fb3-3da3-4c76-a8e9-aa60858c1063`; the artifact SHA-256 is
`77152728aaE70d670f93909064f49e3bc3256bcf705b14cd935d99ec92ca0a3e`.
The D1 size is therefore 1,024 bytes below the 10,000,000,000-byte ceiling.
Floors, queue freeze, snapshot, evaluation, Qdrant/D1 restore and CI gates
remain closed. No code redeploy, destructive compaction, new database or
production change was made.

## Capacity-boundary continuation (2026-08-24, 01:00–01:04Z)

Run `b83f9a13-d8a5-4384-841c-d8f208e3a9d4` completed at
`2026-08-24T01:04:39.481Z` with `error_code=LEGAL_CORPUS_INGESTION_FAILED`.
The direct terminal/dead-letter filter remains empty, while three version jobs
are `retrying`. The failure ledger now contains 14 generic ingestion retries,
seven `LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` retries, four stale-running
retries, one `LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` retry, one source-timeout
retry and five technically unavailable rows. Queue composition is 1,055
completed and 27,097 queued fetch jobs, plus 1,619 completed, 589 queued and
three retrying version jobs. Discovery remains 44/44 `completed`.
Materialized totals advanced to 599 canonical documents, 1,049 language
variants, 15,899 distinct current provisions and 55,814 indexed current
chunks. Query metadata reports `size_after=9,999,994,880` bytes, leaving only
5,120 bytes below the 10,000,000,000-byte ceiling. Floors, queue freeze,
snapshot, evaluation, Qdrant/D1 restore and CI gates remain closed; no code
redeploy, destructive compaction, new database or production change was made.

An independent machine-captured capacity artifact from the updated v2-only
capture script was generated at `2026-08-24T01:06:33.324Z`:
`databaseSizeBytes=9,999,994,880`, database ID
`62620fb3-3da3-4c76-a8e9-aa60858c1063`, file SHA-256
`4398ed82334c3604ef4ef474f754aea0f602e27072565b883744485931126f34`.

## Capacity-boundary monitoring (2026-08-24, 00:36–00:56Z)

Three consecutive scheduled runs completed their bounded work but recorded
`error_code=LEGAL_CORPUS_INGESTION_FAILED`: run
`3f83ddbf-343c-4300-97d7-d73ed9bd300a` (`00:36:20–00:42:53Z`), run
`d58635d4-d53f-4b88-ab9f-85055add5f55` (`00:44:20–00:48:51Z`) and run
`4263e2fb-cdfb-45e8-a9f4-0b4ca1ee0691` (`00:52:20–00:56:53Z`). The direct
terminal/dead-letter job filter is still empty, but a version job remains
`retrying`; the failure ledger has 10 generic ingestion retries, seven
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` retries, four stale-running retries,
one `LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` retry, one source-timeout retry
and five technically unavailable rows. Queue composition is 1,051 completed
and 27,101 queued fetch jobs, plus 1,618 completed, 592 queued and one
retrying version job. Materialized totals are 597 canonical documents, 1,045
language variants, 15,893 distinct current provisions and 55,808 indexed
current chunks; 44/44 discovery checkpoints remain completed.

The remote D1 size is stable at `9,999,978,496` bytes, immediately below the
10,000,000,000-byte database ceiling. A read-only `PRAGMA page_count` is
rejected by D1 with `SQLITE_AUTH`, while `PRAGMA page_size` returns 4,096;
the Worker does not persist the underlying low-level write error, so the
capacity diagnosis is recorded as an evidence-backed blocker rather than an
invented `SQLITE_FULL` claim. The corpus has 1,308,838 total chunks and
64,936,739 compressed sparse postings, explaining why the v2 database reaches
the ceiling before the release floors. No destructive compaction, flag change,
new database, staging redeploy or production change was performed. Floors,
queue freeze, snapshot, evaluation, Qdrant/D1 restore and CI gates remain
closed.

## Sequential v2 monitoring continuation (2026-08-24, 00:32Z)

Run `13c0b66f-d276-4e9d-a700-81229a2e0276` completed at
`2026-08-24T00:32:31.517Z` with `error_code=NULL`; its distributed lock was
released. Discovery remains 44/44 `completed`. The direct terminal/dead-letter
filter is empty. The failure ledger remains 15 `retrying` and five
`technically_unavailable`. Queue composition is 1,039 completed and 27,113
queued fetch jobs, plus 1,611 completed and 600 queued version jobs. Materialized
totals advanced to 590 canonical documents, 1,033 language variants, 15,855
distinct current provisions and 55,722 indexed current chunks. Query metadata
reports `size_after=9,973,362,688` bytes; this is not the final capacity
artifact. Floors and queue freeze remain unmet, so snapshot, evaluation,
Qdrant/D1 restore and CI gates remain closed. No code change or staging
redeploy was justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-24, 00:21Z)

Run `71adb34c-b0ef-4b33-9c68-b0d28d929013` completed at
`2026-08-24T00:21:01.633Z` with `error_code=NULL`; the distributed lock is
now released. Discovery remains 44/44 `completed`. The direct
terminal/dead-letter filter is empty; the only non-completed ingestion jobs
are queued work. Queue composition is 1,034 completed and 27,118 queued fetch
jobs, plus 1,607 completed and 604 queued version jobs. The failure ledger
remains 15 `retrying` and five `technically_unavailable`. Materialized totals
remain 587 canonical documents, 1,028 language variants, 15,765 distinct
current provisions and 55,622 indexed current chunks. Query metadata reports
`size_after=9,925,795,840` bytes; this is not the final capacity artifact.
Floors and queue freeze remain unmet, so snapshot, evaluation, Qdrant/D1
restore and CI gates remain closed. No code change or staging redeploy was
justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-24, 00:18–00:19Z)

Run `71adb34c-b0ef-4b33-9c68-b0d28d929013` remains `running`; its distributed
lock is renewed through `2026-08-24T00:32:58.800Z`. Discovery remains 44/44
`completed`. Queue composition is 1,034 completed and 27,118 queued fetch
jobs, plus 1,605 completed, 605 queued and one running version job. Direct
terminal/dead-letter filtering remains empty. The failure ledger remains 15
`retrying` and five `technically_unavailable`. Materialized totals remain 587
canonical documents, 1,028 language variants, 15,765 distinct current
provisions and 55,622 indexed current chunks. Query metadata reports
`size_after=9,901,559,808` bytes; this is not the final capacity artifact.
Floors and queue freeze remain unmet, so snapshot, evaluation, Qdrant/D1
restore and CI gates remain closed. No code change or staging redeploy was
justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-24, 00:17–00:18Z)

Run `71adb34c-b0ef-4b33-9c68-b0d28d929013` remains `running`; its distributed
lock is renewed through `2026-08-24T00:32:06.787Z`. Discovery remains 44/44
`completed`. Queue composition is 1,034 completed and 27,118 queued fetch
jobs, plus 1,604 completed, 606 queued and one running version job. Direct
terminal/dead-letter filtering remains empty; the failure ledger remains 15
`retrying` and five `technically_unavailable`. Materialized totals remain 587
canonical documents, 1,028 language variants, 15,765 distinct current
provisions and 55,622 indexed current chunks. Query metadata reports
`size_after=9,897,041,920` bytes; this is not the final capacity artifact.
Floors and queue freeze remain unmet, so snapshot, evaluation, Qdrant/D1
restore and CI gates remain closed. No code change or staging redeploy was
justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-24, 00:15–00:16Z)

Run `71adb34c-b0ef-4b33-9c68-b0d28d929013` remains `running` under the
single distributed lock, renewed through `2026-08-24T00:30:59.369Z`.
Discovery remains 44/44 `completed`. Queue composition is 1,034 completed
and 27,118 queued fetch jobs, plus 1,603 completed, 607 queued and one
running version job. Direct terminal/dead-letter filtering remains empty; the
failure ledger remains 15 `retrying` and five `technically_unavailable`.
Materialized totals advanced to 587 canonical documents, 1,028 language
variants, 15,765 distinct current provisions and 55,622 indexed current
chunks. Query metadata reports `size_after=9,888,964,608` bytes; this is not
the final capacity artifact. Floors and queue freeze remain unmet, so
snapshot, evaluation, Qdrant/D1 restore and CI gates remain closed. No code
change or staging redeploy was justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-24, 00:14–00:15Z)

Run `71adb34c-b0ef-4b33-9c68-b0d28d929013` remains `running` under the single
distributed lock, renewed through `2026-08-24T00:29:19.169Z`. Discovery
remains 44/44 `completed`. Queue composition is 1,033 completed, 27,118
queued and one running fetch job, plus 1,603 completed and 608 queued version
jobs. Direct terminal/dead-letter filtering remains empty; the failure ledger
remains 15 `retrying` and five `technically_unavailable`. Materialized totals
advanced to 586 canonical documents, 1,027 language variants, 15,760 distinct
current provisions and 55,617 indexed current chunks. Query metadata reports
`size_after=9,877,147,648` bytes; this is not the final capacity artifact.
Floors and queue freeze remain unmet, so snapshot, evaluation, Qdrant/D1
restore and CI gates remain closed. No code change or staging redeploy was
justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-24, 00:12–00:13Z)

Run `71adb34c-b0ef-4b33-9c68-b0d28d929013` is `running` under the single
distributed lock, renewed through `2026-08-24T00:27:34.336Z`. Discovery
remains 44/44 `completed`. Queue composition is 1,029 completed, 27,122
queued and one running fetch job, plus 1,603 completed and 608 queued version
jobs. Direct terminal/dead-letter filtering remains empty. The failure ledger
remains 15 `retrying` and five `technically_unavailable`. Materialized totals
remain 583 canonical documents, 1,023 language variants, 15,690 distinct
current provisions and 55,531 indexed current chunks. Query metadata reports
`size_after=9,876,557,824` bytes; this is not the final capacity artifact.
Floors and queue freeze remain unmet, so snapshot, evaluation, Qdrant/D1
restore and CI gates remain closed. No code change or staging redeploy was
justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-24, 00:09Z)

Run `f4961a70-4854-4580-83fc-320634779c39` completed at
`2026-08-24T00:08:56.156Z` with `error_code=NULL`; the distributed lock was
released. Post-run probes show 44/44 discovery checkpoints `completed`, no
terminal/dead-letter jobs, 15 `retrying` and five `technically_unavailable`
failure rows. The queue is 1,029 completed and 27,123 queued fetch jobs, plus
1,603 completed and 608 queued version jobs. Materialized totals remain 583
canonical documents, 1,023 language variants, 15,690 distinct current
provisions and 55,531 indexed current chunks. Query metadata reports
`size_after=9,876,553,728` bytes; this is not the final capacity artifact.
Release floors and queue freeze remain unmet, so snapshot, evaluation,
Qdrant/D1 restore and CI gates stay closed. No code change or staging redeploy
was justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-24, 00:08–00:09Z)

Run `f4961a70-4854-4580-83fc-320634779c39` remains `running`; the lock is
renewed through `2026-08-24T00:23:37.093Z`. Discovery remains 44/44
`completed`. Queue composition is 1,029 completed and 27,123 queued fetch
jobs, plus 1,603 completed and 608 queued version jobs. Direct
terminal/dead-letter filtering remains empty. The failure ledger remains 15
`retrying` and five `technically_unavailable`. Materialized totals remain 583
canonical documents, 1,023 language variants, 15,690 distinct current
provisions and 55,531 indexed current chunks. Query metadata reports
`size_after=9,876,553,728` bytes; this is not the final capacity artifact.
Floors and queue freeze remain unmet, so snapshot, evaluation, Qdrant/D1
restore and CI gates remain closed. No code change or staging redeploy was
justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-24, 00:06–00:07Z)

Run `f4961a70-4854-4580-83fc-320634779c39` remains `running`; the distributed
lock is renewed through `2026-08-24T00:21:46.268Z`. Discovery remains 44/44
`completed`. Queue composition is 1,029 completed and 27,123 queued fetch
jobs, plus 1,601 completed, 609 queued and one running version job. Direct
terminal/dead-letter filtering remains empty. The failure ledger remains 15
`retrying` and five `technically_unavailable`. Materialized totals remain 583
canonical documents, 1,023 language variants, 15,690 distinct current
provisions and 55,531 indexed current chunks. Query metadata reports
`size_after=9,863,819,264` bytes; this is not the final capacity artifact.
Floors and queue freeze remain unmet, so snapshot, evaluation, Qdrant/D1
restore and CI gates remain closed. No code change or staging redeploy was
justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-24, 00:04–00:05Z)

Run `f4961a70-4854-4580-83fc-320634779c39` remains `running`; the single
distributed lock is renewed through `2026-08-24T00:19:52.300Z`. Discovery is
44/44 `completed`. Queue composition is 1,029 completed and 27,123 queued
fetch jobs, plus 1,600 completed, 610 queued and one running version job.
Direct terminal/dead-letter filtering remains empty. The failure ledger
remains 15 `retrying` and five `technically_unavailable`. Materialized totals
remain 583 canonical documents, 1,023 language variants, 15,690 distinct
current provisions and 55,531 indexed current chunks. Query metadata reports
`size_after=9,847,357,440` bytes; this is not the final capacity artifact.
Floors and queue freeze remain unmet, so snapshot, evaluation, Qdrant/D1
restore and CI gates remain closed. No code change or staging redeploy was
justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-24, 00:03–00:04Z)

Run `f4961a70-4854-4580-83fc-320634779c39` remains `running`; its latest
scheduler update is `2026-08-24T00:03:46.299Z`. Discovery remains 44/44
`completed`. The queue contains 1,029 completed and 27,123 queued fetch jobs,
plus 1,599 completed, 611 queued and one running version job. Direct
terminal/dead-letter filtering remains empty. The failure ledger remains 15
`retrying` and five `technically_unavailable`, including the newly recorded
English official-text unavailability documented above. Totals advanced to 583
canonical documents, 1,023 language variants, 15,690 distinct current
provisions and 55,531 indexed current chunks. Query metadata reports
`size_after=9,838,489,600` bytes; this is not the final capacity artifact.
Floors and queue freeze remain unmet, so snapshot, evaluation, Qdrant/D1
restore and CI gates remain closed. No code change or staging redeploy was
justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-24, 00:02Z)

Run `f4961a70-4854-4580-83fc-320634779c39` remains `running` under its
single distributed lock. Discovery remains 44/44 `completed`. Queue
composition is 1,028 completed, 27,123 queued and one running fetch job,
plus 1,599 completed and 612 queued version jobs. The direct
terminal/dead-letter filter remains empty. The failure ledger is now 15
`retrying` and five `technically_unavailable`; the newly recorded row is
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` for the English Lex URL
`https://lex.uz/en/docs/8380252`, which is a source-condition record rather
than a terminal ingestion failure. Totals are 580 canonical documents, 1,020
language variants, 15,680 distinct current provisions and 55,521 indexed
current chunks. Query metadata reports `size_after=9,827,614,720` bytes; this
is not the final capacity artifact. Floors and queue freeze remain unmet, so
all post-ingestion gates stay closed. No code change or staging redeploy was
justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-24, 00:00–00:01Z)

Run `f4961a70-4854-4580-83fc-320634779c39` is `running` under the single
distributed lock, renewed through `2026-08-24T00:15:36.654Z`. Discovery
remains 44/44 `completed`. The queue contains 1,025 completed, 27,126 queued
and one running fetch job, plus 1,599 completed and 612 queued version jobs.
The direct terminal/dead-letter filter is empty; the failure ledger remains
15 `retrying` and four `technically_unavailable`. Materialized totals advanced
to 580 canonical documents, 1,020 language variants, 15,680 distinct current
provisions and 55,521 indexed current chunks. Read-only query metadata reports
`size_after=9,827,598,336` bytes; this is not the final capacity artifact.
Release floors and queue freeze remain unmet, so snapshot, evaluation,
Qdrant/D1 restore and CI remain closed. No code change or staging redeploy was
justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-23, 23:56–23:57Z)

Run `f668e7f4-9e54-43e2-adaa-3f97097cde22` completed at
`2026-08-23T23:56:50.215Z` with `error_code=NULL`; its distributed lock was
released. Post-run probes show 44/44 discovery checkpoints `completed`, no
terminal/dead-letter jobs, 15 `retrying` and four `technically_unavailable`
failure rows. The queue is 1,024 completed and 27,128 queued fetch jobs, plus
1,599 completed and 612 queued version jobs. Materialized totals remain 579
canonical documents, 1,019 language variants, 15,672 distinct current
provisions and 55,513 indexed current chunks. The D1 query metadata reports
`size_after=9,827,569,664` bytes; the required fresh 8-GB capacity artifact
has not been captured because the release floors and queue freeze are unmet.
Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain closed.
No code change or staging redeploy was justified; production remains
untouched.

## Sequential v2 monitoring continuation (2026-08-23, 23:54–23:55Z)

Run `f668e7f4-9e54-43e2-adaa-3f97097cde22` remains `running`; the distributed
lock was renewed through `2026-08-24T00:09:56.035Z`. Discovery remains 44/44
`completed`. Queue composition is 1,024 completed and 27,128 queued fetch
jobs, plus 1,598 completed, 612 queued and one running version job. Direct
terminal/dead-letter filtering remains empty. The failure ledger remains 15
`retrying` and four `technically_unavailable`. Materialized totals remain 579
canonical documents, 1,019 language variants, 15,672 distinct current
provisions and 55,513 indexed current chunks. The read-only query metadata
reports `size_after=9,815,187,456` bytes; this is not the final capacity
artifact. Floors and queue freeze remain unmet, so snapshot, evaluation,
Qdrant/D1 restore and CI gates remain closed. No code change or staging
redeploy was justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-23, 23:53Z)

Run `f668e7f4-9e54-43e2-adaa-3f97097cde22` remains `running` with the
single distributed lock; the scheduler last updated it at
`2026-08-23T23:53:07.079Z`. Discovery is still 44/44 `completed`. Queue
composition is 1,024 completed, 27,128 queued and one running fetch job,
plus 1,596 completed, 614 queued and one running version job. The direct
terminal/dead-letter filter remains empty, and the failure ledger remains 15
`retrying` and four `technically_unavailable`. Totals are 579 canonical
documents, 1,019 language variants, 15,672 distinct current provisions and
55,513 indexed current chunks. D1 query metadata reports
`size_after=9,795,543,040` bytes; this is not the final capacity artifact.
The release floors and queue freeze remain unmet, so snapshot, evaluation,
Qdrant/D1 restore and CI gates remain closed. No code change or staging
redeploy was justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-23, 23:49–23:50Z)

Run `f668e7f4-9e54-43e2-adaa-3f97097cde22` remains `running` under the
single distributed lock. Its latest scheduler update is
`2026-08-23T23:49:54.760Z`. Discovery remains 44/44 `completed`. The queue
currently contains 1,023 completed, 27,128 queued and one running fetch job,
plus 1,595 completed and 616 queued version jobs. The direct
terminal/dead-letter filter is empty; the failure ledger remains 15
`retrying` and four `technically_unavailable`. Materialized totals advanced to
578 canonical documents, 1,018 language variants, 15,667 distinct current
provisions and 55,508 indexed current chunks. The query metadata reports
`size_after=9,778,088,888` bytes; this is not the fresh capacity artifact
required by the final release verifier. Floors and queue freeze remain unmet,
so snapshot, indexed evaluation, Qdrant/D1 restore and CI remain closed. No
code change or staging redeploy was justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-23, 23:44–23:48Z)

Run `b90c1212-24f8-447d-aff8-966ebfb48163` completed at
`2026-08-23T23:44:35.146Z` with `error_code=NULL`; the distributed lock was
released. A new scheduled run `f668e7f4-9e54-43e2-adaa-3f97097cde22` was
observed `running` at `2026-08-23T23:48:20.192Z` under the next lease.
Discovery remains 44/44 `completed`. Immediately after closure, fetch jobs
were 1,019 `completed`, 27,131 `queued` and no running fetch; version jobs
were 1,595 `completed` and 616 `queued`. At the next lease, one fetch job was
running and the queue was 1,019 completed / 27,130 queued fetches plus 1,595
completed / 616 queued versions. Direct terminal/dead-letter filtering remains
empty; the failure ledger remains 15 `retrying` and four
`technically_unavailable`. Totals remain 575 canonical documents, 1,014
language variants, 15,659 distinct current provisions and 55,500 indexed
current chunks. `wrangler d1 info` reports the v2 database at 9.78 GB; this is
an operational observation, not the fresh 8-GB release-capacity artifact.
Floors and queue freeze remain unmet, so snapshot, evaluation, Qdrant/D1
restore and CI gates stay closed. No code change or staging redeploy was
justified; production remains untouched.

## Sequential v2 monitoring continuation (2026-08-23, 23:43Z)

Run `b90c1212-24f8-447d-aff8-966ebfb48163` is still `running`; its single
distributed lock is renewed through `2026-08-23T23:56:40.517Z`. Discovery is
44/44 `completed`. Fetch jobs are 1,019 `completed` and 27,131 `queued`;
version jobs are 1,594 `completed`, 616 `queued` and one `running`. The
read-only terminal/dead-letter filter is empty. Failure ledger counts remain
15 `retrying` and four `technically_unavailable`. Materialized totals remain
575 canonical documents, 1,014 language variants, 15,659 distinct current
provisions and 55,500 indexed current chunks. Floors are unmet and ingestion
is not frozen; snapshot, evaluation, Qdrant/D1 restore and CI remain closed.
No code change or staging redeploy was justified; production remains
untouched.

## Sequential v2 monitoring continuation (2026-08-23, 23:40Z)

Run `b90c1212-24f8-447d-aff8-966ebfb48163` remains `running` under the
single distributed lock, renewed through `2026-08-23T23:53:40.704Z`.
Discovery remains 44/44 `completed`. Queue composition is 1,019 completed
and 27,131 queued fetch jobs, plus 1,591 completed, 619 queued and one
running version job. Direct terminal/dead-letter filtering remains empty.
The failure ledger contains 15 `retrying` and four
`technically_unavailable` rows; the latter are source-availability evidence,
not terminal ingestion failures. Materialized totals are 575 canonical
documents, 1,014 language variants, 15,659 distinct current provisions and
55,500 indexed current chunks. Document/provision floors remain unmet and the
queue is not frozen, so snapshot, evaluation, Qdrant/D1 restore and CI gates
remain closed. No code change or staging redeploy was justified; production
remains untouched.

## Sequential v2 monitoring continuation (2026-08-23, 23:33Z)

Run `9415299f-439d-484b-9ac5-cd70852091fa` completed at
`2026-08-23T23:32:56.542Z` without an error; the distributed lock is released.
Discovery remains 44/44 `completed`. Queue composition is 1,014 completed and
27,136 queued fetch jobs, plus 1,591 completed and 620 queued version jobs; no
job is `running`, `failed`, `terminal` or `dead_letter`. Materialized totals
remain 571 canonical documents, 1,010 language variants, 15,640 distinct
current provisions and 55,481 indexed current chunks. Failure ledger counts
remain 15 `retrying` and three `technically_unavailable`, with no terminal or
dead-letter failure. Document/provision floors remain unmet and the queue is
not frozen, so post-ingestion release gates remain closed. No code change or
staging redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 23:31Z)

Run `9415299f-439d-484b-9ac5-cd70852091fa` remains `running` under the single
distributed lock, renewed through `2026-08-23T23:46:22.927Z`. Discovery remains
44/44 `completed`. Queue composition is 1,014 completed and 27,136 queued fetch
jobs, plus 1,590 completed, 620 queued and one running version job. Direct
terminal/dead-letter filtering remains empty; the failure ledger remains 15
`retrying` and three `technically_unavailable` rows. Materialized totals remain
571 canonical documents, 1,010 language variants, 15,640 distinct current
provisions and 55,481 indexed current chunks. Floors remain unmet and the queue
is not frozen, so post-ingestion release gates remain closed. No code change or
staging redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 23:29Z)

Run `9415299f-439d-484b-9ac5-cd70852091fa` remains `running` under the single
distributed lock, renewed through `2026-08-23T23:44:03.242Z`. Discovery remains
44/44 `completed`. Queue composition is 1,014 completed and 27,136 queued fetch
jobs, plus 1,588 completed, 622 queued and one running version job. Direct
terminal/dead-letter filtering remains empty; failure ledger counts remain 15
`retrying` and three `technically_unavailable`. Materialized totals remain 571
canonical documents, 1,010 language variants, 15,640 distinct current
provisions and 55,481 indexed current chunks. Document/provision floors remain
unmet and the queue is not frozen, so all post-ingestion release gates stay
closed. No code change or staging redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 23:27Z)

Run `9415299f-439d-484b-9ac5-cd70852091fa` remains `running` under the single
distributed lock, renewed through `2026-08-23T23:42:41.766Z`. Discovery remains
44/44 `completed`. Queue composition is 1,014 completed, 27,136 queued and no
running fetch job, plus 1,587 completed, 623 queued and one running version
job. Direct terminal/dead-letter filtering remains empty; the failure ledger
remains 15 `retrying` and three `technically_unavailable` rows. Materialized
totals advanced to 571 canonical documents, 1,010 language variants, 15,640
distinct current provisions and 55,481 indexed current chunks. Document and
provision floors remain unmet and the queue is not frozen, so post-ingestion
release gates remain closed. No code change or staging redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 23:25Z)

Run `9415299f-439d-484b-9ac5-cd70852091fa` is `running` under the single
distributed lock, renewed through `2026-08-23T23:40:03.542Z`. Discovery remains
44/44 `completed`. Queue composition is 1,011 completed, 27,138 queued and one
running fetch job, plus 1,587 completed and 624 queued version jobs. Direct
terminal/dead-letter filtering remains empty; the failure ledger remains 15
`retrying` and three `technically_unavailable` rows. Materialized totals
advanced to 570 canonical documents, 1,008 language variants, 15,569 distinct
current provisions and 55,308 indexed current chunks. Document/provision floors
remain unmet and the queue is not frozen, so post-ingestion release gates stay
closed. No code change or staging redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 23:21Z)

Run `5a319b29-4351-435e-a07f-4a43a19f4825` completed at
`2026-08-23T23:21:01.888Z` without an error; the distributed lock is released.
Discovery remains 44/44 `completed`. Queue composition is 1,009 completed and
27,138 queued fetch jobs, plus 1,587 completed and 624 queued version jobs; no
job is `running`, `failed`, `terminal` or `dead_letter`. Materialized totals
remain 567 canonical documents, 1,005 language variants, 15,526 distinct
current provisions and 55,220 indexed current chunks. Failure ledger counts
remain 15 `retrying` and three `technically_unavailable`, with no terminal or
dead-letter failure. Document/provision floors remain unmet and the queue is
not frozen, so post-ingestion gates remain closed. No code change or staging
redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 23:20Z)

Run `5a319b29-4351-435e-a07f-4a43a19f4825` remains `running` under the same
distributed lock. Queue composition is 1,009 completed and 27,138 queued fetch
jobs, plus 1,586 completed, 624 queued and one running version job. Discovery
remains 44/44 `completed`; direct terminal/dead-letter filtering is empty and
the failure ledger remains 15 `retrying` and three `technically_unavailable`
rows. Materialized totals remain 567 canonical documents, 1,005 language
variants, 15,526 distinct current provisions and 55,220 indexed current chunks.
The queue is not frozen and document/provision floors remain unmet, so all
post-ingestion release gates remain closed. No code change or staging redeploy
was justified.

## Sequential v2 monitoring continuation (2026-08-23, 23:17Z)

Run `5a319b29-4351-435e-a07f-4a43a19f4825` remains `running`; the distributed
lock is renewed through `2026-08-23T23:32:40.680Z`. Discovery remains 44/44
`completed`. Queue composition is 1,009 completed and 27,138 queued fetch jobs,
plus 1,584 completed, 626 queued and one running version job. No
`failed`/`terminal`/`dead_letter`/`dead_lettered` job rows are present; failure
ledger counts remain 15 `retrying` and three `technically_unavailable`. Totals
remain 567 canonical documents, 1,005 language variants, 15,526 distinct
current provisions and 55,220 indexed current chunks. The queue is not frozen
and document/provision floors remain unmet, so post-ingestion gates stay closed.
No code change or staging redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 23:15Z)

Run `5a319b29-4351-435e-a07f-4a43a19f4825` remains `running` under the single
distributed lock, renewed through `2026-08-23T23:30:20.493Z`. Discovery remains
44/44 `completed`. Queue composition is 1,009 completed, 27,138 queued and one
running fetch job, plus 1,583 completed, 627 queued and one running version job.
Direct terminal/dead-letter filtering remains empty; the failure ledger remains
15 `retrying` and three `technically_unavailable` rows. Materialized totals
advanced to 567 canonical documents, 1,005 language variants, 15,526 distinct
current provisions and 55,220 indexed current chunks. Document/provision floors
remain unmet and the queue is not frozen, so all post-ingestion release gates
remain closed. No code change or staging redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 23:12Z)

Run `5a319b29-4351-435e-a07f-4a43a19f4825` is `running` under the single
distributed lock, renewed through `2026-08-23T23:27:59.561Z`. Discovery remains
44/44 `completed`. Queue composition is 1,005 completed, 27,141 queued and one
running fetch job, plus 1,583 completed and 628 queued version jobs. Direct
status filtering returns no `failed`, `terminal`, `dead_letter` or
`dead_lettered` ingestion jobs; the failure ledger remains 15 `retrying` and
three `technically_unavailable` rows. Materialized totals advanced to 565
canonical documents, 1,002 language variants, 15,516 distinct current
provisions and 55,209 indexed current chunks. Document/provision floors remain
unmet and the queue is not frozen, so post-ingestion release gates remain
closed. No code change or staging redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 23:09Z)

Run `bc0e5d6c-6bab-4b6e-8aee-1d247ff8ea7e` completed at
`2026-08-23T23:08:58.433Z` without an error; the lock is released. Discovery
remains 44/44 `completed`. Queue composition is 1,004 completed and 27,143
queued fetch jobs, plus 1,583 completed and 628 queued version jobs; no job is
`running`, `failed`, `terminal` or `dead_letter`. Materialized totals remain
563 canonical documents, 1,000 language variants, 15,489 distinct current
provisions and 55,171 indexed current chunks. The failure ledger remains 15
`retrying` and three `technically_unavailable` rows, with no terminal/dead-letter
failure. Document/provision floors remain unmet and the queue is not frozen, so
post-ingestion release gates remain closed. No code change or staging redeploy
was justified.

## Sequential v2 monitoring continuation (2026-08-23, 23:06Z)

Run `bc0e5d6c-6bab-4b6e-8aee-1d247ff8ea7e` remains `running` under the single
lock, renewed through `2026-08-23T23:21:35.778Z`. Discovery remains 44/44
`completed`. Queue composition is 1,004 completed and 27,143 queued fetch jobs,
plus 1,581 completed, 629 queued and one running version job. Direct filtering
still returns no `failed`, `terminal`, `dead_letter` or `dead_lettered` jobs;
the failure ledger remains 15 `retrying` and three `technically_unavailable`
rows. Materialized totals remain 563 canonical documents, 1,000 language
variants, 15,489 distinct current provisions and 55,171 indexed current chunks.
Document/provision floors remain unmet and the queue is not frozen, so every
post-ingestion gate remains closed. No code change or staging redeploy was
justified.

## Sequential v2 monitoring continuation (2026-08-23, 23:04Z)

Run `bc0e5d6c-6bab-4b6e-8aee-1d247ff8ea7e` remains `running`; its distributed
lock is renewed through `2026-08-23T23:19:12.965Z`. Discovery remains 44/44
`completed`. The queue is 1,004 completed and 27,143 queued fetch jobs, plus
1,580 completed, 630 queued and one running version job. Terminal/dead-letter
status filtering remains empty, and the failure ledger remains 15 `retrying`
and three `technically_unavailable` rows. Materialized totals are unchanged at
563 canonical documents, 1,000 language variants, 15,489 distinct current
provisions and 55,171 indexed current chunks. Floors remain unmet and the queue
is not frozen; all post-ingestion gates remain closed. No code change or staging
redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 23:03Z)

The active run `bc0e5d6c-6bab-4b6e-8aee-1d247ff8ea7e` remains `running` under
the single distributed lock. Queue composition advanced to 1,004 completed and
27,143 queued fetch jobs, plus 1,579 completed, 631 queued and one running
version job. Direct terminal/dead-letter filtering remains empty; the failure
ledger remains 15 `retrying` and three `technically_unavailable` rows. The
materialized totals advanced to 563 canonical documents, 1,000 language
variants, 15,489 distinct current provisions and 55,171 indexed current chunks.
Discovery remains 44/44 `completed`. Document/provision floors remain unmet and
the queue is not frozen, so all post-ingestion gates remain closed. The single
Cloudflare API 7403 probe failure was retried successfully and caused no state
change. No code change or staging redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 23:00Z)

Run `bc0e5d6c-6bab-4b6e-8aee-1d247ff8ea7e` is `running` under the single
distributed lock, renewed through `2026-08-23T23:15:34.631Z`. Discovery remains
44/44 `completed`. Queue composition is 999 completed, 27,147 queued and one
running fetch job, plus 1,579 completed and 632 queued version jobs. Direct
status filtering returned no `failed`, `terminal`, `dead_letter` or
`dead_lettered` ingestion jobs. Materialized totals advanced to 560 canonical
documents, 996 language variants, 15,478 distinct current provisions and
55,160 indexed current chunks. The failure ledger remains 15 `retrying` and
three `technically_unavailable` rows. Document/provision floors remain unmet
and the queue is not frozen, so post-ingestion gates remain closed. No code
change or staging redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 22:57Z)

Run `cbd49631-3e46-4325-a922-0401457110df` completed at
`2026-08-23T22:57:06.624Z` without an error, and the distributed lock is
released. Discovery remains 44/44 `completed`. Queue composition is 999
completed and 27,148 queued fetch jobs, plus 1,579 completed and 632 queued
version jobs; no ingestion job is `running`, `failed`, `terminal` or
`dead_letter`. Materialized totals remain 559 canonical documents, 995 language
variants, 15,477 distinct current provisions and 55,159 indexed current chunks.
The failure ledger remains 15 `retrying` and three `technically_unavailable`
rows, with no terminal/dead-letter failure. Document/provision floors remain
unmet and the queue is not frozen, so post-ingestion release gates remain
closed. No code change or staging redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 22:55Z)

The same bounded run `cbd49631-3e46-4325-a922-0401457110df` remains `running`
with no run error. Queue composition is 999 completed and 27,148 queued fetch
jobs, plus 1,577 completed, 633 queued and one running version job. The
materialized totals remain 559 canonical documents, 995 language variants,
15,477 distinct current provisions and 55,159 indexed current chunks. The
checkpoint ledger remains 44/44 `completed`, and no terminal/dead-letter job
rows are present. The queue is not frozen and document/provision floors remain
unmet; snapshot, evaluation, Qdrant and D1 restore gates remain closed. No code
change or staging redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 22:52Z)

Run `cbd49631-3e46-4325-a922-0401457110df` remains `running` under the single
distributed lock, renewed through `2026-08-23T23:06:45.268Z`. Discovery remains
44/44 `completed`. Queue composition is 999 completed and 27,148 queued fetch
jobs, plus 1,575 completed, 635 queued and one running version job. Materialized
v2 totals advanced to 559 canonical documents, 995 language variants, 15,477
distinct current provisions and 55,159 indexed current chunks. Terminal/dead-
letter rows remain zero. The failure ledger contains 15 `retrying` rows and
three `technically_unavailable` rows (the latest is an English official-text
unavailability, not a terminal/dead-letter result). Document/provision floors
remain unmet and the queue is not frozen, so all post-ingestion release gates
remain closed. No code change or staging redeploy was justified.

## Cross-database reconciliation probe (2026-08-23, 22:49Z)

This was a read-only reconciliation; no bulk export/import or cross-database
write was started. The legacy `juro-staging` database currently reports 3,575
canonical documents, 62,075 distinct current provisions and 151,499 indexed
current chunks. The isolated `juro-staging-corpus-v2` database currently reports
555 canonical documents, 15,460 distinct current provisions and 55,138 indexed
current chunks. These are not being treated as equivalent snapshots: v2 is being
populated by its own bounded Lex.uz discovery/fetch/version pipeline, and the
worker does not automatically copy the legacy database. A future delta import,
if needed, would require a separately reviewed export/manifest/restore plan and
would preserve canonical IDs, content hashes and version history; it is not part
of this probe.

The current v2 scheduled run is `cbd49631-3e46-4325-a922-0401457110df` and is
`running` under the single `legal-corpus-worker` lock, renewed through
`2026-08-23T23:04:17.023Z`. Discovery remains 44/44 `completed`. Queue
composition is 994 completed and 27,153 queued fetch jobs, plus 1,575 completed
and 636 queued version jobs. Terminal/dead-letter failure rows remain zero; the
failure ledger remains 15 `retrying` and two `technically_unavailable` rows.
The document and provision release floors remain unmet and the queue is not
frozen, so snapshot, evaluation, Qdrant and D1 restore gates remain closed.
Production is unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 22:44Z)

Run `7817848a-ee11-410f-a233-25f45e12e5b3` remains `running` under the single
distributed lock, renewed through `2026-08-23T22:59:13.342Z`. Discovery remains
44/44 completed. Queue composition is 994 completed and 27,153 queued fetch
jobs, plus 1,574 completed, 636 queued and one running version job. Materialized
totals remain 555 canonical documents, 991 language variants, 15,448 distinct
current provisions and 55,529 indexed current chunks. Terminal/dead-letter jobs
remain zero; the failure ledger remains 15 `retrying` and two
`technically_unavailable` English official-text rows. Document/provision floors
remain unmet and the queue is not frozen, so all post-ingestion gates remain
closed. No code change or staging redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 22:42Z)

The active bounded run remains under the single distributed lock. A read-only
queue-type reconciliation shows 994 completed fetch jobs and 27,153 queued
fetch jobs, plus 1,573 completed, 637 queued and one running version job. This
explains why canonical-document growth is slower while the worker drains its
bounded historical-version backlog; no queue rows were modified. Discovery
remains 44/44 completed, terminal/dead-letter jobs remain zero, and the
materialized totals remain 555 canonical documents, 15,448 distinct current
provisions and 55,529 indexed current chunks. Document/provision floors remain
unmet and the queue is not frozen; all post-ingestion gates remain closed.

## Sequential v2 monitoring continuation (2026-08-23, 22:41Z)

Run `7817848a-ee11-410f-a233-25f45e12e5b3` remains `running` under the single
distributed lock, renewed through `2026-08-23T22:55:27.471Z`. Discovery remains
44/44 completed. Ingestion advanced to 2,566 completed and 27,791 queued jobs,
with one running version job. Materialized totals remain 555 canonical
documents, 991 language variants, 15,448 distinct current provisions and
55,529 indexed current chunks. Terminal/dead-letter jobs remain zero; the
failure ledger remains 15 `retrying` and two `technically_unavailable` English
official-text rows. Document/provision floors remain unmet and the queue is not
frozen, so all post-ingestion gates remain closed. No code change or staging
redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 22:39Z)

Run `7817848a-ee11-410f-a233-25f45e12e5b3` remains `running` under the single
distributed lock, renewed through `2026-08-23T22:53:50.108Z`. Discovery remains
44/44 completed. Ingestion advanced to 2,565 completed and 27,792 queued jobs,
with one running version job. Materialized totals advanced to 555 canonical
documents, 991 language variants, 15,448 distinct current provisions and
55,529 indexed current chunks. Terminal/dead-letter jobs remain zero; the
failure ledger remains 15 `retrying` and two `technically_unavailable` English
official-text rows. Document/provision floors remain unmet and the queue is not
frozen, so all post-ingestion gates remain closed. No code change or staging
redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 22:37Z)

Run `7817848a-ee11-410f-a233-25f45e12e5b3` remains `running` under the single
distributed lock, renewed through `2026-08-23T22:52:03.542Z`. Discovery remains
44/44 completed. Ingestion advanced to 2,562 completed and 27,795 queued jobs,
with one running version job. Materialized totals advanced to 554 canonical
documents, 989 language variants, 15,444 distinct current provisions and
55,525 indexed current chunks. Terminal/dead-letter jobs remain zero; the
failure ledger remains 15 `retrying` and two `technically_unavailable` English
official-text rows. Document/provision floors remain unmet and the queue is not
frozen, so all post-ingestion gates remain closed. No code change or staging
redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 22:35Z)

Run `587f12a7-dc94-4bbc-af94-07df459014d5` completed at
`2026-08-23T22:35:28.969Z` without a terminal error; the distributed lock is
released. Discovery remains 44/44 completed. Ingestion contains 2,560
completed and 27,795 queued jobs, with no running job at the probe boundary.
Materialized totals remain 551 canonical documents, 986 language variants,
15,438 distinct current provisions and 55,519 indexed current chunks.
Terminal/dead-letter jobs remain zero; the failure ledger remains 15 `retrying`
and two `technically_unavailable` English official-text rows. Document and
provision floors remain unmet and the queue is not frozen, so post-ingestion
gates stay closed. No code change or staging redeploy was justified.

## Sequential v2 monitoring continuation (2026-08-23, 22:34Z)

The active bounded run continues under the single distributed lock after the
44/44 discovery completion. Ingestion advanced to 2,559 completed and 27,795
queued jobs, with one running version job; materialized totals remain 551
canonical documents, 986 language variants, 15,438 distinct current
provisions and 55,519 indexed current chunks. Terminal/dead-letter jobs remain
zero. The queue is not frozen and document/provision floors remain unmet, so
post-ingestion gates stay closed; no code change or staging redeploy was
justified.

## Sequential v2 monitoring continuation (2026-08-23, 22:33Z)

Run `587f12a7-dc94-4bbc-af94-07df459014d5` remains `running` under the single
distributed lock, renewed through `2026-08-23T22:48:00.775Z`. The discovery
checkpoint ledger remains 44/44 `completed`. Ingestion contains 2,558
completed, 27,796 queued and one running version job. Materialized totals remain
551 canonical documents, 986 language variants, 15,438 distinct current
provisions and 55,519 indexed current chunks. Terminal/dead-letter jobs remain
zero; the failure ledger remains 15 `retrying` and two
`technically_unavailable` English official-text rows. No transient retry was
force-completed and no code change or staging redeploy was justified. Document
and provision floors are still unmet, the queue is not frozen, and all
post-ingestion gates remain closed.

## Sequential v2 monitoring continuation (2026-08-23, 22:32Z)

Run `587f12a7-dc94-4bbc-af94-07df459014d5` remains `running` under the single
distributed lock, renewed through `2026-08-23T22:45:57.248Z`. The discovery
checkpoint ledger is now 44/44 `completed`; this closes discovery, but does not
freeze the ingestion queue. Ingestion contains 2,557 completed, 27,797 queued
and one running version job. Materialized totals advanced to 551 canonical
documents, 986 language variants, 15,438 distinct current provisions and
55,519 indexed current chunks. Terminal/dead-letter jobs remain zero; the
failure ledger remains 15 `retrying` and two `technically_unavailable` English
official-text rows. No transient retry was force-completed and no code change
or staging redeploy was justified. Document/provision floors and queue freeze
are still unmet, so snapshot, evaluation, Qdrant/D1 restore and CI gates remain
closed.

## Sequential v2 monitoring continuation (2026-08-23, 22:29Z)

Run `587f12a7-dc94-4bbc-af94-07df459014d5` started at
`2026-08-23T22:28:20.190Z` under the single distributed lock, renewed through
`2026-08-23T22:43:56.784Z`. The checkpoint ledger remains 43 completed, with
`uz-Cyrl` now running from page 2 / 1,640 discovered documents after the
durable retry reset reported `LEX_CATALOG_DUPLICATE_PAGE`; this is a bounded
recoverable pager state, not a terminal result. Ingestion contains 2,554
completed and 27,801 queued jobs, with no running ingestion job at the probe
boundary. Materialized totals remain 549 canonical documents, 983 language
variants, 15,432 distinct current provisions and 55,513 indexed current chunks.
Terminal/dead-letter jobs remain zero; the failure ledger remains 15 `retrying`
and two `technically_unavailable` English official-text rows. No transient
retry was force-completed and no code change or staging redeploy was justified.
Release floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 22:25Z)

Run `5e587928-321b-4cca-8c59-a2a71039b58d` completed at
`2026-08-23T22:24:36.422Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`; the distributed lock is released. The checkpoint ledger
remains 43 completed, with only `uz-Cyrl` retrying at page 82 / 1,640 discovered
documents. Ingestion contains 2,554 completed and 27,801 queued jobs, with no
running ingestion job at the probe boundary. Materialized totals remain 549
canonical documents, 983 language variants, 15,432 distinct current provisions
and 55,513 indexed current chunks. Terminal/dead-letter jobs remain zero; the
failure ledger remains 15 `retrying` and two `technically_unavailable` English
official-text rows. No transient retry was force-completed and no code change
or staging redeploy was justified. Release floors, queue freeze and all
post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 22:21Z)

Run `5e587928-321b-4cca-8c59-a2a71039b58d` remains `running` under the single
distributed lock, renewed through `2026-08-23T22:35:32.762Z`. The checkpoint
ledger remains 43 completed; `uz-Cyrl` remains retrying after the allow-listed
`LEX_CATALOG_TIMEOUT`. Ingestion contains 2,551 completed, 27,803 queued and
one running version job. Materialized totals remain 549 canonical documents,
983 language variants, 15,432 distinct current provisions and 55,513 indexed
current chunks. Terminal/dead-letter jobs remain zero; the failure ledger
remains 15 `retrying` and two `technically_unavailable` English official-text
rows. The transient checkpoint retry was not force-completed; no code change or
staging redeploy was justified. Release floors, queue freeze and all
post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 22:19Z)

Run `5e587928-321b-4cca-8c59-a2a71039b58d` remains `running` under the single
distributed lock, renewed through `2026-08-23T22:33:11.258Z`. The checkpoint
ledger advanced to 43 completed; only `uz-Cyrl` remains retrying after the
allow-listed `LEX_CATALOG_TIMEOUT` at page 82 / 1,640 discovered documents.
Ingestion contains 2,550 completed, 27,804 queued and one running version job.
Materialized totals advanced to 549 canonical documents, 983 language
variants, 15,432 distinct current provisions and 55,513 indexed current chunks.
Terminal/dead-letter jobs remain zero; the failure ledger remains 15 `retrying`
and two `technically_unavailable` English official-text rows. The transient
checkpoint retry was not force-completed; no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 22:17Z)

Run `5e587928-321b-4cca-8c59-a2a71039b58d` started at
`2026-08-23T22:16:20.192Z` under the single distributed lock, renewed through
`2026-08-23T22:31:35.064Z`. The checkpoint ledger remains 42 completed, with
`ru` running at page 82 / 1,640 discovered documents and `uz-Cyrl` retrying
after the allow-listed `LEX_CATALOG_TIMEOUT` (next attempt
`2026-08-23T22:17:33.200Z`). Ingestion contains 2,547 completed and 27,803
queued jobs, with no running ingestion job at the probe boundary. Materialized
totals remain 546 canonical documents, 980 language variants, 15,421 distinct
current provisions and 55,502 indexed current chunks. Terminal/dead-letter jobs
remain zero; the failure ledger remains 15 `retrying` and two
`technically_unavailable` English official-text rows. The transient checkpoint
retry was not force-completed; no code change or staging redeploy was justified.
Release floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 22:14Z)

Run `90691dec-334c-4709-9f41-0c2eb021cb09` remains `running` under the single
distributed lock, renewed through `2026-08-23T22:29:09.733Z`. The checkpoint
ledger remains 42 completed and two queued (`ru` and `uz-Cyrl`, both at page 82
/ 1,640 discovered documents). Ingestion contains 2,547 completed and 27,803
queued jobs, with no running ingestion job at the probe boundary. Materialized
totals remain 546 canonical documents, 980 language variants, 15,421 distinct
current provisions and 55,502 indexed current chunks. Terminal/dead-letter jobs
remain zero; the failure ledger remains 15 `retrying` and two
`technically_unavailable` English official-text rows. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 22:13Z)

Run `90691dec-334c-4709-9f41-0c2eb021cb09` remains `running` under the single
distributed lock, renewed through `2026-08-23T22:27:28.675Z`. The checkpoint
ledger remains 42 completed and two queued (`ru` and `uz-Cyrl`, both at page 82
/ 1,640 discovered documents). Ingestion contains 2,546 completed, 27,803
queued and one running version job. Materialized totals remain 546 canonical
documents, 980 language variants, 15,421 distinct current provisions and
55,502 indexed current chunks. Terminal/dead-letter jobs remain zero; the
failure ledger remains 15 `retrying` and two `technically_unavailable` English
official-text rows. No transient retry was force-completed and no code change
or staging redeploy was justified. Release floors, queue freeze and all
post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 22:11Z)

Run `90691dec-334c-4709-9f41-0c2eb021cb09` remains `running` under the single
distributed lock, renewed through `2026-08-23T22:25:24.558Z`. The checkpoint
ledger advanced to 42 completed and two queued; the remaining queued
international checkpoints (`ru` and `uz-Cyrl`) are at page 82 / 1,640
discovered documents, while `uz-Latn` has completed its current page. Ingestion
contains 2,544 completed, 27,805 queued and one running version job. Materialized
totals advanced to 546 canonical documents, 980 language variants, 15,421
distinct current provisions and 55,502 indexed current chunks. Terminal/dead-
letter jobs remain zero; the failure ledger remains 15 `retrying` and two
`technically_unavailable` English official-text rows. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 22:09Z)

Run `90691dec-334c-4709-9f41-0c2eb021cb09` started at
`2026-08-23T22:08:20.192Z` under the single distributed lock, renewed through
`2026-08-23T22:23:57.189Z`. The checkpoint ledger has 41 completed, one
running and two queued: `uz-Cyrl` is at page 81 / 1,620 discovered documents,
`uz-Latn` at page 82 / 1,640, and `ru` at page 81 / 1,620. Ingestion contains
2,542 completed and 27,779 queued jobs, with no running ingestion job at the
probe boundary. Materialized totals remain 544 canonical documents, 977
language variants, 15,415 distinct current provisions and 55,492 indexed
current chunks. Terminal/dead-letter jobs remain zero; the failure ledger
remains 15 `retrying` and two `technically_unavailable` English official-text
rows. No transient retry was force-completed and no code change or staging
redeploy was justified. Release floors, queue freeze and all post-ingestion
gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 22:07Z)

Run `b457b12e-5cd2-4990-9d02-04c3e782d604` completed at
`2026-08-23T22:06:19.936Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`; the distributed lock is released. The checkpoint ledger
remains 41 completed and three queued; the three international checkpoints
remain at page 81 with 1,620 discovered documents. Ingestion contains 2,542
completed and 27,739 queued jobs, with no running job at the probe boundary.
Materialized totals remain 544 canonical documents, 977 language variants,
15,415 distinct current provisions and 55,492 indexed current chunks.
Terminal/dead-letter jobs remain zero; the failure ledger remains 15 `retrying`
and two `technically_unavailable` English official-text rows. No transient
retry was force-completed and no code change or staging redeploy was justified.
Release floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 22:06Z)

Run `b457b12e-5cd2-4990-9d02-04c3e782d604` remained `running` under the
single distributed lock, renewed through `2026-08-23T22:19:52.425Z`. The
checkpoint ledger remains 41 completed and three queued; the three
international checkpoints remain at page 81 with 1,620 discovered documents.
Ingestion contains 2,541 completed, 27,739 queued and one running version job.
Materialized totals remain 544 canonical documents, 977 language variants,
15,415 distinct current provisions and 55,492 indexed current chunks.
Terminal/dead-letter jobs remain zero; the failure ledger remains 15 `retrying`
and two `technically_unavailable` English official-text rows. No transient
retry was force-completed and no code change or staging redeploy was justified.
Release floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 22:03Z)

Run `b457b12e-5cd2-4990-9d02-04c3e782d604` started at
`2026-08-23T22:00:21.897Z` under the single distributed lock, renewed through
`2026-08-23T22:17:51.519Z`. The checkpoint ledger remains 41 completed and
three queued; all three international checkpoints reached page 81 with 1,620
discovered documents. Ingestion advanced to 2,540 completed and 27,741 queued
jobs, with one version job running at the probe boundary. Materialized totals
are 544 canonical documents, 977 language variants, 15,415 distinct current
provisions and 55,492 indexed current chunks. Terminal/dead-letter jobs remain
zero; the failure ledger remains 15 `retrying` and two
`technically_unavailable` English official-text rows. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 22:00Z)

Run `e8925e7d-6c3a-417a-ba74-84c441560e4d` completed at
`2026-08-23T21:58:21.183Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`; the distributed lock is now released. The checkpoint
ledger remains 41 completed and three queued. Ingestion contains 2,537
completed and 27,684 queued jobs, with no running ingestion job at the probe
boundary. Materialized totals remain 542 canonical documents, 974 language
variants, 15,410 distinct current provisions and 55,483 indexed current
chunks. Terminal/dead-letter jobs remain zero; the failure ledger remains 15
`retrying` and two `technically_unavailable` English official-text rows. No
transient retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 21:59Z)

Run `e8925e7d-6c3a-417a-ba74-84c441560e4d` remained active under the single
distributed lock, renewed through `2026-08-23T22:13:18.570Z`. The checkpoint
ledger remained 41 completed and three queued at the probe boundary; all three
international counters remained at page 80 / 1,600 discovered documents.
Ingestion advanced to 2,537 completed, 27,684 queued and one running job.
Materialized totals remained 542 canonical documents, 974 language variants,
15,410 distinct current provisions and 55,483 indexed current chunks.
Terminal/dead-letter jobs remain zero; the failure ledger remains 15
`retrying` and two `technically_unavailable` English official-text rows. No
transient retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 21:57Z)

Run `e8925e7d-6c3a-417a-ba74-84c441560e4d` remained `running` under the
single distributed lock, renewed through `2026-08-23T22:11:35.032Z`. All three
bounded international discovery counters reached page 80 / 1,600 discovered
documents; the checkpoint aggregate remained 41 completed and three queued at
the probe boundary. Ingestion advanced to 2,536 completed, 27,684 queued and
one running job. Materialized totals remained 542 canonical documents, 974
language variants, 15,410 distinct current provisions and 55,483 indexed
current chunks. Terminal/dead-letter jobs remain zero; the failure ledger
remains 15 `retrying` and two `technically_unavailable` English official-text
rows. No transient retry was force-completed and no code change or staging
redeploy was justified. Release floors, queue freeze and all post-ingestion
gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 21:55Z)

Run `e8925e7d-6c3a-417a-ba74-84c441560e4d` remained `running` under the
single distributed lock, renewed through `2026-08-23T22:09:26.316Z`. The
bounded international discovery counters advanced to page 80 / 1,600
discovered documents in all three languages; the checkpoint aggregate remained
41 completed and three queued at the probe boundary. Ingestion advanced to
2,534 completed, 27,686 queued and one running job. Materialized totals
advanced to 542 canonical documents, 974 language variants, 15,410 distinct
current provisions and 55,483 indexed current chunks. Terminal/dead-letter
jobs remain zero; the failure ledger remains 15 `retrying` and two
`technically_unavailable` English official-text rows. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 21:53Z)

Run `e8925e7d-6c3a-417a-ba74-84c441560e4d` started at
`2026-08-23T21:52:20.194Z` under the single distributed lock, renewed through
`2026-08-23T22:07:33.633Z`. The checkpoint probe showed 41 completed, one
running (`international` / `ru`, page 79), one retrying (`uz-Cyrl`,
allow-listed `LEX_CATALOG_TIMEOUT`) and one queued (`uz-Latn`). Ingestion
remained at 2,532 completed and 27,629 queued jobs; no running ingestion job
was present at the probe boundary. Materialized totals remained 540 canonical
documents, 971 language variants, 15,405 distinct current provisions and
55,474 indexed current chunks. Terminal/dead-letter jobs remain zero; the
failure ledger remains 15 `retrying` and two `technically_unavailable` English
official-text rows. No transient retry was force-completed and no code change
or staging redeploy was justified. Release floors, queue freeze and all
post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 21:51Z)

Run `8f8afb3a-c42c-4133-bf24-023ef2471824` completed at
`2026-08-23T21:50:18.894Z` without a scheduled-run error; the distributed
lock is now released. The checkpoint ledger remains 41 completed and three
queued. Ingestion contains 2,532 completed and 27,629 queued jobs, with no
running ingestion job at the probe boundary. Materialized totals remain 540
canonical documents, 971 language variants, 15,405 distinct current
provisions and 55,474 indexed current chunks. Terminal/dead-letter jobs remain
zero; the failure ledger remains 15 `retrying` and two
`technically_unavailable` English official-text rows. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 21:49Z)

Run `8f8afb3a-c42c-4133-bf24-023ef2471824` remained `running` under the
single distributed lock, renewed through `2026-08-23T22:03:30.929Z`. The
checkpoint ledger remained 41 completed and three queued at the probe boundary;
all three international language counters had reached page 79 / 1,580
discovered documents. Ingestion advanced to 2,531 completed, 27,629 queued and
one running job. Materialized totals remained 540 canonical documents, 971
language variants, 15,405 distinct current provisions and 55,474 indexed
current chunks. Terminal/dead-letter jobs remain zero; the failure ledger
remains 15 `retrying` and two `technically_unavailable` English official-text
rows. No transient retry was force-completed and no code change or staging
redeploy was justified. Release floors, queue freeze and all post-ingestion
gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 21:47Z)

Run `8f8afb3a-c42c-4133-bf24-023ef2471824` remained active under the single
distributed lock, renewed through `2026-08-23T22:01:26.112Z`. The bounded
international discovery counters advanced to page 79 / 1,580 discovered
documents in all three languages; the checkpoint aggregate remained 41
completed and three queued at the probe boundary. Ingestion advanced to 2,529
completed, 27,631 queued and one running job. Materialized totals advanced to
540 canonical documents, 971 language variants, 15,405 distinct current
provisions and 55,474 indexed current chunks. Terminal/dead-letter jobs remain
zero; the failure ledger remains 15 `retrying` and two
`technically_unavailable` English official-text rows. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 21:45Z)

Run `8f8afb3a-c42c-4133-bf24-023ef2471824` started at
`2026-08-23T21:44:20.214Z` under the single distributed lock, renewed through
`2026-08-23T21:59:31.135Z`. The checkpoint probe showed 41 completed, one
running (`international` / `uz-Latn`, page 77) and two queued (`ru` and
`uz-Cyrl`). Ingestion remained at 2,527 completed and advanced to 27,574
queued jobs; no running ingestion job was present at the probe boundary.
Materialized totals remained 538 canonical documents, 968 language variants,
15,400 distinct current provisions and 55,464 indexed current chunks.
Terminal/dead-letter jobs remain zero; the failure ledger remains 15
`retrying` and two `technically_unavailable` English official-text rows. No
transient retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 21:43Z)

Run `c3428b10-15ae-470c-b1d8-1540a04485c3` completed at
`2026-08-23T21:42:21.736Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`; the distributed lock is now released. The checkpoint
ledger remains 41 completed and three queued. Ingestion contains 2,527
completed and 27,554 queued jobs, with no running ingestion job at the probe
boundary. Materialized totals remain 538 canonical documents, 968 language
variants, 15,400 distinct current provisions and 55,464 indexed current
chunks. Terminal/dead-letter jobs remain zero; the failure ledger remains 15
`retrying` and two `technically_unavailable` English official-text rows. No
transient retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 21:41Z)

Run `c3428b10-15ae-470c-b1d8-1540a04485c3` remained active under the single
distributed lock, renewed through `2026-08-23T21:55:36.278Z`. The checkpoint
ledger remained 41 completed and three queued at the probe boundary; the
international discovery page counters were 1,560 for `ru` and `uz-Cyrl` and
1,540 for `uz-Latn`. Ingestion advanced to 2,526 completed, 27,554 queued and
one running job. Materialized totals remained 538 canonical documents, 968
language variants, 15,400 distinct current provisions and 55,464 indexed
current chunks. Terminal/dead-letter jobs remain zero; the failure ledger
remains 15 `retrying` and two `technically_unavailable` English official-text
rows. No transient retry was force-completed and no code change or staging
redeploy was justified. Release floors, queue freeze and all post-ingestion
gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 21:39Z)

Run `c3428b10-15ae-470c-b1d8-1540a04485c3` remained `running` under the
single distributed lock, renewed through `2026-08-23T21:53:25.199Z`. The
international discovery checkpoints advanced to page 78 / 1,560 discovered
documents for `ru` and `uz-Cyrl`, with `uz-Latn` at page 77 / 1,540; the
checkpoint aggregate remained 41 completed and three queued at the probe
boundary. Ingestion advanced to 2,524 completed, 27,556 queued and one
running job. Materialized totals advanced to 538 canonical documents, 968
language variants, 15,400 distinct current provisions and 55,464 indexed
current chunks. Terminal/dead-letter jobs remain zero; the failure ledger
remains 15 `retrying` and two `technically_unavailable` English official-text
rows. No transient retry was force-completed and no code change or staging
redeploy was justified. Release floors, queue freeze and all post-ingestion
gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 21:37Z)

Run `c3428b10-15ae-470c-b1d8-1540a04485c3` started at
`2026-08-23T21:36:20.191Z` under the single distributed lock, renewed through
`2026-08-23T21:51:20.191Z`. The checkpoint probe showed 41 completed, one
running (`international` / `uz-Latn`, page 76) and two queued (`ru` and
`uz-Cyrl`). Ingestion remained at 2,522 completed and 27,499 queued jobs;
there was no running ingestion job at the probe boundary. Materialized totals
remained 536 canonical documents, 965 language variants, 15,394 distinct
current provisions and 55,454 indexed current chunks. Terminal/dead-letter
jobs remain zero; the failure ledger remains 15 `retrying` and two
`technically_unavailable` English official-text rows. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 21:35Z)

Run `2e9aead5-dc35-47b7-b46b-54aefecb4325` completed at
`2026-08-23T21:34:18.078Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`; the distributed lock is now released. The checkpoint
ledger remains 41 completed and three queued. Ingestion contains 2,522
completed and 27,499 queued jobs, with no running ingestion job at the probe
boundary. Materialized totals remain 536 canonical documents, 965 language
variants, 15,394 distinct current provisions and 55,454 indexed current
chunks. Terminal/dead-letter jobs remain zero; the failure ledger remains 15
`retrying` and two `technically_unavailable` English official-text rows. No
transient retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 21:33Z)

Run `2e9aead5-dc35-47b7-b46b-54aefecb4325` remained active under the single
distributed lock, renewed through `2026-08-23T21:47:33.310Z`. The checkpoint
ledger remained 41 completed and three queued at the probe boundary; the
international discovery pages had reached 1,540 documents for `ru` and
`uz-Cyrl`. Ingestion advanced to 2,521 completed, 27,499 queued and one
running job. Materialized totals remained 536 canonical documents, 965
language variants, 15,394 distinct current provisions and 55,454 indexed
current chunks. Terminal/dead-letter jobs remain zero; the failure ledger
remains 15 `retrying` and two `technically_unavailable` English official-text
rows. No transient retry was force-completed and no code change or staging
redeploy was justified. Release floors, queue freeze and all post-ingestion
gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 21:31Z)

Run `2e9aead5-dc35-47b7-b46b-54aefecb4325` remained `running` under the
single distributed lock, renewed through `2026-08-23T21:45:25.252Z`. The
bounded international discovery checkpoints advanced to page 77 / 1,540
discovered documents for `ru` and `uz-Cyrl`, with `uz-Latn` at page 76 / 1,520;
the aggregate remained 41 completed and three queued at the probe boundary.
Ingestion advanced to 2,519 completed, 27,501 queued and one running job.
Materialized totals advanced to 536 canonical documents, 965 language
variants, 15,394 distinct current provisions and 55,454 indexed current
chunks. Terminal/dead-letter jobs remain zero; the failure ledger remains 15
`retrying` and two `technically_unavailable` English official-text rows. No
transient retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 21:29Z)

Run `2e9aead5-dc35-47b7-b46b-54aefecb4325` started at
`2026-08-23T21:28:20.193Z` under the single distributed lock, renewed through
`2026-08-23T21:43:33.498Z`. The checkpoint probe showed 41 completed, one
running (`international` / `uz-Cyrl`, page 76), one retrying
(`international` / `uz-Latn`, allow-listed `LEX_CATALOG_TIMEOUT`) and one
queued (`international` / `ru`). Ingestion remained at 2,517 completed and
27,444 queued jobs; no running ingestion job was present at the probe
boundary. Materialized totals remained 533 canonical documents, 962 language
variants, 15,381 distinct current provisions and 55,441 indexed current
chunks. Terminal/dead-letter jobs remain zero; the failure ledger remains 15
`retrying` and two `technically_unavailable` English official-text rows. No
transient retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 21:27Z)

Run `226ccc94-90a1-4f65-a547-3e0622060506` completed at
`2026-08-23T21:26:24.138Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`; the distributed lock is now released. The checkpoint
ledger remains 41 completed and three queued. Ingestion contains 2,517
completed and 27,444 queued jobs, with no running ingestion job at the probe
boundary. Materialized totals remain 533 canonical documents, 962 language
variants, 15,381 distinct current provisions and 55,441 indexed current
chunks. Terminal/dead-letter jobs remain zero; the failure ledger remains 15
`retrying` and two `technically_unavailable` English official-text rows. The
timeout was not force-completed; no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 21:25Z)

Run `226ccc94-90a1-4f65-a547-3e0622060506` remained `running` under the
single distributed lock, renewed through `2026-08-23T21:39:50.975Z`. The
checkpoint ledger remained 41 completed and three queued while the worker
advanced the bounded international queue. Ingestion advanced to 2,516
completed, 27,444 queued and one running job. Materialized totals remained
533 canonical documents, 962 language variants, 15,381 distinct current
provisions and 55,441 indexed current chunks. Terminal/dead-letter jobs remain
zero; the failure ledger remains 15 `retrying` and two
`technically_unavailable` English official-text rows. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 21:23Z)

Run `226ccc94-90a1-4f65-a547-3e0622060506` remained active under the single
distributed lock (renewed through `2026-08-23T21:37:26.075Z`). The checkpoint
aggregate was 41 completed and three queued at the probe boundary; the
international language checkpoints had advanced to the 1,520-document page
boundary and the prior catalog timeout had returned to the retry queue. The
ingestion queue advanced to 2,514 completed, 27,446 queued and one running
version job. Materialized totals advanced to 533 canonical documents, 962
language variants, 15,381 distinct current provisions and 55,441 indexed
current chunks. Terminal/dead-letter jobs remain zero; the failure ledger
remains 15 `retrying` and two `technically_unavailable` English official-text
rows. No transient retry was force-completed and no code change or staging
redeploy was justified. Release floors, queue freeze and all post-ingestion
gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 21:21Z)

Run `226ccc94-90a1-4f65-a547-3e0622060506` started at
`2026-08-23T21:20:20.207Z` under the single distributed lock, renewed
through `2026-08-23T21:35:33.093Z`. The checkpoint probe showed 41 completed,
one running (`international` / `uz-Cyrl`, page 75), one retrying
(`international` / `uz-Latn`, allow-listed `LEX_CATALOG_TIMEOUT`) and one
queued (`international` / `ru`). Ingestion contained 2,512 completed and
27,389 queued jobs; no running ingestion job was present at that probe.
Materialized totals remained 530 canonical documents, 959 language variants,
15,371 distinct current provisions and 55,431 indexed current chunks.
Terminal/dead-letter jobs remain zero; the failure ledger remains 15
`retrying` and two `technically_unavailable` English official-text rows. No
transient retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 21:17Z)

The same run `584740ca-9c8b-40c9-b462-c0bc6e62e585` remained `running`; its
distributed lock was renewed through `2026-08-23T21:31:32.662Z`. The
checkpoint aggregate was 41 completed and three queued at the probe boundary
(the worker is advancing those queued checkpoints sequentially). Ingestion
advanced to 2,511 completed, 27,389 queued and one running job. Materialized
totals are 530 canonical documents, 959 language variants, 15,371 distinct
current provisions and 55,431 indexed current chunks. Terminal/dead-letter
jobs remain zero; the failure ledger remains 15 `retrying` and two
`technically_unavailable` English official-text rows. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 21:15Z)

Run `584740ca-9c8b-40c9-b462-c0bc6e62e585` is running from
`2026-08-23T21:12:20.195Z` under the single distributed lock (renewed
through `2026-08-23T21:28:38.332Z`). The checkpoint ledger probe showed 41
completed, one running and two queued. Ingestion contains 2,507 completed,
27,393 queued and one running fetch job. Materialized totals advanced to 529
canonical documents, 958 language variants, 15,367 distinct current
provisions and 55,427 indexed current chunks. Terminal/dead-letter jobs remain
zero; the failure ledger remains 15 `retrying` and two
`technically_unavailable` English official-text rows. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 21:12Z)

Read-only reconciliation after run `9748cab0-4e97-41fd-b8d7-4fd0d4d3db20`
finished at `2026-08-23T21:10:18.942Z`: the scheduled run completed with no
error, the distributed lock is no longer held, and the checkpoint ledger is
41 completed with three queued (`international` discovery checkpoints). The
ingestion queue contains 2,507 completed and 27,334 queued jobs, with no
running job. Materialized totals are 527 canonical documents, 956 language
variants, 15,358 distinct current provisions and 55,418 indexed current
chunks. The failure ledger remains 15 `retrying` and two
`technically_unavailable` English official-text rows; terminal/dead-letter
jobs remain zero. The preceding completed run still records the allow-listed
retryable `LEX_CATALOG_TIMEOUT`; it was not force-completed. Release floors,
queue freeze and all post-ingestion gates remain open; no code change or
staging redeploy was justified.

This record covers the JURO-native legal-corpus foundation at commit
`6eee1e4957ae82054badf453d555c108ec45a9b6`. It does not claim corpus
coverage, retrieval quality, Qdrant availability or legal-answer readiness.

## Sequential v2 monitoring continuation (2026-08-23, 20:31–20:34Z)

Run `2aaa6704-e620-40a6-9cc2-0ee894d1d2b8` completed at
`2026-08-23T20:31:12.291Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. Timestamp-bounded reconciliation at that finish
boundary remained 515 canonical documents, 944 language variants, 15,318
distinct current provisions and 55,378 indexed current chunks. The checkpoint
ledger remained 41 completed and three queued; ingestion was 2,487 completed
and 27,074 queued, with terminal/dead-letter jobs at zero. The failure ledger
remained 15 `retrying` and two `technically_unavailable` English official-text
rows; the timeout was not treated as terminal or force-completed. The next
sequential run `13f3c522-7bce-4a2c-9e7a-0ec20b6ebfe8` started at
`2026-08-23T20:32:54.363Z` and was running under the renewed lock through
`2026-08-23T20:48:50.982Z`. No code change or staging redeploy was justified.
Release floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 21:08Z)

Run `9748cab0-4e97-41fd-b8d7-4fd0d4d3db20` remained `running` under the
single distributed lock, renewed through `2026-08-23T21:22:12.708Z`. The
checkpoint ledger remained 41 completed and three queued. Ingestion advanced
to 2,505 completed, 27,335 queued and one running version job for
`https://lex.uz/uz/docs/-4674902?ONDATE=14.07.2026` (`uz-Latn`). Materialized
totals advanced to 527 canonical documents, 956 language variants, 15,358
distinct current provisions and 55,418 indexed current chunks. The failure
ledger remained 15 `retrying` and two `technically_unavailable` English
official-text rows; terminal/dead-letter jobs remained zero. No transient
retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 21:05Z)

Run `0dcd04ec-f8eb-4972-9fc1-cab273801e76` completed at
`2026-08-23T21:02:20.685Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. New run `9748cab0-4e97-41fd-b8d7-4fd0d4d3db20` was
running under the single distributed lock, renewed through
`2026-08-23T21:19:33.743Z`. The checkpoint ledger showed 41 completed, one
running and two queued. The running bounded discovery checkpoint was
`international` / `ru`, page 73, with 1,460 documents discovered; session
state and cookies were intentionally excluded from this evidence. Ingestion
showed 2,502 completed and 27,274 queued jobs, with no running ingestion job.
Materialized totals remained 524 canonical documents, 953 language variants,
15,349 distinct current provisions and 55,409 indexed current chunks. The
failure ledger remained 15 `retrying` and two `technically_unavailable`
English official-text rows; terminal/dead-letter jobs remained zero. No
transient retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 21:03Z)

The first scheduled-run D1 probe at `2026-08-23T21:00:53Z` failed with
Cloudflare API error `7403` (account not valid or not authorized); this was
recorded as a failed probe, not as evidence of database state. A subsequent
read-only `wrangler whoami` confirmed the configured account and token, and a
retry of the same D1 query succeeded. Run
`0dcd04ec-f8eb-4972-9fc1-cab273801e76` remained `running` under the single
distributed lock, renewed through `2026-08-23T21:17:11.397Z`. The checkpoint
ledger was 41 completed and three queued. Final queue reconciliation showed
2,502 completed and 27,259 queued ingestion jobs, with no running job.
Materialized totals remained 524 canonical documents, 953 language variants,
15,349 distinct current provisions and 55,409 indexed current chunks. The
failure ledger remained 15 `retrying` and two `technically_unavailable`
English official-text rows; terminal/dead-letter jobs remained zero. No
transient retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 20:59Z)

Run `0dcd04ec-f8eb-4972-9fc1-cab273801e76` remained `running` under the
single distributed lock, renewed through `2026-08-23T21:13:53.095Z`. The
checkpoint ledger remained 41 completed and three queued. Ingestion advanced
to 2,500 completed, 27,261 queued and one running version job for
`https://lex.uz/uz/docs/-4674902?ONDATE=25.07.2026` (`uz-Latn`). Materialized
totals advanced to 524 canonical documents, 953 language variants, 15,349
distinct current provisions and 55,409 indexed current chunks. The failure
ledger remained 15 `retrying` and two `technically_unavailable` English
official-text rows; terminal/dead-letter jobs remained zero. No transient
retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 20:57Z)

The prior run `880d9813-097f-4d6b-a8c7-4f9352e87952` completed at
`2026-08-23T20:55:32.448Z` without an error. New run
`0dcd04ec-f8eb-4972-9fc1-cab273801e76` was running under the single
distributed lock, renewed through `2026-08-23T21:11:54.382Z`. The checkpoint
ledger showed 41 completed, one queued, one running and one retrying. The
retrying checkpoint was `international` / `uz-Latn`, page 71, with the
allow-listed `LEX_CATALOG_TIMEOUT`; the running checkpoint was
`international` / `uz-Cyrl`, page 72. Ingestion showed 2,497 completed and
27,224 queued jobs, with no running ingestion job. Materialized totals
remained 521 canonical documents, 950 language variants, 15,339 distinct
current provisions and 55,399 indexed current chunks. The failure ledger
remained 15 `retrying` and two `technically_unavailable` English official-text
rows; terminal/dead-letter jobs remained zero. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:56Z)

Run `880d9813-097f-4d6b-a8c7-4f9352e87952` remained `running` under the
single distributed lock, renewed through `2026-08-23T21:10:05.291Z`. The
checkpoint ledger remained 41 completed and three queued. A version job
completed during the probe; the final queue reconciliation showed 2,497
completed and 27,204 queued ingestion jobs, with no running job. Materialized
totals remained 521 canonical documents, 950 language variants, 15,339
distinct current provisions and 55,399 indexed current chunks. The failure
ledger remained 15 `retrying` and two `technically_unavailable` English
official-text rows; terminal/dead-letter jobs remained zero. No transient
retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 20:54Z)

Run `880d9813-097f-4d6b-a8c7-4f9352e87952` remained `running` under the
single distributed lock, renewed through `2026-08-23T21:08:10.597Z`. The
checkpoint ledger remained 41 completed and three queued. Ingestion advanced
to 2,496 completed, 27,204 queued and one running version job for
`https://lex.uz/uz/docs/-4674902?ONDATE=27.07.2026` (`uz-Latn`). Materialized
totals remained 521 canonical documents, 950 language variants, 15,339
distinct current provisions and 55,399 indexed current chunks. The failure
ledger remained 15 `retrying` and two `technically_unavailable` English
official-text rows; terminal/dead-letter jobs remained zero. No transient
retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 20:52Z)

Run `880d9813-097f-4d6b-a8c7-4f9352e87952` remained `running` under the
single distributed lock, renewed through `2026-08-23T21:06:19.497Z`. The
checkpoint ledger remained 41 completed and three queued. Ingestion remained
at 2,495 completed, 27,205 queued and one running version job; its last
observed update was `2026-08-23T20:48:45.700Z`. Materialized totals remained
521 canonical documents, 950 language variants, 15,339 distinct current
provisions and 55,399 indexed current chunks. The failure ledger remained 15
`retrying` and two `technically_unavailable` English official-text rows;
terminal/dead-letter jobs remained zero. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:50Z)

Run `880d9813-097f-4d6b-a8c7-4f9352e87952` remained `running` under the
single distributed lock, renewed through `2026-08-23T21:04:32.571Z`. The
checkpoint ledger remained 41 completed and three queued. Ingestion advanced
to 2,495 completed, 27,205 queued and one running version job for
`https://lex.uz/uz/docs/-4674902?ONDATE=12.12.2026` (`uz-Latn`). Materialized
totals advanced to 521 canonical documents, 950 language variants, 15,339
distinct current provisions and 55,399 indexed current chunks. The failure
ledger remained 15 `retrying` and two `technically_unavailable` English
official-text rows; terminal/dead-letter jobs remained zero. No transient
retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 20:48Z)

Run `880d9813-097f-4d6b-a8c7-4f9352e87952` remained `running` under the
single distributed lock, renewed through `2026-08-23T21:02:37.391Z`. The
checkpoint ledger was 41 completed and three queued. Ingestion advanced to
2,493 completed, 27,207 queued and one running fetch job for
`https://lex.uz/uz/docs/8284464` (`uz-Latn`). Materialized totals advanced to
520 canonical documents, 949 language variants, 15,334 distinct current
provisions and 55,394 indexed current chunks. The failure ledger remained 15
`retrying` and two `technically_unavailable` English official-text rows;
terminal/dead-letter jobs remained zero. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:46Z)

Run `880d9813-097f-4d6b-a8c7-4f9352e87952` was running under the single
distributed lock, renewed through `2026-08-23T21:00:28.691Z`. The checkpoint
ledger showed 41 completed, one running and two queued. The running bounded
discovery checkpoint was `international` / `ru`, page 70, with 1,400
documents discovered; session state and cookies were intentionally excluded
from this evidence. Ingestion showed 2,492 completed and 27,142 queued jobs,
with no running ingestion job. Materialized totals remained 518 canonical
documents, 947 language variants, 15,328 distinct current provisions and
55,388 indexed current chunks. The failure ledger remained 15 `retrying` and
two `technically_unavailable` English official-text rows; terminal/dead-letter
jobs remained zero. No transient retry was force-completed and no code change
or staging redeploy was justified. Release floors, queue freeze and all
post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:44Z)

Run `13f3c522-7bce-4a2c-9e7a-0ec20b6ebfe8` finished at
`2026-08-23T20:43:17.707Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`; it was not treated as terminal and no retry was
force-completed. The distributed lock was released. Checkpoints remained 41
completed and three queued. The ingestion queue contained 2,492 completed and
27,129 queued jobs, with no running job. Materialized totals remained 518
canonical documents, 947 language variants, 15,328 distinct current
provisions and 55,388 indexed current chunks. The failure ledger remained 15
`retrying` and two `technically_unavailable` English official-text rows;
terminal/dead-letter jobs remained zero. No code change or staging redeploy
was justified. Ingestion is not frozen and release floors plus all
post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:42Z)

The next sequential read-only probe kept run
`13f3c522-7bce-4a2c-9e7a-0ec20b6ebfe8` in `running` state under the single
distributed lock, renewed through `2026-08-23T20:56:35.398Z`. Checkpoints
remained 41 completed and three queued. Ingestion advanced to 2,491
completed, 27,129 queued and one running job. Materialized totals remained
518 canonical documents, 947 language variants, 15,328 distinct current
provisions and 55,388 indexed current chunks. The active running job was a
Russian historical-version check for
`https://lex.uz/ru/docs/4674902?ONDATE=01.01.2020`. The failure ledger stayed
at 15 `retrying` and two `technically_unavailable` English official-text rows;
terminal/dead-letter ingestion jobs remained zero. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:40Z)

At the sequential read-only probe, run
`13f3c522-7bce-4a2c-9e7a-0ec20b6ebfe8` remained `running` under the single
distributed lock, renewed through `2026-08-23T20:54:09.761Z`. The checkpoint
ledger remained 41 completed and three queued. Ingestion showed 2,490
completed, 27,130 queued and one running job. Materialized totals were 518
canonical documents, 947 language variants, 15,328 distinct current
provisions and 55,388 indexed current chunks. The active running job was a
version check for `https://lex.uz/ru/docs/4674902?ONDATE=11.03.2020` (`ru`).
The failure ledger remained 15 `retrying` and two
`technically_unavailable` English official-text rows; terminal/dead-letter
ingestion jobs remained zero. No transient retry was force-completed and no
code change or staging redeploy was justified. Release floors, queue freeze
and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:37Z)

Run `13f3c522-7bce-4a2c-9e7a-0ec20b6ebfe8` remained `running` under the
single distributed lock, renewed through `2026-08-23T20:50:37.543Z`. The
checkpoint ledger remained 41 completed and three queued; ingestion showed
2,488 completed, 27,132 queued and one running job. Materialized totals
advanced to 517 canonical documents, 946 language variants, 15,324 distinct
current provisions and 55,384 indexed current chunks. The active bounded fetch
was `https://lex.uz/uz/docs/-8278863` (`uz-Latn`). The failure ledger remained
15 `retrying` and two `technically_unavailable` English official-text rows;
terminal/dead-letter ingestion jobs remained zero. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:32Z)

Run `2aaa6704-e620-40a6-9cc2-0ee894d1d2b8` remained `running` under the
single distributed lock, renewed through `2026-08-23T20:45:51.981Z`. The
checkpoint ledger remained 41 completed and three queued; ingestion showed
2,487 completed and 27,074 queued jobs, with no running ingestion job at the
probe (discovery phase). Materialized totals remained 515 canonical documents,
944 language variants, 15,318 distinct current provisions and 55,378 indexed
current chunks. The failure ledger remained 15 `retrying` and two
`technically_unavailable` English official-text rows; terminal/dead-letter
ingestion jobs remained zero. No transient retry was force-completed and no
code change or staging redeploy was justified. Release floors, queue freeze
and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:26Z)

Run `2aaa6704-e620-40a6-9cc2-0ee894d1d2b8` remained `running` under the
single distributed lock, renewed through `2026-08-23T20:39:46.560Z`. The
checkpoint ledger remained 41 completed and three queued; ingestion showed
2,485 completed, 27,075 queued and one running job. Materialized totals
advanced to 515 canonical documents, 944 language variants, 15,318 distinct
current provisions and 55,378 indexed current chunks. The active bounded
version fetch was `https://lex.uz/ru/docs/4674902?ONDATE=09.11.2020` (`ru`).
The failure ledger remained 15 `retrying` and two `technically_unavailable`
English official-text rows; terminal/dead-letter ingestion jobs remained
zero. No transient retry was force-completed and no code change or staging
redeploy was justified. Release floors, queue freeze and all post-ingestion
gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:19–20:22Z)

Run `49c2364b-162a-4d46-875c-455c49671c86` completed at
`2026-08-23T20:19:27.255Z` with `error_code=NULL`. Timestamp-bounded
reconciliation at that finish boundary was 512 canonical documents, 941
language variants, 15,308 distinct current provisions and 55,368 indexed
current chunks. The checkpoint ledger remained 41 completed and three queued;
ingestion was 2,482 completed and 27,019 queued, with terminal/dead-letter
jobs at zero. The failure ledger remained 15 `retrying` and two
`technically_unavailable` English official-text rows. The next sequential run
`2aaa6704-e620-40a6-9cc2-0ee894d1d2b8` started at
`2026-08-23T20:20:54.362Z` and was running under the renewed lock through
`2026-08-23T20:36:47.578Z`; no ingestion job was running at the probe, which
is consistent with its discovery phase. No transient retry was force-completed
and no code change or staging redeploy was justified. Release floors, queue
freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:19Z)

Run `49c2364b-162a-4d46-875c-455c49671c86` remained `running` under the
single distributed lock, renewed through `2026-08-23T20:32:13.330Z`. The
checkpoint ledger remained 41 completed and three queued; ingestion showed
2,481 completed, 27,019 queued and one running job. Materialized totals were
unchanged at 512 canonical documents, 941 language variants, 15,308 distinct
current provisions and 55,368 indexed current chunks. The active bounded
version fetch was `https://lex.uz/ru/docs/4674902?ONDATE=02.12.2020` (`ru`).
The failure ledger remained 15 `retrying` and two `technically_unavailable`
English official-text rows; terminal/dead-letter ingestion jobs remained
zero. No transient retry was force-completed and no code change or staging
redeploy was justified. Release floors, queue freeze and all post-ingestion
gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:16Z)

Run `49c2364b-162a-4d46-875c-455c49671c86` remained `running` under the
single distributed lock, renewed through `2026-08-23T20:29:26.469Z`. The
checkpoint ledger remained 41 completed and three queued; ingestion showed
2,480 completed, 27,020 queued and one running job. Materialized totals were
unchanged at 512 canonical documents, 941 language variants, 15,308 distinct
current provisions and 55,368 indexed current chunks. The active bounded
version fetch remained `https://lex.uz/ru/docs/4674902?ONDATE=04.12.2020`
(`ru`), with no recorded job error. The failure ledger remained 15 `retrying`
and two `technically_unavailable` English official-text rows;
terminal/dead-letter ingestion jobs remained zero. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:13Z)

Run `49c2364b-162a-4d46-875c-455c49671c86` remained `running` under the
single distributed lock, renewed through `2026-08-23T20:26:41.525Z`. The
checkpoint ledger remained 41 completed and three queued; ingestion showed
2,478 completed, 27,022 queued and one running job. Materialized totals
advanced to 512 canonical documents, 941 language variants, 15,308 distinct
current provisions and 55,368 indexed current chunks. The active bounded
version fetch was `https://lex.uz/ru/docs/4674902?ONDATE=04.12.2020` (`ru`).
The failure ledger remained 15 `retrying` and two `technically_unavailable`
English official-text rows; terminal/dead-letter ingestion jobs remained
zero. No transient retry was force-completed and no code change or staging
redeploy was justified. Release floors, queue freeze and all post-ingestion
gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:07–20:10Z)

Run `c9f4f583-f871-4613-96c2-94648ebd5eda` completed at
`2026-08-23T20:07:46.080Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. Timestamp-bounded reconciliation at that finish
boundary remained 509 canonical documents, 938 language variants, 15,299
distinct current provisions and 55,359 indexed current chunks. The checkpoint
ledger remained 41 completed and three queued; ingestion was 2,477 completed
and 26,944 queued, with terminal/dead-letter jobs still zero. The failure
ledger remained 15 `retrying` and two `technically_unavailable` English
official-text rows; the timeout was not treated as terminal or force-completed.
The next sequential run `49c2364b-162a-4d46-875c-455c49671c86` started at
`2026-08-23T20:08:54.364Z` and was running under the renewed lock through
`2026-08-23T20:24:46.571Z`. No code change or staging redeploy was justified.
Release floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:07Z)

Run `c9f4f583-f871-4613-96c2-94648ebd5eda` remained `running` under the
single distributed lock, renewed through `2026-08-23T20:21:12.012Z`. The
checkpoint ledger remained 41 completed and three queued; ingestion showed
2,476 completed, 26,944 queued and one running job. Materialized totals were
unchanged at 509 canonical documents, 938 language variants, 15,299 distinct
current provisions and 55,359 indexed current chunks. The active bounded
version fetch remained `https://lex.uz/ru/docs/4674902?ONDATE=01.01.2021`
(`ru`), with no recorded job error. The failure ledger remained 15 `retrying`
and two `technically_unavailable` English official-text rows;
terminal/dead-letter ingestion jobs remained zero. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:05Z)

Run `c9f4f583-f871-4613-96c2-94648ebd5eda` remained `running` under the
single distributed lock, renewed through `2026-08-23T20:17:56.395Z`. The
checkpoint ledger remained 41 completed and three queued; ingestion showed
2,475 completed, 26,945 queued and one running job. Materialized totals were
unchanged at 509 canonical documents, 938 language variants, 15,299 distinct
current provisions and 55,359 indexed current chunks. The active bounded
version fetch was `https://lex.uz/ru/docs/4674902?ONDATE=01.01.2021` (`ru`).
The failure ledger remained 15 `retrying` and two `technically_unavailable`
English official-text rows; terminal/dead-letter ingestion jobs remained
zero. No transient retry was force-completed and no code change or staging
redeploy was justified. Release floors, queue freeze and all post-ingestion
gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 20:01Z)

Run `c9f4f583-f871-4613-96c2-94648ebd5eda` remained `running` under the
single distributed lock, renewed through `2026-08-23T20:15:10.021Z`. The
checkpoint ledger remained 41 completed and three queued; ingestion showed
2,474 completed, 26,946 queued and one running job. Materialized totals
advanced to 509 canonical documents, 938 language variants, 15,299 distinct
current provisions and 55,359 indexed current chunks. The active bounded
version fetch was `https://lex.uz/ru/docs/4674902?ONDATE=21.04.2021` (`ru`).
The failure ledger remained 15 `retrying` and two `technically_unavailable`
English official-text rows; terminal/dead-letter ingestion jobs remained
zero. No transient retry was force-completed and no code change or staging
redeploy was justified. Release floors, queue freeze and all post-ingestion
gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 19:56–19:59Z)

Run `c6d10f08-0bbb-44f3-a659-4420ff33d32e` completed at
`2026-08-23T19:56:00.101Z` with `error_code=NULL`. Timestamp-bounded
reconciliation at that finish boundary was 507 canonical documents, 935
language variants, 15,295 distinct current provisions and 55,350 indexed
current chunks. The ledgers showed 41 completed and three queued discovery
checkpoints, plus 2,472 completed and 26,889 queued ingestion jobs. The
failure ledger remained 15 `retrying` and two `technically_unavailable`
English official-text rows; terminal/dead-letter ingestion jobs remained zero.
The next sequential run `c9f4f583-f871-4613-96c2-94648ebd5eda` started at
`2026-08-23T19:56:54.361Z` and was running under a renewed lock through
`2026-08-23T20:13:40.744Z`; no ingestion job was running at the probe, which
is consistent with its discovery phase. No transient retry was force-completed
and no code change or staging redeploy was justified. Release floors, queue
freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 19:55Z)

Run `c6d10f08-0bbb-44f3-a659-4420ff33d32e` remained `running` and its
distributed lock was renewed through `2026-08-23T20:09:22.421Z`. The
checkpoint ledger remained 41 completed and three queued; ingestion was 2,471
completed, 26,889 queued and one running job. Materialized totals remained
507 canonical documents, 935 language variants, 15,295 distinct current
provisions and 55,350 indexed current chunks. The running job remained the
bounded Russian version fetch for
`https://lex.uz/ru/docs/4674902?ONDATE=29.04.2021`, with no recorded job error.
The failure ledger remained 15 `retrying` and two `technically_unavailable`
English official-text rows; terminal/dead-letter ingestion jobs remained zero.
No transient retry was force-completed and no code change or staging redeploy
was justified. Release floors, queue freeze and all post-ingestion gates
remain open.

## Sequential v2 monitoring continuation (2026-08-23, 19:53Z)

Run `c6d10f08-0bbb-44f3-a659-4420ff33d32e` remained `running`; the renewed
lock was valid through `2026-08-23T20:06:53.431Z`. The checkpoint ledger
remained 41 completed and three queued. Ingestion remained 2,470 completed,
26,890 queued and one running job. Materialized totals were unchanged at 507
canonical documents, 935 language variants, 15,295 distinct current
provisions and 55,350 indexed current chunks. The active bounded version fetch
was `https://lex.uz/ru/docs/4674902?ONDATE=29.04.2021` (`ru`). The failure
ledger remained 15 `retrying` and two `technically_unavailable` English
official-text rows; terminal/dead-letter ingestion jobs remained zero. No
transient retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 19:50Z)

Run `c6d10f08-0bbb-44f3-a659-4420ff33d32e` remained `running` under the
single distributed lock. The checkpoint ledger showed 41 completed and three
queued checkpoints; ingestion showed 2,470 completed, 26,890 queued and one
running job. Materialized totals increased to 507 canonical documents, 935
language variants, 15,295 distinct current provisions and 55,350 indexed
current chunks. The active bounded version fetch was
`https://lex.uz/ru/docs/4674902?ONDATE=17.08.2021` (`ru`). The failure
ledger remained 15 `retrying` and two `technically_unavailable` English
official-text rows; terminal/dead-letter ingestion jobs remained zero. No
transient retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 19:48Z)

Run `c6d10f08-0bbb-44f3-a659-4420ff33d32e` remained `running` under the
single distributed lock. The checkpoint ledger showed 41 completed, one
running and two queued checkpoints; ingestion showed 2,467 completed,
26,893 queued and one running job. Materialized totals were 506 canonical
documents, 933 language variants, 15,294 distinct current provisions and
55,345 indexed current chunks. The active bounded fetch was
`https://lex.uz/ru/docs/8274402` (`ru`). The failure ledger remained 15
`retrying` and two `technically_unavailable` English official-text rows;
terminal/dead-letter ingestion jobs remained zero. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 19:43–19:45Z)

Run `5b52f4c5-94d4-46b2-a13d-ffbd6c3b0904` completed at
`2026-08-23T19:43:50.860Z` with `error_code=NULL`. Timestamp-bounded
reconciliation at that finish boundary was 505 canonical documents, 932
language variants, 15,290 distinct current provisions and 55,341 indexed
current chunks. The ledgers showed 41 completed and three queued discovery
checkpoints, plus 2,467 completed and 26,814 queued ingestion jobs. The
failure ledger remained 15 `retrying` and two `technically_unavailable`
English official-text rows; terminal/dead-letter ingestion jobs remained zero.
The next sequential run `c6d10f08-0bbb-44f3-a659-4420ff33d32e` started at
`2026-08-23T19:44:54.362Z` under the renewed distributed lock and was running
at the probe. No transient retry was force-completed and no code change or
staging redeploy was justified. Release floors, queue freeze and all
post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 19:41Z)

Run `5b52f4c5-94d4-46b2-a13d-ffbd6c3b0904` remained `running` under the
single `legal-corpus-worker` lock, renewed through
`2026-08-23T19:56:38.372Z`. The independent v2 staging database contained
505 canonical documents, 932 language variants, 15,290 distinct current
provisions and 55,341 indexed current chunks. Discovery remained 41 completed
and three queued checkpoints; ingestion was 2,465 completed, 26,815 queued
and one running job. The running job was a bounded Lex.uz version fetch for
`https://lex.uz/ru/docs/4674902?ONDATE=15.09.2021` (`ru`). The failure ledger
remained 15 `retrying` and two `technically_unavailable` English official-text
rows; terminal/dead-letter ingestion jobs remained zero. No transient retry
was force-completed and no code change or staging redeploy was justified.
Release floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 19:37Z)

The following run `5b52f4c5-94d4-46b2-a13d-ffbd6c3b0904` remained `running`
after the prior run's retryable catalogue timeout. Current materialized totals
were 505 canonical documents, 931 language variants, 15,290 distinct current
provisions and 55,309 indexed current chunks. The checkpoint ledger showed 41
completed and three queued checkpoints; the ingestion aggregate probe recorded
2,463 completed, 26,817 queued and one running job while the worker finalized
its bounded cycle. The failure ledger remained 15 `retrying` and two
`technically_unavailable` English official-text rows; terminal/dead-letter
ingestion jobs remained zero. The run lock remained held by the same holder
and no terminal condition was observed. No transient retry was
force-completed and no code change or staging redeploy was justified. Release
floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 19:31–19:34Z)

Run `322ca38f-144b-4a21-a806-43871568bdbc` completed at
`2026-08-23T19:31:51.605Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. Timestamp-bounded reconciliation at that finish
boundary remained 503 canonical documents, 929 language variants, 15,284
distinct current provisions and 55,303 indexed current chunks. The next
sequential run `5b52f4c5-94d4-46b2-a13d-ffbd6c3b0904` started at
`19:32:54.362Z` and was running at the probe. Its discovery checkpoint was
`international/uz-Cyrl`, page 63, with no error. The checkpoint ledger was
41 completed, one running and two queued; the ingestion ledger contained
2,462 completed and 26,739 queued jobs. The failure ledger remained 15
`retrying` and two `technically_unavailable` English official-text rows;
terminal/dead-letter ingestion jobs remained zero. No timeout was treated as
terminal or force-completed, and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 19:28Z)

Run `322ca38f-144b-4a21-a806-43871568bdbc` remained `running`. The
checkpoint ledger remained 41 completed and three queued; the ingestion ledger
contained 2,460 completed, 26,740 queued and one running job. Materialized
totals were unchanged at 503 canonical documents, 929 language variants,
15,284 distinct current provisions and 55,303 indexed current chunks. The
active bounded Lex.uz version-fetch advanced to
`https://lex.uz/ru/docs/4674902?ONDATE=15.10.2021` with no recorded error. The
failure ledger remained 15 `retrying` and two `technically_unavailable`
English official-text rows; terminal/dead-letter ingestion jobs remained
zero. No transient retry was force-completed and no code change or staging
redeploy was justified. Release floors, queue freeze and all post-ingestion
gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 19:25Z)

Run `322ca38f-144b-4a21-a806-43871568bdbc` remained `running` with no
recorded run error or finish time. Discovery remained 41 completed and three
queued checkpoints. The ingestion ledger contained 2,460 completed, 26,740
queued and one running job. Materialized totals increased to 503 canonical
documents, 929 language variants, 15,284 distinct current provisions and
55,303 indexed current chunks. The active job was the bounded Lex.uz
version-fetch for `https://lex.uz/ru/docs/4674902?ONDATE=26.10.2021` in `ru`.
The failure ledger remained 15 `retrying` and two `technically_unavailable`
English official-text rows; terminal/dead-letter ingestion jobs remained
zero. No transient retry was force-completed and no code change or staging
redeploy was justified. Release floors, queue freeze and all post-ingestion
gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 19:24Z)

The sequential run `322ca38f-144b-4a21-a806-43871568bdbc` remained `running`
with no recorded error or finish time. The discovery ledger remained 41
completed and three queued checkpoints. The ingestion ledger contained 2,457
completed, 26,743 queued and one running job. Current materialized totals
were 503 canonical documents, 928 language variants, 15,283 distinct current
provisions and 55,299 indexed current chunks. The running job was the bounded
Lex.uz fetch for `https://lex.uz/uz/docs/8282153` in `uz-Latn`. The failure
ledger remained 15 `retrying` and two `technically_unavailable` English
official-text rows; terminal/dead-letter ingestion jobs remained zero. No
transient retry was force-completed and no code change or staging redeploy was
justified. Release floors, queue freeze and all post-ingestion gates remain
open.

## Sequential v2 monitoring continuation (2026-08-23, 19:19–19:22Z)

Run `92ca5b38-c39c-4fd0-bfb5-39f618748623` completed at
`2026-08-23T19:19:50.942Z` with `error_code=NULL`. Timestamp-bounded
read-only reconciliation at that boundary remained at 501 canonical
documents, 926 language variants, 15,278 distinct current provisions and
55,294 indexed current chunks. The following sequential run
`322ca38f-144b-4a21-a806-43871568bdbc` started at `19:20:54.362Z` and was
running at the next probe. Discovery was 41 completed, one running and two
queued checkpoints; the ingestion ledger contained 2,457 completed and
26,684 queued jobs. The failure ledger remained 15 `retrying` and two
`technically_unavailable` English official-text rows; terminal/dead-letter
ingestion jobs remained zero. The distributed lock was held by the current
run and renewed through `19:37:14.257Z`. No transient retry was
force-completed and no code change or staging redeploy was justified. The
release floors, queue freeze and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 19:16Z)

The sequential run `92ca5b38-c39c-4fd0-bfb5-39f618748623` remained `running`
with no recorded error or finish time. Read-only D1 probes recorded 41/44
discovery checkpoints completed and three queued; the ingestion ledger had
2,455 completed, 26,685 queued and one running job. Materialized totals were
501 canonical documents, 926 language variants, 15,278 distinct current
provisions and 55,294 indexed current chunks. The single running job was the
bounded Lex.uz version fetch for `https://lex.uz/ru/docs/4674902?ONDATE=30.10.2021`.
The failure ledger remained 15 `retrying` and two
`technically_unavailable` English official-text rows; terminal/dead-letter
ingestion jobs remained zero. No transient retry was force-completed and no
code change or staging redeploy was justified. Release floors, queue freeze
and all post-ingestion gates remain open.

## Sequential v2 monitoring continuation (2026-08-23, 19:07–19:12Z)

The scheduled run `d74b62d5-5712-4764-8693-be287fe69c3f` completed at
`2026-08-23T19:07:42.386Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. Timestamp-bounded read-only reconciliation at that
finish boundary recorded 499 canonical documents, 923 language variants,
15,273 distinct current provisions and 55,274 indexed current chunks; the
ingestion ledger contained 2,452 completed and 26,605 queued jobs, with 41
discovery checkpoints completed. The following sequential run
`92ca5b38-c39c-4fd0-bfb5-39f618748623` started at `19:08:54.360Z` and was
still running at the next probe. Current materialized totals were 500
canonical documents, 924 language variants, 15,277 distinct current
provisions and 55,278 indexed current chunks; the ingestion ledger contained
2,452 completed, 26,688 queued and one running job, with 41 completed and
three queued checkpoints. The failure ledger remained 15 `retrying` and two
`technically_unavailable` English official-text rows; terminal/dead-letter
ingestion jobs remained zero. No timeout was treated as terminal or
force-completed, and no code change or staging redeploy was justified. The
release floors, queue freeze and all post-ingestion gates remain open; the
separate original `juro-staging` database remains unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 18:08–18:55Z)

After the Wrangler read-only session was re-established, the scheduled-run
ledger showed four additional completed single-lease cycles:
`4bd8acb7-f85e-4ee4-8595-381a2b581265` completed at
`18:19:53.643Z` with `error_code=NULL`; `c2b45677-e648-4fc6-8f39-faa1576d253c`
completed at `18:31:30.577Z` with allow-listed `LEX_CATALOG_TIMEOUT`;
`46b01c78-ca80-4112-bc66-c985e5e569c4` completed at
`18:43:51.692Z` with the same retryable timeout; and
`767e1df5-3c88-4fc7-86b0-bcc0823fd77b` completed at
`18:55:41.232Z` with `error_code=NULL`.

Timestamp-bounded reconciliation at the last clean finish boundary recorded
2,447 completed and 26,550 queued ingestion jobs, with 41 discovery
checkpoints completed. Materialized totals there were 497 canonical
documents, 920 language variants, 15,267 distinct current provisions and
55,258 indexed current chunks. The current sequential probe, while the next
run `d74b62d5-5712-4764-8693-be287fe69c3f` is running, records 2,450
completed and 26,611 queued jobs; checkpoints remain 41 completed and three
queued. Current materialized totals are 499 canonical documents, 923 language
variants, 15,273 distinct current provisions and 55,274 indexed current
chunks. The failure ledger remains 15 `retrying` and two
`technically_unavailable` English official-text rows; terminal/dead-letter
jobs remain zero. No timeout was treated as terminal or force-completed, no
code change/redeploy was justified, and all release/post-ingestion gates
remain open.

## Sequential v2 monitoring boundary (2026-08-23, 15:36Z)

Run `cb902304-8357-4dac-a0d9-c4c4d650a79f` remained `running`. Discovery
remained 41 `completed`; all three `international` language checkpoints
(`ru`, `uz-Cyrl`, `uz-Latn`) were `queued` after the retryable catalogue
timeout, with no checkpoint marked terminal. The ingestion ledger contained
2,365 `completed`, 25,535 `queued` and one `running` job. The failure ledger
remained 15 `retrying` and two `technically_unavailable` English official-text
rows; terminal/dead-letter jobs remained zero. Materialized v2 totals were
465 canonical documents, 872 language variants, 15,169 distinct current
provisions and 55,072 indexed current chunks. No force-completion or code
change was performed; queue freeze and all release/post-ingestion gates
remain open.

## Sequential v2 monitoring boundary (2026-08-23, 15:34Z)

Run `cb902304-8357-4dac-a0d9-c4c4d650a79f` was `running` at the probe.
Discovery remained 41 `completed`; `international/ru` was `running` on
attempt 2 with the allow-listed retryable `LEX_CATALOG_TIMEOUT`, while
`international/uz-Cyrl` and `international/uz-Latn` were `queued`. The
ingestion ledger contained 2,362 `completed` and 25,533 `queued` jobs with
no running ingestion job. The failure ledger remained 15 `retrying` and two
`technically_unavailable` English official-text rows; the explicit
terminal/dead-letter query returned zero jobs. Materialized v2 totals were
464 canonical documents, 870 language variants, 15,168 distinct current
provisions and 55,067 indexed current chunks. No retryable checkpoint was
force-completed; release floors, queue freeze and all post-ingestion gates
remain open.

## Sequential v2 monitoring continuation (2026-08-23, 15:20–15:31Z)

Scheduled run `04904e08-2f14-4b0f-bf3a-b6ac85905c40` completed at
`2026-08-23T15:31:21.524Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. Timestamp-bounded read-only reconciliation at the
finish boundary recorded 2,362 completed and 25,479 queued ingestion jobs;
discovery remained 41 completed and three queued. Materialized counts at
that boundary were 463 canonical documents, 869 language variants, 15,164
distinct current provisions and 55,063 indexed current chunks. The explicit
terminal/dead-letter query returned zero jobs, and the current failure ledger
remained 15 `retrying` plus two `technically_unavailable` English
official-text rows. The next single-lease run
`cb902304-8357-4dac-a0d9-c4c4d650a79f` started at
`2026-08-23T15:32:54.362Z`. The timeout did not justify a code change,
regression test or staging redeploy; release floors, queue freeze and all
post-ingestion gates remain open.

## Sequential v2 monitoring boundary (2026-08-23, 15:24Z)

Run `04904e08-2f14-4b0f-bf3a-b6ac85905c40` remained `running` during this
sequential read-only probe. Checkpoints were 41 `completed` and three
`queued`; the ingestion ledger was 2,360 `completed`, 25,480 `queued` and
one `running`. The failure ledger remained 15 `retrying` and two
`technically_unavailable` English official-text rows; terminal/dead-letter
jobs remained zero. Materialized v2 totals were 463 canonical documents,
869 language variants, 15,164 distinct current provisions and 55,063 indexed
current chunks. Queue freeze and all release/post-ingestion gates remain
open; production bindings, feature flags and DNS are unchanged.

## Sequential v2 monitoring boundary (2026-08-23, 15:22Z)

The next single-lease run `04904e08-2f14-4b0f-bf3a-b6ac85905c40`
(`scheduled_for=2026-08-23T15:20:54Z`) was `running` at the read-only probe.
The checkpoint ledger remained 41 `completed` and three `queued`; the
ingestion ledger contained 2,357 `completed`, 25,483 `queued` and one
`running` job. The failure ledger remained 15 `retrying` and two
`technically_unavailable` English official-text rows, while the explicit
terminal/dead-letter query returned zero jobs. Materialized v2 totals were
462 canonical documents, 867 language variants, 15,163 distinct current
provisions and 55,058 indexed current chunks. The queue is not frozen and
the release floors and all post-ingestion gates remain open; production
bindings, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 15:08–15:19Z)

Scheduled run `a17b432b-be82-48f6-b4fc-83a3ccf122c9` completed at
`2026-08-23T15:19:29.760Z` with `error_code=NULL`. Timestamp-bounded
read-only reconciliation at the finish boundary recorded 2,357 completed
and 25,424 queued ingestion jobs; discovery remained 41 completed and three
queued. Materialized counts at that boundary were 461 canonical documents,
866 language variants, 15,159 distinct current provisions and 55,054 indexed
current chunks. The explicit terminal/dead-letter probe returned zero jobs;
the current failure ledger remained 15 `retrying` and two
`technically_unavailable` English official-text rows. The next single-lease
run `04904e08-2f14-4b0f-bf3a-b6ac85905c40` started at
`2026-08-23T15:20:54.362Z`. Release floors, queue freeze and all post-ingestion
gates remain open; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring boundary (2026-08-23, 15:13Z)

The single-lease scheduled run `a17b432b-be82-48f6-b4fc-83a3ccf122c9`
(`scheduled_for=2026-08-23T15:08:54Z`) was still `running` at the
read-only probe. The checkpoint ledger remained 41 `completed` and three
`queued`; the ingestion ledger contained 2,355 `completed`, 25,425 `queued`
and one `running` job. The failure ledger remained 15 `retrying` and two
`technically_unavailable` English official-text rows, while the explicit
terminal/dead-letter query returned zero jobs. Materialized v2 totals were
461 canonical documents, 866 language variants, 15,159 distinct current
provisions and 55,054 indexed current chunks. The release queue is not
frozen and all post-ingestion gates remain open; no production binding,
feature flag or DNS change was made.

## Sequential v2 monitoring continuation (2026-08-23, 14:56–15:07Z)

Scheduled run `6aca7f42-5a4a-416b-a5bb-a51ba80fff19` completed at
`2026-08-23T15:07:42.572Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. Timestamp-bounded read-only reconciliation at the
finish boundary recorded 2,352 completed and 25,349 queued ingestion jobs;
41 discovery checkpoints were completed and one remained queued at that
boundary. Materialized counts were 459 canonical documents, 863 language
variants, 15,153 distinct current provisions and 55,043 indexed current
chunks. The next single-lease run `a17b432b-be82-48f6-b4fc-83a3ccf122c9`
started at `2026-08-23T15:08:54.362Z`. The timeout remained allow-listed and
did not justify a code change, regression test or staging redeploy.

The release gate remains open: the live queue is not frozen, discovery is
not 44/44, and the document/provision floors are unmet even though the chunk
floor is exceeded. Snapshot, indexed 314-scenario evaluation, Qdrant/D1
restore and CI gates have not started. Production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 14:32–14:55Z)

Scheduled run `c3f121ed-eeca-40ce-bd82-665862b78b09` completed at
`2026-08-23T14:43:28.608Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. A timestamp-bounded read-only reconciliation at that
finish boundary recorded 2,342 completed and 25,209 queued ingestion jobs;
41 discovery checkpoints were completed. The corresponding materialized
counts were 455 canonical documents, 857 language variants, 15,142 distinct
current provisions and 55,013 indexed current chunks. The subsequent
single-lease run `5c650c5a-5616-4cc5-9ee8-43a7de12cf0c` started at
`2026-08-23T14:44:54.362Z`. No retryable result was force-completed; the
catalogue timeout did not justify a code change, regression test or staging
redeploy.

Run `5c650c5a-5616-4cc5-9ee8-43a7de12cf0c` completed at
`2026-08-23T14:55:26.444Z` with `error_code=NULL`. A timestamp-bounded
read-only reconciliation at its finish boundary recorded 2,347 completed
and 25,289 queued ingestion jobs. The materialized counts at that boundary
were 457 canonical documents, 860 language variants, 15,147 distinct current
provisions and 55,022 indexed current chunks. The next single-lease run
`6aca7f42-5a4a-416b-a5bb-a51ba80fff19` was running during the following
probe. At that probe the live ledger was 2,351 completed, 25,349 queued and
one running job; checkpoints remained 41 completed and three queued. The
failure ledger remained 15 `retrying` and two `technically_unavailable`
English official-text rows, with no failed, terminal or dead-letter ingestion
jobs. Materialized current totals were 459 canonical documents, 863 language
variants, 15,153 distinct current provisions and 55,043 indexed current
chunks. Release floors, queue freeze, snapshot, indexed evaluation,
Qdrant/D1 restore and CI gates remain open; production bindings, corpus
ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 14:20–14:31Z)

Scheduled run `d17ba8bb-e582-4b81-9117-ede372a276d3` completed at
`2026-08-23T14:31:30.797Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The immediate read-only probe recorded 41/44 discovery
checkpoints completed and three queued (`international` in `uz-Cyrl`,
`uz-Latn` and `ru`). The ingestion ledger contained 2,337 completed and
25,164 queued jobs; no job remained running. No failed, terminal or
dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
were 453 canonical documents, 854 language variants, 15,137 distinct current
provisions and 55,004 indexed current chunks. No retryable result was
force-completed; the catalogue timeout did not justify a code change,
regression test or redeploy. The next single-lease run
`c3f121ed-eeca-40ce-bd82-665862b78b09` is active (scheduled
`2026-08-23T14:32:54Z`). Release floors, checkpoint completion, queue freeze,
snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain open;
production bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 14:08–14:19Z)

Scheduled run `4c4fc22f-5586-47db-87d7-9f57af563143` completed at
`2026-08-23T14:19:32.049Z` with `error_code=NULL`. The immediate read-only
probe recorded 41/44 discovery checkpoints completed and three queued
(`international` in `uz-Latn`, `ru` and `uz-Cyrl`). The ingestion ledger
contained 2,332 completed and 25,109 queued jobs; no job remained running.
No failed, terminal or dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
were 451 canonical documents, 851 language variants, 15,131 distinct current
provisions and 54,993 indexed current chunks. No retryable result was
force-completed and no code change or redeploy was justified. The next
single-lease run `d17ba8bb-e582-4b81-9117-ede372a276d3` is active (scheduled
`2026-08-23T14:20:54Z`). Release floors, checkpoint completion, queue freeze,
snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain open;
production bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 13:56–14:07Z)

Scheduled run `0957afba-79a4-4ed6-bca1-1c105455c7ba` completed at
`2026-08-23T14:07:23.966Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The immediate read-only probe recorded 41/44 discovery
checkpoints completed and three queued (`international` in `uz-Cyrl`, `ru`
and `uz-Latn`). The ingestion ledger contained 2,327 completed and 25,034
queued jobs; no job remained running. No failed, terminal or dead-letter
ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
remained 449 canonical documents, 848 language variants, 15,121 distinct
current provisions and 54,978 indexed current chunks. No retryable result was
force-completed; the catalogue timeout did not justify a code change,
regression test or redeploy. The next single-lease run
`4c4fc22f-5586-47db-87d7-9f57af563143` is active (scheduled
`2026-08-23T14:08:54Z`). Release floors, checkpoint completion, queue freeze,
snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain open;
production bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 13:44–13:55Z)

Scheduled run `ca3a88f9-66d5-487a-8680-b63f51582d75` completed at
`2026-08-23T13:55:39.785Z` with `error_code=NULL`. The immediate read-only
probe recorded 41/44 discovery checkpoints completed and three non-completed
rows: `international/uz-Latn` running, `international/uz-Cyrl` retrying with
`LEX_CATALOG_TIMEOUT`, and `international/ru` queued. The ingestion ledger
contained 2,322 completed and 24,979 queued jobs; no job remained running.
No failed, terminal or dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
were 447 canonical documents, 845 language variants, 15,115 distinct current
provisions and 54,967 indexed current chunks. No retryable result was
force-completed; no repeatable terminal failure appeared, so no code change,
regression test or redeploy was justified. The next single-lease run
`0957afba-79a4-4ed6-bca1-1c105455c7ba` is active (scheduled
`2026-08-23T13:56:54Z`). Release floors, checkpoint completion, queue freeze,
snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain open;
production bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 13:32–13:43Z)

Scheduled run `d81af578-ad09-48ab-862b-496804e98c1d` completed at
`2026-08-23T13:43:49.216Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The immediate read-only probe recorded 41/44 discovery
checkpoints completed and three queued. The ingestion ledger contained 2,317
completed and 24,904 queued jobs. No failed, terminal or dead-letter ingestion
jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
reached 445 canonical documents, 842 language variants, 15,109 distinct
current provisions and 54,956 indexed current chunks. No retryable result was
force-completed; the catalogue timeout did not justify a code change or
redeploy. The next single-lease run
`ca3a88f9-66d5-487a-8680-b63f51582d75` is active. Release floors, checkpoint
completion, queue freeze, snapshot, indexed evaluation, Qdrant/D1 restore and
CI gates remain open; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 13:24–13:31Z)

Scheduled run `1640442c-1446-42d1-97ff-96ddd90e709c` completed at
`2026-08-23T13:31:34.265Z` with `error_code=NULL`. The immediate read-only
probe recorded 41/44 discovery checkpoints completed and three queued. The
ingestion ledger contained 2,312 completed and 24,849 queued jobs. No failed,
terminal or dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
reached 443 canonical documents, 839 language variants, 15,104 distinct
current provisions and 54,935 indexed current chunks. No retryable result was
force-completed and no code change or redeploy was justified. No newer
scheduled run was present at the immediate post-run probe. Release floors,
checkpoint completion, queue freeze, snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain open; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 13:16–13:23Z)

Scheduled run `bfa9a4ba-cda3-4d29-b19b-2e805f94c5db` completed at
`2026-08-23T13:23:47.958Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The immediate read-only probe recorded 41/44 discovery
checkpoints completed and three queued. The ingestion ledger contained 2,307
completed and 24,774 queued jobs. No failed, terminal or dead-letter ingestion
jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
reached 441 canonical documents, 836 language variants, 15,099 distinct
current provisions and 54,925 indexed current chunks. No retryable result was
force-completed; the catalogue timeout did not justify a code change or
redeploy. The next single-lease run
`1640442c-1446-42d1-97ff-96ddd90e709c` is active. Release floors, checkpoint
completion, queue freeze, snapshot, indexed evaluation, Qdrant/D1 restore and
CI gates remain open; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 13:08–13:15Z)

Scheduled run `1a5deed3-75ed-415d-9bf1-730f65d432a2` completed at
`2026-08-23T13:15:26.918Z` with `error_code=NULL`. The immediate read-only
probe recorded 41/44 discovery checkpoints completed and three queued. The
ingestion ledger contained 2,302 completed and 24,719 queued jobs. No failed,
terminal or dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
reached 439 canonical documents, 833 language variants, 14,980 distinct
current provisions and 54,543 indexed current chunks. No retryable result was
force-completed and no code change or redeploy was justified. The next
single-lease run `bfa9a4ba-cda3-4d29-b19b-2e805f94c5db` is active. Release
floors, checkpoint completion, queue freeze, snapshot, indexed evaluation,
Qdrant/D1 restore and CI gates remain open; production bindings, corpus
ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 13:00–13:07Z)

Scheduled run `07461fb1-ecaf-4305-b561-634525697443` completed at
`2026-08-23T13:07:33.812Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The immediate read-only probe recorded 41/44 discovery
checkpoints completed and three queued. The ingestion ledger contained 2,297
completed and 24,644 queued jobs. No failed, terminal or dead-letter ingestion
jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
reached 437 canonical documents, 830 language variants, 14,975 distinct
current provisions and 54,533 indexed current chunks. No retryable result was
force-completed; the catalogue timeout did not justify a code change or
redeploy. The next single-lease run
`1a5deed3-75ed-415d-9bf1-730f65d432a2` is active. Release floors, checkpoint
completion, queue freeze, snapshot, indexed evaluation, Qdrant/D1 restore and
CI gates remain open; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 12:52–12:59Z)

Scheduled run `3a1e43f8-102d-4d24-9428-63c165546c28` completed at
`2026-08-23T12:59:25.916Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The immediate read-only probe recorded 41/44 discovery
checkpoints completed and three queued. The ingestion ledger contained 2,292
completed and 24,589 queued jobs. No failed, terminal or dead-letter ingestion
jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
reached 435 canonical documents, 827 language variants, 14,969 distinct
current provisions and 54,524 indexed current chunks. No retryable result was
force-completed; the catalogue timeout did not justify a code change or
redeploy. The next single-lease run
`07461fb1-ecaf-4305-b561-634525697443` is active. Release floors, checkpoint
completion, queue freeze, snapshot, indexed evaluation, Qdrant/D1 restore and
CI gates remain open; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 12:44–12:51Z)

Scheduled run `ce5538f2-a6f5-4914-8b2f-2776ca34e922` completed at
`2026-08-23T12:51:24.731Z` with `error_code=NULL`. The immediate read-only
probe recorded 41/44 discovery checkpoints completed and three queued. The
ingestion ledger contained 2,287 completed and 24,534 queued jobs. No failed,
terminal or dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
reached 433 canonical documents, 824 language variants, 14,964 distinct
current provisions and 54,515 indexed current chunks. No retryable result was
force-completed and no code change or redeploy was justified. The next
single-lease run `3a1e43f8-102d-4d24-9428-63c165546c28` is active. Release
floors, checkpoint completion, queue freeze, snapshot, indexed evaluation,
Qdrant/D1 restore and CI gates remain open; production bindings, corpus
ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 12:36–12:43Z)

Scheduled run `2fd97e88-9beb-4125-97d7-3b974b739286` completed at
`2026-08-23T12:43:20.105Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The immediate read-only probe recorded 41/44 discovery
checkpoints completed and three queued. The ingestion ledger contained 2,282
completed and 24,459 queued jobs. No failed, terminal or dead-letter ingestion
jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
reached 431 canonical documents, 821 language variants, 14,958 distinct
current provisions and 54,502 indexed current chunks. No retryable result was
force-completed. The catalogue timeout is not a terminal failure and did not
justify a code change or redeploy. Release floors, checkpoint completion,
queue freeze, snapshot, indexed evaluation, Qdrant/D1 restore and CI gates
remain open; production bindings, corpus ingestion, feature flags and DNS are
unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 12:28–12:35Z)

Scheduled run `49b48d54-c030-43de-9529-e9dd1c848e5a` completed at
`2026-08-23T12:35:25.217Z` with `error_code=NULL`. The immediate read-only
probe recorded 41/44 discovery checkpoints completed and three queued. The
ingestion ledger contained 2,277 completed and 24,404 queued jobs. No failed,
terminal or dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
reached 429 canonical documents, 818 language variants, 14,952 distinct
current provisions and 54,470 indexed current chunks. No retryable result was
force-completed. Release floors, checkpoint completion, queue freeze,
snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain open;
production bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 12:20–12:27Z)

Scheduled run `eb1c217c-b1e1-43b6-a2ef-abf6ea360332` completed at
`2026-08-23T12:27:22.418Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The immediate read-only probe recorded 41/44 discovery
checkpoints completed and three queued. The ingestion ledger contained 2,272
completed and 24,329 queued jobs. No failed, terminal or dead-letter ingestion
jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
reached 427 canonical documents, 815 language variants, 14,946 distinct
current provisions and 54,459 indexed current chunks. No retryable result was
force-completed. The catalogue timeout is not a terminal failure and did not
justify a code change or redeploy. Release floors, checkpoint completion,
queue freeze, snapshot, indexed evaluation, Qdrant/D1 restore and CI gates
remain open; production bindings, corpus ingestion, feature flags and DNS are
unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 12:12–12:20Z)

Scheduled run `e7b27134-7bc3-4fbd-b1f4-8aed83c65211` completed at
`2026-08-23T12:20:07.328Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The immediate read-only probe recorded 41/44 discovery
checkpoints completed and three queued. The ingestion ledger contained 2,267
completed and 24,274 queued jobs. No failed, terminal or dead-letter ingestion
jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
reached 425 canonical documents, 812 language variants, 14,941 distinct
current provisions and 54,450 indexed current chunks. The indexed count rose
from the prior probe through successful version/index work; no retryable result
was force-completed. The catalogue timeout is not a terminal failure and did
not justify a code change or redeploy. The next single-lease run
`eb1c217c-b1e1-43b6-a2ef-abf6ea360332` is active. Release floors, checkpoint
completion, queue freeze, snapshot, indexed evaluation, Qdrant/D1 restore and
CI gates remain open; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 12:04–12:11Z)

Scheduled run `b2a59780-62c7-4970-b5a4-62131571f257` completed at
`2026-08-23T12:11:24.923Z` with `error_code=NULL`. The immediate read-only
probe recorded 41/44 discovery checkpoints completed and three queued. The
ingestion ledger contained 2,262 completed and 24,219 queued jobs. No failed,
terminal or dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
reached 423 canonical documents, 809 language variants, 14,935 distinct
current provisions and 53,785 indexed current chunks. No retryable result was
force-completed; no code change or redeploy was justified. Release floors,
checkpoint completion, queue freeze, snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain open; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 11:56–12:03Z)

Scheduled run `5017e8cf-0a6f-46b2-a3c9-bc7a859e5c34` completed at
`2026-08-23T12:03:23.992Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The immediate read-only probe recorded 41/44 discovery
checkpoints completed and three queued; no checkpoint was running or retrying
at the boundary. The ingestion ledger contained 2,257 completed and 24,144
queued jobs. No failed, terminal or dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
reached 421 canonical documents, 806 language variants, 14,930 distinct
current provisions and 53,776 indexed current chunks. The catalogue timeout is
not a terminal failure and did not justify a code change or redeploy. Release
floors, checkpoint completion, queue freeze, snapshot, indexed evaluation,
Qdrant/D1 restore and CI gates remain open; production bindings, corpus
ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 11:52–11:56Z)

Scheduled run `827b94a8-3e1c-45e6-83c1-25929bb2e4dd` completed at
`2026-08-23T11:55:56.793Z` with `error_code=NULL`. The immediate read-only
probe recorded 41/44 discovery checkpoints completed and three queued. The
ingestion ledger contained 2,252 completed and 24,089 queued jobs. No failed,
terminal or dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows; no retryable result was
force-completed. Materialized v2 totals reached 419 canonical documents, 803
language variants, 14,925 distinct current provisions and 53,766 indexed
current chunks. No code change or redeploy was justified. Release floors,
checkpoint completion, queue freeze, snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain open; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 11:48–11:52Z)

Scheduled run `37cd463d-c688-4b48-b69d-901d59a35dcb` completed at
`2026-08-23T11:51:49.596Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The immediate read-only probe recorded 41/44 discovery
checkpoints completed, two queued and one running. The ingestion ledger
contained 2,246 completed and 24,055 queued jobs. No failed, terminal or
dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. `international/uz-Latn`
was the active checkpoint; no retryable result was force-completed. Materialized
v2 totals reached 417 canonical documents, 800 language variants, 14,920
distinct current provisions and 53,757 indexed current chunks. The catalogue
timeout is not a terminal failure and did not justify a code change or
redeploy. The next single-lease run
`827b94a8-3e1c-45e6-83c1-25929bb2e4dd` is active. Release floors, checkpoint
completion, queue freeze, snapshot, indexed evaluation, Qdrant/D1 restore and
CI gates remain open; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 11:44–11:48Z)

Scheduled run `e81c37b2-d91f-4ad5-804e-8cbd7af6a563` completed at
`2026-08-23T11:47:57.618Z` with `error_code=NULL`. The immediate read-only
probe recorded 41/44 discovery checkpoints completed, two queued and one
running. The ingestion ledger contained 2,241 completed and 23,960 queued
jobs. No failed, terminal or dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. `international/uz-Cyrl`
was running while `international/uz-Latn` retained the allow-listed retryable
`LEX_CATALOG_TIMEOUT`; no retryable result was force-completed. Materialized
v2 totals reached 415 canonical documents, 797 language variants, 14,915
distinct current provisions and 53,739 indexed current chunks. The catalogue
timeout is not a terminal failure and did not justify a code change or
redeploy. The next single-lease run
`37cd463d-c688-4b48-b69d-901d59a35dcb` is active. Release floors, checkpoint
completion, queue freeze, snapshot, indexed evaluation, Qdrant/D1 restore and
CI gates remain open; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 11:40–11:44Z)

Scheduled run `be796412-2c45-4a0c-99c8-6ea987d02ba1` completed at
`2026-08-23T11:43:49.155Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The immediate read-only probe recorded 41/44 discovery
checkpoints completed, two queued and one running. The ingestion ledger
contained 2,235 completed and 23,926 queued jobs. No failed, terminal or
dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. `international/ru` was
the active checkpoint; no retryable result was force-completed. Materialized
v2 totals reached 413 canonical documents, 794 language variants, 14,910
distinct current provisions and 53,729 indexed current chunks. The catalogue
timeout is not a terminal failure and did not justify a code change or
redeploy. The next single-lease run
`e81c37b2-d91f-4ad5-804e-8cbd7af6a563` is active. Release floors, checkpoint
completion, queue freeze, snapshot, indexed evaluation, Qdrant/D1 restore and
CI gates remain open; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 11:36–11:40Z)

Scheduled run `b6563ba2-4520-4615-8d27-e656f9702ed0` completed at
`2026-08-23T11:39:59.817Z` with `error_code=NULL`. The immediate read-only
probe recorded 41/44 discovery checkpoints completed, two queued and one
running. The ingestion ledger contained 2,230 completed and 23,831 queued
jobs. No failed, terminal or dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. `international/uz-Latn`
was running while `international/ru` retained the allow-listed retryable
`LEX_CATALOG_TIMEOUT` with a preserved next-attempt timestamp. Materialized
v2 totals reached 411 canonical documents, 791 language variants, 14,905
distinct current provisions and 53,719 indexed current chunks. The retryable
timeout is not a terminal failure and did not justify a code change or
redeploy. The next single-lease run `be796412-2c45-4a0c-99c8-6ea987d02ba1`
is active. Release floors, checkpoint completion, queue freeze, snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remain open; production
bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 11:32–11:36Z)

Scheduled run `229ea50c-3f48-41de-9f15-07ef4450a987` completed at
`2026-08-23T11:35:48.822Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The immediate read-only probe recorded 41/44 discovery
checkpoints completed, two queued and one running. The ingestion ledger
contained 2,224 completed and 23,777 queued jobs. No failed, terminal or
dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. The international
Uzbek-Latin checkpoint continued under the single lease; no retryable result
was force-completed. Materialized v2 totals reached 409 canonical documents,
788 language variants, 14,900 distinct current provisions and 53,709 indexed
current chunks. The catalogue timeout is not a terminal failure and did not
justify a code change or redeploy. The next single-lease run
`b6563ba2-4520-4615-8d27-e656f9702ed0` is active. Release floors, checkpoint
completion, queue freeze, snapshot, indexed evaluation, Qdrant/D1 restore and
CI gates remain open; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 11:28–11:32Z)

Scheduled run `0e36295e-9460-4ced-b22f-197678ff1500` completed at
`2026-08-23T11:31:59.154Z` with `error_code=NULL`. The immediate read-only
probe recorded 41/44 discovery checkpoints completed, one queued, one running
and one retrying. The ingestion ledger contained 2,219 completed and 23,722
queued jobs; no failed, terminal or dead-letter ingestion jobs were present.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. The international
Uzbek-Latin checkpoint was running; the Russian and Uzbek-Cyrillic checkpoints
retained the allow-listed retryable `LEX_CATALOG_TIMEOUT` with their next
attempt timestamps. Materialized v2 totals remained 407 canonical documents,
785 language variants, 14,895 distinct current provisions and 53,699 indexed
current chunks. The retryable catalogue timeouts are not terminal failures and
did not justify a code change or redeploy. The next single-lease run
`229ea50c-3f48-41de-9f15-07ef4450a987` is active. Release floors, checkpoint
completion, queue freeze, snapshot, indexed evaluation, Qdrant/D1 restore and
CI gates remain open; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 11:20–11:28Z)

Scheduled run `d9749d29-f039-4b9d-9ebb-ef25aa3fd353` completed at
`2026-08-23T11:23:59.334Z` with `error_code=NULL`. Its immediate read-only
boundary recorded 41/44 discovery checkpoints completed and three queued; the
ingestion ledger contained 2,213 completed and 23,648 queued jobs. The failure
ledger remained fifteen `retrying` rows and two `technically_unavailable`
English official-text rows. No failed, terminal or dead-letter ingestion jobs
were present.

Materialized v2 totals were 405 canonical documents, 782 language variants,
14,890 distinct current provisions and 53,689 indexed current chunks. The next
single-lease run `0e36295e-9460-4ced-b22f-197678ff1500` then started at
`2026-08-23T11:28:11.098Z` and resumed the `international/ru` checkpoint; no
retryable or unavailable row was force-completed. The document, provision and
checkpoint release gates remain open and ingestion is not frozen. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remain unopened;
production bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 11:16–11:20Z)

Scheduled run `f5a33ac4-3e76-4e44-80fd-f15eafd8fe0d` completed at
`2026-08-23T11:19:51.651Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The next sequential run
`d9749d29-f039-4b9d-9ebb-ef25aa3fd353` was already running when the
read-only counters were captured. At that boundary, 40/44 discovery
checkpoints were completed, 3 were queued and one was running. The ingestion
ledger contained 2,202 completed and 23,575 queued jobs. No failed, terminal or
dead-letter ingestion jobs were observed.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
were 401 canonical documents, 776 language variants, 14,878 distinct current
provisions and 53,667 indexed current chunks. The document, provision and
checkpoint release gates remain open and ingestion is not frozen. The
retryable catalogue timeout did not justify a code change or staging
redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain
unopened; production bindings, corpus ingestion, feature flags and DNS are
unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 11:12–11:16Z)

Scheduled run `2ee9ee9c-b497-40f0-a9ac-322b2bb5c510` completed at
`2026-08-23T11:16:05.103Z` with `error_code=NULL`. The next sequential run
`f5a33ac4-3e76-4e44-80fd-f15eafd8fe0d` was already running when the
read-only counters were captured. At that boundary, 40/44 discovery
checkpoints were completed, 2 were queued, one was retrying and one was
running. The ingestion ledger contained 2,197 completed and 23,500 queued
jobs. No failed, terminal or dead-letter ingestion jobs were observed.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
were 399 canonical documents, 773 language variants, 14,872 distinct current
provisions and 53,656 indexed current chunks. The document, provision and
checkpoint release gates remain open and ingestion is not frozen. No code
change or staging redeploy was justified. Snapshot, indexed evaluation,
Qdrant/D1 restore and CI gates remain unopened; production bindings, corpus
ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 11:08–11:12Z)

Scheduled run `3c993333-894f-41ff-ac52-526f9b3f0576` completed at
`2026-08-23T11:11:51.651Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The next sequential run
`2ee9ee9c-b497-40f0-a9ac-322b2bb5c510` was already running when the
read-only counters were captured. At that boundary, 40/44 discovery
checkpoints were completed, 3 were queued and one was running. The ingestion
ledger contained 2,191 completed and 23,466 queued jobs. No failed, terminal or
dead-letter ingestion jobs were observed.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
were 398 canonical documents, 771 language variants, 14,871 distinct current
provisions and 53,599 indexed current chunks. The document, provision and
checkpoint release gates remain open and ingestion is not frozen. The
retryable catalogue timeout did not justify a code change or staging
redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain
unopened; production bindings, corpus ingestion, feature flags and DNS are
unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 11:04–11:08Z)

Scheduled run `49ccb98c-334b-4198-9542-c76d0f7de496` completed at
`2026-08-23T11:08:01.492Z` with `error_code=NULL`. The next sequential run
`3c993333-894f-41ff-ac52-526f9b3f0576` was already running when the
read-only counters were captured. At that boundary, 40/44 discovery
checkpoints were completed, 3 were queued and one was running. The ingestion
ledger contained 2,186 completed and 23,351 queued jobs. No failed, terminal or
dead-letter ingestion jobs were observed.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
were 395 canonical documents, 767 language variants, 14,862 distinct current
provisions and 53,430 indexed current chunks. The document, provision and
checkpoint release gates remain open and ingestion is not frozen. No code
change or staging redeploy was justified. Snapshot, indexed evaluation,
Qdrant/D1 restore and CI gates remain unopened; production bindings, corpus
ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 11:00–11:04Z)

Scheduled run `ee157de1-3cb0-4b45-9e0c-adbf37141dbb` completed at
`2026-08-23T11:03:52.663Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The next sequential run
`49ccb98c-334b-4198-9542-c76d0f7de496` was already running when the
read-only counters were captured. At that boundary, 40/44 discovery
checkpoints were completed, 3 were queued and one was running. The ingestion
ledger contained 2,180 completed and 23,297 queued jobs, with no running job
at probe time. No failed, terminal or dead-letter ingestion jobs were
observed.

The failure ledger remained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
were 393 canonical documents, 764 language variants, 14,856 distinct current
provisions and 53,421 indexed current chunks. The document, provision and
checkpoint release gates remain open and ingestion is not frozen. The
retryable catalogue timeout did not justify a code change or staging
redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain
unopened; production bindings, corpus ingestion, feature flags and DNS are
unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 10:56–11:00Z)

Scheduled run `99c6a4c5-789d-478a-8852-487796d6f1bb` completed at
`2026-08-23T10:59:58.037Z` with `error_code=NULL`. The next sequential run
`ee157de1-3cb0-4b45-9e0c-adbf37141dbb` was already running when the
read-only counters were captured. At that boundary, 40/44 discovery
checkpoints were completed and 4 were queued. The ingestion ledger contained
2,175 completed and 23,222 queued jobs. No failed, terminal or dead-letter
ingestion jobs were observed.

The failure ledger contained fifteen `retrying` rows and two
`technically_unavailable` English official-text rows. The new retryable row
was `LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` for Russian document
`lexuz:8238258`; it remains a source-language availability limitation, not a
terminal ingestion failure. Materialized v2 totals were 391 canonical
documents, 761 language variants, 14,850 distinct current provisions and
53,382 indexed current chunks. The document, provision and checkpoint release
gates remain open and ingestion is not frozen. No code change or staging
redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remain unopened; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 10:52–10:56Z)

Scheduled run `8bafd56c-9dbf-49db-8c6f-d7edb7d3cf27` completed at
`2026-08-23T10:55:47.948Z` with `error_code=NULL`. The next sequential run
`99c6a4c5-789d-478a-8852-487796d6f1bb` was already running when the
read-only counters were captured. At that boundary, 40/44 discovery
checkpoints were completed, 3 were queued and one was running. The ingestion
ledger contained 2,170 completed and 23,187 queued jobs; the ledger probe had
no running job at that instant. No failed, terminal or dead-letter ingestion
jobs were observed.

The failure ledger remained fourteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
were 390 canonical documents, 759 language variants, 14,845 distinct current
provisions and 53,314 indexed current chunks. The document, provision and
checkpoint release gates remain open and ingestion is not frozen. No code
change or staging redeploy was justified. Snapshot, indexed evaluation,
Qdrant/D1 restore and CI gates remain unopened; production bindings, corpus
ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 10:44–10:48Z)

Scheduled run `7cfba736-b13e-49d6-a552-83f4e6cff1fa` completed at
`2026-08-23T10:48:12.141Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. No newer scheduled run was present when the
post-run read-only counters were captured. At that boundary, 39/44 discovery
checkpoints were completed, 4 were queued and one checkpoint was retrying.
The ingestion ledger contained 2,165 completed and 23,132 queued jobs, with no
running job. No failed, terminal or dead-letter ingestion jobs were observed.

The failure ledger remained fourteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
were 389 canonical documents, 756 language variants, 14,827 distinct current
provisions and 53,288 indexed current chunks. The document, provision and
checkpoint release gates remain open and ingestion is not frozen. The
retryable catalogue timeout did not justify a code change or staging
redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain
unopened; production bindings, corpus ingestion, feature flags and DNS are
unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 10:36–10:40Z)

Scheduled run `406b40ec-30c6-4546-8d23-686d8f77551f` completed at
`2026-08-23T10:40:16.183Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. No newer scheduled run was present when the
post-run read-only counters were captured. At that boundary, 39/44 discovery
checkpoints were completed, 4 were queued and one checkpoint was retrying.
The ingestion ledger contained 2,157 completed and 23,140 queued jobs, with no
running job. No failed, terminal or dead-letter ingestion jobs were observed.

The failure ledger remained fourteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
were 388 canonical documents, 752 language variants, 14,822 distinct current
provisions and 53,220 indexed current chunks. The document, provision and
checkpoint release gates remain open and ingestion is not frozen. The
retryable catalogue timeout did not justify a code change or staging
redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain
unopened; production bindings, corpus ingestion, feature flags and DNS are
unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 10:28–10:32Z)

Scheduled run `933268a1-d036-4955-a80a-5e95054f8f8c` completed at
`2026-08-23T10:32:11.880Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. No newer scheduled run was present when the
post-run read-only counters were captured. At that boundary, 39/44 discovery
checkpoints were completed, 4 were queued and one checkpoint was retrying.
The ingestion ledger contained 2,149 completed and 23,148 queued jobs, with no
running job. No failed, terminal or dead-letter ingestion jobs were observed.

The failure ledger remained fourteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
were 387 canonical documents, 748 language variants, 14,817 distinct current
provisions and 52,981 indexed current chunks. The document, provision and
checkpoint release gates remain open and ingestion is not frozen. The
retryable catalogue timeout did not justify a code change or staging
redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain
unopened; production bindings, corpus ingestion, feature flags and DNS are
unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 10:24–10:28Z)

Scheduled run `6b835d4c-58a0-40a7-b82d-82b200ece677` completed at
`2026-08-23T10:28:07.987Z` with `error_code=NULL`. The next sequential run
`933268a1-d036-4955-a80a-5e95054f8f8c` was already running when the
read-only counters were captured. At that boundary, 39/44 discovery
checkpoints were completed, 4 were queued and one ingestion job was active.
The ingestion ledger contained 2,141 completed, 23,155 queued and one running
job. No failed, terminal or dead-letter ingestion jobs were observed.

The failure ledger remained fourteen `retrying` rows and two
`technically_unavailable` English official-text rows. Materialized v2 totals
were 387 canonical documents, 745 language variants, 14,816 distinct current
provisions and 52,973 indexed current chunks. The document, provision and
checkpoint release gates remain open and ingestion is not frozen. No code
change or staging redeploy was justified. Snapshot, indexed evaluation,
Qdrant/D1 restore and CI gates remain unopened; production bindings, corpus
ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 10:20–10:24Z)

Scheduled run `d9423204-e44e-4867-a388-d2a9323e30c4` completed at
`2026-08-23T10:24:10.867Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The next sequential run
`6b835d4c-58a0-40a7-b82d-82b200ece677` was already running when the
read-only counters were captured. At that boundary, 39/44 discovery
checkpoints were completed, 4 were queued and one checkpoint was running.
The ingestion ledger contained 2,135 completed and 23,142 queued jobs. No
failed, terminal or dead-letter ingestion jobs were observed.

The failure ledger contained fourteen `retrying` rows and two
`technically_unavailable` English official-text rows (`lexuz:8348901` and
`lexuz:8269306`). These are source-availability limitations and are tracked
explicitly, not treated as successful coverage. Materialized v2 totals were
385 canonical documents, 740 language variants, 14,805 distinct current
provisions and 52,824 indexed current chunks. The document, provision and
checkpoint release gates remain open and ingestion is not frozen. No code
change or staging redeploy was justified. Snapshot, indexed evaluation,
Qdrant/D1 restore and CI gates remain unopened; production bindings, corpus
ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 10:16–10:20Z)

Scheduled run `2d80f077-82b2-43ad-b9ef-22a3d638989f` completed at
`2026-08-23T10:20:04.531Z` with `error_code=NULL`. The next sequential run
`d9423204-e44e-4867-a388-d2a9323e30c4` was already running when the
read-only counters were captured. At that boundary, 39/44 discovery
checkpoints were completed, 4 were queued and one checkpoint remained in
retrying state. The ingestion ledger contained 2,127 completed, 23,089 queued
and one running job. No failed, terminal or dead-letter ingestion jobs were
observed.

The failure ledger remained fourteen `retrying` rows and one
`technically_unavailable` row. Materialized v2 totals were 385 canonical
documents, 740 language variants, 14,805 distinct current provisions and
52,824 indexed current chunks. The document, provision and checkpoint release
gates remain open and ingestion is not frozen. No code change or staging
redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remain unopened; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 10:12–10:16Z)

Scheduled run `4b3a60e5-2c9a-45aa-85b3-220b39458017` completed at
`2026-08-23T10:16:09.779Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The next sequential run
`2d80f077-82b2-43ad-b9ef-22a3d638989f` was already running when the
read-only counters were captured. At that boundary, 39/44 discovery
checkpoints were completed, 4 were queued and one ingestion job was active.
The ingestion ledger contained 2,121 completed and 23,036 queued jobs. No
failed, terminal or dead-letter ingestion jobs were observed.

The failure ledger remained fourteen `retrying` rows and one
`technically_unavailable` row. Materialized v2 totals were 383 canonical
documents, 735 language variants, 14,795 distinct current provisions and
52,740 indexed current chunks. The document, provision and checkpoint release
gates remain open and ingestion is not frozen. The retryable catalogue timeout
did not justify a code change or staging redeploy. Snapshot, indexed
evaluation, Qdrant/D1 restore and CI gates remain unopened; production
bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 10:08–10:12Z)

Scheduled run `fc0a1975-8ebf-46f6-8a0f-ca4da5b26b39` completed at
`2026-08-23T10:11:58.213Z` with `error_code=NULL`. The next sequential run
`4b3a60e5-2c9a-45aa-85b3-220b39458017` was already running when the
read-only counters were captured. At that boundary, 39/44 discovery
checkpoints were completed, 4 were queued and one ingestion job was running.
The ingestion ledger contained 2,113 completed and 23,023 queued jobs. No
failed, terminal or dead-letter ingestion jobs were observed.

The failure ledger remained fourteen `retrying` rows and one
`technically_unavailable` row. Materialized v2 totals were 383 canonical
documents, 732 language variants, 14,794 distinct current provisions and
52,671 indexed current chunks. The document, provision and checkpoint release
gates remain open and ingestion is not frozen. No code change or staging
redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remain unopened; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 10:04–10:07Z)

Scheduled run `c1017ba8-5541-462e-857e-9eee4eaf3a2f` completed at
`2026-08-23T10:07:48.445Z` with `error_code=NULL`. The next sequential run
`fc0a1975-8ebf-46f6-8a0f-ca4da5b26b39` was already running when the
read-only counters were captured. At that boundary, 39/44 discovery
checkpoints were completed, 4 were queued and one ingestion run was active;
the checkpoint rows themselves had no retrying or running status. The
ingestion ledger contained 2,107 completed and 22,970 queued jobs. No failed,
terminal or dead-letter ingestion jobs were observed.

The failure ledger remained fourteen `retrying` rows and one
`technically_unavailable` row. Materialized v2 totals were 381 canonical
documents, 728 language variants, 14,784 distinct current provisions and
52,603 indexed current chunks. The document, provision and checkpoint release
gates remain open and ingestion is not frozen. No code change or staging
redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remain unopened; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 09:56–10:00Z)

Scheduled run `602ad672-810f-412f-a413-13dac946d60e` finished at
`2026-08-23T10:00:18.360Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. Read-only counters after closure showed 39/44
discovery checkpoints completed, 4 queued and the technical/Russian
checkpoint retrying. Materialized totals were unchanged at 380 canonical
documents, 725 language variants, 14,780 distinct current provisions and
52,555 indexed current chunks. The failure ledger remained fourteen
`retrying` rows and one `technically_unavailable` row; no failed, terminal or
dead-letter ingestion jobs were present.

The release floors, queue freeze and all post-ingestion gates remain open. The
retryable catalogue timeout did not justify a code change or staging redeploy.
Production bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 09:48–09:54Z)

Scheduled run `ec4ab007-8ce8-4c42-89fd-222e32df1fda` completed at
`2026-08-23T09:51:48.796Z` with `error_code=NULL`. The next sequential run
`f7228ea6-df4c-429d-8efb-630e6feb927b` was already running when the
read-only counters were captured. At that boundary, 39/44 discovery
checkpoints were completed and 5 remained queued; the ingestion ledger had
2,092 completed, 22,884 queued and one running job. No failed, terminal or
dead-letter ingestion jobs were observed.

The failure ledger contained fourteen `retrying` rows and one
`technically_unavailable` row: two `LEGAL_CORPUS_INGESTION_FAILED` (ru), one
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (en, `lexuz:8348901`,
non-retryable), one `LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (uz-Latn), four
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`, six
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` (ru), and one
`LEGAL_SOURCE_TIMEOUT` (ru). These remain explicitly tracked and are not
claimed as successful legal coverage.

The materialized v2 totals at the probe were 379 canonical documents, 721
language variants, 14,775 distinct current provisions and 52,432 indexed
current chunks. The document, provision and checkpoint release gates remain
open and ingestion is not frozen. No code change or staging redeploy was
justified. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain
unopened; production bindings, corpus ingestion, feature flags and DNS are
unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 09:52–09:56Z)

Scheduled run `f7228ea6-df4c-429d-8efb-630e6feb927b` completed at
`2026-08-23T09:56:00.404Z` with `error_code=NULL`. The next sequential run
`602ad672-810f-412f-a413-13dac946d60e` was already running when the
read-only counters were captured. At that boundary, 39/44 discovery
checkpoints were completed, 4 were queued and the technical/Russian
checkpoint was retrying after the allow-listed `LEX_CATALOG_TIMEOUT`. The
ingestion ledger contained 2,098 completed, 22,878 queued and one running job.
No failed, terminal or dead-letter ingestion jobs were observed.

The failure ledger remained fourteen `retrying` rows and one
`technically_unavailable` row. The materialized v2 totals were 380 canonical
documents, 725 language variants, 14,780 distinct current provisions and
52,555 indexed current chunks. The document, provision and checkpoint release
gates remain open and ingestion is not frozen. No code change or staging
redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remain unopened; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 09:40–09:44Z)

Scheduled run `e3309f64-f1f4-46f9-946a-64fe8ff4a3e3` completed at
`2026-08-23T09:44:13.969Z` with `error_code=NULL`. Read-only counters after
the run show 39/44 discovery checkpoints completed and 5 queued; no
checkpoint is currently running or retrying. The ingestion ledger contains
2,083 completed and 22,734 queued jobs. The failure ledger contains fourteen
`retrying` rows and one `technically_unavailable` row: two
`LEGAL_CORPUS_INGESTION_FAILED` (ru), one
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (en, `lexuz:8348901`,
non-retryable), one `LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (uz-Latn), four
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`, six
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` (ru), and one
`LEGAL_SOURCE_TIMEOUT` (ru). No failed, terminal or dead-letter ingestion jobs
were observed.

The materialized v2 totals are 377 canonical documents, 715 language variants,
14,767 distinct current provisions and 52,368 indexed current chunks. The
document, provision and checkpoint release gates remain open and ingestion is
not frozen. No code change or staging redeploy was justified. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remain unopened; production
bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 09:28–09:32Z)

Scheduled run `46e90326-981f-47ef-bf54-0a7199cc8e37` completed at
`2026-08-23T09:32:11.217Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. Read-only counters after the run show 39/44 discovery
checkpoints completed and 4 queued; the `technical`/`ru` checkpoint is
retrying after that catalogue timeout. The ingestion ledger contains 2,072
completed and 22,585 queued jobs. The failure ledger contains fourteen
`retrying` rows and one `technically_unavailable` row: two
`LEGAL_CORPUS_INGESTION_FAILED` (ru), one
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (en, `lexuz:8348901`,
non-retryable), one `LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (uz-Latn), four
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`, six
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` (ru), and one
`LEGAL_SOURCE_TIMEOUT` (ru). No failed, terminal or dead-letter ingestion jobs
were observed.

The materialized v2 totals are 375 canonical documents, 709 language variants,
14,754 distinct current provisions and 50,783 indexed current chunks. The
document, provision and checkpoint release gates remain open and ingestion is
not frozen. No code change or staging redeploy was justified. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remain unopened; production
bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 09:24–09:27Z)

Scheduled run `0006e257-7c0e-4856-a7b5-9576e03f29db` completed at
`2026-08-23T09:27:59.560Z` with `error_code=NULL`. The next run
`46e90326-981f-47ef-bf54-0a7199cc8e37` was already running when counters were
read: 39/44 discovery checkpoints completed, 4 queued and 1 running. The
ingestion ledger contained 2,064 completed, 22,592 queued and one running job.
The failure ledger contained fourteen `retrying` rows and one
`technically_unavailable` row: two `LEGAL_CORPUS_INGESTION_FAILED` (ru), one
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (en, `lexuz:8348901`,
non-retryable), one `LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (uz-Latn), four
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`, six
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` (ru), and one
`LEGAL_SOURCE_TIMEOUT` (ru). No failed, terminal or dead-letter ingestion jobs
were observed.

The materialized v2 totals observed at that boundary are 374 canonical
documents, 705 language variants, 14,749 distinct current provisions and
50,752 indexed current chunks. The document, provision and checkpoint release
gates remain open and ingestion is not frozen. No code change or staging
redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remain unopened; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 09:20–09:23Z)

Scheduled run `0da2bff7-8d04-40cb-9f3b-61b6e7145238` completed at
`2026-08-23T09:23:48.846Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The next run was already processing the `technical`
checkpoint (`ru`) when counters were read: 37/44 checkpoints completed, 6
queued and 1 running. The ingestion ledger contained 2,058 completed and
22,572 queued jobs. The failure ledger contained fourteen `retrying` rows and
one `technically_unavailable` row: two `LEGAL_CORPUS_INGESTION_FAILED` (ru),
one `LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (en, `lexuz:8348901`,
non-retryable), one `LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (uz-Latn), four
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`, six
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` (ru), and one
`LEGAL_SOURCE_TIMEOUT` (ru). No failed, terminal or dead-letter ingestion jobs
were observed.

The materialized v2 totals observed at that boundary are 373 canonical
documents, 702 language variants, 14,745 distinct current provisions and
50,679 indexed current chunks. The document, provision and checkpoint release
gates remain open and ingestion is not frozen. No code change or staging
redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remain unopened; production bindings, corpus ingestion, feature flags and
DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 09:12–09:15Z)

Scheduled run `b8ae1cbd-d53f-4d08-bd11-88043d58224d` completed at
`2026-08-23T09:15:57.422Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The next scheduled run
`520f49a1-d82b-4735-a594-0a0940e60d20` was already running when the
post-run read-only counters were taken: 37/44 discovery checkpoints completed,
6 queued and 1 running; the ingestion ledger contained 2,047 completed and
22,463 queued jobs. No checkpoint was retrying.
The failure ledger contains fourteen `retrying` rows and one
`technically_unavailable` row: two `LEGAL_CORPUS_INGESTION_FAILED` (ru), one
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (en, `lexuz:8348901`,
`https://lex.uz/en/docs/8348901`, non-retryable), one
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (uz-Latn), four
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`, six
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` (ru), and one
`LEGAL_SOURCE_TIMEOUT` (ru). No failed, terminal or dead-letter ingestion jobs
were observed.

The materialized v2 totals observed at that boundary are 371 canonical
documents, 696 language variants, 14,736 distinct current provisions and
50,587 indexed current chunks. The
document, provision and checkpoint release gates remain open and ingestion is
not frozen. The non-retryable English source row is recorded as a source-data
availability limitation, not silently treated as success; no code change or
staging redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain unopened; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 02:12–02:16Z)

Scheduled run `c14a0ebe-17b5-4252-a54a-e8ec5e034963` completed at
`2026-08-23T02:16:12.701Z` with `error_code=NULL`. Read-only counters after
the run show 23/44 discovery checkpoints completed and 21 queued; no
checkpoint is currently retrying or running. The ingestion ledger contains
1,611 completed and 17,496 queued jobs. The failure ledger contains ten
`retrying` rows only: two `LEGAL_CORPUS_INGESTION_FAILED` (ru), one
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (uz-Latn), four
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`, and three
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` (ru). No failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals are 292 canonical documents, 461 language variants,
14,257 distinct current provisions and 44,484 indexed current chunks. The
document, provision and checkpoint release gates remain open and ingestion is
not frozen. No code change or staging redeploy was needed. Snapshot, indexed
evaluation, Qdrant/D1 restore and CI gates remain unopened; production
bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 02:04–02:08Z)

Scheduled run `31a9d6ee-49e1-462a-afeb-8972b66f7f7a` completed at
`2026-08-23T02:08:15.056Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. Read-only counters after the run show 23/44 discovery
checkpoints completed and 21 queued; no checkpoint is currently retrying or
running. The ingestion ledger contains 1,606 completed and 17,421 queued jobs.
The failure ledger contains ten `retrying` rows only: two
`LEGAL_CORPUS_INGESTION_FAILED` (ru), one
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (uz-Latn), four
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`, and three
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` (ru). No failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals are 291 canonical documents, 458 language variants,
14,253 distinct current provisions and 44,467 indexed current chunks. The
document, provision and checkpoint release gates remain open and ingestion is
not frozen. The retryable catalogue timeout did not justify a code change or
staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates
remain unopened; production bindings, corpus ingestion, feature flags and DNS
are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 01:56–02:01Z)

Scheduled run `e1726336-0658-46a1-9980-6cc649652dd6` completed at
`2026-08-23T02:01:04.475Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. Read-only counters after the run show 23/44 discovery
checkpoints completed, 20 queued and one retrying checkpoint
(`local_authorities`, `uz-Latn`, attempt 1, next attempt
`2026-08-23T01:57:14.893Z`). The ingestion ledger contains 1,601 completed
and 17,346 queued jobs. The failure ledger contains ten `retrying` rows only:
two `LEGAL_CORPUS_INGESTION_FAILED` (ru), one
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (uz-Latn), four
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`, and three
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` (ru). No failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals are 290 canonical documents, 455 language variants,
14,247 distinct current provisions and 44,415 indexed current chunks. The
document, provision and checkpoint release gates remain open and ingestion is
not frozen. The retryable catalogue timeout did not justify a code change or
staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates
remain unopened; production bindings, corpus ingestion, feature flags and DNS
are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 01:48–01:52Z)

Scheduled run `fe3d5ba3-ba40-4496-9261-3e01b93379ce` completed at
`2026-08-23T01:52:15.225Z` with `error_code=NULL`. Read-only counters after
the run show 23/44 discovery checkpoints completed and 21 queued. The
ingestion ledger contains 1,593 completed and 17,354 queued jobs; no job is
currently running. The failure ledger contains ten `retrying` rows only: two
`LEGAL_CORPUS_INGESTION_FAILED` (ru), one
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (uz-Latn), four
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`, and three
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` (ru). No failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals are 289 canonical documents, 451 language variants,
14,241 distinct current provisions and 44,279 indexed current chunks. The
document, provision and checkpoint release gates remain open and ingestion is
not frozen. No code change or staging redeploy was needed. Snapshot, indexed
evaluation, Qdrant/D1 restore and CI gates remain unopened; production
bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 01:40–01:44Z)

Scheduled run `8e607a9f-418b-4c0c-8228-82918b318fba` completed at
`2026-08-23T01:44:16.424Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. Read-only counters after the run show 22/44 discovery
checkpoints completed and 22 queued. The ingestion ledger contains 1,588
completed and 17,299 queued jobs; no job is currently running. The failure
ledger contains ten `retrying` rows only: two
`LEGAL_CORPUS_INGESTION_FAILED` (ru), one
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (uz-Latn), four
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`, and three
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` (ru). No failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals are 288 canonical documents, 448 language variants,
14,237 distinct current provisions and 44,234 indexed current chunks. The
document, provision and checkpoint release gates remain open and ingestion is
not frozen. The retryable catalogue timeout did not justify a code change or
staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates
remain unopened; production bindings, corpus ingestion, feature flags and DNS
are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 01:32–01:36Z)

Scheduled run `395b6b9b-94ec-4d81-aa3e-d12160128650` completed at
`2026-08-23T01:36:15.188Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. Read-only counters after the run show 22/44 discovery
checkpoints completed and 22 queued. The ingestion ledger contains 1,583
completed and 17,264 queued jobs; no job is currently running. The failure
ledger contains ten `retrying` rows only: two
`LEGAL_CORPUS_INGESTION_FAILED` (ru), one
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` (uz-Latn), four
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT`, and three
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` (ru). No failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals are 287 canonical documents, 445 language variants,
14,222 distinct current provisions and 44,131 indexed current chunks. The
document, provision and checkpoint release gates remain open and ingestion is
not frozen. The retryable catalogue timeout did not justify a code change or
staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates
remain unopened; production bindings, corpus ingestion, feature flags and DNS
are unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 20:52–20:58Z)

Scheduled run `2ad6f6a6-c6e6-4898-b71c-9769dc9fb342` completed at
`2026-08-22T20:58:37.391Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. Read-only counters after the run show 21/44 discovery
checkpoints completed and 23 queued; no checkpoint is currently running or
retrying. The ingestion ledger contains 1,259 completed and 13,488 queued
jobs. The failure ledger contains nine `retrying` rows only; no terminal or
technically-unavailable source rows and no failed, terminal or dead-letter
ingestion jobs were observed.

The materialized v2 totals are 227 canonical documents, 266 language variants,
12,846 distinct current provisions and 36,325 indexed current chunks. These
totals remain below the 1,500-document and 22,000-provision release floors,
and the queue is not frozen. No code change or staging redeploy was justified
by this retryable catalogue timeout. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain intentionally unopened; production bindings,
corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 21:00–21:06Z)

Scheduled run `dcb3c450-e904-40a7-b3b6-724d822c6d13` completed at
`2026-08-22T21:06:37.955Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. Read-only counters show 21/44 discovery checkpoints
completed and 23 queued; no checkpoint is currently running or retrying. The
ingestion ledger contains 1,264 completed and 13,545 queued jobs. The failure
ledger contains nine `retrying` rows only; no terminal or
technically-unavailable source rows and no failed, terminal or dead-letter
ingestion jobs were observed.

The materialized v2 totals are 228 canonical documents, 269 language variants,
12,873 distinct current provisions and 36,592 indexed current chunks. The
document and provision floors remain open and ingestion is not frozen. This
retryable catalogue timeout did not justify a code change or staging redeploy.
Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain unopened;
production bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 21:08–21:14Z)

Scheduled run `28322ea8-3522-4c60-8849-cfe0d582b52b` completed at
`2026-08-22T21:14:21.392Z` with `error_code=NULL`. Read-only counters show
21/44 discovery checkpoints completed and 23 queued; no checkpoint is
currently running or retrying. The ingestion ledger contains 1,269 completed
and 13,620 queued jobs. The failure ledger contains nine `retrying` rows only;
no terminal or technically-unavailable source rows and no failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals are 229 canonical documents, 272 language variants,
12,879 distinct current provisions and 36,691 indexed current chunks. The
document and provision floors remain open and ingestion is not frozen. No code
change or staging redeploy was needed. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain unopened; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 21:16–21:22Z)

Scheduled run `d0ad2cfa-02d7-4161-aec6-d13669e572f9` completed at
`2026-08-22T21:22:30.701Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. Read-only counters show 21/44 discovery checkpoints
completed and 23 queued; no checkpoint is currently running or retrying. The
ingestion ledger contains 1,274 completed and 13,675 queued jobs. The failure
ledger contains nine `retrying` rows only; no terminal or
technically-unavailable source rows and no failed, terminal or dead-letter
ingestion jobs were observed.

The materialized v2 totals are 230 canonical documents, 275 language variants,
12,897 distinct current provisions and 36,830 indexed current chunks. The
document and provision floors remain open and ingestion is not frozen. The
catalogue timeout is retryable and did not justify a code change or staging
redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain
unopened; production bindings, corpus ingestion, feature flags and DNS are
unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 21:24–21:30Z)

Scheduled run `1c4e0b7d-2f35-470b-8346-a924f53f2753` completed at
`2026-08-22T21:30:34.090Z` with `error_code=NULL`. Read-only counters show
21/44 discovery checkpoints completed and 23 queued; no checkpoint is
currently running or retrying. The ingestion ledger contains 1,279 completed
and 13,752 queued jobs. The failure ledger contains nine `retrying` rows only;
no terminal or technically-unavailable source rows and no failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals are 231 canonical documents, 278 language variants,
12,920 distinct current provisions and 37,039 indexed current chunks. The
document and provision floors remain open and ingestion is not frozen. No code
change or staging redeploy was needed. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain unopened; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 21:32–21:38Z)

Scheduled run `de819bb5-2a3e-42b7-a6a2-382744c7df13` completed at
`2026-08-22T21:38:28.060Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. Read-only counters show 21/44 discovery checkpoints
completed and 23 queued; no checkpoint is currently running or retrying. The
ingestion ledger contains 1,284 completed and 13,808 queued jobs. The failure
ledger contains nine `retrying` rows only; no terminal or
technically-unavailable source rows and no failed, terminal or dead-letter
ingestion jobs were observed.

The materialized v2 totals are 232 canonical documents, 281 language variants,
12,937 distinct current provisions and 37,188 indexed current chunks. The
document and provision floors remain open and ingestion is not frozen. This
retryable catalogue timeout did not justify a code change or staging redeploy.
Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates remain unopened;
production bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 21:40–21:46Z)

Scheduled run `77cf73ed-fd54-42cf-88f3-df235b8d545f` completed at
`2026-08-22T21:46:23.241Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. Read-only counters show 21/44 discovery checkpoints
completed and 23 queued; no checkpoint is currently running or retrying. The
ingestion ledger contains 1,289 completed and 13,865 queued jobs. The failure
ledger contains nine `retrying` rows only; no terminal or
technically-unavailable source rows and no failed, terminal or dead-letter
ingestion jobs were observed.

The materialized v2 totals are 233 canonical documents, 284 language variants,
12,947 distinct current provisions and 37,260 indexed current chunks. The
document and provision floors remain open and ingestion is not frozen. The
catalogue timeout remains retryable and did not justify a code change or
staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates
remain unopened; production bindings, corpus ingestion, feature flags and DNS
are unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 21:48–21:51Z)

Scheduled run `da0cf598-75bd-4be4-8d39-4596bc7a0e57` completed at
`2026-08-22T21:51:47.358Z` with `error_code=NULL`. Read-only counters show
21/44 discovery checkpoints completed and 23 queued; no checkpoint is
currently running or retrying. The ingestion ledger contains 1,294 completed
and 13,940 queued jobs. The failure ledger contains nine `retrying` rows only;
no terminal or technically-unavailable source rows and no failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals are 234 canonical documents, 287 language variants,
12,951 distinct current provisions and 37,283 indexed current chunks. The
document and provision floors remain open and ingestion is not frozen. No code
change or staging redeploy was needed. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain unopened; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 21:56–21:59Z)

Scheduled run `982cf6b2-7e63-49fd-8052-d71703875ca6` completed at
`2026-08-22T21:59:47.052Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. Read-only counters immediately after the run show
21/44 discovery checkpoints completed and 23 queued; no checkpoint is
currently running or retrying. The ingestion ledger contains 1,305 completed
and 14,069 queued jobs. The failure ledger contains nine `retrying` rows only;
no terminal or technically-unavailable source rows and no failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals are 236 canonical documents, 293 language variants,
12,963 distinct current provisions and 37,364 indexed current chunks. The
document and provision floors remain open and ingestion is not frozen. The
catalogue timeout remains retryable and did not justify a code change or
staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates
remain unopened; production bindings, corpus ingestion, feature flags and DNS
are unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 22:28–22:31Z)

Scheduled run `ee58f0b5-e955-46a0-aa50-cdc427517808` completed at
`2026-08-22T22:31:46.503Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The immediately-following read-only probe found the
next run already active; checkpoint state was 21 completed, 1 running and 22
queued. The ingestion ledger contained 1,349 completed and 14,648 queued jobs.
The failure ledger contained nine `retrying` rows only; no terminal or
technically-unavailable source rows were present and no failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals at that boundary were 244 canonical documents, 317
language variants, 13,136 distinct current provisions and 37,957 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. The timeout was retryable and did not justify a code change or
staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates
remained unopened; production bindings, corpus ingestion, feature flags and
DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 22:36–22:39Z)

Scheduled run `519722fd-e79d-441d-a4ae-f83c9c33e9ec` completed at
`2026-08-22T22:39:48.940Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The immediately-following read-only probe found the
next run already active; checkpoint state was 21 completed, 1 running and 22
queued. The ingestion ledger contained 1,360 completed and 14,778 queued jobs.
The failure ledger contained nine `retrying` rows only; no terminal or
technically-unavailable source rows were present and no failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals at that boundary were 247 canonical documents, 324
language variants, 13,559 distinct current provisions and 39,655 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. The timeout was retryable and did not justify a code change or
staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates
remained unopened; production bindings, corpus ingestion, feature flags and
DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 22:40–22:43Z)

Scheduled run `d8090a2f-890d-4c29-a2c1-676ee254b654` completed at
`2026-08-22T22:43:52.282Z` with `error_code=NULL`. The immediately-following
read-only probe found the next run already active; checkpoint state was 21
completed, 1 running and 22 queued. The ingestion ledger contained 1,366
completed and 14,792 queued jobs. The failure ledger contained nine `retrying`
rows only; no terminal or technically-unavailable source rows were present and
no failed, terminal or dead-letter ingestion jobs were observed.

The materialized v2 totals at that boundary were 247 canonical documents, 326
language variants, 13,560 distinct current provisions and 39,675 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. No code change or staging redeploy was needed. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remained unopened;
production bindings, corpus ingestion, feature flags and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 22:44–22:47Z)

Scheduled run `e428b8f4-956f-4a27-9f65-3556ffcdaa61` completed at
`2026-08-22T22:47:45.299Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The immediately-following read-only probe found the
next run already active; checkpoint state was 21 completed, 1 running and 22
queued. The ingestion ledger contained 1,371 completed and 14,907 queued jobs.
The failure ledger contained nine `retrying` rows only; no terminal or
technically-unavailable source rows were present and no failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals at that boundary were 248 canonical documents, 329
language variants, 13,580 distinct current provisions and 39,738 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. The timeout was retryable and did not justify a code change or
staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI gates
remained unopened; production bindings, corpus ingestion, feature flags and
DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 22:48–22:51Z)

Scheduled run `9869b2cc-bdb8-4430-9126-d64d276fd713` completed at
`2026-08-22T22:51:54.152Z` with `error_code=NULL`. The following read-only
probe observed the scheduler already advancing the next checkpoint: 21/44
checkpoints completed, 1 running and 22 queued. The ingestion ledger contained
1,377 completed and 14,921 queued jobs. The failure ledger contained nine
`retrying` rows only; no terminal or technically-unavailable source rows and
no failed, terminal or dead-letter ingestion jobs were observed.

The materialized v2 totals at that boundary were 249 canonical documents, 332
language variants, 13,608 distinct current provisions and 39,876 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. No code change or staging redeploy was needed. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remained unopened;
production bindings, corpus ingestion, feature flags and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 22:52–22:55Z)

Scheduled run `f003dfe7-f787-4e3b-ac8d-0027748bfa38` completed at
`2026-08-22T22:55:46.390Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. Read-only counters immediately after the run show
21/44 discovery checkpoints completed and 23 queued; no checkpoint was
running at probe time. The ingestion ledger contained 1,382 completed and
14,977 queued jobs. The failure ledger contained nine `retrying` rows only;
no terminal or technically-unavailable source rows and no failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals at that boundary were 250 canonical documents, 335
language variants, 13,621 distinct current provisions and 40,012 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. The retryable catalogue timeout did not justify a code change
or staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remained unopened; production bindings, corpus ingestion, feature flags
and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 01:16–01:21Z)

Scheduled run `c1bca9a8-ee32-41f4-b028-20f0a77a6ac2` completed at
`2026-08-23T01:20:14.845Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The immediate read-only post-run probe showed 21/44
discovery checkpoints completed, 22 queued and one retrying; no checkpoint was
running at probe time. The ingestion ledger contained 1,573 completed and
17,214 queued jobs. The failure ledger contained ten `retrying` rows only; no
terminal, technically-unavailable or dead-letter ingestion rows were observed.

The materialized v2 totals were 285 canonical documents, 439 language
variants, 14,211 distinct current provisions and 43,013 indexed current chunks.
The indexed-chunk floor remains met, but the document and provision floors are
open, discovery is not 44/44, and ingestion is not frozen. The retryable
catalogue timeout did not justify a code change or staging redeploy. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remain unopened; production
bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 01:08–01:13Z)

Scheduled run `aa04317c-5571-4ea1-83a0-956e2db460bf` completed at
`2026-08-23T01:12:14.022Z` with `error_code=NULL`. The immediate read-only
post-run probe showed 21/44 discovery checkpoints completed and 23 queued; no
checkpoint was running or retrying at probe time. The ingestion ledger
contained 1,568 completed and 17,179 queued jobs. The failure ledger contained
ten `retrying` rows only; no terminal, technically-unavailable or dead-letter
ingestion rows were observed.

The materialized v2 totals were 284 canonical documents, 436 language
variants, 14,206 distinct current provisions and 42,897 indexed current chunks.
The indexed-chunk floor remains met, but the document and provision floors are
open, discovery is not 44/44, and ingestion is not frozen. No code change or
staging redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain unopened; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 01:04–01:08Z)

Scheduled run `b9c3b02a-c319-4414-8602-73c86f0853fc` completed at
`2026-08-23T01:07:42.217Z` with `error_code=NULL`. The immediate read-only
post-run probe, while the next run was already active, showed 21/44 discovery
checkpoints completed, 22 queued and one running. The ingestion ledger
contained 1,563 completed and 17,124 queued jobs. The failure ledger contained
ten `retrying` rows only; no terminal, technically-unavailable or dead-letter
ingestion rows were observed.

The materialized v2 totals were 283 canonical documents, 433 language
variants, 14,201 distinct current provisions and 42,821 indexed current chunks.
The indexed-chunk floor remains met, but the document and provision floors are
open, discovery is not 44/44, and ingestion is not frozen. No code change or
staging redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain unopened; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 00:56–01:00Z)

Scheduled run `0c619088-2660-410f-adb8-a6e285e5a692` completed at
`2026-08-23T00:59:43.105Z` with `error_code=NULL`. The immediate read-only
post-run probe, while the next run was already active, showed 21/44 discovery
checkpoints completed and 23 queued; no checkpoint was running at probe time.
The ingestion ledger contained 1,552 completed, one running and 17,034 queued
jobs. The failure ledger contained ten `retrying` rows only; no terminal,
technically-unavailable or dead-letter ingestion rows were observed.

The materialized v2 totals were 282 canonical documents, 428 language
variants, 14,196 distinct current provisions and 42,738 indexed current chunks.
The indexed-chunk floor remains met, but the document and provision floors are
open, discovery is not 44/44, and ingestion is not frozen. No code change or
staging redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain unopened; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 00:52–00:56Z)

Scheduled run `254dc8b5-1651-49a6-83ba-9089cae43951` completed at
`2026-08-23T00:55:38.191Z` with `error_code=NULL`. The immediate read-only
post-run probe, while the next run was already active, showed 21/44 discovery
checkpoints completed, 22 queued and one running. The ingestion ledger
contained 1,546 completed, one running and 16,980 queued jobs. The failure
ledger contained ten `retrying` rows only; no terminal, technically-unavailable
or dead-letter ingestion rows were observed.

The materialized v2 totals were 280 canonical documents, 424 language
variants, 14,185 distinct current provisions and 42,658 indexed current chunks.
The indexed-chunk floor remains met, but the document and provision floors are
open, discovery is not 44/44, and ingestion is not frozen. No code change or
staging redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain unopened; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 00:48–00:52Z)

Scheduled run `071b4ef0-72cc-44d0-9ce3-5551057c32f6` completed at
`2026-08-23T00:51:41.953Z` with `error_code=NULL`. The immediate read-only
post-run probe, while the next run was already active, showed 21/44 discovery
checkpoints completed, 22 queued and one running. The ingestion ledger
contained 1,541 completed and 16,846 queued jobs. The failure ledger contained
ten `retrying` rows only; no terminal, technically-unavailable or dead-letter
ingestion rows were observed.

The materialized v2 totals were 279 canonical documents, 421 language
variants, 14,180 distinct current provisions and 42,580 indexed current chunks.
The indexed-chunk floor remains met, but the document and provision floors are
open, discovery is not 44/44, and ingestion is not frozen. No code change or
staging redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain unopened; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 00:44–00:49Z)

Scheduled run `173c48a7-617a-4e1b-a1e4-0fed9b64140b` completed at
`2026-08-23T00:47:38.359Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The immediate read-only post-run probe, while the next
run was already active, showed 21/44 discovery checkpoints completed, 22 queued
and one running. The ingestion ledger contained 1,535 completed and 16,812
queued jobs. The failure ledger contained ten `retrying` rows only; no
terminal, technically-unavailable or dead-letter ingestion rows were observed.

The materialized v2 totals were 278 canonical documents, 418 language
variants, 14,173 distinct current provisions and 42,561 indexed current chunks.
The indexed-chunk floor remains met, but the document and provision floors are
open, discovery is not 44/44, and ingestion is not frozen. The retryable
catalogue timeout did not justify a code change or staging redeploy. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remain unopened; production
bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 00:40–00:44Z)

Scheduled run `f70d9a97-8a3a-4f1f-9e12-63450f5472f8` completed at
`2026-08-23T00:43:43.632Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The immediate read-only post-run probe showed 21/44
discovery checkpoints completed, 22 queued and one retrying; no checkpoint was
running at probe time. The ingestion ledger contained 1,530 completed and
16,697 queued jobs. The failure ledger contained ten `retrying` rows only; no
terminal, technically-unavailable or dead-letter ingestion rows were observed.

The materialized v2 totals were 277 canonical documents, 415 language
variants, 14,168 distinct current provisions and 42,547 indexed current chunks.
The indexed-chunk floor remains met, but the document and provision floors are
open, discovery is not 44/44, and ingestion is not frozen. The retryable
catalogue timeout did not justify a code change or staging redeploy. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remain unopened; production
bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 00:36–00:40Z)

Scheduled run `0512cdf6-04ee-41ef-bdfb-1ba9ed6f1982` completed at
`2026-08-23T00:39:38.683Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The immediate read-only post-run probe showed 21/44
discovery checkpoints completed and 23 queued; no checkpoint was running or
retrying at probe time. The ingestion ledger contained 1,524 completed and
16,643 queued jobs. The failure ledger contained ten `retrying` rows only; a
read-only breakdown showed retryable language-text/official-text-unavailable,
stale-running-timeout and ingestion-failed codes, with no terminal,
technically-unavailable or dead-letter ingestion rows.

The materialized v2 totals were 276 canonical documents, 412 language
variants, 14,162 distinct current provisions and 42,533 indexed current chunks.
The indexed-chunk floor remains met, but the document and provision floors are
open, discovery is not 44/44, and ingestion is not frozen. The retryable
failures did not establish a repeatable terminal root cause, so no code change
or staging redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain unopened; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 00:32–00:37Z)

Scheduled run `2168de1f-91e3-46a0-b428-c63c3ecf0f43` completed at
`2026-08-23T00:36:03.229Z` with `error_code=NULL`. The immediate read-only
post-run probe, while the next run was already active, showed 21/44 discovery
checkpoints completed, 22 queued and one running. The ingestion ledger
contained 1,520 completed and 16,587 queued jobs. The failure ledger contained
nine `retrying` rows only; no terminal, technically-unavailable or dead-letter
ingestion rows were observed.

The materialized v2 totals were 275 canonical documents, 410 language
variants, 14,158 distinct current provisions and 42,501 indexed current chunks.
The indexed-chunk floor remains met, but the document and provision floors are
open, discovery is not 44/44, and ingestion is not frozen. No code change or
staging redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain unopened; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 00:28–00:32Z)

Scheduled run `f3e70843-eaad-46f2-a60a-0e87e6e14d5b` completed at
`2026-08-23T00:31:47.967Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The immediate read-only post-run probe showed 21/44
discovery checkpoints completed and 23 queued; no checkpoint was running or
retrying at probe time. The ingestion ledger contained 1,514 completed and
16,513 queued jobs. The failure ledger contained nine `retrying` rows only; no
terminal, technically-unavailable or dead-letter ingestion rows were observed.

The materialized v2 totals were 274 canonical documents, 407 language
variants, 14,152 distinct current provisions and 42,477 indexed current chunks.
The indexed-chunk floor remains met, but the document and provision floors are
open, discovery is not 44/44, and ingestion is not frozen. The retryable
catalogue timeout did not justify a code change or staging redeploy. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remain unopened; production
bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 00:24–00:29Z)

Scheduled run `f362f710-8552-4e4e-80f7-784a56be4e0c` completed at
`2026-08-23T00:28:09.086Z` with `error_code=NULL`. The immediate read-only
post-run probe, while the next run was already active, showed 21/44 discovery
checkpoints completed, 21 queued, one retrying and one running. The ingestion
ledger contained 1,509 completed and 16,469 queued jobs. The failure ledger
contained nine `retrying` rows only; no terminal, technically-unavailable or
dead-letter ingestion rows were observed.

The materialized v2 totals were 273 canonical documents, 404 language
variants, 14,127 distinct current provisions and 42,409 indexed current chunks.
The indexed-chunk floor remains met, but the document and provision floors are
open, discovery is not 44/44, and ingestion is not frozen. No code change or
staging redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain unopened; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 00:20–00:25Z)

Scheduled run `3320f0f6-e97e-4451-839a-224ff004305b` completed at
`2026-08-23T00:24:03.063Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The immediate read-only post-run probe, while the next
run was already active, showed 21/44 discovery checkpoints completed, 22 queued
and one running. The ingestion ledger contained 1,503 completed and 16,404
queued jobs. The failure ledger contained nine `retrying` rows only; no
terminal, technically-unavailable or dead-letter ingestion rows were observed.

The materialized v2 totals were 272 canonical documents, 401 language
variants, 14,121 distinct current provisions and 42,375 indexed current chunks.
The indexed-chunk floor is met, but the document and provision floors remain
open, discovery is not 44/44, and ingestion is not frozen. The retryable
catalogue timeout did not justify a code change or staging redeploy. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remain unopened; production
bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 00:16–00:21Z)

Scheduled run `eefec808-5619-45ac-b780-9410eef0d5b3` completed at
`2026-08-23T00:20:05.046Z` with `error_code=NULL`. The immediate read-only
post-run probe, while the next run was already active, showed 21/44 discovery
checkpoints completed, 21 queued, one retrying and one running. The ingestion
ledger contained 1,498 completed and 16,349 queued jobs. The failure ledger
contained nine `retrying` rows only; no terminal, technically-unavailable or
dead-letter ingestion rows were observed.

The materialized v2 totals were 271 canonical documents, 398 language
variants, 14,116 distinct current provisions and 42,361 indexed current chunks.
The indexed-chunk floor remains met, but the document and provision floors are
open, discovery is not 44/44, and ingestion is not frozen. No code change or
staging redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain unopened; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 00:12–00:16Z)

Scheduled run `2ec80f60-98f6-4459-889b-a92af0bc13b7` completed at
`2026-08-23T00:15:38.189Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The immediate read-only post-run probe, while the next
run was already active, showed 21/44 discovery checkpoints completed, 22 queued
and one running. The ingestion ledger contained 1,492 completed and 16,295
queued jobs. The failure ledger contained nine `retrying` rows only; no
terminal, technically-unavailable or dead-letter ingestion rows were observed.

The materialized v2 totals were 270 canonical documents, 395 language
variants, 14,102 distinct current provisions and 42,333 indexed current chunks.
The indexed-chunk floor remains met, but the document and provision floors are
open, discovery is not 44/44, and ingestion is not frozen. The retryable
catalogue timeout did not justify a code change or staging redeploy. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remain unopened; production
bindings, corpus ingestion, feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 00:08–00:12Z)

Scheduled run `a4428268-3899-4632-bbfc-0fb2076336cb` completed at
`2026-08-23T00:11:44.070Z` with `error_code=NULL`. The immediate read-only
post-run probe showed 21/44 discovery checkpoints completed and 23 queued; no
checkpoint was running or retrying at probe time. The ingestion ledger
contained 1,487 completed and 16,199 queued jobs. The failure ledger contained
nine `retrying` rows only; no terminal, technically-unavailable or dead-letter
ingestion rows were observed.

The materialized v2 totals were 269 canonical documents, 392 language
variants, 14,096 distinct current provisions and 42,292 indexed current chunks.
The indexed-chunk floor is met, but the document and provision floors remain
open, discovery is not 44/44, and ingestion is not frozen. No code change or
staging redeploy was justified. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain unopened; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-23, 00:00–00:07Z)

Scheduled run `5aa770be-f964-43ea-a440-eb0a87e95359` completed at
`2026-08-23T00:03:55.322Z` with `error_code=NULL`. A subsequent read-only
probe, while the next run `3f690a80-f5b5-4af8-855d-cbd2da691120` was already
running, showed 21/44 discovery checkpoints completed, 22 queued and one
retrying. The ingestion ledger at that probe contained 1,480 completed, one
running and 16,125 queued jobs. The failure ledger contained nine `retrying`
rows only; no terminal, technically-unavailable or dead-letter ingestion rows
were observed.

The materialized v2 totals at the same read-only probe were 268 canonical
documents, 389 language variants, 14,090 distinct current provisions and
42,264 indexed current chunks. These exceed the indexed-chunk floor but remain
below the 1,500-document and 22,000-provision release floors; the queue is not
frozen and discovery is not 44/44. The active retryable state did not justify a
code change or staging redeploy. Snapshot, indexed evaluation, Qdrant/D1
restore and CI gates remain unopened; production bindings, corpus ingestion,
feature flags and DNS are unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 23:56–23:59Z)

Scheduled run `f74b44ee-8a6b-46c8-bcc5-3313ed156bd5` completed at
`2026-08-22T23:59:43.800Z` with `error_code=NULL`. The following read-only
probe observed the next invocation running: 21/44 checkpoints completed, 1
running and 22 queued. The ingestion ledger contained 1,470 completed and
16,055 queued jobs. The failure ledger contained nine `retrying` rows only; no
terminal or technically-unavailable source rows and no failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals at that boundary were 266 canonical documents, 383
language variants, 14,082 distinct current provisions and 42,093 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. No code change or staging redeploy was needed. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remained unopened;
production bindings, corpus ingestion, feature flags and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 23:52–23:55Z)

Scheduled run `812e02d1-f40a-4ee2-aba3-e118485801df` completed at
`2026-08-22T23:55:50.441Z` with `error_code=NULL`. The following read-only
probe found no newer run yet: 21/44 checkpoints completed, 1 running and 22
queued. The ingestion ledger contained 1,465 completed and 15,940 queued jobs.
The failure ledger contained nine `retrying` rows only; no terminal or
technically-unavailable source rows and no failed, terminal or dead-letter
ingestion jobs were observed.

The materialized v2 totals at that boundary were 265 canonical documents, 380
language variants, 14,077 distinct current provisions and 41,882 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. No code change or staging redeploy was needed. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remained unopened;
production bindings, corpus ingestion, feature flags and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 23:48–23:51Z)

Scheduled run `579a8409-8e84-43b9-b8b6-f17b4a78b677` completed at
`2026-08-22T23:51:43.412Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The following read-only probe observed the next
invocation running: 21/44 checkpoints completed, 1 running and 22 queued. The
ingestion ledger contained 1,459 completed and 15,916 queued jobs. The failure
ledger contained nine `retrying` rows only; no terminal or technically-
unavailable source rows and no failed, terminal or dead-letter ingestion jobs
were observed.

The materialized v2 totals at that boundary were 265 canonical documents, 378
language variants, 14,073 distinct current provisions and 41,852 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. The retryable catalogue timeout did not justify a code change
or staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remained unopened; production bindings, corpus ingestion, feature flags
and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 23:44–23:47Z)

Scheduled run `8be4e17c-e779-4f50-bd55-c70505dfb908` completed at
`2026-08-22T23:47:49.711Z` with `error_code=NULL`. The following read-only
probe observed the next invocation running: 21/44 checkpoints completed, 1
running and 22 queued. The ingestion ledger contained 1,454 completed and
15,811 queued jobs. The failure ledger contained nine `retrying` rows only; no
terminal or technically-unavailable source rows and no failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals at that boundary were 263 canonical documents, 374
language variants, 14,067 distinct current provisions and 41,792 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. No code change or staging redeploy was needed. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remained unopened;
production bindings, corpus ingestion, feature flags and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 23:40–23:43Z)

Scheduled run `e7504a39-06cf-4102-a610-aca109872473` completed at
`2026-08-22T23:43:43.870Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The following read-only probe observed the next
invocation running: 21/44 checkpoints completed, 1 running and 22 queued. The
ingestion ledger contained 1,448 completed and 15,777 queued jobs. The failure
ledger contained nine `retrying` rows only; no terminal or technically-
unavailable source rows and no failed, terminal or dead-letter ingestion jobs
were observed.

The materialized v2 totals at that boundary were 263 canonical documents, 372
language variants, 14,067 distinct current provisions and 41,775 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. The retryable catalogue timeout did not justify a code change
or staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remained unopened; production bindings, corpus ingestion, feature flags
and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 23:36–23:40Z)

Scheduled run `7c57e652-c340-4568-8a66-e51e8618e203` completed at
`2026-08-22T23:40:00.533Z` with `error_code=NULL`. The following read-only
probe observed the next invocation running: 21/44 checkpoints completed, 1
running, 1 retrying and 21 queued. The ingestion ledger contained 1,443
completed and 15,722 queued jobs. The failure ledger contained nine
`retrying` rows only; no terminal or technically-unavailable source rows and
no failed, terminal or dead-letter ingestion jobs were observed.

The materialized v2 totals at that boundary were 262 canonical documents, 369
language variants, 14,062 distinct current provisions and 41,724 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. The retryable checkpoint state did not justify a code change
or staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remained unopened; production bindings, corpus ingestion, feature flags
and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 23:32–23:35Z)

Scheduled run `62fd4aba-e486-446a-ab8d-7a64ae1dd2a2` completed at
`2026-08-22T23:35:44.067Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The following read-only probe observed the next
invocation running: 21/44 checkpoints completed, 1 running and 22 queued. The
ingestion ledger contained 1,437 completed and 15,668 queued jobs. The failure
ledger contained nine `retrying` rows only; no terminal or technically-
unavailable source rows and no failed, terminal or dead-letter ingestion jobs
were observed.

The materialized v2 totals at that boundary were 261 canonical documents, 366
language variants, 14,058 distinct current provisions and 41,312 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. The retryable catalogue timeout did not justify a code change
or staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remained unopened; production bindings, corpus ingestion, feature flags
and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 23:28–23:31Z)

Scheduled run `835187d1-795b-439c-9455-677d95561483` completed at
`2026-08-22T23:31:53.629Z` with `error_code=NULL`. The following read-only
probe observed the next invocation running: 21/44 checkpoints completed, 1
running and 22 queued. The ingestion ledger contained 1,432 completed and
15,552 queued jobs. The failure ledger contained nine `retrying` rows only; no
terminal or technically-unavailable source rows and no failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals at that boundary were 259 canonical documents, 362
language variants, 13,928 distinct current provisions and 40,955 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. No code change or staging redeploy was needed. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remained unopened;
production bindings, corpus ingestion, feature flags and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 23:24–23:27Z)

Scheduled run `d037dddb-b5d2-4bc0-9a85-244a3fc70241` completed at
`2026-08-22T23:27:43.867Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The following read-only probe observed the next
invocation running: 21/44 checkpoints completed, 1 running and 22 queued. The
ingestion ledger contained 1,426 completed and 15,498 queued jobs. The failure
ledger contained nine `retrying` rows only; no terminal or technically-
unavailable source rows and no failed, terminal or dead-letter ingestion jobs
were observed.

The materialized v2 totals at that boundary were 258 canonical documents, 359
language variants, 13,900 distinct current provisions and 40,819 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. The retryable catalogue timeout did not justify a code change
or staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remained unopened; production bindings, corpus ingestion, feature flags
and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 23:20–23:23Z)

Scheduled run `2e3cdfcf-f598-41e7-a676-af822e55f539` completed at
`2026-08-22T23:23:52.493Z` with `error_code=NULL`. The following read-only
probe observed the next invocation running: 21/44 checkpoints completed, 1
running and 22 queued; the prior retrying checkpoint returned to the normal
queued/running flow. The ingestion ledger contained 1,421 completed and
15,422 queued jobs. The failure ledger contained nine `retrying` rows only; no
terminal or technically-unavailable source rows and no failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals at that boundary were 257 canonical documents, 356
language variants, 13,877 distinct current provisions and 40,737 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. No code change or staging redeploy was needed. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remained unopened;
production bindings, corpus ingestion, feature flags and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 23:16–23:19Z)

Scheduled run `8c361acc-ef88-4033-8070-e71aab42bab1` completed at
`2026-08-22T23:19:43.550Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The following read-only probe observed the next
invocation running: 21/44 checkpoints completed, 1 running and 22 queued. The
ingestion ledger contained 1,415 completed and 15,387 queued jobs. The failure
ledger contained nine `retrying` rows only; no terminal or technically-
unavailable source rows and no failed, terminal or dead-letter ingestion jobs
were observed.

The materialized v2 totals at that boundary were 256 canonical documents, 353
language variants, 13,853 distinct current provisions and 40,560 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. The retryable catalogue timeout did not justify a code change
or staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remained unopened; production bindings, corpus ingestion, feature flags
and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 23:12–23:15Z)

Scheduled run `38021673-249b-4095-bb71-1f7ef1e7ae15` completed at
`2026-08-22T23:15:52.037Z` with `error_code=NULL`. The following read-only
probe observed the next invocation running: 21/44 checkpoints completed, 1
running and 22 queued. The ingestion ledger contained 1,410 completed and
15,292 queued jobs. The failure ledger contained nine `retrying` rows only; no
terminal or technically-unavailable source rows and no failed, terminal or
dead-letter ingestion jobs were observed.

One intermediate Wrangler read-only probe returned Cloudflare API
authentication error `10000`; the immediate retry succeeded and no D1 write or
ingestion action was performed by that probe. The materialized v2 totals at
the completed-run boundary were 255 canonical documents, 350 language
variants, 13,850 distinct current provisions and 40,515 indexed current
chunks. The document and provision floors remained open and ingestion was not
frozen. No code change or staging redeploy was needed. Snapshot, indexed
evaluation, Qdrant/D1 restore and CI gates remained unopened; production
bindings, corpus ingestion, feature flags and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 23:08–23:11Z)

Scheduled run `c04a8b3c-78c2-45c6-82d9-c0b0e3dfb3e9` completed at
`2026-08-22T23:11:46.522Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The following read-only probe observed the next
invocation running: 21/44 checkpoints completed, 1 running and 22 queued; the
prior `local_authorities/uz-Cyrl` retry was preserved for the next attempt.
The ingestion ledger contained 1,404 completed and 15,278 queued jobs. The
failure ledger contained nine `retrying` rows only; no terminal or
technically-unavailable source rows and no failed, terminal or dead-letter
ingestion jobs were observed.

The materialized v2 totals at that boundary were 255 canonical documents, 348
language variants, 13,849 distinct current provisions and 40,470 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. The retryable catalogue timeout did not justify a code change
or staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remained unopened; production bindings, corpus ingestion, feature flags
and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 23:04–23:07Z)

Scheduled run `0443fb8a-5765-4e68-a391-374cdd8b9030` completed at
`2026-08-22T23:07:54.678Z` with `error_code=NULL`. The following read-only
probe observed the next invocation running: 21/44 checkpoints completed, 1
running, 1 retrying and 21 queued. The retrying checkpoint is
`local_authorities/uz-Cyrl` at page 58, with `LEX_CATALOG_TIMEOUT`, attempt 1
and the durable next-attempt timestamp preserved. The ingestion ledger
contained 1,399 completed and 15,202 queued jobs. The failure ledger contained
nine `retrying` rows only; no terminal or technically-unavailable source rows
and no failed, terminal or dead-letter ingestion jobs were observed.

The materialized v2 totals at that boundary were 254 canonical documents, 346
language variants, 13,842 distinct current provisions and 40,372 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. The checkpoint timeout is retryable and did not justify a code
change or staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and
CI gates remained unopened; production bindings, corpus ingestion, feature
flags and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 23:00–23:03Z)

Scheduled run `4d85aacc-0fb0-43f3-a1ae-d9a60087a975` completed at
`2026-08-22T23:03:44.062Z` with the existing allow-listed
`LEX_CATALOG_TIMEOUT`. The following read-only probe observed the scheduler
already advancing the next checkpoint: 21/44 checkpoints completed, 1 running
and 22 queued. The ingestion ledger contained 1,393 completed and 15,146
queued jobs. The failure ledger contained nine `retrying` rows only; no
terminal or technically-unavailable source rows and no failed, terminal or
dead-letter ingestion jobs were observed.

The materialized v2 totals at that boundary were 252 canonical documents, 341
language variants, 13,787 distinct current provisions and 40,255 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. The retryable catalogue timeout did not justify a code change
or staging redeploy. Snapshot, indexed evaluation, Qdrant/D1 restore and CI
gates remained unopened; production bindings, corpus ingestion, feature flags
and DNS were unchanged.

## Sequential v2 monitoring continuation (2026-08-22, 22:56–22:59Z)

Scheduled run `e5e03d6e-eb75-4f6a-a6e1-874304fb5af1` completed at
`2026-08-22T22:59:57.577Z` with `error_code=NULL`. The following read-only
probe observed the scheduler already advancing the next checkpoint: 21/44
checkpoints completed, 1 running and 22 queued. The ingestion ledger contained
1,388 completed and 15,051 queued jobs. The failure ledger contained nine
`retrying` rows only; no terminal or technically-unavailable source rows and
no failed, terminal or dead-letter ingestion jobs were observed.

The materialized v2 totals at that boundary were 251 canonical documents, 338
language variants, 13,780 distinct current provisions and 40,234 indexed
current chunks. The document and provision floors remained open and ingestion
was not frozen. No code change or staging redeploy was needed. Snapshot,
indexed evaluation, Qdrant/D1 restore and CI gates remained unopened;
production bindings, corpus ingestion, feature flags and DNS were unchanged.

## Staging D1 binding clarification (2026-08-22)

The previously reported staging totals were read from the original
`juro-staging` database (`bb716a96-b2fb-4823-90d6-6c228fed181a`): **3,575
canonical documents, 62,075 distinct current provisions, 151,499 indexed
chunks and 44/44 discovery checkpoints**. A current read-only probe confirms
that database is still intact at the Cloudflare D1 10 GB limit; it was not
deleted or overwritten.

Commit `af7f6064` intentionally moved the isolated staging corpus binding to
the new `juro-staging-corpus-v2` database
(`62620fb3-3da3-4c76-a8e9-aa60858c1063`) after the original database reached
that capacity boundary. The active resumable worker therefore writes only to
v2. Its current read-only totals are **179 canonical documents, 185 language
variants, 11,387 distinct current provisions, 29,996 indexed chunks and
16/44 checkpoints**. The two databases are separate; the v2 stream is
rehydrating the bounded catalogue and is not presented as the old 3,575-row
corpus. No production binding, migration, feature flag or DNS record changed.

## Read-only database reconciliation (2026-08-22, 18:36–18:44Z)

The old `juro-staging` database remains a separate, full 10 GB-boundary
snapshot. A direct read-only probe returned 3,575 documents; it was not used
as the write target and was not modified.

The active `juro-staging-corpus-v2` stream is a separate resumable rebuild,
not a diff-and-copy operation against the old database. At the boundary, v2
contained 210 canonical documents, 218 language variants, 12,549 distinct
current provisions, 33,564 current/indexed chunks and 21/44 completed
discovery checkpoints. The non-catalogue queued/retrying ingestion count was
1,442; terminal failures and dead-letter ingestion jobs were both zero.

Run `790de8a3-24d6-4d5d-bb3d-c575c0cf98ca` had just completed with
`error_code=NULL`; the next sequential run
`c0e71f3f-0c3d-413c-892f-3decaaf65623` was running at the probe. No parallel
crawl, old-database backfill, production binding change or release freeze was
performed.

## Sequential v2 monitoring boundary (2026-08-22, 18:42Z)

Read-only probes show the scheduled run
`c0e71f3f-0c3d-413c-892f-3decaaf65623` still running after the prior clean
run. The checkpoint ledger is 21 `completed` and 23 `queued`; the ingestion
ledger has 980 `completed`, 1,439 `queued` and 1 `running` non-catalogue jobs.
The failure ledger contains seven `retrying` rows only, with no terminal or
technically-unavailable state, and the ingestion ledger has no dead-letter
jobs.

The materialized v2 boundary is 211 canonical documents, 219 language
variants, 12,570 distinct current provisions and 33,592 indexed chunks. The
release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain open. No new terminal failure was observed, so no code change or
staging redeploy was justified.

## Fetch-capacity correction deployed to staging (2026-08-22, 18:43–18:48Z)

The run `c0e71f3f-0c3d-413c-892f-3decaaf65623` closed at
`2026-08-22T18:43:14.500Z` with the allow-listed `LEX_CATALOG_TIMEOUT`.
Read-only job evidence showed the five-slot batch completed one `fetch` and
four `version` jobs, confirming that version-debt scheduling had reduced
current-corpus capacity to one slot. The run produced no terminal or
dead-letter failure.

Commit `52406720` changes only the bounded slot allocation: when version debt
is high and the five-slot budget is active, two slots may process versions and
three remain available for current-corpus fetches. The total request budget,
20-second host pacer, distributed lock and start fence are unchanged. The
boundary test passed 21/21, type-check, lint and staging artifact dry-run
passed. Staging-only deployment completed as Worker version
`2f403af0-0dfe-48e2-9cf3-e450d6d3958a`; no production deployment was made.

The next sequential run `8ad13db6-ce19-4d17-824e-034041e0ecc6` was running
after deployment. Its read-only boundary showed 212 canonical documents,
220 language variants, 12,599 distinct current provisions and 33,655 indexed
chunks, with 1,435 queued/retrying jobs, terminal failures 0 and dead-letter
jobs 0. The release floors, queue freeze and post-ingestion gates remain open.

## Lex alternate-language recovery deployed and verified (2026-08-22, 18:54–19:27Z)

The bounded staging stream first recorded a source-language condition for
`lexuz:8385395` (`https://lex.uz/ru/docs/8385395`). The official page returned
HTTP 200 but its warning states that the act text is provided in Uzbek and
links to the official alternate page `https://lex.uz/ru/docs/8383786`; the
alternate page also returned HTTP 200 with legal body text. The diagnostic
requests followed Lex.uz's published crawl-delay (20 seconds) and did not
start a parallel crawl.

Commit `ed86b593` adds a bounded, one-time recovery path: the parser preserves
the verified official alternate link, the next sequential run reopens a
completed `LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` row, redirects it once,
and the alternate document is then parsed and indexed. It does not increase
the request budget, bypass the distributed lock, or treat the warning as
legal content. The focused parser suite passed 12/12, ingestion suite 38/38,
worker-boundary suite 21/21; type-check, lint and the legal-corpus artifact
dry-run also passed.

Staging-only Worker deployment `1af6e465-d269-48e2-b8ff-cd811ea814c` completed
at `2026-08-22T19:16:30.242Z`. The immediately preceding run started at
19:16:22Z and therefore used the prior version; it closed with the
allow-listed `LEX_CATALOG_TIMEOUT`. The first run using the new version,
`8e641892-9bd7-428a-aa34-8815d88ed78c` (scheduled 19:24:22Z), reopened the
old row at 19:26:23Z, recorded the bounded redirect, and completed the
alternate source at 19:26:50Z. The job now has `status=completed`,
`attempt_count=3`, `last_error_code=NULL`, source URL
`https://lex.uz/ru/docs/8383786`, and language `ru` (the official route's
body is Uzbek; no translation was introduced).

The post-recovery read-only boundary is 216 canonical documents, 233 language
variants, 12,677 distinct current provisions and 34,125 indexed chunks.
Failure rows are retrying-only (9); terminal/technically-unavailable source
rows are 0 and dead-letter ingestion jobs are 0. Discovery remains 21/44
completed with the queue active, so release floors, ingestion freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Sequential continuation after alternate-language recovery (2026-08-22, 19:32–19:38Z)

Run `7aa7896d-03a7-4c0b-89ab-79678c313c56` held the single staging lease and
closed at `2026-08-22T19:38:28.886Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. No terminal or dead-letter row was created. The
checkpoint ledger remains 21 completed and 23 queued; no checkpoint was
force-completed on the timeout.

The post-run read-only materialized totals are 217 canonical documents, 236
language variants, 12,697 distinct current provisions and 34,271 indexed
chunks. The failure ledger contains 9 retrying rows only; unresolved
terminal/technically-unavailable rows and dead-letter ingestion jobs remain
zero. The ingestion queue is still active, so the release floors, queue
freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain open;
production is untouched.

## Sequential continuation after timeout retry (2026-08-22, 19:40–19:46Z)

Run `0f95b924-a2de-400f-b97f-50ee437d4dcd` closed at
`2026-08-22T19:46:20.748Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The distributed lease remained single-owner and no
parallel crawl was started. No terminal or dead-letter ingestion row was
created; the temporary checkpoint retry returned to the queued ledger for a
later bounded attempt.

The post-run read-only boundary is 218 canonical documents, 239 language
variants, 12,715 distinct current provisions and 34,351 indexed chunks. The
ingestion ledger contains 1,214 completed and 12,911 queued jobs. Failure
rows remain retrying-only; unresolved terminal/technically-unavailable rows
and dead-letter jobs are both zero. Discovery remains 21/44 completed and the
queue is not frozen, so release floors and all post-ingestion gates remain
open; production is untouched.

## Clean sequential continuation (2026-08-22, 19:48–19:54Z)

Run `b7b370b4-ead2-4206-b5e2-90d4892dc248` completed at
`2026-08-22T19:54:30.461Z` with `error_code=NULL`. The single distributed
lease was preserved and no parallel crawl or forced checkpoint completion was
performed.

The post-run read-only boundary is 219 canonical documents, 242 language
variants, 12,721 distinct current provisions and 34,464 indexed chunks. The
ingestion ledger contains 1,219 completed and 12,986 queued jobs; the failure
ledger remains retrying-only (9 rows). Terminal/technically-unavailable
source rows and dead-letter ingestion jobs are both zero. Discovery remains
21/44 completed and the queue is not frozen, so release floors and all
post-ingestion gates remain open; production is untouched.

## Sequential continuation with bounded timeout (2026-08-22, 19:56–20:02Z)

Run `f1b51fab-dfb2-4bc8-9585-5c596109d93a` closed at
`2026-08-22T20:02:36.010Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The single distributed lease and crawl pacing were
preserved; no terminal or dead-letter ingestion row was created.

The post-run read-only boundary is 220 canonical documents, 245 language
variants, 12,742 distinct current provisions and 34,671 indexed chunks. The
ingestion ledger contains 1,224 completed and 13,041 queued jobs. Failure
rows remain retrying-only (9); unresolved terminal/technically-unavailable
rows and dead-letter jobs are both zero. Discovery remains 21/44 completed
and the queue is not frozen, so release floors and all post-ingestion gates
remain open; production is untouched.

## Clean sequential continuation (2026-08-22, 20:04–20:10Z)

Run `6ff55e65-3b80-4ef4-af0b-d0d7017e8ae2` completed at
`2026-08-22T20:10:24.918Z` with `error_code=NULL`. The single distributed
lease, source pacing and bounded retry behavior were preserved; no terminal
or dead-letter ingestion row was created.

The post-run read-only boundary is 221 canonical documents, 248 language
variants, 12,747 distinct current provisions and 34,720 indexed chunks. The
ingestion ledger contains 1,229 completed and 13,116 queued jobs. Failure
rows remain retrying-only (9); unresolved terminal/technically-unavailable
rows and dead-letter jobs are both zero. Discovery remains 21/44 completed
and the queue is not frozen, so release floors and all post-ingestion gates
remain open; production is untouched.

## Sequential continuation with transient Lex timeout (2026-08-22, 20:12–20:18Z)

Run `a8db95be-baa3-4959-bcc0-8ac688c5d333` closed at
`2026-08-22T20:18:22.049Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The `local_authorities/uz-Latn` checkpoint was
temporarily retrying at page 20 and returned to the queued ledger; no
checkpoint was force-completed and no terminal or dead-letter ingestion row
was created.

The post-run read-only boundary is 222 canonical documents, 251 language
variants, 12,761 distinct current provisions and 34,784 indexed chunks. The
ingestion ledger contains 1,234 completed and 13,171 queued jobs. Failure
rows remain retrying-only (9); unresolved terminal/technically-unavailable
rows and dead-letter jobs are both zero. Discovery remains 21/44 completed
and the queue is not frozen, so release floors and all post-ingestion gates
remain open; production is untouched. A single transient Cloudflare D1 probe
returned API code 7403; `wrangler whoami` confirmed the authorized OAuth
account and the identical read-only query succeeded on retry.

## Sequential continuation after local-authority retry (2026-08-22, 20:20–20:26Z)

Run `334110ab-19b5-4cac-b930-60099ae57784` closed at
`2026-08-22T20:26:24.979Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The single distributed lease and crawl pacing were
preserved; no terminal or dead-letter ingestion row was created.

The post-run read-only boundary is 223 canonical documents, 254 language
variants, 12,791 distinct current provisions and 34,904 indexed chunks. The
ingestion ledger contains 1,239 completed and 13,226 queued jobs. Failure
rows remain retrying-only (9); unresolved terminal/technically-unavailable
rows and dead-letter jobs are both zero. Discovery remains 21/44 completed
and the queue is not frozen, so release floors and all post-ingestion gates
remain open; production is untouched.

## Clean sequential continuation (2026-08-22, 20:28–20:34Z)

Run `187b0818-9de2-4b11-819b-c045a9c05900` completed at
`2026-08-22T20:34:25.257Z` with `error_code=NULL`. The single distributed
lease and bounded Lex pacing were preserved; no terminal or dead-letter
ingestion row was created.

The post-run read-only boundary is 224 canonical documents, 257 language
variants, 12,798 distinct current provisions and 34,993 indexed chunks. The
ingestion ledger contains 1,244 completed and 13,301 queued jobs. Failure
rows remain retrying-only (9); unresolved terminal/technically-unavailable
rows and dead-letter jobs are both zero. Discovery remains 21/44 completed
and the queue is not frozen, so release floors and all post-ingestion gates
remain open; production is untouched.

## Sequential continuation after retryable catalogue timeout (2026-08-22, 20:36–20:42Z)

Run `a4a1728e-95ff-4caa-9add-b68a23d322b7` closed at
`2026-08-22T20:42:20.803Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`. The sequential lease and 20-second source pacing were
preserved; no terminal or dead-letter ingestion row was created.

The post-run read-only boundary is 225 canonical documents, 260 language
variants, 12,822 distinct current provisions and 35,101 indexed chunks. The
ingestion ledger contains 1,249 completed and 13,356 queued jobs. Failure
rows remain retrying-only (9); unresolved terminal/technically-unavailable
rows and dead-letter jobs are both zero. Discovery remains 21/44 completed
and the queue is not frozen, so release floors and all post-ingestion gates
remain open; production is untouched.

## Clean sequential continuation (2026-08-22, 20:44–20:50Z)

Run `a63ae093-c31b-41cb-a173-8c4321e05ccf` completed at
`2026-08-22T20:50:29.776Z` with `error_code=NULL`. The single distributed
lease and bounded Lex pacing were preserved; no terminal or dead-letter
ingestion row was created.

The post-run read-only boundary is 226 canonical documents, 263 language
variants, 12,842 distinct current provisions and 35,255 indexed chunks. The
ingestion ledger contains 1,254 completed and 13,432 queued jobs. Failure
rows remain retrying-only (9); unresolved terminal/technically-unavailable
rows and dead-letter jobs are both zero. Discovery remains 21/44 completed
and the queue is not frozen, so release floors and all post-ingestion gates
remain open; production is untouched.

## Staging catalogue upstream retry observation (2026-08-22, 13:44–14:05Z)

The sequential v2 worker recorded two source-condition runs while continuing
the bounded stream: run `222811f0-40c5-46b1-a437-d6adf6f9bddd` ended at
13:51:39Z with `LEX_CATALOG_UPSTREAM_UNAVAILABLE`, and run
`da812784-7517-46be-995e-c15e027ca2cc` ended at 13:59:30Z with the
allow-listed `LEX_CATALOG_TIMEOUT`. The next run
`80cfe197-32d7-4511-92fe-1220b1c9090e` was still running at the 14:05Z
boundary with its scheduler lease renewed; no parallel crawler was started.

The ministries/uz-Cyrl checkpoint was observed in `dead_letter` at attempt 2
with `LEX_CATALOG_UPSTREAM_UNAVAILABLE`, while the ingestion-job ledger had
**0 dead-letter jobs** and the failure ledger had **0 terminal or technically
unavailable failures**. The existing seed recovery path reopens this exact
upstream code while attempts remain below five; the focused catalogue suite
passed **20/20**, including the regression that old terminal upstream rows
self-heal. No code or deployment change is justified yet because the source
condition remains allow-listed and retryable; the next read-only boundary must
prove whether the checkpoint reopens. Release thresholds and the checkpoint
freeze gate remain open.

## Upstream checkpoint recovery confirmed (2026-08-22, 14:08–14:09Z)

At the next four-minute staging tick, the seed reconciliation reopened the
ministries/uz-Cyrl `LEX_CATALOG_UPSTREAM_UNAVAILABLE` checkpoint as designed;
the checkpoint entered `running` at attempt 3 under run
`07df35c8-f87b-41dd-94c3-e236afe01dac`. The read-only boundary showed **0
dead-letter ingestion jobs** and **0 terminal/technically-unavailable failure
rows**. This confirms the existing retry/self-heal path rather than a new
terminal ingestion defect; the run must still finish successfully before the
checkpoint can count toward release coverage.

The same run then completed the ministries/en page-one checkpoint at
14:08:48Z and restarted ministries/uz-Cyrl as a clean queued page-one state
with 20 discovered records, `attempt_count=0` and no error. The 14:11Z
read-only totals were 182 canonical documents, 11,454 distinct current
provisions and 30,098 indexed chunks with 17/44 checkpoints complete; dead-
letter ingestion jobs and terminal failure rows remained zero. The run was
still active at that boundary, so no freeze or release claim is made.

## Completed ministry recovery run (2026-08-22, 14:08–14:15Z)

Run `07df35c8-f87b-41dd-94c3-e236afe01dac` completed at
`2026-08-22T14:15:34.157Z` with `error_code=NULL`. The recovered ministry
checkpoint remained free of the upstream error: English completed its four
page-one records, while Russian, Uzbek Cyrillic and Uzbek Latin retained their
20 discovered page-one records for sequential continuation. The post-run
read-only boundary recorded 182 canonical documents, 11,454 distinct current
provisions, 30,098 indexed chunks and 17/44 completed checkpoints. The live
or manual ingestion queue was 1,496 jobs; dead-letter jobs and terminal or
technically-unavailable failure rows were both zero. The queue is still active,
so the freeze, snapshot and post-ingestion gates remain open.

## Completed staging continuation run (2026-08-22, 14:16–14:23Z)

Run `b7a48ca2-61ad-4682-a8b4-12a8951b06db` completed at
`2026-08-22T14:23:39.824Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT` source condition. The durable scheduler lease was
renewed throughout and no parallel crawler was started. The post-run
read-only boundary recorded 183 canonical documents, 11,476 distinct current
provisions, 30,133 indexed chunks, 17/44 completed checkpoints and 1,495
live-or-manual queued jobs. Dead-letter ingestion jobs and terminal or
technically-unavailable failure rows remained zero; the queue is not frozen,
so release gates remain open.

## Completed staging continuation run (2026-08-22, 14:24–14:31Z)

Run `bf738e26-31cb-4852-9273-22056dd3bc06` completed at
`2026-08-22T14:31:49.552Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT` source condition. The run held and renewed the
distributed lease and was followed by the next sequential run
`17845a1e-c3d7-48e5-9797-fabf384c6aac`; no parallel crawler was started.
At the read-only boundary immediately after closure, v2 contained 184
canonical documents, 11,501 distinct current provisions and 30,173 indexed
chunks, with 17/44 discovery checkpoints complete and 1,494 live-or-manual
queued/running/retrying jobs. Dead-letter ingestion jobs and terminal or
technically-unavailable failure rows were both zero. Ingestion remains active;
the queue freeze, release floors and all post-ingestion gates remain open.

## Completed staging continuation run (2026-08-22, 14:32–14:39Z)

Run `17845a1e-c3d7-48e5-9797-fabf384c6aac` completed at
`2026-08-22T14:39:38.901Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT` source condition. The distributed lease was renewed
throughout and the next sequential run
`93bfb614-606a-404a-a55e-c0336928996c` acquired the lease at
`2026-08-22T14:40:22.697Z`; no parallel crawler was started. The
read-only boundary recorded 185 canonical documents, 11,594 distinct current
provisions and 30,485 indexed chunks, with 17/44 discovery checkpoints
complete and 1,493 live-or-manual queued/running/retrying jobs. Dead-letter
ingestion jobs and terminal or technically-unavailable failure rows remained
zero. Ingestion is still active; the queue freeze, release floors and all
post-ingestion gates remain open.

## Completed staging continuation run (2026-08-22, 14:40–14:46Z)

Run `93bfb614-606a-404a-a55e-c0336928996c` completed at
`2026-08-22T14:46:45.726Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT` source condition. The sequential worker held the
distributed lease for the full run; no parallel crawler was started. The
post-run read-only boundary recorded 186 canonical documents, 11,691 distinct
current provisions and 30,708 indexed chunks, with 17/44 discovery
checkpoints complete and 1,492 live-or-manual queued/running/retrying jobs.
Dead-letter ingestion jobs and terminal or technically-unavailable failure
rows remained zero. Ingestion remains active; the queue freeze, release
floors and all post-ingestion gates remain open.

## Completed staging continuation run (2026-08-22, 14:48–14:55Z)

Run `ab2938e4-a536-4917-8edf-ac73bc998ac3` completed at
`2026-08-22T14:55:33.491Z` with `error_code=NULL`. The worker retained the
single distributed lease while resuming `ministries/ru` from its page-five
marker; no parallel crawler was started. The post-run read-only boundary
recorded 187 canonical documents, 11,729 distinct current provisions and
30,810 indexed chunks, with 17/44 discovery checkpoints complete and 1,491
live-or-manual queued/running/retrying jobs. Dead-letter ingestion jobs and
terminal or technically-unavailable failure rows were both zero. Ingestion
remains active; queue freeze, release floors and all post-ingestion gates
remain open.

## Completed staging continuation run (2026-08-22, 14:56–15:03Z)

Run `7cc45979-3953-45de-aa69-2b19ed599720` completed at
`2026-08-22T15:03:19.838Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT` source condition. The worker preserved the single
distributed lease while continuing the ministries checkpoints; no parallel
crawler was started and no checkpoint was force-completed. The post-run
read-only boundary recorded 188 canonical documents, 11,784 distinct current
provisions and 31,174 indexed chunks, with 17/44 discovery checkpoints
complete and 1,490 live-or-manual queued/running/retrying jobs. Dead-letter
ingestion jobs and terminal or technically-unavailable failure rows remained
zero. Ingestion remains active; queue freeze, release floors and all
post-ingestion gates remain open.

## Completed staging continuation run (2026-08-22, 15:04–15:10Z)

Run `4c4c4ce1-4d44-45c3-b044-14258fcbd80f` completed at
`2026-08-22T15:10:26.703Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT` source condition. The worker retained the single
distributed lease while continuing the ministry-language checkpoints; the
retrying Uzbek Cyrillic page recovered without a terminal transition. No
parallel crawler was started and no checkpoint was force-completed. The
post-run read-only boundary recorded 189 canonical documents, 11,866 distinct
current provisions and 31,263 indexed chunks, with 17/44 discovery
checkpoints complete and 1,489 live-or-manual queued/running/retrying jobs.
Dead-letter ingestion jobs and terminal or technically-unavailable failure
rows remained zero. Ingestion remains active; queue freeze, release floors
and all post-ingestion gates remain open.

## Completed staging continuation run (2026-08-22, 15:12–15:18Z)

Run `8bbc5fe5-8884-411f-a8f4-e8235ff5aa92` completed at
`2026-08-22T15:18:43.682Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT` source condition. The worker retained the single
distributed lease while advancing the ministry-language checkpoints; the
retryable Russian timeout did not become terminal and no checkpoint was
force-completed. No parallel crawler was started. The post-run read-only
boundary recorded 190 canonical documents, 11,972 distinct current
provisions and 31,453 indexed chunks, with 17/44 discovery checkpoints
complete and 1,488 live-or-manual queued/running/retrying jobs. Dead-letter
ingestion jobs and terminal or technically-unavailable failure rows remained
zero. Ingestion remains active; queue freeze, release floors and all
post-ingestion gates remain open.

## Completed staging continuation run (2026-08-22, 15:20–15:26Z)

Run `3673bd37-b699-422c-bb3e-1336f855aaaa` completed at
`2026-08-22T15:26:29.347Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT` source condition. The worker retained the single
distributed lease while advancing the ministry-language checkpoints; no
parallel crawler was started and no checkpoint was force-completed. The
post-run read-only boundary recorded 191 canonical documents, 12,007 distinct
current provisions and 31,510 indexed chunks, with 17/44 discovery
checkpoints complete and 1,487 live-or-manual queued/running/retrying jobs.
Dead-letter ingestion jobs and terminal or technically-unavailable failure
rows remained zero. Ingestion remains active; queue freeze, release floors
and all post-ingestion gates remain open.

## Completed staging continuation run (2026-08-22, 15:28–15:34Z)

Run `2d070c9c-a0f8-45f6-8592-01a89a6fdd76` completed at
`2026-08-22T15:34:28.421Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT` source condition. The worker retained its single
distributed lease while continuing the ministry-language checkpoints; no
parallel crawler was started and no checkpoint was force-completed. The
post-run read-only boundary recorded 192 canonical documents, 12,018 distinct
current provisions and 31,523 indexed chunks, with 17/44 discovery
checkpoints complete and 1,486 live-or-manual queued/running/retrying jobs.
Dead-letter ingestion jobs and terminal or technically-unavailable failure
rows remained zero. Ingestion remains active; queue freeze, release floors
and all post-ingestion gates remain open.

## Completed staging continuation run (2026-08-22, 15:36–15:42Z)

Run `f38f74c6-58ac-484c-b753-b398a053d0f1` completed at
`2026-08-22T15:42:33.420Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT` source condition. The worker retained its single
distributed lease while continuing the ministry-language checkpoints; no
parallel crawler was started and no checkpoint was force-completed. The
post-run read-only boundary recorded 193 canonical documents, 12,063 distinct
current provisions and 31,685 indexed chunks, with 17/44 discovery
checkpoints complete and 1,487 live-or-manual queued/running/retrying jobs.
Dead-letter ingestion jobs and terminal or technically-unavailable failure
rows remained zero. Ingestion remains active; queue freeze, release floors
and all post-ingestion gates remain open.

## Completed staging continuation run (2026-08-22, 15:44–15:51Z)

Run `94120870-79f3-47ad-90d1-b39c6e2474a0` completed at
`2026-08-22T15:51:02.680Z` with `error_code=NULL`. The worker retained the
single distributed lease while continuing the ministry-language checkpoints;
no parallel crawler was started and no checkpoint was force-completed. The
post-run read-only boundary recorded 194 canonical documents, 12,116 distinct
current provisions and 32,319 indexed chunks, with 17/44 discovery checkpoints
complete and 1,488 live-or-manual queued/running/retrying jobs. Dead-letter
ingestion jobs and terminal or technically-unavailable failure rows remained
zero. Ingestion remains active; queue freeze, release floors and all
post-ingestion gates remain open.

## Completed staging continuation run (2026-08-22, 15:52–15:58Z)

Run `0ee0f84b-62f8-49cc-8ef1-ac54ad1d3714` completed at
`2026-08-22T15:58:20.937Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT` source condition. The worker retained the single
distributed lease while continuing the ministry-language checkpoints; no
parallel crawler was started and no checkpoint was force-completed. The
post-run read-only boundary recorded 195 canonical documents, 12,131 distinct
current provisions and 32,346 indexed chunks, with 17/44 discovery
checkpoints complete and 1,487 live-or-manual queued/running/retrying jobs.
Dead-letter ingestion jobs and terminal or technically-unavailable failure
rows remained zero. Ingestion remains active; queue freeze, release floors
and all post-ingestion gates remain open.

## Completed staging continuation run (2026-08-22, 16:00–16:06Z)

Run `e91f09cc-f8e6-44a1-ae64-59840a722fcc` completed at
`2026-08-22T16:06:29.310Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT` source condition. The worker retained the single
distributed lease while continuing the ministry-language checkpoints; no
parallel crawler was started and no checkpoint was force-completed. The
post-run read-only boundary recorded 196 canonical documents, 12,166
distinct current provisions and 32,420 indexed chunks, with 17/44 discovery
checkpoints complete and 1,486 live-or-manual queued/running/retrying jobs.
Dead-letter ingestion jobs and terminal or technically-unavailable failure
rows remained zero. Ingestion remains active; queue freeze, release floors
and all post-ingestion gates remain open.

## Completed staging continuation run (2026-08-22, 16:08–16:17Z)

Run `7ad4207d-2fb1-4f46-a0d3-ab758bd2fca7` completed at
`2026-08-22T16:17:24.122Z` with `error_code = NULL`. The worker retained
the single distributed lease for the full bounded invocation; no parallel
crawler was started and no checkpoint was force-completed. The post-run
read-only boundary recorded 197 canonical documents, 12,177 distinct current
provisions and 32,431 indexed chunks, with 17/44 discovery checkpoints
complete and 1,485 live-or-manual queued/running/retrying jobs. Dead-letter
ingestion jobs and terminal or technically-unavailable failure rows remained
zero. Ingestion remains active; queue freeze, release floors and all
post-ingestion gates remain open.

## Completed staging continuation run (2026-08-22, 16:20–16:29Z)

Run `d2419f1e-9407-473e-b3d1-053a300c1c37` completed at
`2026-08-22T16:29:50.562Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT` source condition. The worker held the single
distributed lease for the bounded invocation; no parallel crawler was
started and no checkpoint was force-completed. The post-run read-only
boundary recorded 198 canonical documents, 12,194 distinct current
provisions and 32,490 indexed chunks, with 17/44 discovery checkpoints
complete and 1,484 live-or-manual queued/running/retrying jobs. Dead-letter
ingestion jobs and terminal or technically-unavailable failure rows remained
zero. Ingestion remains active; queue freeze, release floors and all
post-ingestion gates remain open.

## Completed staging continuation run (2026-08-22, 16:32–16:41Z)

Run `6c96fc99-471a-4cb6-92a5-f726d6149a93` completed at
`2026-08-22T16:41:41.761Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT` source condition. The worker held and renewed the
single distributed lease for the bounded invocation; no parallel crawler was
started and no checkpoint was force-completed. The post-run read-only boundary
recorded 199 canonical documents, 12,292 distinct current provisions and
32,774 indexed chunks, with 17/44 discovery checkpoints complete and 1,483
live-or-manual queued/running/retrying jobs. Dead-letter ingestion jobs and
terminal or technically-unavailable failure rows remained zero. Ingestion
remains active; queue freeze, release floors and all post-ingestion gates
remain open.

## Completed staging continuation run (2026-08-22, 16:44–16:53Z)

Run `af1c7ab9-c67f-446f-be1b-4e286999812b` completed at
`2026-08-22T16:53:35.514Z` with `error_code = NULL`. The worker held and
renewed the single distributed lease for the full bounded invocation; no
parallel crawler was started and no checkpoint was force-completed. The
post-run read-only boundary recorded 200 canonical documents, 12,293 distinct
current provisions and 32,780 indexed chunks, with 18/44 discovery
checkpoints complete and 1,479 live-or-manual queued/running/retrying jobs.
Dead-letter ingestion jobs and terminal or technically-unavailable failure
rows remained zero. Ingestion remains active; queue freeze, release floors
and all post-ingestion gates remain open.

## Version-debt slot balancing fix (2026-08-22)

The run boundary showed 217 queued fetch jobs versus 1,262 queued historical
version jobs while the prior policy reserved nine of ten sequential slots for
version catch-up. Commit `d1cecdab` caps the catch-up reservation at four slots,
retaining at least five current-corpus fetch slots while preserving the shared
20-second Lex.uz pacer, one distributed lock and the existing start fence. The
focused worker boundary suite passed **21/21**, `npm run type-check`,
`npm run lint` and `npm run validate:legal-corpus:artifact` all passed. The
staging-only Worker was deployed as version
`09dba303-8870-45ab-ac5b-f24abfa6a3c1`; no production binding, flag, migration
or DNS record changed.

## Completed staging continuation run (2026-08-22, 16:56–17:05Z)

Run `1580fbcf-f555-4d1b-840c-00add3aa0a39` completed at
`2026-08-22T17:05:02.716Z` with the allow-listed upstream condition
`error_code = LEX_CATALOG_TIMEOUT`. This is a catalog timeout recorded by the
bounded source probe, not a terminal or technically-unavailable ingestion
failure. The worker used the single distributed lease for the invocation; no
parallel crawler was started and no checkpoint was force-completed. The
post-run read-only boundary recorded 201 canonical documents, 12,298 distinct
current provisions and 32,789 indexed chunks, with 18/44 discovery checkpoints
complete and 1,475 live-or-manual queued/running/retrying jobs (catalog jobs
excluded). Dead-letter ingestion jobs and terminal or technically-unavailable
failure rows remained zero. The lease was released after completion. Ingestion
is not frozen; queue freeze, release floors and all post-ingestion gates remain
open.

## Completed staging continuation run (2026-08-22, 17:08–17:16Z)

Run `2823d6b3-3488-43b1-b8f3-dd01aa733a93` completed at
`2026-08-22T17:16:58.104Z` with `error_code = NULL`. The worker held the
single distributed lease for the bounded invocation; no parallel crawler was
started and no checkpoint was force-completed. The post-run read-only boundary
recorded 202 canonical documents, 12,320 distinct current provisions and
32,891 indexed chunks, with 19/44 discovery checkpoints complete and 1,471
live-or-manual queued/running/retrying jobs (catalog jobs excluded).
Dead-letter ingestion jobs and terminal or technically-unavailable failure
rows remained zero. The lease was released after completion. Ingestion is not
frozen; queue freeze, release floors and all post-ingestion gates remain open.

## Signed Lex PDF redrive and terminal-failure recovery (2026-08-22)

A read-only staging probe found one technically-unavailable row for
`lexuz:8420999` (`https://lex.uz/uz/docs/-8420999`, attempted at
`2026-08-22T17:22:55.627Z`). A live, robots-checked read of that official page
returned HTTP 200 and showed the signed representation path
`/pdffile/-8420999`; the previous parser had stripped the leading minus sign
and therefore treated a reachable official PDF as unavailable. This was a
parser defect, not a legal-source determination.

Commit `7b87ee28` preserves signed Lex IDs in the source fetcher,
normalizer and ingestion path. Commit `e1889189` adds a bounded recovery rule:
only a first-attempt `LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` row whose source
URL is a signed Lex `/docs/-<id>` path is re-read once. The original failure
row is retained as evidence; a second unavailable result remains
`technically_unavailable` and blocks the release gate. The regression suite
passed **36/36**, `npm run type-check`, `npm run lint`,
`npm run validate:legal-corpus:artifact` and `git diff --check` passed.

Staging-only Worker version `111cac77-7cd4-4405-bfce-842e9e05d314` deployed the
fix against `juro-staging-corpus-v2` and `juro_legal_staging_v2`. The next
sequential cron run redrove the target job (`attempt_count 1 → 2`), completed
it with `last_error_code = NULL`, and left the original failure row in the
ledger as a completed-job retry projection. A subsequent read-only D1 probe
reported **0 terminal/technically-unavailable failures**. The current
admin-equivalent totals were 205 canonical documents, 12,485 unique current
provisions, 33,485 indexed chunks, 21/44 checkpoints and 1,464 live/manual
queued or retrying jobs. Seven historical retrying rows belong to completed
jobs and are projected as resolved by the dashboard; ingestion is still not
frozen and release floors, snapshot, evaluation and restore gates remain open.
Production bindings, flags, migrations and DNS were not changed.

The containing scheduled run `dacf7a9b-7445-4476-9c12-42bc58be53fa` ran from
`2026-08-22T17:44:22.892Z` through `2026-08-22T17:53:17.136Z` with
`error_code = NULL`. The following scheduled run
`1b8d980d-7581-48d6-95fc-d7ef250a0aec` ran under the same
single-worker lock; no overlapping invocation was started.

That run completed at `2026-08-22T18:03:26.688Z` with the allow-listed
`error_code = LEX_CATALOG_TIMEOUT`. The worker released the lock, left the
ingestion failure gate at zero, and the subsequent read-only probe recorded
1,458 live/manual queued or retrying jobs and 21/44 completed checkpoints.
This catalog timeout is not treated as a legal-source terminal failure or as a
successful release gate.

The next scheduled run `22cefddf-b8dc-4ecd-9fee-48b2c5509884` completed at
`2026-08-22T18:11:15.098Z` with `error_code = NULL`. The following read-only
probe recorded 1,454 live/manual queued or retrying jobs, 21/44 completed
checkpoints, zero terminal failures and zero dead-letter jobs.

The subsequent scheduled run `80738156-d310-4c4f-86ab-b7d9798703ed` completed
at `2026-08-22T18:19:16.154Z` with the same allow-listed
`LEX_CATALOG_TIMEOUT`; its read-only boundary recorded 1,450 queued jobs,
21/44 completed checkpoints, zero terminal failures and zero dead-letter jobs.
The following run `5ab5ccd9-8771-4e85-b98e-5a5d20409327` completed at
`2026-08-22T18:27:17.785Z` with the same allow-listed timeout; its boundary
recorded 1,446 queued jobs, 21/44 completed checkpoints, zero terminal
failures and zero dead-letter jobs.

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

## Oliy Majlis recovery run closure (2026-08-22, 13:28–13:35Z)

The prior run `88f5c9ab-8b96-4624-bbb1-230fe65e149e` was closed fail-closed
at `2026-08-22T13:28:22.693Z` with
`LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED` after its 15-minute scheduler lease
expired. No production state or feature flag was changed. Recovery run
`7de7df22-9d26-43e1-b5a0-6466a8bea9f4` then completed from
`2026-08-22T13:28:22.693Z` to `2026-08-22T13:35:33.702Z` without a run-level
error. Its stale-job reconciliation redrove
`legal-version:7b4a1df57287dfa1151abb451103` at attempt 2/5; the job completed
without a last error. The resulting failure ledger contained four retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows and two retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows; terminal/dead-letter remained zero.

## Oliy Majlis bounded run closure (2026-08-22, 13:36–13:43Z)

Run `2aea6d24-d6d9-4268-abb5-f2471cd462c2` completed from
`2026-08-22T13:36:22.693Z` to `2026-08-22T13:43:32.538Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 13:44:30Z read-only
boundary confirmed no terminal/dead-letter conversion and no new failure
class. The bounded worker advanced the Oliy Majlis ledger without forcing any
checkpoint.

The final read-only totals are 178 canonical documents, 184 language
variants, 11,343 distinct current provisions and 29,925 indexed chunks, with
1,499 live-or-manual queued/retrying jobs. The checkpoint ledger is now 14
completed and 30 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and four retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis Russian is completed at page 3 (2,900 discovered records); Uzbek
Cyrillic and Uzbek Latin remain queued at page 2 with the recorded
`LEX_CATALOG_DUPLICATE_PAGE` markers (2,900 and 2,880 records respectively).
Release floors, queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI
gates remain unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 13:00–13:07Z)

Run `03a58782-8347-4d6e-a4b4-0aaff0cb40d2` completed from
`2026-08-22T13:00:22.698Z` to `2026-08-22T13:07:09.589Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 13:07:45Z read-only
boundary confirmed no new failure class and no terminal/dead-letter
conversion; the bounded worker advanced the Oliy Majlis catalogue ledger
without force-completing any checkpoint.

The final read-only totals are 176 canonical documents, 182 language
variants, 11,310 distinct current provisions and 29,860 indexed chunks, with
1,502 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 144 for Russian (2,880 discovered records),
page 143 for Uzbek Cyrillic (2,860) and page 143 for Uzbek Latin (2,860);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 12:52–12:59Z)

Run `a749dd8d-f89d-4bd4-a9a6-81e5ebcbd01f` completed from
`2026-08-22T12:52:22.692Z` to `2026-08-22T12:59:12.296Z` without a run-level
error. The 12:59:17Z read-only boundary confirmed no new failure class and no
terminal/dead-letter conversion; the bounded worker advanced the Oliy Majlis
catalogue ledger without force-completing any checkpoint.

The final read-only totals are 175 canonical documents, 181 language
variants, 11,288 distinct current provisions and 29,817 indexed chunks, with
1,503 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 143 for Russian (2,860 discovered records),
page 142 for Uzbek Cyrillic (2,840) and page 142 for Uzbek Latin (2,840);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 12:44–12:51Z)

Run `2b38585a-e2e2-4d51-b87d-20105dae4203` completed from
`2026-08-22T12:44:22.693Z` to `2026-08-22T12:51:16.798Z` without a run-level
error. The 12:52:14Z read-only boundary confirmed no new failure class and no
terminal/dead-letter conversion; the bounded worker advanced the Oliy Majlis
catalogue ledger without force-completing any checkpoint.

The final read-only totals are 174 canonical documents, 180 language
variants, 11,282 distinct current provisions and 29,811 indexed chunks, with
1,504 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 141 for Russian, Uzbek Cyrillic and Uzbek Latin
(2,820 discovered records each); English is completed at page 1 with zero
catalogue records. Release floors, queue freeze, snapshot/evaluation,
Qdrant/D1 restore and CI gates remain unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 12:36–12:43Z)

Run `36fc42f5-1b12-4aba-856a-4fac93337cef` completed from
`2026-08-22T12:36:22.889Z` to `2026-08-22T12:43:16.050Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 12:43:50Z read-only
boundary confirmed no new failure class and no terminal/dead-letter
conversion; the bounded worker advanced the Oliy Majlis catalogue ledger
without force-completing any checkpoint.

The final read-only totals are 173 canonical documents, 179 language
variants, 11,255 distinct current provisions and 29,767 indexed chunks, with
1,505 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 140 for Russian (2,800 discovered records),
page 139 for Uzbek Cyrillic (2,780) and page 140 for Uzbek Latin (2,800);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 12:28–12:34Z)

Run `3fc5446c-2a49-4545-b0fe-7b3799fa3544` completed from
`2026-08-22T12:28:41.784Z` to `2026-08-22T12:34:18.913Z` without a run-level
error. The 12:34:20Z read-only boundary confirmed the failure ledger is
unchanged and no terminal/dead-letter conversion occurred. The bounded worker
advanced the Oliy Majlis catalogue ledger without force-completing any
checkpoint.

The final read-only totals are 172 canonical documents, 178 language
variants, 11,247 distinct current provisions and 29,753 indexed chunks, with
1,506 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 139 for Russian (2,780 discovered records),
page 138 for Uzbek Cyrillic (2,760) and page 139 for Uzbek Latin (2,780);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 12:20–12:26Z)

Run `fd4c3a36-ac9e-4196-a90e-a1101e530df6` completed from
`2026-08-22T12:20:41.785Z` to `2026-08-22T12:26:17.910Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 12:26:25Z read-only
boundary confirmed the failure ledger is unchanged: no new failure class and
no terminal/dead-letter conversion. The bounded worker advanced the Oliy
Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 171 canonical documents, 177 language
variants, 11,242 distinct current provisions and 29,748 indexed chunks, with
1,507 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 138 for Russian (2,760 discovered records),
page 137 for Uzbek Cyrillic (2,740) and page 137 for Uzbek Latin (2,740);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 12:12–12:18Z)

Run `18887167-1650-4123-882c-8dc3d37d0053` completed from
`2026-08-22T12:12:41.784Z` to `2026-08-22T12:18:58.288Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 12:20:00Z read-only
boundary confirmed no terminal/dead-letter conversion and no new failure
class; the bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 170 canonical documents, 176 language
variants, 11,230 distinct current provisions and 29,734 indexed chunks, with
1,508 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 137 for Russian (2,740 discovered records),
page 136 for Uzbek Cyrillic (2,720) and page 136 for Uzbek Latin (2,720);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 12:04–12:10Z)

Run `f225ab07-4ea6-422e-b02a-592e9bbf4c45` completed from
`2026-08-22T12:04:41.786Z` to `2026-08-22T12:10:22.109Z` with no run-level
error. The 12:10:23Z read-only boundary showed the run completed without a
subsequent failure. The bounded worker advanced the Oliy Majlis catalogue
ledger without force-completing any checkpoint.

The final read-only totals are 169 canonical documents, 175 language
variants, 11,131 distinct current provisions and 28,883 indexed chunks, with
1,507 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 136 for Russian (2,720 discovered records),
page 135 for Uzbek Cyrillic (2,700) and page 135 for Uzbek Latin (2,700);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 11:56–12:02Z)

Run `a81281ba-bd69-44a7-9ff8-6cbe1fa3b72f` completed from
`2026-08-22T11:56:41.783Z` to `2026-08-22T12:02:23.907Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 12:02:55Z read-only boundary
showed no subsequent scheduled run. The bounded worker advanced the Oliy
Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 168 canonical documents, 174 language
variants, 11,124 distinct current provisions and 28,873 indexed chunks, with
1,507 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 134 for Russian (2,680 discovered records),
page 134 for Uzbek Cyrillic (2,680) and page 134 for Uzbek Latin (2,680);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 11:48–11:54Z)

Run `e89634fb-c439-4ab0-ac00-f6d33276372e` completed from
`2026-08-22T11:48:41.782Z` to `2026-08-22T11:54:27.478Z` with no run-level
error. The 11:54:39Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 167 canonical documents, 173 language
variants, 11,091 distinct current provisions and 28,819 indexed chunks, with
1,508 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 133 for Russian (2,660 discovered records),
page 133 for Uzbek Cyrillic (2,660) and page 133 for Uzbek Latin (2,660);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 11:40–11:46Z)

Run `1ff03bce-e6b2-4c98-9bda-1055a56dfc16` completed from
`2026-08-22T11:40:41.785Z` to `2026-08-22T11:46:31.517Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 11:47:06Z read-only boundary
showed no subsequent scheduled run. The bounded worker advanced the Oliy
Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 166 canonical documents, 172 language
variants, 11,059 distinct current provisions and 28,772 indexed chunks, with
1,509 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 132 for Russian (2,640 discovered records),
page 132 for Uzbek Cyrillic (2,640) and page 131 for Uzbek Latin (2,620);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 11:32–11:38Z)

Run `ef78a4fe-a02a-458e-9bcd-bfcd0b481076` completed from
`2026-08-22T11:32:41.783Z` to `2026-08-22T11:38:32.733Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 11:38:34Z read-only boundary
showed no subsequent scheduled run. The bounded worker advanced the Oliy
Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 165 canonical documents, 171 language
variants, 11,026 distinct current provisions and 28,655 indexed chunks, with
1,510 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 131 for Russian (2,620 discovered records),
page 131 for Uzbek Cyrillic (2,620) and page 130 for Uzbek Latin (2,600);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 11:24–11:30Z)

Run `69f1553f-3637-4940-99ac-37393cd7ab0f` completed from
`2026-08-22T11:24:41.781Z` to `2026-08-22T11:30:28.080Z` with no run-level
error. The 11:31:18Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 164 canonical documents, 170 language
variants, 10,968 distinct current provisions and 28,539 indexed chunks, with
1,511 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 130 for Russian (2,600 discovered records),
page 130 for Uzbek Cyrillic (2,600) and page 129 for Uzbek Latin (2,580);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 11:16–11:22Z)

Run `d0a46780-f972-4421-b467-deee6d07c28c` completed from
`2026-08-22T11:16:41.783Z` to `2026-08-22T11:22:24.296Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 11:23:02Z read-only boundary
showed no subsequent scheduled run. The bounded worker advanced the Oliy
Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 163 canonical documents, 169 language
variants, 10,929 distinct current provisions and 28,478 indexed chunks, with
1,512 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 128 for Russian (2,560 discovered records),
page 129 for Uzbek Cyrillic (2,580) and page 128 for Uzbek Latin (2,560);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 11:08–11:14Z)

Run `bf467758-bb59-45f6-a9c8-966fc41a44aa` completed from
`2026-08-22T11:08:41.783Z` to `2026-08-22T11:14:36.941Z` with no run-level
error. The 11:14:51Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 162 canonical documents, 168 language
variants, 10,924 distinct current provisions and 28,473 indexed chunks, with
1,513 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 127 for Russian (2,540 discovered records),
page 128 for Uzbek Cyrillic (2,560) and page 127 for Uzbek Latin (2,540);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 11:00–11:06Z)

Run `85d0d8e1-85b3-448c-93a5-3f4dcff93c1f` completed from
`2026-08-22T11:00:42.465Z` to `2026-08-22T11:06:35.759Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 11:07:44Z read-only boundary
showed no subsequent scheduled run. The bounded worker advanced the Oliy
Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 161 canonical documents, 167 language
variants, 10,861 distinct current provisions and 28,320 indexed chunks, with
1,514 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 126 for Russian (2,520 discovered records),
page 126 for Uzbek Cyrillic (2,520) and page 126 for Uzbek Latin (2,520);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 10:52–10:58Z)

Run `99df2470-bf20-4fae-8f9b-ac1269e65b1e` completed from
`2026-08-22T10:52:41.783Z` to `2026-08-22T10:58:29.585Z` with no run-level
error. The 10:58:32Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 160 canonical documents, 166 language
variants, 10,851 distinct current provisions and 28,285 indexed chunks, with
1,515 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 125 for Russian (2,500 discovered records),
page 125 for Uzbek Cyrillic (2,500) and page 125 for Uzbek Latin (2,500);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 10:44–10:50Z)

Run `16a5b38b-dd44-4422-bfa9-5b0c831dc774` completed from
`2026-08-22T10:44:41.784Z` to `2026-08-22T10:50:50.513Z` with no run-level
error. The 10:51:39Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 159 canonical documents, 165 language
variants, 10,825 distinct current provisions and 28,247 indexed chunks, with
1,516 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 124 for Russian (2,480 discovered records),
page 124 for Uzbek Cyrillic (2,480) and page 123 for Uzbek Latin (2,460);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 10:36–10:42Z)

Run `b922ab9d-5498-4160-bcba-4933dd9a3a5c` completed from
`2026-08-22T10:36:41.785Z` to `2026-08-22T10:42:45.690Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 10:43:37Z read-only boundary
showed no subsequent scheduled run. The bounded worker advanced the Oliy
Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 158 canonical documents, 164 language
variants, 10,789 distinct current provisions and 28,176 indexed chunks, with
1,517 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 123 for Russian (2,460 discovered records),
page 122 for Uzbek Cyrillic (2,440) and page 122 for Uzbek Latin (2,440);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 10:28–10:34Z)

Run `109d5ce8-31df-4f8c-9271-135db56a0ea7` completed from
`2026-08-22T10:28:41.784Z` to `2026-08-22T10:34:39.333Z` with no run-level
error. The 10:35:16Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 157 canonical documents, 163 language
variants, 10,779 distinct current provisions and 28,158 indexed chunks, with
1,518 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 122 for Russian (2,440 discovered records),
page 121 for Uzbek Cyrillic (2,420) and page 121 for Uzbek Latin (2,420);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 10:20–10:26Z)

Run `b0397b14-3358-434e-aa74-b48e1f0bf5c2` completed from
`2026-08-22T10:20:41.785Z` to `2026-08-22T10:26:34.666Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 10:27:23Z read-only boundary
showed no subsequent scheduled run. The bounded worker advanced the Oliy
Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 156 canonical documents, 162 language
variants, 10,735 distinct current provisions and 28,056 indexed chunks, with
1,519 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 120 for Russian (2,400 discovered records),
page 120 for Uzbek Cyrillic (2,400) and page 120 for Uzbek Latin (2,400);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 10:12–10:18Z)

Run `d00f7373-481b-4cb9-b2f8-dc1f078bf15d` completed from
`2026-08-22T10:12:42.066Z` to `2026-08-22T10:18:46.541Z` with no run-level
error. The 10:19:06Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 155 canonical documents, 161 language
variants, 10,716 distinct current provisions and 28,019 indexed chunks, with
1,520 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 119 for Russian (2,380 discovered records),
page 119 for Uzbek Cyrillic (2,380) and page 119 for Uzbek Latin (2,380);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 10:04–10:08Z)

Run `56ee5fdd-b68f-4e35-b4bb-4438d5989807` completed from
`2026-08-22T10:04:56.206Z` to `2026-08-22T10:08:58.632Z` with no run-level
error. The 10:09:26Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 154 canonical documents, 160 language
variants, 10,674 distinct current provisions and 27,890 indexed chunks, with
1,521 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 118 for Russian (2,360 discovered records),
page 118 for Uzbek Cyrillic (2,360) and page 117 for Uzbek Latin (2,340);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 09:56–10:00Z)

Run `20442fec-6806-4898-9fc9-fe810374da37` completed from
`2026-08-22T09:56:56.210Z` to `2026-08-22T10:00:57.291Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 10:01:30Z read-only boundary
showed no subsequent scheduled run. The bounded worker advanced the Oliy
Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 153 canonical documents, 159 language
variants, 10,622 distinct current provisions and 27,802 indexed chunks, with
1,522 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 116 for Russian (2,320 discovered records),
page 117 for Uzbek Cyrillic (2,340) and page 116 for Uzbek Latin (2,320);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 09:48–09:52Z)

Run `1ca644b3-2299-4386-9c91-78c43e99b815` completed from
`2026-08-22T09:48:56.208Z` to `2026-08-22T09:52:59.785Z` with no run-level
error. The 09:53:16Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 152 canonical documents, 158 language
variants, 10,612 distinct current provisions and 27,777 indexed chunks, with
1,523 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 115 for Russian (2,300 discovered records),
page 116 for Uzbek Cyrillic (2,320) and page 115 for Uzbek Latin (2,300);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 09:40–09:45Z)

Run `93039f1b-8e56-4bb3-a698-c478ab3a312f` completed from
`2026-08-22T09:40:56.276Z` to `2026-08-22T09:45:04.027Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 09:45:41Z read-only boundary
showed no subsequent scheduled run. The bounded worker advanced the Oliy
Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 151 canonical documents, 157 language
variants, 10,585 distinct current provisions and 27,740 indexed chunks, with
1,524 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 114 for Russian (2,280 discovered records),
Uzbek Cyrillic (2,280) and Uzbek Latin (2,280); English is completed at page 1
with zero catalogue records. Release floors, queue freeze, snapshot/evaluation,
Qdrant/D1 restore and CI gates remain unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 09:32–09:37Z)

Run `8e89695a-e078-41c4-817b-88878f9cf8b0` completed from
`2026-08-22T09:32:56.208Z` to `2026-08-22T09:37:01.540Z` with no run-level
error. The 09:37:41Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 150 canonical documents, 156 language
variants, 10,554 distinct current provisions and 27,593 indexed chunks, with
1,525 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 113 for Russian (2,260 discovered records),
Uzbek Cyrillic (2,260) and Uzbek Latin (2,260); English is completed at page 1
with zero catalogue records. Release floors, queue freeze, snapshot/evaluation,
Qdrant/D1 restore and CI gates remain unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 09:24–09:29Z)

Run `d48a2c07-05bf-46d3-b346-2ab31eb15560` completed from
`2026-08-22T09:24:56.206Z` to `2026-08-22T09:29:18.905Z` with no run-level
error. The 09:29:51Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 149 canonical documents, 155 language
variants, 10,529 distinct current provisions and 27,562 indexed chunks, with
1,528 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 112 for Russian (2,240 discovered records),
page 112 for Uzbek Cyrillic (2,240) and page 111 for Uzbek Latin (2,220);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 09:16–09:21Z)

Run `41d443ef-f339-44aa-aa94-d7a9886640ea` completed from
`2026-08-22T09:16:56.205Z` to `2026-08-22T09:21:05.044Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 09:22:13Z read-only boundary
showed no subsequent scheduled run. The bounded worker advanced the Oliy
Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 148 canonical documents, 154 language
variants, 10,208 distinct current provisions and 26,346 indexed chunks, with
1,529 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 111 for Russian (2,220 discovered records),
page 110 for Uzbek Cyrillic (2,200) and page 110 for Uzbek Latin (2,200);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 09:08–09:13Z)

Run `617b7f35-0403-4abb-a718-5e17dea8c27b` completed from
`2026-08-22T09:08:56.206Z` to `2026-08-22T09:13:06.292Z` with no run-level
error. The 09:13:51Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 147 canonical documents, 153 language
variants, 10,186 distinct current provisions and 26,305 indexed chunks, with
1,532 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 110 for Russian (2,200 discovered records),
page 109 for Uzbek Cyrillic (2,180) and page 109 for Uzbek Latin (2,180);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 09:00–09:05Z)

Run `e6840f4f-098b-47a5-b627-8ed06aafda9c` completed from
`2026-08-22T09:00:57.355Z` to `2026-08-22T09:05:05.738Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 09:05:06Z read-only boundary
showed no subsequent scheduled run. The bounded worker advanced the Oliy
Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 146 canonical documents, 152 language
variants, 10,140 distinct current provisions and 26,203 indexed chunks, with
1,533 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 108 for Russian (2,160 discovered records),
Uzbek Cyrillic (2,160) and Uzbek Latin (2,160); English is completed at page 1
with zero catalogue records. Release floors, queue freeze, snapshot/evaluation,
Qdrant/D1 restore and CI gates remain unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 08:52–08:57Z)

Run `eb4837c7-757b-4a6f-aae1-bfecb116c655` completed from
`2026-08-22T08:52:56.207Z` to `2026-08-22T08:57:06.525Z` with no run-level
error. The 08:58:09Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 145 canonical documents, 151 language
variants, 10,113 distinct current provisions and 26,153 indexed chunks, with
1,534 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 107 for Russian (2,140 discovered records),
Uzbek Cyrillic (2,140) and Uzbek Latin (2,140); English is completed at page 1
with zero catalogue records. Release floors, queue freeze, snapshot/evaluation,
Qdrant/D1 restore and CI gates remain unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 08:44–08:49Z)

Run `e252ef0c-9b2c-4eb3-8bd0-841a0672bc93` completed from
`2026-08-22T08:44:56.204Z` to `2026-08-22T08:49:08.169Z` with no run-level
error. The 08:49:55Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 144 canonical documents, 150 language
variants, 10,051 distinct current provisions and 26,043 indexed chunks, with
1,535 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 106 for Russian (2,120 discovered records),
page 106 for Uzbek Cyrillic (2,120) and page 105 for Uzbek Latin (2,100);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 08:36–08:41Z)

Run `857afe66-7685-41c3-8280-f79f266dcfc6` completed from
`2026-08-22T08:36:56.257Z` to `2026-08-22T08:41:04.444Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 08:41:48Z read-only boundary
showed no subsequent scheduled run. The bounded worker advanced the Oliy
Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 143 canonical documents, 149 language
variants, 9,828 distinct current provisions and 25,773 indexed chunks, with
1,536 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 104 for Russian (2,080 discovered records),
page 105 for Uzbek Cyrillic (2,100) and page 104 for Uzbek Latin (2,080);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 08:28–08:33Z)

Run `b5e0f6f9-c543-43fe-a4f8-9b10b4e125c7` completed from
`2026-08-22T08:28:56.204Z` to `2026-08-22T08:33:09.602Z` with no run-level
error. The 08:33:30Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 142 canonical documents, 148 language
variants, 9,788 distinct current provisions and 25,724 indexed chunks, with
1,539 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 103 for Russian (2,060 discovered records),
page 104 for Uzbek Cyrillic (2,080) and page 103 for Uzbek Latin (2,060);
English is completed at page 1 with zero catalogue records. Release floors,
queue freeze, snapshot/evaluation, Qdrant/D1 restore and CI gates remain
unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 08:20–08:25Z)

Run `9d99fc99-9705-45af-9d38-8080a2b7a0cb` completed from
`2026-08-22T08:20:56.274Z` to `2026-08-22T08:25:06.094Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 08:25:41Z read-only boundary
showed no subsequent scheduled run. The bounded worker advanced the Oliy
Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 141 canonical documents, 147 language
variants, 9,756 distinct current provisions and 25,658 indexed chunks, with
1,540 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 102 for Russian (2,040 discovered records),
Uzbek Cyrillic (2,040) and Uzbek Latin (2,040); English is completed at page 1
with zero catalogue records. Release floors, queue freeze, snapshot/evaluation,
Qdrant/D1 restore and CI gates remain unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 08:12–08:17Z)

Run `56b59cee-5e1c-4370-ba81-e139cc6f4f3f` completed from
`2026-08-22T08:12:56.207Z` to `2026-08-22T08:17:07.673Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The 08:17:38Z read-only boundary
showed no subsequent scheduled run. The bounded worker advanced the Oliy
Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 140 canonical documents, 146 language
variants, 9,683 distinct current provisions and 25,557 indexed chunks, with
1,543 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 101 for Russian (2,020 discovered records),
Uzbek Cyrillic (2,020) and Uzbek Latin (2,020); English is completed at page 1
with zero catalogue records. Release floors, queue freeze, snapshot/evaluation,
Qdrant/D1 restore and CI gates remain unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 08:04–08:09Z)

Run `bd9262c3-1e5a-47cf-ab49-bb5c3de14052` completed from
`2026-08-22T08:04:56.207Z` to `2026-08-22T08:09:08.071Z` with no run-level
error. The 08:09:11Z read-only boundary showed no subsequent scheduled run.
The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 139 canonical documents, 145 language
variants, 9,652 distinct current provisions and 25,488 indexed chunks, with
1,544 live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis is queued at page 100 for Russian (2,000 discovered records),
Uzbek Cyrillic (2,000) and Uzbek Latin (2,000); English is completed at page 1
with zero catalogue records. Release floors, queue freeze, snapshot/evaluation,
Qdrant/D1 restore and CI gates remain unproven; production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 07:56–08:01Z)

Run `6ab4206d-95ce-4246-85fa-09f196895bef` completed from
`2026-08-22T07:56:56.208Z` to `2026-08-22T08:01:07.065Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. No subsequent scheduled run was
present at the 08:01:49Z read-only boundary. The bounded worker advanced the
Oliy Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 138 canonical documents, 144 language variants,
9,577 distinct current provisions and 25,300 indexed chunks, with 1,548
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis remains queued for Russian page 99 (1,980 discovered records),
Uzbek Cyrillic page 98 (1,960) and Uzbek Latin page 99 (1,980); English is
completed at page 1 with zero catalogue records. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 07:48–07:53Z)

Run `28d577f0-cfb9-4d27-a43f-5fce776e221a` completed from
`2026-08-22T07:48:56.207Z` to `2026-08-22T07:53:10.377Z` with no run-level
error. No subsequent scheduled run was present at the 07:53:50Z read-only
boundary. The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 137 canonical documents, 143 language variants,
9,568 distinct current provisions and 25,286 indexed chunks, with 1,552
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis remains queued for Russian page 98 (1,960 discovered records),
Uzbek Cyrillic page 97 (1,940) and Uzbek Latin page 98 (1,960); English is
completed at page 1 with zero catalogue records. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 07:40–07:45Z)

Run `d05c9dcd-3e11-45e2-a4e2-09060cfa0907` completed from
`2026-08-22T07:40:56.271Z` to `2026-08-22T07:45:06.468Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. No subsequent scheduled run was
present at the 07:46:13Z read-only boundary. The bounded worker advanced the
Oliy Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 136 canonical documents, 142 language variants,
9,400 distinct current provisions and 25,090 indexed chunks, with 1,556
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis remains queued for Russian page 96 (1,920 discovered records),
Uzbek Cyrillic page 96 (1,920) and Uzbek Latin page 97 (1,940); English is
completed at page 1 with zero catalogue records. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 07:32–07:37Z)

Run `a66915f2-604a-4748-8e1f-5b48640a9ffd` completed from
`2026-08-22T07:32:56.208Z` to `2026-08-22T07:37:09.673Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. No subsequent scheduled run was
present at the 07:37:55Z read-only boundary. The bounded worker advanced the
Oliy Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 135 canonical documents, 141 language variants,
9,391 distinct current provisions and 25,079 indexed chunks, with 1,560
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis remains queued for Russian page 95 (1,900 discovered records),
Uzbek Cyrillic page 95 (1,900) and Uzbek Latin page 96 (1,920); English is
completed at page 1 with zero catalogue records. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 07:24–07:29Z)

Run `6f99cffc-850b-472a-b1e9-269c66ea600b` completed from
`2026-08-22T07:24:56.207Z` to `2026-08-22T07:29:08.080Z` with no run-level
error. No subsequent scheduled run was present at the 07:30:02Z read-only
boundary. The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 134 canonical documents, 140 language variants,
9,327 distinct current provisions and 24,838 indexed chunks, with 1,564
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis remains queued for Russian page 94 (1,880 discovered records),
Uzbek Cyrillic page 94 (1,880) and Uzbek Latin page 95 (1,900); English is
completed at page 1 with zero catalogue records. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 07:16–07:21Z)

Run `4c014bd5-b4d8-4df7-bb4a-5b9af0b94db0` completed from
`2026-08-22T07:16:56.204Z` to `2026-08-22T07:21:09.665Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. No subsequent scheduled run was
present at the 07:21:43Z read-only boundary. The bounded worker advanced the
Oliy Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 133 canonical documents, 139 language variants,
9,308 distinct current provisions and 24,803 indexed chunks, with 1,567
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis remains queued for Russian page 93 (1,860 discovered records),
Uzbek Cyrillic page 93 (1,860) and Uzbek Latin page 93 (1,860); English is
completed at page 1 with zero catalogue records. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 07:08–07:13Z)

Run `68eafbf3-c4bd-4b89-8a36-1b7b1f27aa9f` completed from
`2026-08-22T07:08:56.206Z` to `2026-08-22T07:13:07.760Z` with no run-level
error. No subsequent scheduled run was present at the 07:13:48Z read-only
boundary. The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 132 canonical documents, 138 language variants,
9,286 distinct current provisions and 24,755 indexed chunks, with 1,571
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis remains queued for Russian page 92 (1,840 discovered records),
Uzbek Cyrillic page 92 (1,840) and Uzbek Latin page 92 (1,840); English is
completed at page 1 with zero catalogue records. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 07:00–07:05Z)

Run `b22e44f1-64be-416f-bdc6-558b75bbe91c` completed from
`2026-08-22T07:00:56.662Z` to `2026-08-22T07:05:12.260Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. No subsequent scheduled run was
present at the 07:05:27Z read-only boundary. The bounded worker advanced the
Oliy Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 131 canonical documents, 137 language variants,
9,279 distinct current provisions and 24,743 indexed chunks, with 1,575
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis remains queued for Russian page 90 (1,800 discovered records),
Uzbek Cyrillic page 91 (1,820) and Uzbek Latin page 91 (1,820); English is
completed at page 1 with zero catalogue records. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 06:52–06:57Z)

Run `08b42580-2779-4da7-828d-05155033f17c` completed from
`2026-08-22T06:52:56.255Z` to `2026-08-22T06:57:12.404Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. No subsequent scheduled run was
present at the 06:57:45Z read-only boundary. The bounded worker advanced the
Oliy Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 130 canonical documents, 136 language variants,
9,216 distinct current provisions and 24,649 indexed chunks, with 1,579
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis remains queued for Russian page 89 (1,780 discovered records),
Uzbek Cyrillic page 90 (1,800) and Uzbek Latin page 90 (1,800); English is
completed at page 1 with zero catalogue records. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 06:44–06:49Z)

Run `dcddf710-1cbc-49ab-ae5e-3067b67dbb2a` completed from
`2026-08-22T06:44:56.205Z` to `2026-08-22T06:49:12.059Z` with no run-level
error. No subsequent scheduled run was present at the 06:50:04Z read-only
boundary. The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 129 canonical documents, 135 language variants,
9,193 distinct current provisions and 24,614 indexed chunks, with 1,583
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis remains queued for Russian page 88 (1,760 discovered records),
Uzbek Cyrillic page 89 (1,780) and Uzbek Latin page 89 (1,780); English is
completed at page 1 with zero catalogue records. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 06:36–06:41Z)

Run `8589b457-3aa9-487a-9de7-6035a9491e38` completed from
`2026-08-22T06:36:56.207Z` to `2026-08-22T06:41:12.308Z` with no run-level
error. No subsequent scheduled run was present at the 06:41:33Z read-only
boundary. The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 128 canonical documents, 134 language variants,
9,060 distinct current provisions and 24,450 indexed chunks, with 1,587
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis remains queued for Russian page 87 (1,740 discovered records),
Uzbek Cyrillic page 88 (1,760) and Uzbek Latin page 87 (1,740); English is
completed at page 1 with zero catalogue records. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 06:28–06:33Z)

Run `c9c490dd-9b71-4bf7-9310-dcf74398ac26` completed from
`2026-08-22T06:28:56.207Z` to `2026-08-22T06:33:11.628Z` with no run-level
error. No subsequent scheduled run was present at the 06:34:08Z read-only
boundary. The bounded worker advanced the Oliy Majlis catalogue ledger without
force-completing any checkpoint.

The final read-only totals are 127 canonical documents, 133 language variants,
9,007 distinct current provisions and 24,336 indexed chunks, with 1,591
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis remains queued for Russian page 86 (1,720 discovered records),
Uzbek Cyrillic page 86 (1,720) and Uzbek Latin page 86 (1,720); English is
completed at page 1 with zero catalogue records. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 06:20–06:25Z)

Run `3264e343-8b86-4f91-8fe5-8ab45b8ce5ad` completed from
`2026-08-22T06:20:56.210Z` to `2026-08-22T06:25:15.060Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. No subsequent scheduled run was
present at the 06:25:31Z read-only boundary. The bounded worker advanced the
Oliy Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 126 canonical documents, 132 language variants,
9,002 distinct current provisions and 24,330 indexed chunks, with 1,594
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis remains queued for Russian page 84 (1,680 discovered records),
Uzbek Cyrillic page 85 (1,700) and Uzbek Latin page 85 (1,700); English is
completed at page 1 with zero catalogue records. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 06:12–06:17Z)

Run `82aa61d1-f011-4a2a-a9aa-2ae23d0ae02b` completed from
`2026-08-22T06:12:56.206Z` to `2026-08-22T06:17:12.403Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. No subsequent scheduled run was
present at the 06:17:36Z read-only boundary. The bounded worker advanced the
Oliy Majlis catalogue ledger without force-completing any checkpoint.

The final read-only totals are 125 canonical documents, 131 language variants,
8,959 distinct current provisions and 24,131 indexed chunks, with 1,598
live-or-manual queued/retrying jobs. The checkpoint ledger remains 13
completed and 31 queued. The failure ledger remains two retrying
`LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis remains queued for Russian page 83 (1,660 discovered records),
Uzbek Cyrillic page 84 (1,680) and Uzbek Latin page 84 (1,680); English is
completed at page 1 with zero catalogue records. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

## Oliy Majlis bounded run closure (2026-08-22, 02:12–02:21Z; sequential pair)

Runs `3884c93d-7d5e-4802-8aa8-cbe2c7b272fc` and
`17a67950-497a-4b87-bd04-3222e6bb90db` executed sequentially with no overlap:
the first completed from `2026-08-22T02:12:56.206Z` to
`2026-08-22T02:16:55.048Z`, and the second completed from
`2026-08-22T02:16:56.204Z` to `2026-08-22T02:21:05.568Z`. Both completed with
no run-level error. The bounded worker advanced the non-empty Oliy Majlis
catalogues without force-completing checkpoints; after the second run, `ru`
and `uz-Cyrl` were at page 39 with 780 discovered documents each, and
`uz-Latn` was at page 38 with 760 discovered documents. The empty `en`
checkpoint remains completed with zero discovered documents; the three
non-empty language checkpoints remain queued for their next bounded
continuation.

The final read-only totals below were measured after the second run (the
intermediate per-run totals were not used): 87 canonical documents, 93
language variants, 7,794 current unique provisions, 21,384 indexed chunks,
and 1,756 queued or retrying non-catalogue ingestion jobs. The checkpoint
ledger remained 13 completed and 31 queued. The failure ledger remained 2
retrying `LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 05:56–06:01Z)

Run `2e27e5bd-bdf9-4b6a-a8a5-c4c69beb159e` completed from
`2026-08-22T05:56:56.208Z` to `2026-08-22T06:01:09.678Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. No subsequent scheduled run was
present at the read-only boundary. The bounded worker left `ru` and
`uz-Latn` queued at page 81 (1,620 discovered), `uz-Cyrl` queued at page 82
(1,640 discovered), and the empty `en` checkpoint remained completed with
zero discovered documents.

Final read-only totals were 123 canonical documents, 129 language variants,
8,844 current unique provisions, 23,851 indexed chunks, and 1,606 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger was 13 completed
and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 05:48–05:53Z)

Run `fe2bd4c3-5f45-4d06-a1f4-e81e1b15e469` completed from
`2026-08-22T05:48:56.207Z` to `2026-08-22T05:53:10.778Z` with no run-level
error. No subsequent scheduled run was present at the read-only boundary. The
bounded worker left `ru` and `uz-Latn` queued at page 80 (1,600 discovered),
`uz-Cyrl` queued at page 81 (1,620 discovered), and the empty `en` checkpoint
remained completed with zero discovered documents.

Final read-only totals were 122 canonical documents, 128 language variants,
8,802 current unique provisions, 23,741 indexed chunks, and 1,610 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger was 13 completed
and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 05:40–05:45Z)

Run `45c7d0a0-c8b4-4e48-a079-0c6e7fe5f5d6` completed from
`2026-08-22T05:40:56.268Z` to `2026-08-22T05:45:08.827Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. No subsequent scheduled run was
present at the read-only boundary. The bounded worker left `ru`, `uz-Cyrl`,
and `uz-Latn` queued at page 79 (1,580 discovered each); the empty `en`
checkpoint remained completed with zero discovered documents.

Final read-only totals were 121 canonical documents, 127 language variants,
8,771 current unique provisions, 23,690 indexed chunks, and 1,614 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger was 13 completed
and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 05:32–05:37Z)

Run `aae02203-9e85-4f11-853c-8b5131b4c8df` completed from
`2026-08-22T05:32:56.208Z` to `2026-08-22T05:37:10.947Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. No subsequent scheduled run was
present at the read-only boundary. The bounded worker left `ru`, `uz-Cyrl`,
and `uz-Latn` queued at page 78 (1,560 discovered each); the empty `en`
checkpoint remained completed with zero discovered documents.

Final read-only totals were 120 canonical documents, 126 language variants,
8,765 current unique provisions, 23,684 indexed chunks, and 1,618 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger was 13 completed
and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 05:24–05:29Z)

Run `6177c184-ebbe-4e04-9897-756ce9929494` completed from
`2026-08-22T05:24:56.207Z` to `2026-08-22T05:29:09.872Z` with no run-level
error. No subsequent scheduled run was present at the read-only boundary. The
bounded worker left `ru`, `uz-Cyrl`, and `uz-Latn` queued at page 77 (1,540
discovered each); the empty `en` checkpoint remained completed with zero
discovered documents.

Final read-only totals were 119 canonical documents, 125 language variants,
8,680 current unique provisions, 23,569 indexed chunks, and 1,622 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger was 13 completed
and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 05:16–05:21Z)

Run `329e4076-0c77-4b13-ad5b-0a5e1f32711e` completed from
`2026-08-22T05:16:56.205Z` to `2026-08-22T05:21:10.458Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. No subsequent scheduled run was
present at the read-only boundary. The bounded worker left `ru` queued at
page 76 (1,520 discovered), `uz-Cyrl` queued at page 75 (1,500 discovered),
and `uz-Latn` queued at page 76 (1,520 discovered); the empty `en` checkpoint
remained completed with zero discovered documents.

Final read-only totals were 118 canonical documents, 124 language variants,
8,631 current unique provisions, 23,463 indexed chunks, and 1,626 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger was 13 completed
and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 05:08–05:13Z)

Run `5fca1a22-7dd6-44e7-963c-d26af7fe0e50` completed from
`2026-08-22T05:08:56.256Z` to `2026-08-22T05:13:10.195Z` with no run-level
error. No subsequent scheduled run was present at the read-only boundary. The
bounded worker left `ru` queued at page 75 (1,500 discovered),
`uz-Cyrl` queued at page 74 (1,480 discovered), and `uz-Latn` queued at page
75 (1,500 discovered); the empty `en` checkpoint remained completed with zero
discovered documents.

Final read-only totals were 117 canonical documents, 123 language variants,
8,612 current unique provisions, 23,435 indexed chunks, and 1,630 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger was 13 completed
and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 05:00–05:05Z)

Run `60dc8648-d784-4da8-908e-3d150472d775` completed from
`2026-08-22T05:00:56.365Z` to `2026-08-22T05:05:12.538Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. No subsequent scheduled run was
present at the read-only boundary. The bounded worker left `ru` queued at
page 74 (1,480 discovered), and `uz-Cyrl`/`uz-Latn` queued at page 73 (1,460
discovered each); the empty `en` checkpoint remained completed with zero
discovered documents.

Final read-only totals were 116 canonical documents, 122 language variants,
8,586 current unique provisions, 23,402 indexed chunks, and 1,634 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger was 13 completed
and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 04:52–04:57Z)

Run `3b494e58-c0c9-411e-a87b-83049714ddfb` completed from
`2026-08-22T04:52:56.205Z` to `2026-08-22T04:57:13.482Z` with no run-level
error. No subsequent scheduled run was present at the read-only boundary. The
bounded worker left `ru` queued at page 73 (1,460 discovered), and
`uz-Cyrl`/`uz-Latn` queued at page 72 (1,440 discovered each); the empty `en`
checkpoint remained completed with zero discovered documents.

Final read-only totals were 115 canonical documents, 121 language variants,
8,560 current unique provisions, 23,300 indexed chunks, and 1,638 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger was 13 completed
and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 04:44–04:49Z)

Run `080f5e49-3cc7-4df8-a8c5-5138869b8cbf` completed from
`2026-08-22T04:44:56.207Z` to `2026-08-22T04:49:13.024Z` with no run-level
error. No subsequent scheduled run was present at the read-only boundary. The
bounded worker left `ru`, `uz-Cyrl`, and `uz-Latn` queued at page 71 (1,420
discovered each), while the empty `en` checkpoint remained completed with zero
discovered documents.

Final read-only totals were 114 canonical documents, 120 language variants,
8,524 current unique provisions, 23,228 indexed chunks, and 1,642 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger was 13 completed
and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 04:36–04:41Z)

Run `b1eff47b-54ff-44b6-a053-bdca0d66ea64` completed from
`2026-08-22T04:36:56.209Z` to `2026-08-22T04:41:10.884Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. No subsequent scheduled run was
present at the read-only boundary. The bounded worker left `ru` and
`uz-Cyrl` queued at page 70 (1,400 discovered each), `uz-Latn` queued at page
69 (1,380 discovered), and the empty `en` checkpoint completed with zero
discovered documents.

Final read-only totals were 113 canonical documents, 119 language variants,
8,486 current unique provisions, 22,948 indexed chunks, and 1,646 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger was 13 completed
and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 04:28–04:33Z)

Run `7d3023d9-3d6c-4064-92d6-97a95a504b21` completed from
`2026-08-22T04:28:56.206Z` to `2026-08-22T04:33:11.270Z` with no run-level
error. No subsequent scheduled run was present at the read-only boundary. The
bounded worker left `ru` and `uz-Cyrl` queued at page 69 (1,380 discovered
each), `uz-Latn` queued at page 68 (1,360 discovered), and the empty `en`
checkpoint completed with zero discovered documents.

Final read-only totals were 112 canonical documents, 118 language variants,
8,456 current unique provisions, 22,881 indexed chunks, and 1,650 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger was 13 completed
and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run boundary (2026-08-22, 04:20–04:30Z)

Run `581864df-f6bb-47ad-9f8b-793780de2af1` completed from
`2026-08-22T04:20:56.257Z` to `2026-08-22T04:25:24.882Z` with no run-level
error. The preceding sequential run `a3141eba-4fcc-414b-8cc3-1208e3d162ba`
completed with the allow-listed retryable `LEX_CATALOG_TIMEOUT`; the next
sequential run `7d3023d9-3d6c-4064-92d6-97a95a504b21` started at
`2026-08-22T04:28:56.206Z` and was still running while the post-run checks
were collected. At the boundary, `ru` and `uz-Cyrl` were queued at page 68
(1,360 discovered each), `uz-Latn` was running at page 67 (1,340 discovered),
and the empty `en` checkpoint remained completed with zero discovered
documents.

These are current materialized boundary values and are not attributed solely
to the completed run: 111 canonical documents, 117 language variants, 8,443
current unique provisions, 22,854 indexed chunks, and 1,654 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger was 13 completed,
30 queued and 1 running. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven; snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run boundary (2026-08-22, 04:12–04:17Z)

Run `c032a947-2070-43f9-ba25-6bb6fd92f467` completed from
`2026-08-22T04:12:56.206Z` to `2026-08-22T04:16:48.232Z` with no run-level
error. The next sequential run `a3141eba-4fcc-414b-8cc3-1208e3d162ba`
started at `2026-08-22T04:16:56.206Z` and was still running while the
post-run read-only checks were collected. At the boundary, `ru` and
`uz-Cyrl` were queued at page 65 (1,300 discovered each), `uz-Latn` was
running at page 65 (1,300 discovered), and the empty `en` checkpoint remained
completed with zero discovered documents.

Boundary read-only totals were 109 canonical documents, 115 language
variants, 8,417 current unique provisions, 22,779 indexed chunks, and 1,663
queued or retrying non-catalogue ingestion jobs. The checkpoint ledger was 13
completed, 30 queued and 1 running. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven; snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run boundary (2026-08-22, 04:08–04:13Z)

Run `689d6f83-6299-4f06-9db6-0efc0f93b964` completed from
`2026-08-22T04:08:56.205Z` to `2026-08-22T04:12:42.140Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The next sequential run
`c032a947-2070-43f9-ba25-6bb6fd92f467` started at
`2026-08-22T04:12:56.206Z` and was active while the post-run checks were
collected. At the boundary, `ru` was queued at page 65 (1,300 discovered),
`uz-Cyrl` was running at page 64 (1,280 discovered), and `uz-Latn` was queued
at page 65 (1,300 discovered). The empty `en` checkpoint remained completed
with zero discovered documents.

Boundary read-only totals were 108 canonical documents, 114 language
variants, 8,413 current unique provisions, 22,773 indexed chunks, and 1,668
queued or retrying non-catalogue ingestion jobs. The checkpoint ledger was 13
completed, 30 queued and 1 running. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven; snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run boundary (2026-08-22, 04:04–04:09Z)

Run `e33cc261-dcb0-4ccf-b443-515edfbf04e0` completed from
`2026-08-22T04:04:56.212Z` to `2026-08-22T04:08:49.068Z` with no run-level
error. The next sequential run `689d6f83-6299-4f06-9db6-0efc0f93b964`
started at `2026-08-22T04:08:56.205Z` and was active while the post-run
read-only checks were collected. At the boundary, `ru` was running at page 63
(1,260 discovered), `uz-Cyrl` was retrying at page 62 (1,240 discovered) with
the allow-listed `LEX_CATALOG_TIMEOUT` marker, and `uz-Latn` was queued at
page 64 (1,280 discovered). The empty `en` checkpoint remained completed with
zero discovered documents.

Boundary read-only totals were 107 canonical documents, 113 language
variants, 8,380 current unique provisions, 22,664 indexed chunks, and 1,672
queued or retrying non-catalogue ingestion jobs. The checkpoint ledger was 13
completed, 29 queued, 1 retrying and 1 running. The failure ledger remained 2
retrying `LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven; snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 04:00–04:05Z)

Run `3bff8243-07cb-484c-baf7-91eff9d9b390` completed from
`2026-08-22T04:00:56.461Z` to `2026-08-22T04:04:46.430Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The bounded worker advanced the
non-empty Oliy Majlis catalogues without force-completing checkpoints: `ru`
reached page 63 (1,260 discovered), `uz-Cyrl` reached page 62 (1,240
discovered), and `uz-Latn` reached page 63 (1,260 discovered). The empty
`en` checkpoint remains completed with zero discovered documents. The next
sequential run `e33cc261-dcb0-4ccf-b443-515edfbf04e0` started at
`2026-08-22T04:04:56.212Z` and was active while the post-run read-only checks
were collected.

Final read-only totals were 106 canonical documents, 112 language variants,
8,375 current unique provisions, 22,657 indexed chunks, and 1,677 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger was 13 completed,
30 queued and 1 running. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run boundary (2026-08-22, 03:56–04:01Z)

Run `9e74b644-1506-4fab-bb6f-24621a7577b9` completed from
`2026-08-22T03:56:56.205Z` to `2026-08-22T04:00:52.859Z` with no run-level
error. The next sequential run `3bff8243-07cb-484c-baf7-91eff9d9b390`
started at `2026-08-22T04:00:56.461Z` and was still running at the
read-only boundary (`2026-08-22T04:01:43Z`), so the totals below are current
materialized boundary values and are not attributed solely to the completed
run. At that boundary, `ru` was queued at page 61 (1,220 discovered),
`uz-Cyrl` was running at page 60 (1,200 discovered) with the allow-listed
`LEX_CATALOG_TIMEOUT` marker, and `uz-Latn` was queued at page 62 (1,240
discovered). The empty `en` checkpoint remained completed with zero discovered
documents.

Boundary read-only totals were 105 canonical documents, 111 language
variants, 8,363 current unique provisions, 22,634 indexed chunks, and 1,681
queued or retrying non-catalogue ingestion jobs. The checkpoint ledger was 13
completed, 29 queued, 1 retrying and 1 running. The failure ledger remained 2
retrying `LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven; snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 03:52–03:57Z)

Run `c3d858b3-a659-415f-a963-5dc67f5d98b9` completed from
`2026-08-22T03:52:56.205Z` to `2026-08-22T03:56:48.874Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The bounded worker advanced the
non-empty Oliy Majlis catalogues without force-completing checkpoints: `ru`
was running at page 59 (1,180 discovered), while `uz-Cyrl` and `uz-Latn` were
queued at page 60 (1,200 discovered each). The empty `en` checkpoint remains
completed with zero discovered documents.

Final read-only totals measured after the run were 104 canonical documents,
110 language variants, 8,273 current unique provisions, 22,516 indexed
chunks, and 1,686 queued or retrying non-catalogue ingestion jobs. The
checkpoint ledger was 13 completed, 30 queued and 1 running. The failure
ledger remained 2 retrying `LEGAL_CORPUS_INGESTION_FAILED` rows plus 3
retrying `LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows
remained zero. Release thresholds and queue-freeze remain unproven, so
snapshot, evaluation, Qdrant/D1 restore gates and CI are still blocked.
Production flags, corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run boundary (2026-08-22, 03:48–03:53Z)

Run `2fa1f9ba-de5b-4eba-ade2-73ee28841918` completed from
`2026-08-22T03:48:56.207Z` to `2026-08-22T03:52:55.554Z` with no run-level
error. The next sequential run `c3d858b3-a659-415f-a963-5dc67f5d98b9`
started at `2026-08-22T03:52:56.205Z` and was still running at the
read-only boundary (`2026-08-22T03:53:52Z`), so the totals below are current
materialized boundary values and are not attributed solely to the completed
run. At that boundary, `ru` was running at page 58 (1,160 discovered) with
the allow-listed `LEX_CATALOG_TIMEOUT` marker; `uz-Cyrl` and `uz-Latn` were
queued at page 59 (1,180 discovered each), and the empty `en` checkpoint
remained completed with zero discovered documents.

Boundary read-only totals were 103 canonical documents, 109 language
variants, 8,238 current unique provisions, 22,449 indexed chunks, and 1,690
queued or retrying non-catalogue ingestion jobs. The checkpoint ledger was 13
completed, 29 queued, 1 retrying and 1 running. The failure ledger remained 2
retrying `LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven; snapshot,
evaluation, Qdrant/D1 restore gates and CI remain blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 03:28–03:33Z)

Run `db04d535-f962-4c15-9fff-f2316a28774e` completed from
`2026-08-22T03:28:56.205Z` to `2026-08-22T03:33:04.741Z` with no run-level
error. The bounded worker advanced the non-empty Oliy Majlis catalogues
without force-completing checkpoints: `ru` reached page 54 (1,080
discovered), while `uz-Cyrl` and `uz-Latn` each reached page 53 (1,060
discovered). The empty `en` checkpoint remains completed with zero discovered
documents; the three non-empty language checkpoints remain queued for their
next bounded continuation.

Final read-only totals were 99 canonical documents, 105 language variants,
8,067 current unique provisions, 22,031 indexed chunks, and 1,704 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 03:04–03:25Z; sequential chain)

The worker completed five sequential invocations under the distributed lease:
`05c97300-c61d-41e5-b504-db4eadce6989` (03:04:56.206–03:08:47.375Z,
no run-level error), `ddf5b5ed-9b11-4d2e-8d64-0c990d281dcd`
(03:08:56.206–03:12:53.540Z, no run-level error),
`7f79ce49-5d8e-4568-af03-5d02dda14b12` (03:12:56.209–03:16:48.922Z,
allow-listed retryable `LEX_CATALOG_TIMEOUT`),
`2e408e6f-91a3-4719-b991-e9ddd48c7304`
(03:16:56.204–03:20:54.794Z, no run-level error), and
`81d3dbb4-ffaa-416b-9bb3-68edd8e9007f`
(03:20:56.210–03:25:10.545Z, allow-listed retryable
`LEX_CATALOG_TIMEOUT`). The bounded worker advanced the non-empty Oliy
Majlis catalogues without force-completing checkpoints: `ru`, `uz-Cyrl`, and
`uz-Latn` each reached page 52 (1,040 discovered). The empty `en` checkpoint
remains completed with zero discovered documents; the three non-empty language
checkpoints remain queued for their next bounded continuation.

Final read-only totals measured after the chain were 98 canonical documents,
104 language variants, 8,066 current unique provisions, 22,024 indexed
chunks, and 1,708 queued or retrying non-catalogue ingestion jobs. The
checkpoint ledger remained 13 completed and 31 queued. The failure ledger
remained 2 retrying `LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 02:56–03:01Z)

Run `09f9c968-cd44-426a-9ef4-ae27633ea696` completed from
`2026-08-22T02:56:56.205Z` to `2026-08-22T03:01:06.788Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`. The bounded worker advanced the
non-empty Oliy Majlis catalogues without force-completing checkpoints: `ru`,
`uz-Cyrl`, and `uz-Latn` each reached page 46 (920 discovered). The empty
`en` checkpoint remains completed with zero discovered documents; the three
non-empty language checkpoints remain queued for their next bounded
continuation.

Final read-only totals were 93 canonical documents, 99 language variants,
7,906 current unique provisions, 21,729 indexed chunks, and 1,730 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 02:44–02:52Z; sequential pair)

Runs `2fa185ec-93a5-4123-8b7f-b0c394453e02` and
`edfb94fd-9218-4ee0-8c50-0639360d89cd` executed sequentially under the
distributed lease. The first completed from `2026-08-22T02:44:56.208Z` to
`2026-08-22T02:48:47.445Z`, and the second completed from
`2026-08-22T02:48:56.206Z` to `2026-08-22T02:52:58.785Z`; both had no run-level
error. The bounded worker advanced the non-empty Oliy Majlis catalogues
without force-completing checkpoints: `ru`, `uz-Cyrl`, and `uz-Latn` each
reached page 45 (900 discovered). The empty `en` checkpoint remains completed
with zero discovered documents; the three non-empty language checkpoints
remain queued for their next bounded continuation.

Final read-only totals were 92 canonical documents, 98 language variants,
7,905 current unique provisions, 21,701 indexed chunks, and 1,734 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 02:32–02:41Z; sequential pair)

Runs `4c2b263b-3a97-48e7-819d-8c41aedbe7c7` and
`8868d9a1-6c76-47b1-8df1-5d21cf917f72` executed sequentially under the
distributed lease. The first completed from `2026-08-22T02:32:56.206Z` to
`2026-08-22T02:36:51.140Z` with the allow-listed retryable
`LEX_CATALOG_TIMEOUT`; the second completed from `2026-08-22T02:36:56.206Z`
to `2026-08-22T02:41:01.096Z` with no run-level error. The bounded worker
advanced the non-empty Oliy Majlis catalogues without force-completing
checkpoints: `ru` reached page 42 (840 discovered), `uz-Cyrl` reached page 43
(860 discovered), and `uz-Latn` reached page 42 (840 discovered). The empty
`en` checkpoint remains completed with zero discovered documents; the three
non-empty language checkpoints remain queued for their next bounded
continuation.

Final read-only totals were 90 canonical documents, 96 language variants,
7,849 current unique provisions, 21,585 indexed chunks, and 1,743 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 02:24–02:29Z)

Run `ae950196-61b4-4fe7-a1b2-320274b348a7` completed normally from
`2026-08-22T02:24:56.205Z` to `2026-08-22T02:29:13.184Z` with no run-level
error. The bounded sequential worker advanced all three non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru`, `uz-Cyrl`, and
`uz-Latn` each reached page 40 with 800 discovered documents. The empty `en`
checkpoint remains completed with zero discovered documents; the three
non-empty language checkpoints remain queued for their next bounded
continuation.

Final read-only totals were 88 canonical documents, 94 language variants,
7,795 current unique provisions, 21,392 indexed chunks, and 1,752 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 02:04–02:08Z)

Run `9c80d98c-6b85-42e9-bae2-16fbe92baf5e` completed normally from
`2026-08-22T02:04:56.206Z` to `2026-08-22T02:08:56.587Z` with no run-level
error. The bounded sequential worker advanced all three non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru`, `uz-Cyrl`, and
`uz-Latn` each reached page 36 with 720 discovered documents. The empty `en`
checkpoint remains completed with zero discovered documents; the three
non-empty language checkpoints remain queued for their next bounded
continuation.

Final read-only totals were 85 canonical documents, 91 language variants,
7,740 current unique provisions, 21,300 indexed chunks, and 1,765 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 01:56–02:00Z)

Run `18946d47-c5a1-43ca-8980-24241f208157` completed from
`2026-08-22T01:56:56.205Z` to `2026-08-22T02:00:58.488Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`; no terminal run failure was
recorded. The bounded sequential worker advanced the non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru` and `uz-Cyrl` each
reached page 35 with 700 discovered documents, while `uz-Latn` reached page 34
with 680 discovered documents. The empty `en` checkpoint remains completed
with zero discovered documents; the three non-empty language checkpoints
remain queued for their next bounded continuation.

Final read-only totals were 84 canonical documents, 90 language variants,
7,729 current unique provisions, 21,288 indexed chunks, and 1,769 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 01:48–01:52Z)

Run `9d7e049d-46ea-4632-8e32-4649b4bdedfa` completed normally from
`2026-08-22T01:48:56.209Z` to `2026-08-22T01:52:57.270Z` with no run-level
error. The bounded sequential worker advanced the non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru` and `uz-Cyrl` each
reached page 34 with 680 discovered documents, while `uz-Latn` reached page 33
with 660 discovered documents. The empty `en` checkpoint remains completed
with zero discovered documents; the three non-empty language checkpoints
remain queued for their next bounded continuation.

Final read-only totals were 83 canonical documents, 89 language variants,
7,702 current unique provisions, 21,238 indexed chunks, and 1,773 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 01:40–01:44Z)

Run `95fbbbb5-8f5d-4857-b55f-5ae4abbcc110` completed from
`2026-08-22T01:40:56.268Z` to `2026-08-22T01:44:57.280Z` with the
allow-listed retryable `LEX_CATALOG_TIMEOUT`; no terminal run failure was
recorded. The bounded sequential worker advanced the non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru` reached page 33 with
660 discovered documents, while `uz-Cyrl` and `uz-Latn` each reached page 32
with 640 discovered documents. The empty `en` checkpoint remains completed
with zero discovered documents; the three non-empty language checkpoints
remain queued for their next bounded continuation.

Final read-only totals were 82 canonical documents, 88 language variants,
7,685 current unique provisions, 21,197 indexed chunks, and 1,777 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

## Oliy Majlis bounded run closure (2026-08-22, 01:32–01:36Z)

Run `3d8c5a77-10a9-40bb-9f7a-c0609cf10322` completed normally from
`2026-08-22T01:32:56.206Z` to `2026-08-22T01:36:58.400Z` with no run-level
error. The bounded sequential worker advanced the non-empty Oliy Majlis
catalogues without force-completing checkpoints: `ru` reached page 32 with
640 discovered documents, while `uz-Cyrl` and `uz-Latn` each reached page 31
with 620 discovered documents. The empty `en` checkpoint remains completed
with zero discovered documents; the three non-empty language checkpoints
remain queued for their next bounded continuation.

Final read-only totals were 81 canonical documents, 87 language variants,
7,655 current unique provisions, 21,157 indexed chunks, and 1,781 queued or
retrying non-catalogue ingestion jobs. The checkpoint ledger remained 13
completed and 31 queued. The failure ledger remained 2 retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows plus 3 retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter rows remained
zero. Release thresholds and queue-freeze remain unproven, so snapshot,
evaluation, Qdrant/D1 restore gates and CI are still blocked. Production flags,
corpus ingestion and deployment were not changed.

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

## Oliy Majlis bounded run closure (2026-08-22, 06:04–06:09Z)

Run `4bb09c0e-fb9c-4b97-a665-7f0801a7ce92` completed at 06:09:13.434Z with
no run-level error. The bounded worker advanced the Oliy Majlis catalogue
ledger sequentially and did not force-complete any checkpoint.

The final read-only totals at the 06:09:52Z boundary are 124 canonical
documents, 130 language variants, 8,930 distinct current provisions and
24,081 indexed chunks, with 1,602 live-or-manual queued/retrying jobs. The
checkpoint ledger remains 13 completed and 31 queued. The failure ledger
remains two retrying `LEGAL_CORPUS_INGESTION_FAILED` and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` rows; terminal/dead-letter remains zero.
Oliy Majlis remains queued for Russian page 82 (1,640 discovered records),
Uzbek Cyrillic page 83 (1,660) and Uzbek Latin page 83 (1,660); English is
completed at page 1 with zero catalogue records. Release floors, queue freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain unproven;
production is untouched.

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

## Shard run closure (2026-08-24, 06:56Z)

The shard run `1414c04b-058d-40f7-aac0-ad928a04a204` completed at
`2026-08-24T06:56:25.305Z` with `status=completed` and `error_code=NULL`.
It completed 14 fetch jobs and two version jobs without failure-ledger rows.
The materialized totals are 31 canonical documents, 5,298 unique current
provisions and 16,626 indexed chunks. All 44 discovery checkpoints remain
`completed`; the job ledger has 61 completed fetches, 27,093 queued fetches,
11 completed versions and 2,200 queued versions, with no running jobs. The
queue remains active, so the release floors, ingestion freeze,
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

## Staging D1 shard continuation (2026-08-24, 05:22–05:45Z)

The v2 database reached Cloudflare's non-increaseable 10 GB per-database limit,
so a separate staging-only database was created: `juro-staging-corpus-shard-1`,
ID `e09e0682-0c2e-4458-a8f3-be9de28117e3`. All 142 existing corpus migrations
were applied to the new database. The original `juro-staging-corpus-v2` binding
and its data were not changed, truncated or rebound; production was not
touched. Cloudflare D1 limits remain a capacity constraint rather than a
release-gate relaxation.

The idempotent seed copied only 44 completed discovery checkpoints, 27,900
discovery metadata rows, 27,689 active ingestion jobs (running rows reset to
queued), and the verified Lex.uz robots pacing row. It did not copy raw HTML,
R2 objects, provisions, chunks, user documents, secrets or any production data.
The temporary SQL file was removed after import. The dedicated staging Worker
`juro-legal-corpus-shard-staging` was deployed as version
`85c7ef5b-a769-4792-bf24-bf2615c74392` with dense Qdrant disabled and no
production environment in its config.

Its first sequential run `e22c655c-d90f-4078-a32a-a9dfcecf5b02` started at
`2026-08-24T05:40:24.024Z` and was still running at the last probe
(`2026-08-24T05:45:18.573Z`). At that probe the shard contained two fetched
canonical documents, three language variants, three versions, 3,900 parsed
provisions and 3,901 indexed chunks. The failure ledger was empty; the queue
remained active and the release floors, queue freeze, snapshot/evaluation,
Qdrant/D1 restore and CI gates were therefore still unproven. These are actual
materialized rows, not discovery or placeholder counts.

## Staging shard first-run closure (2026-08-24, 05:48Z)

The first shard run `e22c655c-d90f-4078-a32a-a9dfcecf5b02` completed at
`2026-08-24T05:48:02.542Z` with no scheduler error. Sequential processing
materialized two canonical documents, three language variants, five versions,
8,158 provisions and 8,161 indexed chunks. Two fetch jobs and three version
jobs are completed; the failure ledger remains empty. The next bounded run
`e6b34c66-33c2-4496-9acc-585a80b0b9c6` started at `2026-08-24T05:48:23.810Z`.
The queue is active, so the 1,500/22,000/22,513 floors, freeze, snapshot,
evaluation, restore and CI gates remain open.

## Staging shard bounded batch update (2026-08-24, 05:53Z)

The shard Worker was updated to version `76660542-3127-428e-a258-b7c0e0529582`.
It now packs up to 20 sequential ingestion jobs into one staging lease,
bounded by the existing twelve-minute start fence, fifteen-minute lease and
20-second Lex.uz host delay. Production and the primary v2 Worker retain the
five-job default; no second crawl stream or parallel source request was
introduced. Boundary tests, type-check and shard dry-run passed before this
staging-only deployment. This is a throughput change inside the existing
robots budget, not a release-gate relaxation.

## Shard monitor after larger bounded batch (2026-08-24, 06:00Z)

The next run `cb2b91ba-4ce4-469f-9448-4217acc1e2be` remained active at
`2026-08-24T06:00:20.068Z` with no error code. The read-only materialized
totals were eight canonical documents, ten language variants, fourteen
versions, 17,366 provisions and 16,411 indexed chunks; the failure ledger was
empty. The batch is still governed by the single 20-second Lex.uz host pacer,
and the release floors and queue-freeze/post-ingestion gates remain open.

## Shard sequential monitor (2026-08-24, 06:03Z)

The active run `cb2b91ba-4ce4-469f-9448-4217acc1e2be` still reports
`status=running`, `error_code=NULL`, and a renewed lease. A sequential
read-only aggregate reports 10 canonical documents, 3,611 unique current
provisions and 7,965 indexed chunks; the failure ledger has no rows. One
intermediate CLI probe returned Cloudflare API code 7403, but the identical
read-only scheduler query immediately succeeded and the durable run remained
healthy; this is recorded as a probe transport retry, not an ingestion failure.
The queue is active and all post-ingestion release gates remain closed.

## Preserved v2 capacity probe (2026-08-24, 06:06Z)

The original `juro-staging-corpus-v2` remains at `9,999,998,976` bytes. Its
last durable scheduler rows are the previously recorded `D1_ERROR` failures
from the capacity guard; no new source work was started there. A sequential
read-only job aggregate remains 1,055 completed fetches, 27,097 queued fetches,
1,619 completed versions, 589 queued versions, one retrying version and two
running versions. The job ledger still has zero `failed` and zero
`dead_letter` rows; the separate failure ledger has 28 retrying and five
technically-unavailable rows. The v2 database was not modified or rebound.

## Shard run closure (2026-08-24, 06:08Z)

The shard run `cb2b91ba-4ce4-469f-9448-4217acc1e2be` closed successfully at
`2026-08-24T06:08:53.463Z`; the lock was released only after the durable run
row was finalized. It completed 16 fetch jobs and five version jobs. The
materialized shard totals are 10 canonical documents, 4,123 unique current
provisions and 14,924 indexed chunks, with no failure-ledger rows. The queue
remains 27,103 queued fetches and 2,206 queued versions, so the required
release floors and ingestion freeze are not met and no post-ingestion gate has
started.

## Shard run closure (2026-08-24, 06:25Z)

The next shard run `e5692b7b-418f-4608-a698-0ea2f0808e03` completed at
`2026-08-24T06:25:37.447Z` with `status=completed` and `error_code=NULL`.
Sequential processing completed 15 fetch jobs and two version jobs. The
materialized shard totals are 19 canonical documents, 5,220 unique current
provisions and 16,383 indexed chunks. All 44 discovery checkpoints remain
`completed`, and the failure ledger query returned no rows. The job ledger has
31 completed fetches, 27,097 queued fetches, seven completed versions and 2,204
queued versions, with no running jobs. The queue is therefore still active and
the 1,500/22,000/22,513 floors, ingestion freeze, snapshot/evaluation,
Qdrant/D1 restore and CI gates remain open; production is untouched.

## Shard run monitor (2026-08-24, 06:30Z)

The cron-started run `ff3d5805-36d1-4fe0-8e1d-b863dd91ca2e` remains
`status=running` with `error_code=NULL`. The materialized shard totals are
21 canonical documents, 5,225 unique current provisions and 16,388 indexed
chunks. All 44 discovery checkpoints are `completed`; the failure ledger
returned no rows, and the only running job is a fetch for an allow-listed
Lex.uz URL with no error code. The queue remains active (34 completed fetches,
27,097 queued fetches, seven completed versions and 2,204 queued versions), so
release floors, ingestion freeze and all post-ingestion gates remain open.

## Shard run closure (2026-08-24, 06:40Z)

The cron-started run `ff3d5805-36d1-4fe0-8e1d-b863dd91ca2e` completed at
`2026-08-24T06:40:24.220Z` with `status=completed` and `error_code=NULL`.
It completed 12 fetch jobs and two version jobs without failure-ledger rows.
The materialized totals remain 25 canonical documents, 5,253 unique current
provisions and 16,463 indexed chunks; this run processed existing/version
work without adding a new canonical document. All 44 discovery checkpoints are
still `completed`. The queue remains active with 27,095 queued fetches and
2,202 queued versions, so the release floors, ingestion freeze,
snapshot/evaluation, Qdrant/D1 restore and CI gates remain open; production is
untouched.

## Shard run monitor (2026-08-24, 07:05Z)

The cron run `e667fa98-4355-4a6a-bbab-1ef38e40e9a0` remains active with
`error_code=NULL`. Materialized totals are 35 canonical documents, 5,320
unique current provisions and 16,715 indexed chunks; all 44 discovery
checkpoints are `completed`. The failure ledger contains one
`technically_unavailable` row for `https://lex.uz/en/docs/8152156` with
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE`; its fetch job is completed and no
`failed` or `dead_letter` jobs exist. With 27,900 discovered URLs, the
technical-unavailability rate is approximately 0.0036%, below the 2% release
threshold. The queue remains active, so release floors and post-ingestion gates
remain open; production is untouched.

## Shard run closure (2026-08-24, 07:12Z)

The cron run `e667fa98-4355-4a6a-bbab-1ef38e40e9a0` completed at
`2026-08-24T07:12:25.011Z` with `status=completed` and `error_code=NULL`.
The read-only shard aggregate is 39 canonical documents, 5,341 unique current
provisions and 16,769 indexed chunks. All 44 discovery checkpoints remain
`completed`. The ingestion queue is not frozen: 27,092 fetch jobs and 2,198
version jobs are still `queued` (76 fetch and 13 version jobs are
`completed`). The failure ledger still has one
`technically_unavailable` source-language row for
`https://lex.uz/en/docs/8152156`; no `failed` or `dead_letter` ingestion jobs
are present. Release floors and post-ingestion snapshot/evaluation/restore/CI
gates therefore remain open; production is untouched.

## Shard run monitor (2026-08-24, 07:20Z)

The next cron run `8fa50581-524c-453f-8473-13a44352fe3b` is still
`running` with `error_code=NULL` (`started_at=2026-08-24T07:16:17.183Z`).
The read-only aggregate is 43 canonical documents, 5,357 unique current
provisions and 16,788 indexed chunks; all 44 discovery checkpoints are
`completed`. The queue remains active (`fetch`: 82 completed, 27,092 queued,
1 running; `version`: 13 completed, 2,198 queued). The failure ledger still
contains only the previously recorded `technically_unavailable` row, and the
explicit `failed`/`dead_letter` query is empty. Release floors, queue freeze,
snapshot/evaluation/restore and CI gates remain open; production is untouched.

## Shard run monitor (2026-08-24, 07:22Z)

The active cron run `8fa50581-524c-453f-8473-13a44352fe3b` remains
`running` with `error_code=NULL` (`started_at=2026-08-24T07:16:17.183Z`).
The read-only aggregate is 44 canonical documents, 5,371 unique current
provisions and 16,842 indexed chunks; all 44 discovery checkpoints are
`completed`. The queue is still active (`fetch`: 85 completed, 27,092 queued,
1 running; `version`: 13 completed, 2,198 queued). The failure ledger has only
the existing `technically_unavailable` source-language row; the explicit
`failed`/`dead_letter` query remains empty. Release floors and queue freeze are
not yet proven, so snapshot/evaluation/restore/CI gates remain open; production
is untouched.

## Shard run closure (2026-08-24, 08:00Z)

The cron run `4f1fb552-6372-4a34-9619-756639405299` completed at
`2026-08-24T08:00:46.362Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 59 canonical documents, 5,582 unique
current provisions and 17,752 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 121 fetch jobs are
`completed`, 27,086 are `queued`; 18 version jobs are `completed`, 2,193 are
`queued`. The failure ledger still contains only the previously recorded
`technically_unavailable` source-language row, while the explicit
`failed`/`dead_letter` query is empty. Release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Scheduler incident evidence (2026-08-24, 18:00–18:12Z)

The scheduled run `1b0ebf19-62ed-4bbe-96e1-84238812dba3` started at
`2026-08-24T17:32:17.593Z` and was recorded as `status=failed` at
`2026-08-24T18:00:23.108Z` with `error_code=LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED`.
The next run `dbc27ecb-2b43-478f-8e61-d341a32a3fd7` ran from
`2026-08-24T18:00:23.108Z` to `2026-08-24T18:12:40.326Z` with
`status=completed` and `error_code=LEGAL_CORPUS_INGESTION_FAILED`.
The related three failure-ledger rows are retrying, not terminal; their
corresponding fetch jobs are now `completed` at attempt 2. The explicit
`failed`/`dead_letter` ingestion-job query remains empty. The lease incident
and retryable source errors remain a release limitation; no production state
was changed.

## Shard run closure (2026-08-24, 18:28Z)

The scheduled run `05a376f9-182d-43df-aa2f-2170e036c061` completed at
`2026-08-24T18:28:39.506Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 280 canonical documents, 10,517 unique
current provisions and 34,311 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 684 fetch jobs are
`completed`, 27,003 are `queued`; 98 version jobs are `completed`, 2,113 are
`queued`. The failure ledger contains three retrying
`LEGAL_CORPUS_INGESTION_FAILED` rows, four retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records, five retrying
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` rows and six technically unavailable
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` rows; the explicit
`failed`/`dead_letter` query is empty. Release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Shard run closure (2026-08-24, 13:17Z)

The scheduled run `565e1266-3c95-43f1-8b8a-2b9d3f0a2057` completed at
`2026-08-24T13:17:28.560Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 160 canonical documents, 7,872 unique
current provisions and 25,703 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 374 fetch jobs are
`completed`, 27,052 are `queued`; 49 version jobs are `completed`, 2,162 are
`queued`. The failure ledger contains three technically unavailable
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` rows, three retrying
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` rows and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records; the explicit
`failed`/`dead_letter` query is empty. Release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Shard run closure (2026-08-24, 13:01Z)

The scheduled run `763c8fef-b896-4ba0-879c-05a11b363ea3` completed at
`2026-08-24T13:01:00.671Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 155 canonical documents, 7,765 unique
current provisions and 25,158 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 359 fetch jobs are
`completed`, 27,055 are `queued`; 47 version jobs are `completed`, 2,164 are
`queued`. The failure ledger contains three technically unavailable
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` rows, three retrying
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` rows and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records; the explicit
`failed`/`dead_letter` query is empty. Release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Shard run closure (2026-08-24, 12:45Z)

The scheduled run `a6690452-7009-439e-8d72-1c9fb6e1813b` completed at
`2026-08-24T12:45:20.074Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 149 canonical documents, 7,694 unique
current provisions and 24,834 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 345 fetch jobs are
`completed`, 27,056 are `queued`; 45 version jobs are `completed`, 2,166 are
`queued`. The failure ledger contains three technically unavailable
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` rows, two retrying
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` rows and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records; the explicit
`failed`/`dead_letter` query is empty. Release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Shard run closure (2026-08-24, 12:28Z)

The scheduled run `34455bd9-29f1-48c4-9f09-b1a1291fa086` completed at
`2026-08-24T12:28:38.938Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 144 canonical documents, 7,524 unique
current provisions and 24,276 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 330 fetch jobs are
`completed`, 27,059 are `queued`; 43 version jobs are `completed`, 2,168 are
`queued`. The failure ledger contains three technically unavailable
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` rows, two retrying
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` rows and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records; the explicit
`failed`/`dead_letter` query is empty. Release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Shard run closure (2026-08-24, 12:13Z)

The scheduled run `66870a64-63e0-4755-ba47-093e51d38b4b` completed at
`2026-08-24T12:13:06.007Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 138 canonical documents, 7,389 unique
current provisions and 23,555 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 316 fetch jobs are
`completed`, 27,060 are `queued`; 41 version jobs are `completed`, 2,170 are
`queued`. The failure ledger contains three `technically_unavailable`
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` rows, one retrying
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` row and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records; the explicit
`failed`/`dead_letter` query is empty. Release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Shard run closure (2026-08-24, 11:56Z)

The scheduled run `fd9776bd-40ac-45b2-ba4b-e15b6ab2aed6` completed at
`2026-08-24T11:56:37.485Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 132 canonical documents, 7,248 unique
current provisions and 22,828 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 301 fetch jobs are
`completed`, 27,062 are `queued`; 39 version jobs are `completed`, 2,172 are
`queued`. The failure ledger contains three `technically_unavailable`
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` rows, one retrying
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` row and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records; the explicit
`failed`/`dead_letter` query is empty. Release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Shard run closure (2026-08-24, 11:40Z)

The scheduled run `72d7a319-a3e7-4f6d-aeb3-b4aabb4c7a95` completed at
`2026-08-24T11:40:32.201Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 126 canonical documents, 7,165 unique
current provisions and 22,626 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 286 fetch jobs are
`completed`, 27,064 are `queued`; 37 version jobs are `completed`, 2,174 are
`queued`. The failure ledger contains three `technically_unavailable`
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE` rows, one retrying
`LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE` row and three retrying
`LEGAL_CORPUS_STALE_RUNNING_TIMEOUT` records; the explicit
`failed`/`dead_letter` query is empty. Release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Shard run closure (2026-08-24, 11:25Z)

The scheduled run `9e889ade-5b44-47a3-aacb-8f41a7ee1b9f` completed at
`2026-08-24T11:25:24.294Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 120 canonical documents, 7,071 unique
current provisions and 22,268 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 271 fetch jobs are
`completed`, 27,066 are `queued`; 35 version jobs are `completed`, 2,176 are
`queued`. The failure ledger still contains three non-terminal
`technically_unavailable` source-language rows, one retrying language-text
row and three retrying stale-running timeout records; the explicit
`failed`/`dead_letter` query is empty. Release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Shard run closure (2026-08-24, 11:08Z)

The scheduled run `68dd8456-90eb-4140-ab39-5439284f13bc` completed at
`2026-08-24T11:08:25.351Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 115 canonical documents, 6,898 unique
current provisions and 21,719 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 256 fetch jobs are
`completed`, 27,069 are `queued`; 33 version jobs are `completed`, 2,178 are
`queued`. The failure ledger still contains three non-terminal
`technically_unavailable` source-language rows, one retrying language-text
row and three retrying stale-running timeout records; the explicit
`failed`/`dead_letter` query is empty. Release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Shard run closure (2026-08-24, 10:53Z)

The scheduled run `e91dc21d-1451-4238-a3e4-1bc369a8e4a1` completed at
`2026-08-24T10:52:53.038Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 112 canonical documents, 6,830 unique
current provisions and 21,423 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 241 fetch jobs are
`completed`, 27,075 are `queued`; 31 version jobs are `completed`, 2,180 are
`queued`. The failure ledger contains three non-terminal
`technically_unavailable` source-language rows, one retrying language-text
row and three retrying stale-running timeout records; the explicit
`failed`/`dead_letter` query is empty. Release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Shard run closure (2026-08-24, 10:09Z)

The cron run `f0bbd775-7516-42bf-8869-61c58b897a47` completed at
`2026-08-24T10:09:04.604Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 100 canonical documents, 6,372 unique
current provisions and 20,473 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 212 fetch jobs are
`completed`, 27,078 are `queued`; 29 version jobs are `completed`, 2,182 are
`queued`. The failure ledger contains three non-terminal
`technically_unavailable` source-language rows (`https://lex.uz/en/docs/8152156`,
`https://lex.uz/en/docs/8101804` and `https://lex.uz/en/docs/7991975`) and two
historical `retrying` stale-running evidence rows; their corresponding jobs
were reclaimed and completed on a later attempt. The explicit
`failed`/`dead_letter` query is empty. The bounded upstream-fetch cancellation
fix is deployed to staging and its 14/14 source-fetch plus 60 ingestion/worker
boundary tests passed. Release floors, queue freeze and all post-ingestion
snapshot/evaluation/restore/CI gates remain open; production is untouched.

## Stale-run recovery (2026-08-24, 10:40Z)

The scheduled run `6c5f8005-49d6-4cf4-b789-27fbb2abf6fe` was closed by the
next scheduled invocation at `2026-08-24T10:40:17.189Z` with
`LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED` after version job
`legal-version:f9a2eb6c0148fb1017b22d8e1c7b` stopped renewing its run lease.
The normal reconciliation path reclaimed that job at attempt 2 under the
following run `e91dc21d-1451-4238-a3e4-1bc369a8e4a1`; it completed successfully
with `last_error_code=NULL`. The queue remained bounded and sequential
(`fetch`: 228 completed, 27,074 queued, 1 running; `version`: 30 completed,
2,181 queued), and the explicit `failed`/`dead_letter` query remained empty.
This is recovery evidence only; release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Shard run closure (2026-08-24, 09:25Z)

The cron run `cb63939b-3830-4869-a768-e428518ac3cb` completed at
`2026-08-24T09:25:03.636Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 89 canonical documents, 5,867 unique
current provisions and 18,857 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 183 fetch jobs are
`completed`, 27,082 are `queued`; 26 version jobs are `completed`, 2,185 are
`queued`. The failure ledger contains three non-terminal
`technically_unavailable` source-language rows (`https://lex.uz/en/docs/8152156`,
`https://lex.uz/en/docs/8101804` and `https://lex.uz/en/docs/7991975`) plus one
retrying stale-running timeout record retained for retry evidence; the explicit
`failed`/`dead_letter` query is empty. The previous run
`ac15fb03-f687-4487-888f-404ae25d4a90` was closed as
`LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED`; its held fetch job was reclaimed and
completed on attempt 2. Release floors, queue freeze and all post-ingestion
snapshot/evaluation/restore/CI gates remain open; production is untouched.

## Shard run closure (2026-08-24, 07:46Z)

The cron run `82b5eebf-d876-4cb0-be84-bee05fd44877` completed at
`2026-08-24T07:46:55.199Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 51 canonical documents, 5,461 unique
current provisions and 17,294 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue is not frozen: 106 fetch jobs are `completed`, 27,088
are `queued`; 16 version jobs are `completed`, 2,195 are `queued`. The failure
ledger still contains only the previously recorded `technically_unavailable`
source-language row, while the explicit `failed`/`dead_letter` query is empty.
Release floors, queue freeze and all post-ingestion snapshot/evaluation/restore/
CI gates remain open; production is untouched.

## Shard run closure (2026-08-26, 11:11Z)

The cron run `d52a37fb-ecc7-40d5-ba84-057903fc2231` completed at
`2026-08-26T11:11:45.700Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 909 canonical documents, 10,009 unique
current provisions and 43,964 indexed chunks. All 44 discovery checkpoints are
`completed`; the distributed `legal-corpus-worker` lock is released. The queue
is not frozen: 1,669 jobs are `completed` and 28,521 fetch/version jobs remain
`queued`, with no job currently `running`. Terminal failures and dead-letter
jobs are both zero. The staging D1 size is approximately 2.87 GiB. Release
floors, queue freeze and all post-ingestion snapshot/evaluation/restore/CI
gates remain open; production is untouched.

## Shard run closure (2026-08-24, 07:28Z)

The cron run `8fa50581-524c-453f-8473-13a44352fe3b` completed at
`2026-08-24T07:28:50.191Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 45 canonical documents, 5,381 unique
current provisions and 16,973 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 91 fetch jobs are
`completed`, 27,090 are `queued`; 15 version jobs are `completed`, 2,196 are
`queued`. The failure ledger still contains only the previously recorded
`technically_unavailable` source-language row, while the explicit
`failed`/`dead_letter` query is empty. Release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Shard run closure (2026-08-24, 08:16Z)

The cron run `b17c3d9d-54a0-4b4d-b495-5fa6a0cdd533` completed at
`2026-08-24T08:16:39.445Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 67 canonical documents, 5,639 unique
current provisions and 17,964 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 136 fetch jobs are
`completed`, 27,085 are `queued`; 20 version jobs are `completed`, 2,191 are
`queued`. The failure ledger now contains two non-terminal
`technically_unavailable` source-language rows (`https://lex.uz/en/docs/8152156`
and `https://lex.uz/en/docs/8101804`), both with
`LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE`; the explicit `failed`/`dead_letter`
query is empty. Release floors, queue freeze and all post-ingestion
snapshot/evaluation/restore/CI gates remain open; production is untouched.

## Shard run closure (2026-08-24, 08:33Z)

The cron run `d310dfbd-23b3-4085-a683-695b9fe1a54b` completed at
`2026-08-24T08:33:05.795Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 73 canonical documents, 5,778 unique
current provisions and 18,624 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 151 fetch jobs are
`completed`, 27,083 are `queued`; 22 version jobs are `completed`, 2,189 are
`queued`. The failure ledger remains at two non-terminal
`technically_unavailable` source-language rows; the explicit
`failed`/`dead_letter` query is empty. Release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Shard run closure (2026-08-24, 08:48Z)

The cron run `c7d186e5-4fef-4c9b-adc9-62db961a48d5` completed at
`2026-08-24T08:48:53.333Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 79 canonical documents, 5,827 unique
current provisions and 18,782 indexed chunks. All 44 discovery checkpoints are
`completed`. The queue remains active and unfrozen: 166 fetch jobs are
`completed`, 27,081 are `queued`; 24 version jobs are `completed`, 2,187 are
`queued`. The failure ledger remains at two non-terminal
`technically_unavailable` source-language rows; the explicit
`failed`/`dead_letter` query is empty. Release floors, queue freeze and all
post-ingestion snapshot/evaluation/restore/CI gates remain open; production is
untouched.

## Shard run closure (2026-08-26, 10:00Z)

The cron run `3f1a0b8c-177b-4a8d-9e0f-a82e328e57a6` completed at
`2026-08-26T10:00:59.442Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 861 canonical documents, 9,834 unique
current provisions and 43,778 indexed chunks. All 44 discovery checkpoints are
`completed`; the distributed `legal-corpus-worker` lock is released. The queue
is not frozen: 1,051 fetch jobs and 542 version jobs are `completed`, with
28,548 fetch/version jobs still `queued` or `running`. Terminal failures and
dead-letter jobs are both zero. The staging D1 size is approximately 2.92 GB.
Release floors, queue freeze and all post-ingestion snapshot/evaluation/restore/
CI gates remain open; production is untouched.

## Shard run closure (2026-08-26, 10:17Z)

The cron run `b79fc4fe-3e32-4dc9-a937-1c17e8510eee` completed at
`2026-08-26T10:17:51.462Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 871 canonical documents, 9,870 unique
current provisions and 43,819 indexed chunks. All 44 discovery checkpoints are
`completed`; the distributed `legal-corpus-worker` lock is released. The queue
is not frozen: 1,062 fetch jobs and 548 version jobs are `completed`, with
28,542 fetch/version jobs still `queued`. Terminal failures and dead-letter jobs
are both zero. The staging D1 size is approximately 2.96 GB. Release floors,
queue freeze and all post-ingestion snapshot/evaluation/restore/CI gates remain
open; production is untouched.

## Shard run closure (2026-08-26, 10:33Z)

The cron run `a88e8344-267c-476f-bad0-ca82c54d88f5` completed at
`2026-08-26T10:33:55.893Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 882 canonical documents, 9,914 unique
current provisions and 43,867 indexed chunks. All 44 discovery checkpoints are
`completed`; the distributed `legal-corpus-worker` lock is released. The queue
is not frozen: 1,623 jobs are `completed` and 28,536 fetch/version jobs remain
`queued` (no job is currently running). Terminal failures and dead-letter jobs
are both zero. The staging D1 size is approximately 2.79 GiB. Release floors,
queue freeze and all post-ingestion snapshot/evaluation/restore/CI gates remain
open; production is untouched.

## Shard run closure (2026-08-26, 10:47Z)

The cron run `c63df720-8d55-47b4-a799-1e9cc83bd5d9` completed at
`2026-08-26T10:47:49.517Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 891 canonical documents, 9,952 unique
current provisions and 43,905 indexed chunks. All 44 discovery checkpoints are
`completed`; the distributed `legal-corpus-worker` lock is released. The queue
is not frozen: 1,649 jobs are `completed` and 28,531 fetch/version jobs remain
`queued` (no job is currently running). Terminal failures and dead-letter jobs
are both zero. The staging D1 size is approximately 2.82 GiB. Release floors,
queue freeze and all post-ingestion snapshot/evaluation/restore/CI gates remain
open; production is untouched.

## Second corrected run closure (2026-08-26, 10:59Z)

The cron run `8cc47386-ccaa-493c-801d-73875481912b` completed at
`2026-08-26T10:59:42.142Z` with `status=completed` and `error_code=NULL`.
The immediate lock-free post-run aggregate is 900 canonical documents, 9,980
unique current provisions and 43,935 indexed chunks. All 44 discovery
checkpoints are `completed`; the distributed `legal-corpus-worker` lock was
released. The lock-free queue composition was 1,655 completed and 28,526 queued
fetch/version jobs, with zero running, failed or dead-letter ingestion jobs and
zero terminal failures. A later observation occurred after the next run had
already acquired the lock and is therefore not used as this run's baseline.
Release floors, queue freeze and all post-ingestion snapshot/evaluation/restore/
CI gates remain open; production is untouched.

## Shard run closure (2026-08-26, 11:23Z)

The cron run `5f18361e-d2a1-477d-893a-186f3a1e016b` completed at
`2026-08-26T11:23:46.522Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 918 canonical documents, 10,041 unique
current provisions and 43,996 indexed chunks. All 44 discovery checkpoints are
`completed`, and the distributed `legal-corpus-worker` lock is released. The
queue is not frozen: 1,683 ingestion jobs are `completed` and 28,516 remain
`queued`; 4,392 of the queued jobs are live/manual (the remaining catalog
discovery jobs are excluded from the release queue calculation). Terminal
failures and dead-letter jobs are both zero. The staging D1 size is
3,116,019,712 bytes (approximately 2.90 GiB). Release floors, queue freeze and
all post-ingestion snapshot/evaluation/restore/CI gates remain open; production
is untouched.

## Shard run closure (2026-08-26, 11:35Z)

The cron run `90c75439-468b-433c-aee7-53b92d5df79f` completed at
`2026-08-26T11:35:37.640Z` with `status=completed` and `error_code=NULL`.
The post-run read-only aggregate is 927 canonical documents, 10,073 unique
current provisions and 44,029 indexed chunks. All 44 discovery checkpoints are
`completed`, and the distributed `legal-corpus-worker` lock is released. The
queue is not frozen: 1,697 ingestion jobs are `completed` and 28,511 remain
`queued`; 4,396 of the queued jobs are live/manual (the remaining catalog
discovery jobs are excluded from the release queue calculation). Terminal
failures and dead-letter jobs are both zero. The staging D1 size is
3,145,568,256 bytes (approximately 2.93 GiB). Release floors, queue freeze and
all post-ingestion snapshot/evaluation/restore/CI gates remain open; production
is untouched.
