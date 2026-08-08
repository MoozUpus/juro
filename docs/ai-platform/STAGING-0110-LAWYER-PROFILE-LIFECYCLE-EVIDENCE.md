# Staging 0110 — restricted lawyer-profile lifecycle controls

Date: 2026-08-07

## Scope

- Environment: protected staging only.
- Commit: `abe5f3d` (`Add restricted lawyer profile lifecycle controls`).
- Worker version: `3ae7c2d7-57fd-4263-8772-e65a27bf39a8`.
- Production: no Worker, D1 migration, Access policy or public-site change.

## Behaviour enforced

- Lifecycle actions are `suspend`, `block`, `archive` and `restore`.
- A lifecycle event is immutable in D1 and carries a bounded reason and actor.
- A profile in a restricted state is not editable by its owner, cannot be
  public, cannot be listed as a selectable request recipient and cannot be
  booked through legacy request routes.
- `block` requires super-admin authority and fresh MFA. Other lifecycle
  operations require lawyer-profile moderation authority and fresh MFA.
- A restore creates a reviewable state, never an automatic public approval.
- The same D1 batch writes the lifecycle record, workspace audit event and a
  localized RU/UZ in-app notification.

## Backup and migration evidence

| Checkpoint | Evidence |
|---|---|
| Preflight export | Private R2 prefix `d1/juro-staging/20260807T013100Z-0110/`; full SHA-256 `fd36c098cf8c59635ffb4331455f10da42da36f39a66dadba9e5037a6a28ce2d` |
| Preflight restore | `quick_check=ok`, 0 foreign-key violations, 221 tables / 492 indexes / 293 triggers |
| Apply | Wrangler applied 8 statements from `0110_lawyer_profile_lifecycle_controls.sql`; ledger then had no pending migration |
| Postflight export | Private R2 prefix `d1/juro-staging/20260807T013309Z-0110-post/`; full SHA-256 `4546a0a2fa68a327bde430c673bf2b648632fc153f904b19f15c6c4e693238a1` |
| Postflight restore | `quick_check=ok`, 0 foreign-key violations, 222 tables / 494 indexes / 297 triggers / 111 migration records |
| Schema probe | `lawyer_profile_lifecycle_events`, `lawyer_profile_lifecycle_event_state_guard`, and `lawyer_profiles_restricted_marketplace_requires_lifecycle_event` present |

Temporary local plaintext copies used only for isolated restore validation were
deleted immediately after their SHA-256 round trips. No document contents,
user records, session data or secret values are recorded here.

## Verification

| Command | Result |
|---|---|
| `npm run type-check` | passed |
| `npm run lint` | passed |
| `npm test` | passed: 129/129 |
| focused lifecycle/request suites | passed: 24/24 |
| `npm run test:cloudflare` | passed |
| `npm run build:staging` | passed |
| `CLOUDFLARE_ENV=staging npm run validate:artifact` | passed |
| `npm run deploy:staging` | passed, Worker version above |

## Protected staff surface

- Commit `307bf2f` adds status filters and reason-bound lifecycle forms to the
  isolated `juro-admin-staging` Worker. A restricted profile can be restored;
  another profile can be suspended, archived or (only for a server-authorized
  super-admin) blocked. The UI never carries its own authorization decision:
  platform rechecks the separate session, role and fresh MFA for every POST.
- `apps/admin` typecheck and staging dry-run passed. The related platform
  admin/lifecycle contract suite passed 16/16.
- Staging deployment succeeded as Worker
  `0416c908-1eff-4842-9ae7-2fa842ce41ac`, bound only to the private
  `juro-platform-staging` service plus staging environment variables. No D1,
  R2, queue, AI, production binding or schema change was introduced.

## Remaining gate

An authenticated read-only browser smoke for the protected staff control and a
separate, explicitly consented synthetic lawyer-handoff write remain open.
The controllable staging browser still reaches `ERR_TOO_MANY_REDIRECTS` at the
Cloudflare Access boundary before the Worker executes. This does not affect
the migration result but prevents the next browser gate from being claimed.
