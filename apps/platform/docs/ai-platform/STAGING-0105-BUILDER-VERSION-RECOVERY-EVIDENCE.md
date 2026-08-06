# Staging 0105 — Builder checkpoint recovery

Date: 2026-08-06

Commit: `2ef429e`

PR: `MoozUpus/juro#3`

Environment: protected staging only. Production was not migrated or deployed.

## Cause and bounded repair

The authenticated staging Builder exposed a real failure: creating a manual
checkpoint returned an operation error. A read-only D1 schema inspection showed
that all three Builder checkpoint tables used the D1-incompatible
`zeroblob()/replace()` SHA-256 `GLOB` expression. Migration `0105` rebuilds only
the metadata/evidence tables and preserves their foreign keys, immutable guards,
R2-key constraints, idempotency constraints, version indexes, projected-write
guards and restore evidence. Hash validation remains exact: 64 lowercase
hexadecimal characters.

## Backup and migration

- D1: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`).
- Pre-migration private R2 backup:
  `d1/juro-staging/20260806T063628Z/pre-0105-full.sql` in
  `juro-staging-backups`.
- Size: `2,446,287` bytes.
- SHA-256: `0258e1a64c91e6c9cc44b4ae5ad1bb8643ee82baf8809990364267dea01b87b2`.
- A private R2 download produced the same SHA-256; temporary local SQL files
  were deleted immediately after the round trip.
- Pre-change Time Travel bookmark:
  `0000090c-00000000-000050bf-51bf2a326a6f7c64e686c38da7ef0f68`.
- Wrangler applied `0105_d1_builder_version_hash_guards.sql`; the remote
  `d1_migrations` ledger records row `106` at `2026-08-06 06:37:02`.
- Post-migration `PRAGMA foreign_key_check` returned zero rows.

## Authenticated staging journey

Only one synthetic Builder document was used. No production or real user
document content was used for this verification.

1. Save an authenticated manual checkpoint.
2. Verify that version `v1` is `ready`, has zero storage attempts/errors, and
   references document revision `7`.
3. Make and autosave a visible synthetic change (revision `8`).
4. Open the explicit, accessible restore dialog; its text explains that the
   current state remains in the revision log.
5. Confirm restoration and verify that the synthetic change disappears from the
   preview and the UI reports successful restoration.
6. D1 records a restore event from revision `10` to `11`; the checkpoint itself
   remains ready and immutable. The extra revisions are normal autosave fences
   around the explicit restore operation.
7. Reopen the dialog and press Escape: it closes without a mutation. The tab
   reported no warning or error console entries during the completed flow.

The native browser confirmation was replaced by a semantic `<dialog>` with
visible Cancel/Restore controls. This makes the destructive restoration step
inspectable, keyboard-cancellable and testable without relying on browser-native
prompt behavior.

## Checks and deployment

- `npm run type-check` — passed.
- `npm run lint` — passed.
- `npm run test:cloudflare` — 129 passed, 0 failed.
- `npm run build:staging` — passed.
- Staging Worker deployment: version
  `aa82068e-339d-4a38-a5b0-54aba3dc46e7` at 100% traffic.

## Remaining gates

This evidence closes the authenticated staging Builder checkpoint/create/restore
smoke for the one synthetic document. It does not substitute for full
document-analysis corpus evaluation, collaboration/signature regression, the
complete responsive/mobile accessibility matrix, or any production approval.
