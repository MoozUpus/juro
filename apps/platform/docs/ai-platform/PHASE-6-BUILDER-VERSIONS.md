# Phase 6 — immutable Document Builder versions

Status: the explicit owner checkpoint/restore foundation from commit `8433b94`
and migration `0096` is deployed to protected staging. Production is unchanged.
The automatic lifecycle integrations described below are the next local
candidate and are not yet deployed.

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

The next local candidate makes receipt/configurable file generation, owner
approval, collaborator approval, internal signing and signed-PDF upload create
or reuse the exact persisted checkpoint before changing legal status. If
checkpoint storage fails, the mutation does not run. Generation runs the
checkpoint before any DOCX/PDF/ZIP object write; signed-PDF upload runs it before
the PDF write and removes a just-uploaded object if the atomic D1 batch fails.
Existing generated files and D1 rows remain intact.

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
immutability, lifecycle checkpoint ordering, typed errors, trigger enforcement
and migration integrity. The files are registered in the mandatory platform
test runner. Private pre/post backups, SHA round trips, isolated restores,
ordered `0096` application, schema/FK checks, exact Worker deployment, CI and
anonymous Access-boundary probes passed. See
`STAGING-0096-BUILDER-VERSIONS-EVIDENCE.md`.

Authenticated RU/UZ owner create/list/restore/replay with a synthetic document
remains open. It is not inferred from the anonymous Access redirect.

Rollback is application-first: return to the previous Worker. Migration `0096`
is expand-only, so unused metadata tables may remain until a later reviewed
contract migration. Production requires its own explicit approval.

Accepted suggestions and analysis corrections change content and are not yet
automatic checkpoints. They require a later transactional projected-snapshot
contract; the current implementation does not pretend a post-mutation R2 write
is atomic.
