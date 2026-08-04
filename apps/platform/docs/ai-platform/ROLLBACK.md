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

## Migration 0084 / operational feature-control rollback

Before staging activation, capture and round-trip-verify a fresh private D1 export and record the active Worker version. Apply `0084` before deploying code that queries the table. If a feature guard causes a false stop, unexpected latency or a staff-access regression, first restore traffic to the previous verified Worker. The additive immutable history table may remain unused; do not drop it or delete operator evidence during the incident.

If one capability is unhealthy but the console remains trustworthy, prefer the narrow server-enforced feature stop over a whole-application rollback. If history integrity fails, covered execution fails closed: preserve D1/R2 evidence and roll back the Worker. Restore D1 only for proven corruption after recording the damaged state and validating the private backup in isolation. Production activation and rollback still require their own backup, exact production version and explicit owner approval.

## Migration 0085 / operational job-redrive rollback

Apply `0085` before deploying the jobs console/API. Record a fresh verified
private D1 export and the previous Worker version. If the monitor, authorization
boundary or redrive policy regresses, pause affected producers/consumers and
restore traffic to the previous Worker first. The additive immutable event
table and triggers may remain unused; do not drop them or delete evidence.

A redrive may already have reopened the same outbox row. Before rollback,
capture job/outbox/domain-effect state and either let the fenced job reach one
terminal state or pause its consumer. Do not create a replacement job. Restore
D1 only for demonstrated corruption after preserving the current database and
verifying the selected private backup in isolation.

## Migration 0086 / platform audit-access rollback

Apply `0086` before deploying the audit console/API and record a fresh verified
private D1 export plus prior Worker version. If authorization, safe projection,
CSV or access-evidence behavior regresses, restore the prior Worker first. The
additive access-evidence table may remain unused; do not drop it or delete its
rows during an incident.

If chain verification fails, preserve the affected database and application
logs, disable the console route and investigate before any restore. This chain
records access to the projection, so rollback must not be described as proving
integrity of every source table. Restore D1 only for demonstrated corruption
after isolated backup verification.
