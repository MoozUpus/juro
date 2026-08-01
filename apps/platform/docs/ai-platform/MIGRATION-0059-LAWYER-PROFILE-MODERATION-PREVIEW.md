# Migration 0059 — revision-bound lawyer profile moderation

Status: locally implemented and verified; not applied to staging or production.

`0059_pretty_punisher.sql` extends the existing `lawyer_profiles` domain without
copying it. It adds an integer `profile_revision` (defaulting to 1) and an
append-only `lawyer_profile_moderation` journal keyed by profile and revision.
The journal contains the decision, moderator identifier, optional bounded reason,
SHA-256 digest of the reviewed profile facts, and timestamp.

At the D1 boundary:

- direct updates of `status` and `public_approved_at` fail unless the matching
  moderation record exists;
- direct updates and deletes of accepted moderation rows fail;
- approved/rejected entries update the parent only while it is still pending for
  that exact revision;
- a self-service profile edit increments the revision and returns the record to
  `pending`, so a previously approved profile is never silently republished.

The associated protected staff API and UI require the `lawyer.profiles.moderate`
capability and fresh MFA. They add an immutable moderation row and workspace
audit event in the same D1 batch. The public directory keeps reading only the
existing `public_approved` projection. This does not turn a self-declared
advocate status into a verified credential.

Local evidence:

```text
npm run type-check          PASS
npm run lint                PASS
npm test                    PASS (377 core + 90 Cloudflare tests)
npm run validate:artifact   pending re-run after documentation-only change
```

Staging runbook: create a fresh Time Travel bookmark, export `juro-staging` to
private `juro-staging-backups`, checksum and round-trip verify the export, confirm
only `0058` and `0059` are pending, apply them in order, redeploy the staging
Worker, then repeat integrity and backup verification. Application rollback is
the prior Worker plus feature-disabled routes; because both migrations are
additive, their fields and journal remain harmlessly unused. Production is not
authorized.
