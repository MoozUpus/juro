# Phase 6 — immutable Document Builder versions

Status: locally implemented and verified; migration `0096` is not applied to
staging or production.

## Contract

The existing receipt and configurable builders retain debounced autosave. An
owner may additionally choose **Save version**. The UI first waits for autosave,
then the server snapshots the persisted D1 state—not browser-provided document
content—to a server-generated private R2 key. Version metadata is listed in RU
or UZ without returning the snapshot.

Restore verifies R2 byte length, SHA-256, JSON schema, document identity and
source revision. It writes the selected answers/content as the next monotonic
revision, downgrades an old approved/signed status to `Готов`, and appends both
ordinary revision metadata and a dedicated immutable restore event. The source
checkpoint is never mutated.

## Security and privacy

- Existing session, active-workspace and owner checks are required.
- POST endpoints enforce same-origin CSRF and strict bounded Zod payloads.
- Raw idempotency keys are never persisted; only SHA-256 is stored.
- D1 triggers recheck active membership, owner, tenant, document revision and
  selected ready version.
- R2 writes use `If-None-Match: *`, private/no-store metadata and an expected
  checksum. A mismatch or outage fails closed.
- D1 version/evidence rows contain no answers, title, parties or legal text.
- No public or signed snapshot download route exists.

## Verification and rollout

Focused tests cover success, replay, R2 retry, cross-tenant denial, restore,
immutability, trigger enforcement and migration integrity. The files are
registered in the mandatory platform test runner. Before staging: make and
round-trip-verify a fresh private D1 backup, restore it in isolation, apply
`0096`, inspect ledger/tables/triggers/FKs, deploy the exact tested commit and
run authenticated RU/UZ create/list/restore/replay with a synthetic document.

Rollback is application-first: return to the previous Worker. Migration `0096`
is expand-only, so unused metadata tables may remain until a later reviewed
contract migration. Production requires its own explicit approval.
