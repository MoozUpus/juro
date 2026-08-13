# Contributing to JURO

JURO is maintained as a product repository. Contributions are welcome when they are focused, reviewed and safe for legal, privacy and operational boundaries.

## Before opening a pull request

1. Start from an up-to-date branch and keep the change narrow.
2. Do not include secrets, user data, document files, production exports or private logs.
3. Describe user impact, route or API changes, migrations, environment changes, security impact and rollback considerations.
4. Run the relevant root checks: npm run lint, npm run type-check, npm test, npm run build and npm run validate:artifact.
5. Add screenshots for user-facing changes using synthetic data only.

Changes affecting authentication, authorization, file access, AI-source handling, D1 migrations, R2 storage, public sharing or production configuration require explicit review before release.

## Issues and discussions

Use the issue forms for reproducible bugs and product proposals. Do not use a public issue for a vulnerability, secret, personal data or a private document. Follow [SECURITY.md](../SECURITY.md) for responsible disclosure.

Submitting a pull request does not grant permission to deploy, change DNS, alter production bindings or access production data.
