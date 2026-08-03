# D1 migration checkpoint

## 0066 — voice recordings

Status: additive migration locally verified; not applied to staging or production.

`0066_voice_recordings.sql` adds one tenant-scoped table with five foreign keys, bounded audio metadata, idempotency evidence, non-PII R2 keys, encrypted transcript fields and a 30-day retention index. It adds no destructive statement and does not modify existing document-builder data.

Before staging application:

1. Export/snapshot `juro-staging` into private `juro-staging-backups` and verify the object exists.
2. Record the pre-migration D1 migration list and Worker version.
3. Apply pending migrations `0065` and `0066` in order.
4. Re-run the migration list, `PRAGMA foreign_key_check`, and the voice schema smoke test.
5. Deploy with the repository staging deploy script and run authenticated route smoke tests.

Rollback is application-first: disable or roll back the Worker to the previous version. Because `0066` is expand-only, the unused table may remain safely during incident recovery. Do not drop it in the same release; data removal requires a later reviewed contract migration and a fresh backup.
