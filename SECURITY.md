# Security policy

## Reporting a vulnerability

Do not disclose a suspected vulnerability, secret, personal data or user document in a public GitHub issue.

Use a private GitHub Security Advisory for this repository or contact the repository owner through an agreed private channel. Include:

- the affected route, component or commit;
- reproducible steps with non-production data;
- expected and observed behaviour;
- impact and suggested mitigation;
- whether credentials or personal data may have been exposed.

## Repository rules

- Never commit `.env` files, private keys, tokens, database dumps, R2 exports, production logs or user documents.
- Keep AI and storage credentials server-side.
- Rotate any credential that is accidentally committed; deleting it from the latest revision is not sufficient.
- Require review for authentication, authorization, public sharing, migrations and file-access changes.
- Test owner/collaborator permissions and IDOR resistance before release.
