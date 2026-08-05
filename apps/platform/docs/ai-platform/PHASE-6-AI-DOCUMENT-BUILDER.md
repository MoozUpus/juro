# Phase 6 — AI answer to Document Builder

Status: locally implemented and verified; migration `0094` is not applied to staging or production.

## User flow

After JURO persists a structured assistant answer with a published
`suggestedDocument.templateCode`, the user can open a review panel from AI chat.
The server resolves the template from that tenant-owned message, proposes only
compatible profile/workspace/answer fields, and lets the user edit or remove
each value. A draft is created only after explicit confirmation. The browser is
redirected with the opaque document ID only; confidential values are never put
in the URL.

The flow is available in RU and UZ for individual, entrepreneur, lawyer and
canonical business-workspace routes. It reuses the existing configurable
Document Builder and does not introduce `document-builder-test` routes.

## Security and data contract

- Authentication, active-workspace resolution and CSRF stay server-side.
- The client cannot submit a template code or arbitrary questionnaire field.
  Confirmation accepts only field IDs offered by the server preview.
- Request JSON is strict and bounded to 64 KiB. Field values are checked against
  the template's current maximum length.
- The required idempotency key is hashed with SHA-256 before D1 lookup/storage.
- The new evidence row stores opaque IDs, selected field IDs and hashes only.
  Reviewed values remain in the normal tenant-owned `document_answers` row.
- A D1 trigger independently proves active membership, tenant ownership of the
  persisted assistant message and ownership/template/status of the new draft.
- Evidence is update-immutable, but cascades with document/account deletion so
  retention does not defeat the existing purge contract.

## Local verification

`tests/ai-suggested-document.test.ts` covers tenant ownership, published-template
resolution, preview, user edits, exact-once confirmation, hashed idempotency,
content-free evidence, unknown-field rejection, conflicting replay and cascade
deletion. `tests/migration-0094-ai-document-prefill.test.ts` verifies the
additive D1 migration, complete journal application and zero foreign-key
violations. Both files are registered in the mandatory platform task runner.

## Remaining staging gate

Before migration `0094`, create and round-trip-verify a fresh full staging D1
export in private `juro-staging-backups`, restore it in isolation, then apply
pending migrations in ledger order. Deploy the exact verified commit and run an
authenticated RU/UZ browser rehearsal: preview, edit, remove, confirm, replay,
open the resulting Builder draft and delete it. Production remains unchanged.
