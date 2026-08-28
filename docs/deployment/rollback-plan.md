# Rollback plan — Worker 166 / migrations 0159-0160 / Sites 86

## Application rollback

The active application version is
`4bd03261-df05-4e5b-9f91-66bd6d8cfdcd` (version 166), deployment
`3579b110-a09d-4f53-8563-34ec0d2d5c4e`. The immediate application rollback is
`a75c0337-da48-49fd-8adf-6a721fb24088` (version 165), deployment
`ee0465b5-fb83-4ebb-87a5-3b40b0be7f83`. Confirm the currently active version
before changing traffic. Sites version 86 is live and version 85 is its
immediate public rollback.

Rollback is justified for a release-caused availability, authentication,
routing, metadata, font loading, signed-share, document-comparison, Lawyer or
Admin interaction-target regression.
Anthropic `CREDIT_BALANCE_LOW` was not release-caused, was resolved by restoring
API credit and is not a reason to roll back Worker 166. After any genuine
release rollback, repeat the six-host HTTPS
probe, login/status smoke, document-comparison compact-layout probe, Lawyer
re-auth/API boundary, Admin re-auth boundary, authenticated dashboard count and
`/api/status` read. Worker 165 retains the Lawyer-host redirect, stable Lex
fingerprint, deterministic per-run digest, bounded unread-count query, safe
provider error classification, saved monitoring cadence and dedicated
monitoring-email outbox, cost measurement readiness UI and explicit
unconfigured-policy warning. It does not contain the stable Analytics Engine
dimension normalization or feedback-outcome metric. Record all preference cursors,
monitoring-email job states, AI usage totals and the exact notification count
before rollback; prefer a forward fix. Do not report overall recovery unless
status evidence is fresh and operational.

Migrations 0159 and 0160 are additive. An application-only rollback to Worker
165 must not edit D1. A
rollback farther than the documented immediate version can remove monitoring
cadence or later lockout/encryption behavior and is therefore a separate
incident decision, not the ordinary rollback path.

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
