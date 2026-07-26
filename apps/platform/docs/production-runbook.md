# JURO app production runbook

## Required configuration

The following values are configured in the deployment environment and never committed:

- `APP_URL` — canonical application origin (`https://app.juro.uz`).
- `PUBLIC_SITE_URL` — canonical marketing origin (`https://juro.uz`).
- `RESEND_API_KEY` — server-only Resend credential.
- `EMAIL_FROM` — verified sender, expected `JURO <no-reply@juro.uz>`.
- `AI_PROVIDER`, `AI_PROVIDER_API_KEY` — server-only AI adapter configuration.
- `OPENAI_API_KEY`, `OPENAI_MODEL` — optional OpenAI adapter aliases.
- `LEGISLATION_FEED_PROVIDER`, `LEGISLATION_FEED_API_KEY` — server-only adapter for an approved official Uzbekistan legislation feed. Their presence does not enable automatic publication.
- `PAYMENT_PROVIDER`, `PAYMENT_API_KEY`, `PAYMENT_WEBHOOK_SECRET` — payment adapter configuration.
- `ALLOW_PLATFORM_AUTH_HEADERS` — leave empty unless a trusted edge strips client-supplied `oai-authenticated-*` headers and injects authenticated values.
- `IDENTITY_KEYRING` — versioned server-only AES/HMAC key ring. Required before
  enabling TOTP or identity encryption; never store it in `wrangler.jsonc`.
- `IDENTITY_PROTECTION_MODE` — non-secret rollout gate. Keep `legacy` in all
  checked-in environments; `dual_write` requires the reviewed staging gates
  below and is not authorized for production.
- `DB` — Cloudflare D1 binding.
- `BUCKET` — private Cloudflare R2 binding.
- `BACKUP_BUCKET`, `QUARANTINE_BUCKET` — environment-specific protected R2 bindings.
- Queue, Vectorize, and Analytics Engine bindings declared in `wrangler.jsonc`.

Do not use `NEXT_PUBLIC_*` for credentials.

## Pre-deployment checks

```bash
npm ci
npm run cf:types:check
npm run lint
npm run type-check
npm test
npm run validate:artifact
npm audit --omit=dev --audit-level=high
```

Run the local integration flow only against an isolated D1/R2 environment:

```bash
npm run smoke:document-builder
npm run smoke:document-comparison
```

The smoke flows create and remove test documents, comparisons, share links, collaborators, monitoring preferences, and generated files. Never point them at production.

## Database migration

Migrations are ordered in `drizzle/0000_*.sql` through
`drizzle/0018_*.sql`. Before any remote deployment:

1. Record the exact environment, D1 ID, schema ledger, and application version.
2. Take an independent D1 backup and verify its checksum/manifest.
3. Restore it into an isolated database and run integrity checks.
4. Apply the pending migrations in order.
5. Verify the migration ledger and foreign keys.
6. Confirm that pre-existing user profiles received a default workspace and that tenant-owned records received `workspace_id`.
7. Verify `document_comparisons`, `comparison_changes`,
   `legislation_updates`, `monitoring_preferences`, `job_outbox`, `job_runs`,
   `auth_devices`, `security_events`, `auth_totp_credentials`,
   `auth_backup_codes`, `auth_mfa_challenges`, and
   `auth_mfa_factor_claims`, plus the nullable profile identity-protection
   columns and completeness triggers from 0016, plus the nullable invitation
   evidence columns, lookup indexes, and completeness triggers from 0017,
   plus the nullable OTP/deletion challenge HMAC fields, OTP lookup indexes,
   and completeness triggers from 0018.
8. Run read-only counts for users, documents, cases, comparisons, and bookings before and after migration.
9. Require both tenant-link audits to return zero:

   ```sql
   SELECT count(*) FROM documents WHERE workspace_id IS NULL;
   SELECT count(*) FROM document_files WHERE workspace_id IS NULL;
   ```

Do not delete the backup tables created by migration `0004` during the release window.
Those same-database tables are not a substitute for the independent backup and restore rehearsal.

Migrations `0011`–`0018` have passed local sequence, foreign-key,
sentinel-preservation, tenant-backfill, append-only trigger, chain-fork, and
snapshot tests. They have not been applied to staging or production.

