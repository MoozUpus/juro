# JURO deployment notes

JURO has two independent deployment targets: the public website at juro.uz and the protected platform at app.juro.uz. Keep their release, rollback and acceptance paths separate.

## Cloudflare deployment model

- apps/website is the public website Worker/Vinext application.
- apps/platform is the protected application Worker with D1, private R2, document-generation and server-side AI workflows.
- apps/admin is a separate Worker surface for administration and must not be treated as a public application.

The platform uses Cloudflare D1 migrations in apps/platform/drizzle/. Its file workflows require private R2 bindings. Secrets, including AI and email-provider credentials, belong in the hosting secret store and must never be committed.

## Release sequence

1. Build and validate the affected application from its committed lockfile.
2. Deploy to the appropriate preview or staging hostname.
3. Verify routes, authorization boundaries, document access and generated files with synthetic data.
4. Back up D1 and R2 before a schema migration or any production cutover.
5. Apply D1 migrations as an explicit deployment step and retain a tested restore path.
6. Confirm the separate website and platform deployment targets, bindings and custom domains.
7. Obtain release approval before production traffic or DNS is changed.
8. Keep the previous deployable Worker version available for rollback and monitor redacted server logs after release.

## Operational safeguards

- Use production-scoped Wrangler configuration for production checks and migrations; do not infer production state from development defaults.
- Do not change DNS, TLS, custom domains, bindings, secrets or data stores as part of a documentation-only pull request.
- Do not log document text, tokens, API keys, PINFL or private files.
- Verify owner/collaborator permission boundaries and R2 access before release.
- Run restoration exercises for backups instead of assuming a backup is usable.

For the original source and migration audit, see [MIGRATION.md](MIGRATION.md). Report vulnerabilities through [SECURITY.md](../SECURITY.md).
