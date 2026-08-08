# Staging 0075 — expanded tenant-scoped global search

Date: 2026-08-02

## Deployed change

The authenticated global search now includes real task, document-analysis, and
public-approved lawyer records in addition to the existing cases, documents,
conversations, comparisons, templates, and verified legal sources.

Tasks and analyses require both the active `workspace_id` and current
`owner_user_id`. Lawyer records are limited to publicly approved profiles.
Search continues to return metadata only: document text, extracted content, AI
structured answers, and other sensitive content fields are excluded.

## Deployment evidence

- Environment: `staging`
- Worker: `juro-platform-staging`
- Worker version: `654bd5cd-51df-4cb4-89d7-db99754fef87`
- API: `GET /api/platform/search`
- UI: authenticated application shell command search

## Verification

- Type-check — passed
- Lint — passed
- Full platform suite — passed: 386 tests
- Cloudflare/migration/job suite — passed: 91 tests
- Staging build and artifact validation — passed
- Static contract asserts tenant ownership for tasks/analyses and public-only
  lawyer profiles
- Deployment output confirms staging-only bindings

No schema migration, provider request, user content seed, or production change
was made. Authenticated browser validation remains behind Cloudflare Access.
