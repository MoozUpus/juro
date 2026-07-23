# JURO — «Юрист в кармане»

JURO is a LegalTech product for Uzbekistan that combines a public website, a user platform, an AI-assisted legal workflow, document analysis and generation, and escalation to a human lawyer.

This repository is a monorepo containing the current source snapshots behind:

- `https://juro.uz` — public website;
- `https://app.juro.uz` — user platform;
- `https://app.juro.uz/document-builder-test` — isolated document-builder module.

The source code is complete enough to build both deployed applications. Runtime data, hosted database contents, private object-storage files, DNS configuration, TLS certificates and secret values are intentionally not stored in Git.

## Repository layout

```text
juro-platform/
├── apps/
│   ├── website/        # juro.uz
│   └── platform/       # app.juro.uz and document-builder-test
├── docs/
│   └── MIGRATION.md
├── .github/
│   └── workflows/ci.yml
├── .env.example
├── .gitignore
├── SECURITY.md
├── package.json
└── README.md
```

The two applications retain their original package manifests, lockfiles, build scripts and hosting manifests. They can be developed and deployed independently.

## Technology stack

| Area | Current implementation |
|---|---|
| Language | TypeScript |
| UI | React 19, Next.js App Router |
| Build/runtime adapter | Vite 8, Vinext, Cloudflare Workers |
| Styling and UI | CSS, Tailwind toolchain, Framer Motion, Lucide React |
| Backend | Next.js route handlers compiled for Cloudflare Worker runtime |
| Database | Cloudflare D1 (SQLite) with Drizzle ORM and SQL migrations |
| File storage | Private Cloudflare R2 bucket |
| Authentication | Sites/ChatGPT identity headers for protected builder routes; the main prototype login remains browser-local demo logic |
| AI | Server-side OpenAI Responses API integration for the document builder |
| Document generation | DOCX, PDF and ZIP generation in the platform application |
| Package manager | npm with committed `package-lock.json` files |

## System requirements

- Node.js `>=22.13.0`;
- npm compatible with the committed lockfiles;
- Linux for the provided bounded install/build helper scripts (`bash`, `flock`, `curl`, GNU `timeout`);
- Cloudflare-compatible D1 and R2 bindings for persistent document-builder functions;
- an OpenAI API key only if live AI review is required.

## Installation

Install both applications from the repository root:

```bash
npm run install:all
```

Or install one application:

```bash
npm --prefix apps/website ci
npm --prefix apps/platform ci
```

## Local development

Public website:

```bash
npm run dev:website
```

User platform:

```bash
npm run dev:platform
```

Copy `.env.example` to a local ignored environment file and supply only the values required for the feature being tested. Never commit `.env`, API keys, access tokens, database exports or user data.

Local D1 and R2 resources are simulated by the existing Vite/Cloudflare configuration. Production bindings are supplied by the hosting platform.

## Environment and bindings

| Name | Required | Scope | Purpose |
|---|---:|---|---|
| `OPENAI_API_KEY` | For live AI only | Server | OpenAI Responses API authentication |
| `OPENAI_MODEL` | No | Server | Model override; defaults to `gpt-5.6-sol` |
| `JURO_SMOKE_BASE_URL` | No | Test process | Base URL for the document-builder smoke test |
| `DB` | Yes for persisted builder features | Worker binding | Cloudflare D1 database |
| `BUCKET` | Yes for generated/uploaded files | Worker binding | Private Cloudflare R2 bucket |
| `ASSETS` / `IMAGES` | Hosting-managed | Worker bindings | Static assets and image optimization |

`DB`, `BUCKET`, `ASSETS` and `IMAGES` are platform bindings, not secrets placed in `.env`.

## Quality checks

From the repository root:

```bash
npm run lint
npm run type-check
npm test
npm run build
npm run validate:artifact
```

The application-level test scripts also validate the deployable Worker artifact. The platform test suite checks the document-builder logic and generated file structures.

## Routes

### Public website (`apps/website`)

| Route | Status |
|---|---|
| `/` | Public JURO landing page |
| `/landing-test` | Isolated premium landing experiment |
| `/lending-test` | Backward-compatible misspelled alias retained from the source |

### User platform (`apps/platform`)

