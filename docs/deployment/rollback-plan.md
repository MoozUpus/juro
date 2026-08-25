# Rollback plan — Worker 357d0438 / migration 0159

## Application rollback

The immediate application rollback version is
`f91406c2-903b-438f-bafb-01a64f5af2b7`. Confirm the currently active version
before changing traffic; the release version is
`357d0438-1a5f-4b29-ba81-869cbc130c0a`.

Rollback is justified for a release-caused availability, authentication,
routing or signed-share regression. After rollback, repeat the four-host HTTPS
probe, login/status smoke and `/api/status` read. Do not report overall recovery
unless status evidence is fresh and operational.

Migration 0159 is additive. An older application can ignore its new table and
columns, so an application-only rollback should not edit D1. It would, however,
remove the new lockout/encryption behavior and is therefore a short-lived
incident action, not a preferred steady state.

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
