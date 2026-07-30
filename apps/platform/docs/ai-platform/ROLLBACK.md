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
