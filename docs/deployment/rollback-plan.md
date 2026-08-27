# Rollback plan — Worker 147 / migration 0159 / Sites 86

## Application rollback

The active application version is
`ed0253e1-1c35-416e-9f2a-5bd8352c1936` (version 147), deployment
`6f536ee9-9666-41bb-b0f3-6f174019692b`. The immediate application rollback is
`c3237f9e-a258-42eb-8b94-62f5045b7b03` (version 146). Confirm the currently
active version before changing traffic. Sites version 86 is live and version
85 is its immediate public rollback.

Rollback is justified for a release-caused availability, authentication,
routing, font loading or signed-share regression. After rollback, repeat the
six-host HTTPS probe, login/status smoke and `/api/status` read. The font-path
disclosure will return with version 146, so a rollback must be followed by an
incident fix rather than treated as a stable privacy resolution. Do not report
overall recovery unless status evidence is fresh and operational.

Migration 0159 is additive. An older application can ignore its new table and
columns, so an application-only rollback should not edit D1. It would, however,
remove the new lockout/encryption behavior and is therefore a short-lived
incident action, not a preferred steady state.

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