| Route | Status |
|---|---|
| `/` | Main interactive platform prototype |
| `/document-builder-test` | Document-builder entry |
| `/document-builder-test/documents` | User documents |
| `/document-builder-test/documents/[id]` | Document workspace |
| `/document-builder-test/contacts` | Contacts |
| `/document-builder-test/notifications` | Notifications |
| `/document-builder-test/share/[token]` | Main document share link |
| `/document-builder-test/signed-share/[token]` | Signed-PDF code access |

The main login, registration, dashboard, AI chat, voice, analysis, operator and profile screens currently exist as internal React states under `/`; they are not separate directly addressable URL routes. The document-builder routes and APIs are server-backed.

## Database and file storage

`apps/platform/db/schema.ts` defines the document-builder D1 schema. Migrations are committed in `apps/platform/drizzle/`.

Generated documents, attachments and signed PDFs are stored as private R2 objects. The application returns files through permission-checked backend endpoints; it does not require permanent public bucket URLs.

The public website keeps optional D1 scaffolding in the source, but its hosting manifest currently sets D1/R2 to `null` and its application schema is intentionally empty.

## Deployment

### Lowest-risk path: preserve the current runtime

Deploy `apps/website` and `apps/platform` as two independent Cloudflare Worker/Vinext applications:

1. provision the hosting-managed asset and image bindings;
2. provision D1 and apply `apps/platform/drizzle/*.sql`;
3. provision a private R2 bucket and bind it as `BUCKET`;
4. add `OPENAI_API_KEY` as a server-side secret if live AI review is enabled;
5. deploy first to preview hostnames;
6. test all critical routes, files and permissions;
7. switch DNS only after acceptance.

### Portable hosting path

A conventional Node.js host can run the frontend applications, but the current backend is Cloudflare-specific. Moving to PostgreSQL and S3-compatible storage requires a planned adapter migration:

- convert Drizzle schema imports from `sqlite-core` to `pg-core`;
- create and test PostgreSQL migrations;
- replace `cloudflare:workers` D1/R2 access with database and object-storage adapters;
- replace Sites identity headers with the chosen OIDC/session provider;
- preserve server-side ownership and collaborator checks;
- migrate existing D1 records and R2 objects before DNS cutover.

Do not point `juro.uz` or `app.juro.uz` to a new host until preview acceptance, data migration verification, rollback preparation and backups are complete.

## DNS, SSL and operations

- Keep `juro.uz` and `app.juro.uz` as separate deployment targets.
- Use a temporary preview hostname for migration testing.
- Configure managed TLS and HTTP-to-HTTPS redirects before cutover.
- Lower DNS TTL before a planned migration, then restore it after stability is confirmed.
- Back up the database and object storage before schema migration or DNS cutover.
- Run migrations as an explicit deployment step with rollback/restore procedures.
- Collect structured server logs without document text, PINFL, tokens or API keys.
- Add error monitoring, uptime checks for both domains, API health checks and alerts for failed document generation.

See [docs/MIGRATION.md](docs/MIGRATION.md) for the source audit and migration checklist.

## Security

- Secret files and private keys are ignored.
- AI credentials remain server-side.
- D1/R2 access is mediated by the backend.
- Public-share tokens are high-entropy and stored as hashes where implemented.
- Private routes set no-store/noindex protections.
- Do not commit production database dumps, R2 exports, user documents or logs.
- Rotate any credential immediately if it is ever committed.

Security reports should follow [SECURITY.md](SECURITY.md).

## Branches and Pull Requests

- Protect `main`; deploy only reviewed, passing commits.
- Create feature branches as `feature/<short-name>`, fixes as `fix/<short-name>` and operational work as `chore/<short-name>`.
- Keep each Pull Request focused and describe user impact, migrations, environment changes and rollback steps.
- Require CI, code review and security review for auth, permissions, database, storage and public-link changes.
- Never merge secrets or production user data.

## Current product boundaries

The repository contains production-capable document-builder backend code, but several screens in the broader platform remain interactive prototypes. In particular, the main registration/login flow, general AI chat, voice/avatar, operator queue, payments and much of the dashboard use browser-local state or demonstration data. They require separate backend integrations before being represented as live services.
