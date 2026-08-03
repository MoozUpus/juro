# JURO rollback plan

Updated: 2026-07-30
Scope: protected staging; production execution is not authorized.

## Cinematic prototype

The design slice is additive and schema-free. Immediate rollback is Worker traffic to the previous verified staging version or removal of the staging-only route files in a follow-up artifact. Existing canonical routes and CSS remain intact.

## Functional platform

Use feature flags and queue pause before data restoration. Roll back application code first. Additive D1 migrations may remain unused. Use the recorded Time Travel bookmark or verified export only for demonstrated corruption, under maintenance, after preserving current evidence. Retain private R2 data unless an exact deletion is separately approved.

## Stop conditions

Rollback on authentication outage, cross-tenant exposure, upload/delete corruption, uncontrolled provider cost, persistent queue replay, critical accessibility regression, document-builder regression, or unexpected public exposure of staging.

Production rollback requires an approved production change set, a fresh backup/restore rehearsal, exact prior version IDs, and the two owner approvals; this document grants no production action.

## Migration 0062 / memory rollback

Before staging activation, preserve a verified private D1 checkpoint and the
previous Worker version. If memory causes decryption, tenant, export or AI-chat
regressions, first deploy the previous Worker; additive memory tables remain
unused and no down migration is required. Do not delete the tables during an
incident. Restore D1 only for demonstrated corruption after preserving current
evidence. A malformed `IDENTITY_KEYRING` keeps memory unavailable by design and
must be corrected through Cloudflare secret entry, never through chat or Git.
