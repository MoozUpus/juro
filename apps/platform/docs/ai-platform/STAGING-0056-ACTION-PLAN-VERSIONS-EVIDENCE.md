# STAGING-0056 — action-plan version history

Date: 2026-08-01  
Environment: protected staging only  
Worker: juro-platform-staging, version febbfe45-1713-4e39-8ced-38d7e8b75b59  
D1: juro-staging (bb716a96-b2fb-4823-90d6-6c228fed181a)  
Migration: 0051_noisy_nuke.sql

## Implemented behavior

- Case creation writes action-plan version 1 with the complete initial step snapshot.
- A successful optimistic step update writes a new immutable plan snapshot with the next plan revision.
- GET /api/platform/cases/:caseId/plan-versions requires the active session and workspace ownership, then returns newest-first plan history.
- D1 enforces immutability of snapshots with separate update and delete triggers. Cascade deletion remains possible only as part of removing the parent plan.

## Recovery checkpoint before migration

A private staging export was taken before migration and round-tripped through the private backup bucket.

- Object key: d1/juro-staging/20260801T011803Z/pre-0051-full.sql
- Bytes: 589,688
- SHA-256: 5ad2a7a06dd207a5923e22088fc8e8c364d1dbd0454367150d26a81294c2e9d8
- Downloaded checksum: identical

The export URL is deliberately not recorded.

## Remote postflight

- Wrangler 4.92.0 applied 6 SQL commands successfully.
- Migration ledger reports no pending migrations.
- PRAGMA quick_check returned ok.
- PRAGMA foreign_key_check returned no rows.
- action_plan_versions, action_plan_versions_no_update, and action_plan_versions_no_delete are present.

## Code checks

- npm run type-check — pass.
- npm run lint — pass.
- npm test — 87/87 pass.
- npm run build:staging — pass.
- npm run validate:cloudflare:matrix — pass; production was dry-run only.
- npm run cf:types:check — pass after regenerating worker-configuration.d.ts.

## Limits

Authenticated browser E2E of creating and editing a staging case remains pending because the staging site is owner-only Cloudflare Access and no synthetic test session was provisioned in this run. The route is nevertheless in the deployed server artifact and its server authorization, migration, static contract, and D1 integrity are verified.