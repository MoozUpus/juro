<div align="center">
  <img src="docs/github/hero.svg" width="100%" alt="JURO — AI-powered LegalTech platform for Uzbekistan">
</div>

<div align="center">
  <a href="README.md">English</a> · <a href="README.ru.md">Русский</a> · <a href="README.uz.md">O‘zbekcha</a>
</div>

<div align="center">
  <a href="https://juro.uz">Live website</a> ·
  <a href="https://app.juro.uz">Open platform</a> ·
  <a href="#read-this-repository">Read the dossier</a> ·
  <a href="#product-tour">Product tour</a> ·
  <a href="#product-contract">Product contract</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#quick-start">Quick start</a>
</div>

<br>

<div align="center">
  <img src="docs/github/stack-badges.svg" width="100%" alt="TypeScript, React, Next.js, Cloudflare Workers, D1, R2, OpenAI, Node.js 22 and CI">
</div>

JURO is a LegalTech workspace for Uzbekistan that brings legal questions, document work and next actions into one connected flow. It is built for people and teams who need practical legal information, more structured document workflows and, where appropriate, a route to human legal help.

The public site is available at [juro.uz](https://juro.uz). The protected product platform is available at [app.juro.uz](https://app.juro.uz). This repository contains the source for both applications, their Cloudflare configuration, documentation and quality checks.

## Read this repository

| If you are evaluating… | Start here | Then inspect |
|---|---|---|
| The product experience | [Product tour](#product-tour) and [operating model](#product-operating-model) | [Current status](#current-status) and [trust boundaries](#trust-privacy-and-legal-safety) |
| The legal-AI approach | [How JURO works](#how-juro-works) and the [product contract](#product-contract) | [Product foundations](docs/github/PRODUCT_FOUNDATIONS.md) and source-handling modules |
| The technical architecture | [Architecture](#architecture) | Cloudflare configuration, [deployment](#deployment) and quality commands |
| A safe contribution | [Repository structure](#repository-structure) and [quick start](#quick-start) | [Contributing](#contributing), [security](#security) and the PR template |

## What is JURO?

Finding and understanding legal information can be difficult, while traditional legal services can be fragmented and costly. JURO is designed to reduce that friction: start with a question or document, keep the source and context visible, and continue toward a draft, a plan or a human hand-off when the product supports it.

The product is oriented to Uzbekistan. The public product UI currently offers Russian and Uzbek language surfaces; the repository documentation is also maintained in English for international technical audiences. JURO does not present AI output as individual legal advice or as a substitute for a lawyer.

## At a glance

| Area | Repository-backed fact | What it does **not** imply |
|---|---|---|
| Product shape | Legal questions, document work, cases/action plans and a controlled lawyer hand-off surface share one platform direction. | Every workflow is not necessarily available to every account or deployment. |
| Delivery | The monorepo contains a public website, a protected platform and a separate administrative app. | The administrative or hand-off surfaces are not presented as fully complete services. |
| Legal sources | The source-aware path retrieves query-scoped public Lex.uz and Advice.uz pages and stores citation context. | No official third-party source API or complete legislative corpus is claimed. |
| Runtime | TypeScript, React, Next.js, Vite/Vinext and Cloudflare Worker tooling are used across the repository. | A technology choice is not a claim of legal correctness. |
| Data boundaries | Platform features use Cloudflare D1, private R2 and server-side AI configuration. | No certification, privacy-law compliance status or data-residency claim is made here. |
| Quality gates | Root scripts and CI cover linting, type checks, tests, builds and artifact validation. | A passing check is not a production-release or legal-quality guarantee. |

## Product tour

| Public legal-intelligence entry | Protected workspace |
|---|---|
| <img src="docs/github/screenshots/public-website.webp" alt="JURO public website" width="100%"> | <img src="docs/github/screenshots/platform-dashboard.webp" alt="JURO platform dashboard without account data" width="100%"> |
| Start with a situation, document or next step on the live public website. | Connect a question, source, document and action in the protected workspace. |

| AI legal-chat starting state | Document builder |
|---|---|
| <img src="docs/github/screenshots/ai-chat.webp" alt="JURO AI legal-chat starting state without conversation history" width="100%"> | <img src="docs/github/screenshots/document-builder.webp" alt="JURO document library and builder entry" width="100%"> |
| The product prompts for a legal situation and makes source availability explicit. | Browse document workflows and begin a structured draft. |

| Document review and comparison | Narrow public-product preview |
|---|---|
| <img src="docs/github/screenshots/document-analysis.webp" alt="JURO document review and comparison entry" width="100%"> | <img src="docs/github/screenshots/mobile-experience.webp" alt="Narrow JURO public-product preview" width="100%"> |
| Review and comparison UI is present, with its end-to-end analysis status shown below as PARTIAL. | A narrow presentation crop of the live public product; replace with a verified mobile capture before using it as mobile QA evidence. |

## What users can do

| Capability | User value | Status |
|---|---|---|
| Ask a legal question | Start a structured legal-information workflow with visible source handling. | WORKING |
| Create a document | Build a draft through document workflows and generate supported files. | WORKING |
| Analyze or compare a document | Review a document and compare versions; fresh end-to-end analysis evidence remains incomplete. | PARTIAL |
| Build an action plan | Keep actions, deadlines, documents and legal context connected to a case. | WORKING |
| Request lawyer assistance | Use the controlled lawyer-profile and hand-off surface where available. | PARTIAL |
| Use a production payment service | Not offered as a live payment claim in this repository. | PLANNED |

## Product operating model

<img src="docs/github/operating-model.svg" width="100%" alt="JURO product operating model from legal context to source-aware response, protected work and partial lawyer hand-off">

JURO is organised around a connected sequence rather than an isolated chat screen. A user may begin with a question or document, inspect source-aware information, continue in a protected workspace and, where the current workflow permits, request human assistance.

| Transition | Current status | How it is represented |
|---|---|---|
| Public legal-intelligence entry → protected platform | LIVE | The public website and platform entry are deployed to separate public domains. |
| Question → structured response with source handling | WORKING | The source-aware response and citation surfaces are implemented in platform routes. |
| Response → document, case or action-plan work | WORKING | Document, case and task workflows are implemented in the protected platform. |
| Complex matter → lawyer assistance | PARTIAL | Controlled profile and hand-off lifecycle code exists; it is not represented as guaranteed representation. |

Solid paths in the diagram denote implemented or working surfaces. The dashed hand-off path deliberately remains PARTIAL. The diagram is a product model, not a claim that all transitions are available in every environment or account state.

## How JURO works

<img src="docs/github/ai-answer-flow.svg" width="100%" alt="JURO source-aware legal answer flow">

JURO's implemented source-aware path classifies the request, retrieves relevant public legal-source pages, assembles bounded context and presents a structured answer with source cards when evidence is available. The source layer is query-scoped direct retrieval from public Lex.uz and Advice.uz pages; it is not represented as an official provider API.

- The system should make the source visible and should not invent a citation.
- When the available evidence does not support a conclusion, the product should state that limitation.
- AI output is legal information and workflow support, not individual legal advice.
- Lawyer escalation is a partial product workflow, not a guarantee of representation or a completed consultation.

## Product contract

<img src="docs/github/engineering-commitments.svg" width="100%" alt="JURO product contract from legal context and source evidence to protected work and partial human hand-off">

A polished legal AI interface is not enough on its own. JURO presents the following boundaries as product commitments that can be inspected in the repository rather than as marketing promises:

| Product commitment | Implementation evidence | Boundary kept visible |
|---|---|---|
| Keep the source attached to the response that used it. | [`direct-citation-store.ts`](apps/platform/lib/legal/direct-citation-store.ts) records direct citations against an AI run. | A public source page is not automatically a verified conclusion. |
| Preserve canonical context while retrieving legal-source pages. | [`direct-retrieval.ts`](apps/platform/lib/legal/direct-retrieval.ts) contains the direct-source retrieval and citation-eligibility path. | This is query-scoped public-page retrieval, not an official provider API claim. |
| Require references for certain document-review findings. | [`document-analysis/schema.ts`](apps/platform/lib/document-analysis/schema.ts) rejects legal findings, risks and missing clauses without citations. | The review surface remains PARTIAL until fresh authenticated end-to-end evidence is complete. |
| Keep saved legal work behind platform boundaries. | Protected handlers, D1, private R2 and document-storage runtime live in [`apps/platform`](apps/platform). | No certification or compliance status is claimed here. |

Read the [product foundations](docs/github/PRODUCT_FOUNDATIONS.md) for the longer engineering narrative, repository evidence and review map.

## Product ecosystem

<img src="docs/github/product-overview.svg" width="100%" alt="JURO current, partial and planned product ecosystem">

The diagram separates the current product core from partial workflows and planned payments. Solid paths indicate implemented or working repository surfaces; dashed paths indicate partial or planned work.

## Architecture

<img src="docs/github/platform-architecture.svg" width="100%" alt="JURO application and Cloudflare architecture">

JURO is a monorepo with independently deployable public and protected applications:

- apps/website powers the public website through React, Next.js, Vite/Vinext and Cloudflare Worker tooling.
- apps/platform provides protected route handlers, document workflows, authorization boundaries and generated-file flows.
- apps/admin is a separate Worker-based administrative surface and is represented as PARTIAL.
- Cloudflare D1 and private R2 back persisted platform data and files; OpenAI integration is server-side.
- The platform supports DOCX, PDF and ZIP generation. OTP/email integration is configured through server-side provider settings when enabled.

## Trust, privacy and legal safety

<img src="docs/github/trust-layer.svg" width="100%" alt="JURO trust, privacy and legal-safety principles">

Repository boundaries are deliberate: credentials are server-side, D1/R2 access is mediated by backend routes, and protected flows enforce ownership or workspace checks. No GDPR, ISO, SOC 2 or other certification is claimed here. For responsible disclosure, see [SECURITY.md](SECURITY.md).

## Current status

| Area | Status | Notes |
|---|---|---|
| Public website | LIVE | [juro.uz](https://juro.uz) was reachable during this documentation audit. |
| Protected platform entry | LIVE | [app.juro.uz](https://app.juro.uz) is reachable and serves protected product routes. |
| AI legal chat | WORKING | Source-aware response and citation surfaces are implemented; broader legal evaluation remains a separate release gate. |
| Document builder | WORKING | Persisted document workflows, private storage and generated-file paths are implemented. |
| Document analysis and comparison | PARTIAL | Review and compare surfaces exist; fresh authenticated end-to-end analysis evidence is not complete. |
| Cases and action plans | WORKING | Case, task and action-plan workflows are implemented. |
| Lawyer marketplace and consultations | PARTIAL | Controlled profile, directory and hand-off lifecycle work remains incomplete. |
| Administration | PARTIAL | Separate admin Worker and protected administrative flows exist. |
| Production payments | PLANNED | Demo/payment-foundation code is not represented as a live payment service. |

## Repository structure

    juro/
    ├── apps/
    │   ├── website/       # juro.uz public website
    │   ├── platform/      # app.juro.uz and legal workflows
    │   └── admin/         # separate administrative Worker
    ├── docs/              # architecture, migration and operational documentation
    ├── .github/           # CI, contribution and issue templates
    ├── .env.example       # server-side configuration names only
    ├── SECURITY.md
    ├── package.json
    └── README.md

## Quick start

### Requirements

- Node.js 22.13 or later.
- npm compatible with the committed lockfiles.
- Bash and documented POSIX tools for the legacy apps/website lifecycle; apps/platform uses shell-neutral Node launchers.
- Cloudflare-compatible bindings for persisted platform features.

Clone and install both applications:

    git clone https://github.com/MoozUpus/juro.git
    cd juro
    npm run install:all

Run an application locally:

    npm run dev:website
    npm run dev:platform
    npm run dev:admin

Copy .env.example to a local ignored environment file. Never commit .env files, API keys, access tokens, database exports, user documents or logs.

<details>
<summary>Environment variables and Cloudflare bindings</summary>

| Name | Required | Scope | Purpose |
|---|---:|---|---|
| OPENAI_API_KEY | For live AI only | Server | OpenAI Responses API authentication |
| OPENAI_MODEL | No | Server | Optional model override |
| RESEND_API_KEY | For email OTP | Server | Email-provider authentication |
| EMAIL_FROM | For email OTP | Server | Verified sender address |
| JURO_SMOKE_BASE_URL | No | Test process | Document-builder smoke-test base URL |
| CLOUDFLARE_REMOTE_BINDINGS | No | Local development | Opt in to remote bindings; requires Wrangler login |
| DB | Persisted features | Worker binding | Cloudflare D1 |
| BUCKET | File workflows | Worker binding | Private Cloudflare R2 |
| ASSETS / IMAGES | Hosting managed | Worker binding | Static assets and image optimization |

DB, BUCKET, ASSETS and IMAGES are platform bindings, not secrets to place in an environment file. AI and email keys are server-only configuration and must not be exposed through public browser variables.

</details>

## Quality and testing

From the repository root:

    npm run lint
    npm run type-check
    npm test
    npm run build
    npm run validate:artifact

CI is defined in [.github/workflows/ci.yml](.github/workflows/ci.yml). The workflow runs locked installs, linting, TypeScript checks, tests, artifact validation and the platform Cloudflare environment matrix. For a platform-only environment matrix and dry-run coverage, run:

    npm --prefix apps/platform run validate:cloudflare:matrix

## Deployment

Website and platform deployments are intentionally independent. The platform requires its D1 migrations, private R2 bindings, server-side secrets and explicit permission checks; both targets should be preview-tested before any production approval.

Read [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the release sequence, rollback expectations, DNS safeguards and backup requirements. [docs/MIGRATION.md](docs/MIGRATION.md) retains the source-migration and alternative-hosting audit.

## Roadmap

| Now | Next | Later |
|---|---|---|
| Maintain source-aware answers, document workflows, permissions and release evidence. | Complete authenticated document-analysis and lawyer hand-off verification. | Consider production payments and broader ecosystem integrations only after their product, security and operational gates are approved. |

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Do not include secrets, personal data, user documents or production logs in an issue or pull request. Rotate exposed credentials; removing a secret from a later revision is not sufficient.

## Contributing

JURO is a product-managed repository. Focused, safe contributions are welcome; see [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) and use the supplied issue and pull-request templates. A pull request does not authorize a production deploy, DNS change or access to production data.

## License

No license file is currently included in this repository. Reuse rights have not been granted here; contact the repository owner before reusing code or assets.

---

Presentation asset provenance and update rules: [docs/github/README_ASSETS.md](docs/github/README_ASSETS.md).
