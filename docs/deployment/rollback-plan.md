# Rollback plan — Worker 170 / applied migrations 0159-0160 / Sites 86

## Application rollback

The active application version is
`8a51f26c-2011-4ea0-a8f9-2e5a80316ce6` (version 170), deployment
`8dc989ba-014b-4a40-87e5-d017d8a4488e`. The immediate application rollback is
`a5978f48-b424-4846-aa72-6fe42ef47cc0` (version 169), deployment
`cee1ff1a-8029-44ef-a6f7-eeb532e95601`. Confirm the currently active version
before changing traffic. Sites version 86 is live and version 85 is its
immediate public rollback.

Rollback is justified for a release-caused availability, authentication,
routing, metadata, font loading, signed-share, document-comparison, Lawyer or
Admin interaction-target regression.
Anthropic `CREDIT_BALANCE_LOW` was not release-caused, was resolved by restoring
API credit and is not a reason to roll back Worker 170. The latest content-free
production probe passed at `2026-08-29T11:10:56.708Z` in 4,810 ms with no safe
error. After any genuine
release rollback, repeat the six-host HTTPS
probe, login/status smoke, document-comparison compact-layout probe, Lawyer
re-auth/API boundary, Admin re-auth boundary, authenticated dashboard count and
`/api/status` read. Worker 169 retains the Lawyer-host redirect, stable Lex
fingerprint, deterministic per-run digest, bounded unread-count query, safe
provider error classification, saved monitoring cadence and dedicated
monitoring-email outbox, cost measurement readiness UI, stable Analytics Engine
dimension normalization, feedback-outcome metric, Client pseudo-element removal
and the 72 px Turnstile reservation, dashboard composer focus ring, conditional
search ARIA reference and 12 px Client shell text floor. It does not remove the
mobile pointer scrim from the accessibility/tab order. Record all
preference cursors, monitoring-email job states, AI usage totals and the exact
notification count before rollback; prefer a forward fix. Do not report
overall recovery unless status evidence is fresh and operational.

Migrations 0159 and 0160 are additive. An application-only rollback to Worker
169 must not edit D1. A
rollback farther than the documented immediate version can remove monitoring
cadence or later lockout/encryption behavior and is therefore a separate
incident decision, not the ordinary rollback path.

## Prepared feedback-quality KPI change — not deployed

Candidate `3101525c12dd53171494515e0c9668859b92408c` adds only an aggregate
read and RU/UZ Admin presentation over the existing `ai_feedback` table. It has
no migration and makes no write-path change. If a future release causes a KPI
query or Admin rendering regression, route traffic back to the verified
pre-release Worker; do not edit or restore D1. Confirm that protected Admin
access still requires fresh MFA, the response remains aggregate-only and rates
remain suppressed below five before restoring traffic to a forward fix.

## Prepared migration 0161 gate — not applied

Candidate migration `0161_balanced_ai_reasoning_mode.sql` rebuilds only
`ai_slo_telemetry_events` so its reasoning-mode constraint accepts Fast,
Balanced and Deep. It copies existing rows and recreates the append-only
update/delete guards and indexes. It is not applied to production.

Before an explicitly approved release:

1. Confirm the exact production migration ledger, table row count, indexes,
   triggers and zero foreign-key violations with read-only queries.
2. Create a new full pre-0161 production export in private
   `juro-production-backups`; record its exact object path, byte count and
   SHA-256 in the release evidence.
3. Download that object into an isolated protected directory, verify its hash,
   restore it into an isolated database and require `quick_check=ok`, zero
   foreign-key violations, matching telemetry row count and the expected
   append-only guards.
4. Apply 0161 only through the explicit production Wrangler configuration,
   then re-check ledger/schema/row-count parity and append-only guards before
   routing traffic to the new Worker.

If the new Worker fails after a successful 0161 migration, route traffic back
to the verified pre-release Worker first. The old Fast/Deep values remain valid
under the extended constraint, so an ordinary application rollback must not
restore or edit D1. Prefer a forward database fix if the migrated schema itself
is defective. Restore the verified pre-0161 export only after an explicit
database-incident decision, a recorded recovery-point impact review and a
fresh incident-database export. Never use ad-hoc `ALTER`, `DROP` or migration
ledger edits as rollback.

## Prepared migration 0162 gate — not applied

Candidate migration `0162_scoped_ai_cost_budgets.sql` is additive. It creates
versioned scope policies, immutable budget events and mutable alert-delivery
evidence; it does not seed thresholds or change existing usage rows. It remains
excluded from the production `migrations_pattern` and is not applied remotely.

Before an explicitly approved release, repeat the verified private backup and
isolated restore procedure above for the complete ordered ledger through 0162.
Require `quick_check=ok`, zero foreign-key violations, the expected indexes and
immutable triggers, then exercise controlled daily/monthly thresholds and one
retry-safe identifiers-only alert in staging. Enter only owner-reviewed limits
and deploy the exact matching Worker after the migration passes.

If the Worker fails after 0162 is applied, restore the prior Worker first and
leave the additive tables/evidence intact. Do not delete policies or events and
do not edit the migration ledger. A database restore is an explicit incident
decision only; because concurrent provider calls can overshoot a D1 boundary,
reconcile provider billing before choosing the recovery point.

