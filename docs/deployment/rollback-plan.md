# Rollback plan — Worker 162 / migration 0159 / Sites 86

## Application rollback

The active application version is
`d2146684-bd77-4a33-a2a2-8d47042e473e` (version 162), deployment
`0c8ec9f3-cd7f-4a0c-9e99-e0b1d91fc998`. The immediate application rollback is
`34c54357-0878-4637-b533-1fa1afa36336` (version 161), deployment
`72c5d2be-e417-4dcf-a4eb-8022a59a1b61`. Confirm the currently active version
before changing traffic. Sites version 86 is live and version 85 is its
immediate public rollback.

Rollback is justified for a release-caused availability, authentication,
routing, metadata, font loading, signed-share, document-comparison, Lawyer or
Admin interaction-target regression.
Anthropic `CREDIT_BALANCE_LOW` was not release-caused, was resolved by restoring
API credit and is not a reason to roll back Worker 162. After any genuine
release rollback, repeat the six-host HTTPS
probe, login/status smoke, document-comparison compact-layout probe, Lawyer
re-auth/API boundary, Admin re-auth boundary, authenticated dashboard count and
`/api/status` read. Worker 161 retains the Lawyer-host redirect, auth error
association, localized status metadata, same-origin icons, corrected Client
comparison target, Lawyer/non-corpus Admin interaction floors and safe provider
error classification. It does not contain the stable Lex monitoring
fingerprint, atomic digest fan-out or bounded unread-count query. A rollback may
therefore restart notification growth; record the exact count before and after
the next cron and prefer a forward fix. Do not report overall recovery unless
status evidence is fresh and operational.

Migration 0159 is additive. Worker 162 added no migration and an application-
only rollback to Worker 161 must not edit D1. A rollback farther than the
documented immediate version can remove later lockout/encryption behavior and
is therefore a separate incident decision, not the ordinary rollback path.

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

Do not reverse 0159 with ad-hoc `ALTER`, `DROP` or migration-ledger edits. Use
the verified pre-migration full export only after an explicit database incident
decision:

- bucket: private `juro-production-backups`;
- SQL object:
  `d1/juro-production/2026-08-25/pre-0159-a3f22f87.sql`;
- manifest:
  `d1/juro-production/2026-08-25/pre-0159-a3f22f87.manifest.json`;
- SQL SHA-256:
  `11a00bda41475ed8fec0030a7cac9bc65d46d5ca9f92219327ebcd14b19d522f`.

Before any restore, download to an isolated protected directory, verify the
manifest and SHA-256, restore locally, require `quick_check=ok` and zero
foreign-key violations, then take a fresh export of the incident database.
Restore with explicit production bindings only. Re-run the migration ledger,
schema checks and role/signed-share smoke after recovery.

## Data and secret boundaries

- Never print `IDENTITY_KEYRING` or signed-share secrets.
- Do not reconstruct a link from token hashes.
- Preserve the private post-migration export for forensic comparison:
  `d1/juro-production/2026-08-25/post-0159-a3f22f87.sql`.
- Remove local plaintext exports only after a verified private R2 readback.
