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
- `DB` — Cloudflare D1 binding.
- `BUCKET` — private Cloudflare R2 binding.

Do not use `NEXT_PUBLIC_*` for credentials.

## Pre-deployment checks

```bash
npm ci
npm run lint
npm run type-check
npm test
npm run validate:artifact
```

Run the local integration flow only against an isolated D1/R2 environment:

```bash
npm run smoke:document-builder
npm run smoke:document-comparison
```

The smoke flows create and remove test documents, comparisons, share links, collaborators, monitoring preferences, and generated files. Never point them at production.

## Database migration

Migrations are ordered in `drizzle/0000_*.sql` through `drizzle/0010_*.sql`. Before production deployment:

1. Take a D1 backup.
2. Apply the pending migrations in order.
3. Verify the migration ledger.
4. Confirm that pre-existing user profiles received a default workspace and that tenant-owned records received `workspace_id`.
5. Verify `document_comparisons`, `comparison_changes`, `legislation_updates`, and `monitoring_preferences`.
6. Run read-only counts for users, documents, cases, comparisons, and bookings before and after migration.

Do not delete the backup tables created by migration `0004` during the release window.

## Smoke checklist

- `/login` and `/register` render without exposing environment values.
- Resend returns a real success before the UI moves to the OTP step.
- Invalid, expired, replaced, and exhausted OTP states are distinct.
- Onboarding persists locale, account type, goal, workspace, consent, and audit event.
- Private routes redirect a guest to `/login`.
- `/document-builder-test/*` returns `308` to `/document-builder/*`.
- Private APIs return `401` without a valid session and `Cache-Control: private, no-store`.
- PDF and DOCX uploads remain private and reject invalid type or size.
- Comparison accepts only validated PDF/DOCX bytes, preserves SHA-256 hashes, and rejects cross-tenant access.
- Deterministic comparison, side-by-side data, redline, PDF report, and editable DOCX export complete without an AI key.
- Legislation monitoring returns no synthetic entries and keeps automatic publication disabled.
- Workspace switching rejects every workspace without an active membership.
- Archive invalidates active signed links; restore does not reactivate them.
- `robots.txt` blocks the application and response headers include `X-Robots-Tag: noindex`.

## Rollback

1. Stop new writes if a migration or authorization regression is detected.
2. Redeploy the previously saved Sites version.
3. If the schema migration changed production data, restore the pre-migration D1 backup; do not attempt a destructive reverse migration in place.
4. Revoke sessions and invitation/share tokens if authorization boundaries may have been affected.
5. Verify login, one tenant-isolation query, one private file request, and one legacy redirect before reopening traffic.

Rolling back application code without rolling back an incompatible database change is not considered a complete rollback.