## Prepared migration 0163 gate — not applied

Candidate migration `0163_anthropic_prompt_cache_accounting.sql` adds default-
zero cache-write token counters to immutable provider events and daily
aggregates. It remains excluded from the production `migrations_pattern` and
has not been applied remotely.

Before an explicitly approved release, repeat the private backup and isolated
restore procedure for the full ordered ledger through 0163. Require
`quick_check=ok`, zero foreign-key violations, exact existing row-count parity,
zero cache-write values on pre-existing rows and intact immutability triggers.
Then exercise one controlled Anthropic cache creation and read in staging,
reconcile provider usage/cost, and deploy only the exact tested Worker.

If application behavior regresses after 0163, restore the prior Worker first.
The old Worker ignores the additive columns, so keep them and their evidence;
do not edit the migration ledger or delete usage rows. A database restore is
reserved for a separately approved schema incident with explicit recovery-point
and provider-billing reconciliation.

## Prepared migration 0164 gate — not applied

Candidate migration `0164_lawyer_directory_daily_visits.sql` is additive. It
stores an internal user key, UTC visit day and first/last timestamps with one row
per user/day; it stores no lawyer profile, case, workspace, contact, query or
content field. Account deletion explicitly purges the actor's rows. Migration
0164 remains excluded from the production `migrations_pattern` and has not been
applied remotely.

Before an explicitly approved release, create and round-trip-verify a fresh full
pre-0164 production export. Require `quick_check=ok`, zero foreign-key
violations, exact existing row-count parity and the expected composite key/index
after an isolated ordered migration rehearsal. In staging, verify daily
deduplication, non-blocking directory behavior, cross-user isolation, account
purge and a same-actor seven-day request conversion before deploying the exact
matching Worker. Begin the production observation window only after both schema
and Worker identities are recorded.

If the matching Worker regresses after 0164, restore the prior Worker first and
leave the additive table in place; the old Worker does not read or write it. Do
not delete funnel rows ad hoc or edit the migration ledger. A database restore
requires a separately approved schema incident and recovery-point review.

## Prepared migration 0165 gate — not applied

Candidate migration `0165_ai_answer_source_opens.sql` is additive. It stores an
internal user ID, exact assistant-response ID and first/last open timestamps,
one row per actor/answer. Owner-integrity triggers reject a response that is not
an assistant message owned by that actor. It contains no prompt, answer, source
URL, profile, workspace, case, contact or document content, and account deletion
explicitly purges the actor's rows. Migration 0165 remains excluded from the
production `migrations_pattern` and has not been applied remotely.

Before an explicitly approved release, create and round-trip-verify a fresh full
pre-0164/0165 production export, rehearse the complete ordered migration set in
an isolated database, and require `quick_check=ok`, zero foreign-key violations,
the composite keys, both owner triggers and exact row-count parity. Apply both
schemas before the matching Worker. In staging, prove an authorized citation
open is answer-deduplicated, a foreign actor is rejected, source access remains
available on observation failure, account purge removes only the actor's row,
and the 14-day fully observed cohort returns aggregate-only output.

If the matching Worker regresses after 0165, restore the prior Worker first and
leave the additive table in place. The prior Worker does not read or write it.
Do not delete funnel rows ad hoc or edit the migration ledger; database restore
requires a separately approved schema incident and recovery-point review.

## Zone TLS rollback

The current zone encryption mode is explicit `Full (strict)`. If a verified
post-change origin failure produces `526` or an application host becomes
unavailable, restore the previous `Full` mode in Cloudflare SSL/TLS settings.
Then repeat the six-host production matrix (`juro`, `www`, `app`, `lawyer`,
`admin`, `status`), the three protected-staging probes and `/api/status`.
Do not weaken TLS for an unrelated application regression, and do not call the
rollback successful until expected status/redirect/auth boundaries and fresh
operational health are restored.

## Database recovery

Do not reverse 0159 or 0160 with ad-hoc `ALTER`, `DROP` or migration-ledger
edits. For an incident attributable to 0160, use the verified pre-migration full
export only after an explicit database incident decision:

- bucket: private `juro-production-backups`;
- SQL object:
  `d1/juro-production/20260828T105200Z-pre-0160-52f579ca/production-pre-0160.sql`;
- manifest:
  `d1/juro-production/20260828T105200Z-pre-0160-52f579ca/production-pre-0160.manifest.json`;
- SQL SHA-256:
  `4d339e3fcb5f31eecdfcaddb2f0b7fb642503b6cd4464a6172f56889278a41a8`.

Before any restore, download to an isolated protected directory, verify the
manifest and SHA-256, restore locally, require `quick_check=ok` and zero
foreign-key violations, then take a fresh export of the incident database.
Restore with explicit production bindings only. Re-run the migration ledger,
schema checks and role/signed-share smoke after recovery.

## Data and secret boundaries

- Never print `IDENTITY_KEYRING` or signed-share secrets.
- Never export recipient email addresses from `monitoring_email_jobs`; resolve
  protected identity only inside the bounded queue-delivery path.
- Do not reconstruct a link from token hashes.
- Preserve the private post-migration export for forensic comparison:
  `d1/juro-production/2026-08-25/post-0159-a3f22f87.sql`.
- Remove local plaintext exports only after a verified private R2 readback.