Keep `IDENTITY_PROTECTION_MODE=legacy` while applying 0016–0018. Before any
staging-only `dual_write` proposal, configure the protected key ring, invoke
the bounded backfill through a reviewed isolated harness, prove zero
legacy/divergent/rotation-required profile rows, and rehearse rollback. The
current source does not authorize clearing plaintext, removing legacy
invitation/challenge hashes, or changing production. Active legacy invitations
must expire or be revoked/reissued before a later contract migration. A
challenge's ten-minute expiry alone does not authorize row deletion or
pseudonymization: first classify MFA, policy, and deletion-request references
through a dry-run retention plan.

## Smoke checklist

- `/login` and `/register` render without exposing environment values.
- Resend returns a real success before the UI moves to the OTP step.
- Invalid, expired, replaced, and exhausted OTP states are distinct.
- Parallel OTP requests create one active challenge, and one valid OTP creates
  at most one session claim.
- With a protected staging key ring and `dual_write`, OTP email/IP rate limits
  match the active and retained HMAC key versions; keyed/SHA divergence fails
  before attempt or session side effects.
- A new email-code login creates one device-aware primary-assurance session,
  with a 30-day absolute and seven-day idle limit.
- For an account with active MFA, email OTP creates only a five-minute
  pre-auth challenge; it must not create a primary session.
- TOTP enrollment encrypts the secret, confirmation displays ten backup codes
  once, and a consumed backup code cannot be reused.
- TOTP and backup-code login, regeneration, and disable remain replay-safe
  under parallel requests; a losing operation cannot revoke or downgrade the
  winner's session.
- Missing, malformed, and unknown-version `IDENTITY_KEYRING` values fail
  closed without issuing a session or exposing configuration detail.
- Deletion-code evidence is bound to challenge, user, and current local
  session; keyed/SHA divergence cannot create a deletion request, audit event,
  or session revocation.
- Session listing marks the current local session, never claims to include
  external-provider sessions, and allows only owner-scoped single/other/all
  revocation.
- A forced security-event failure rolls back the associated session creation
  or revocation, and stored events reject update/delete.
- OTP request, verification, and logout reject missing or foreign-origin CSRF
  writes.
- MFA verification, setup, confirmation, backup-code regeneration, and
  disable reject missing or foreign-origin CSRF writes.
- Platform-auth headers cannot manage or satisfy JURO MFA. Keep
  `ALLOW_PLATFORM_AUTH_HEADERS` absent unless the trusted edge has been proven
  to strip client values and inject authenticated headers.
- Onboarding persists locale, account type, goal, workspace, consent, and audit event.
- Private routes redirect a guest to `/login`.
- `/document-builder-test/*` returns `308` to `/document-builder/*`.
- Private APIs return `401` without a valid session and `Cache-Control: private, no-store`.
- PDF and DOCX uploads remain private and reject invalid type or size.
- Comparison accepts only validated PDF/DOCX bytes, preserves SHA-256 hashes, and rejects cross-tenant access.
- Deterministic comparison, side-by-side data, redline, PDF report, and editable DOCX export complete without an AI key.
- Legislation monitoring returns no synthetic entries and keeps automatic publication disabled.
- Workspace switching rejects every workspace without an active membership.
- Pending document invitations cannot read document content; access starts
  only after acceptance.
- Owned documents and standalone files from a non-active workspace are denied;
  accepted external collaboration remains available in the shared scope.
- Archive invalidates active signed links; restore does not reactivate them.
- `robots.txt` blocks the application and response headers include `X-Robots-Tag: noindex`.

## Rollback

1. Stop new writes if a migration or authorization regression is detected.
2. Redeploy the previously saved Sites version.
3. If the schema migration changed production data, restore the pre-migration D1 backup; do not attempt a destructive reverse migration in place.
4. If MFA authentication is unstable, stop new enrollments and preserve the
   additive MFA rows and key versions. Roll back only to an MFA-aware saved
   version that still enforces the pre-auth gate; never deploy pre-MFA code
   while any active credential exists. Do not delete credentials or rotate
   keys during the incident.
5. Revoke sessions and invitation/share tokens if authorization boundaries may have been affected.
6. Verify email-only and MFA login, one tenant-isolation query, one private
   file request, and one legacy redirect before reopening traffic.

Rolling back application code without rolling back an incompatible database change is not considered a complete rollback.
