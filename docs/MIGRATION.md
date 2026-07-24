# JURO source migration report

Date of source audit: 24 July 2026.

## 1. Source provenance

The repository was assembled from the current source snapshots of two existing JURO Sites projects:

| Application | Domain | Repository path |
|---|---|---|
| JURO public website | `juro.uz` | `apps/website` |
| JURO user platform | `app.juro.uz` | `apps/platform` |

The document builder is part of the user-platform source at canonical route `/document-builder`; the historical test route is redirect-only.

The source was imported as a clean snapshot rather than by copying the original internal Git history. This prevents hosting credentials, temporary build state and unrelated platform metadata from entering the new repository history.

## 2. Files received

The public website snapshot contained 58 tracked files, including:

- Next.js/Vinext application source;
- the production landing page;
- `/landing-test` and `/lending-test`;
- public brand assets;
- package manifest and npm lockfile;
- Cloudflare Worker and build configuration;
- lint, build, artifact-validation and route tests.

The platform snapshot contained 134 tracked files, including:

- the main JURO interactive application;
- the complete document-builder UI;
- 20 document-builder API route files;
- D1 schema and two SQL migrations;
- D1/R2 storage code;
- server-side permission and validation logic;
- OpenAI server integration;
- DOCX, PDF and ZIP generators;
- document templates, fonts and brand assets;
- automated tests and a D1/R2 smoke script;
- package manifest and npm lockfile.

## 3. Technical assessment

Both snapshots are real TypeScript source projects, not static website downloads. They include `package.json`, npm lockfiles, source components, routing, Worker entry points, build scripts and test code.

The platform snapshot includes backend code for the document builder. The broader main application is still partly a frontend prototype: its login, registration, dashboard, general AI chat, voice/avatar, operator, payment and several document-analysis flows use local browser state or demonstration content.

The public website does not have an application database schema or production business backend. Its hosting manifest sets D1/R2 to `null`; the remaining database helper is optional scaffolding and the schema is intentionally empty.

## 4. Components not included

The following are external runtime resources and were not present in, or copied into, the source repository:

- production D1 database contents;
- private R2 objects, uploaded files and generated documents;
- server-side OpenAI secret values;
- Sites-managed authentication sessions and identity configuration;
- DNS-zone access and current DNS records;
- TLS private keys or certificates;
- production logs, analytics datasets and user records;
- payment, telephony, email or live-operator provider integrations.

These omissions are expected for a safe source migration. They must be exported or reconfigured separately if the project leaves its current hosting platform.

## 5. Secret audit

The current tracked source was scanned for common high-confidence patterns covering:

- private keys;
- OpenAI and Anthropic keys;
- Google API keys;
- GitHub tokens;
- AWS access keys;
- access/refresh tokens and credential files.

No live secret matching these patterns was found. No `.env` file was present in either source snapshot.

The code references the following configuration names without containing their values:

- `OPENAI_API_KEY`;
- `OPENAI_MODEL`;
- `JURO_SMOKE_BASE_URL`;
- D1 binding `DB`;
- R2 binding `BUCKET`;
- hosting-managed `ASSETS` and `IMAGES`.

The UI contains a visibly labelled demonstration account string. It is presentation data for the prototype and is not a server credential. It must not be reused as a production password.

If a secret was ever supplied to an earlier build outside the tracked source, the owner should verify the hosting secret store and rotate it before migrating environments.

## 6. Route audit

| Route or function | Location | Result |
|---|---|---|
| `/` public landing | `apps/website` | Present |
| `/landing-test` | `apps/website` | Present |
| `/lending-test` alias | `apps/website` | Present |
| `/` platform | `apps/platform` | Present |
| `/document-builder` | `apps/platform` | Present as the canonical entry |
| `/document-builder-test/*` | `apps/platform` | Present as backward-compatible redirects |
| document list/workspace | `apps/platform` | Present as direct routes |
| contacts and notifications | `apps/platform` | Present as direct routes |
| document and signed-PDF share pages | `apps/platform` | Present as direct routes |
| login and registration | `apps/platform` | Present as internal UI states, not URL routes |
| dashboard | `apps/platform` | Present as an internal UI state |
| general AI chat | `apps/platform` | Present as a demonstration UI state |
| document analysis | `apps/platform` | Present as a demonstration UI state outside the builder |
| live operator | `apps/platform` | Present as a demonstration UI state |

## 7. New-hosting requirements

### Frontend

Run the two applications as separate deployments. Preserve independent release and rollback for `juro.uz` and `app.juro.uz`.

### Backend

The document-builder backend currently depends on Cloudflare Worker runtime APIs. The fastest migration keeps Cloudflare Workers. A move to a generic Node.js runtime requires storage, database and identity adapters.

### PostgreSQL

PostgreSQL is not the current database. Before adopting it:

1. convert the Drizzle schema from SQLite to PostgreSQL types;
2. define explicit constraints and indexes;
3. generate reviewed migrations;
4. export D1 data;
5. transform and import it into a staging database;
6. compare row counts, references and sample records;
7. freeze writes for final delta migration;
8. keep a tested restore point.

### File storage

Keep objects private. On a non-Cloudflare host, use S3-compatible storage with server-side encryption, versioning, lifecycle rules, access logging and backend-issued short-lived access only after permission checks.

### Authentication

Sites identity headers do not automatically exist on another host. Replace them with a production OIDC/session solution and map stable user IDs before migrating database ownership records.

### AI

Add `OPENAI_API_KEY` only to the server secret store. Do not expose it through frontend-prefixed environment variables or build output.

### DNS and SSL

Do not change current production DNS during source import. For the eventual cutover:

1. deploy both applications to preview hostnames;
2. complete functional, security and data-migration acceptance;
3. configure TLS and redirects;
4. lower TTL before the approved change window;
5. back up current D1/R2 data;
6. update `juro.uz` and `app.juro.uz` separately;
7. monitor errors and keep the previous hosting target available for rollback.

Exact DNS values depend on the selected host and must be taken from that host's verified custom-domain instructions.

## 8. CI/CD recommendation

The included GitHub Actions workflow installs from each committed lockfile and runs lint, TypeScript checks, tests, builds and artifact validation.

Recommended deployment policy:

- Pull Request: validation only;
- merge to protected `main`: deploy to a non-production environment;
- manual approval: deploy production;
- run database migrations before application traffic shifts;
- retain the previous deployable artifact;
- prohibit deployment when required secrets or bindings are missing.

## 9. Backup, logging and monitoring

- automated database backups with periodic restore tests;
- R2/S3 versioning or replicated object backups;
- encrypted backup retention aligned with legal and privacy requirements;
- structured logs with request IDs and redaction of document text, PINFL, tokens and secrets;
- error monitoring for frontend and Worker/backend exceptions;
- uptime checks for both domains and critical API endpoints;
- alerts for failed migrations, generation failures, storage errors and abnormal public-link traffic;
- audit events for document ownership, collaborator changes and share-link lifecycle.

## 10. Owner actions before a new-hosting launch

The owner must:

1. choose the target hosting architecture;
2. grant the deployment system access to the target account;
3. create production and preview environments;
4. add secrets and bindings through the host's secret manager;
5. export/migrate D1 records and R2 objects if existing production data must move;
6. select and configure replacement authentication if leaving Sites;
7. approve DNS changes only after acceptance testing;
8. define backup retention, monitoring recipients and incident contacts;
9. verify legal/privacy requirements for storage location and subprocessors.

The source transfer alone does not move production data or switch either domain.
