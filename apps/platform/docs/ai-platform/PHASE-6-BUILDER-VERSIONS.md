# Phase 6 — immutable Document Builder versions

Status: the explicit owner checkpoint/restore foundation from commit `8433b94`
and migration `0096` is deployed to protected staging. Production is unchanged.
The automatic unchanged-content lifecycle integrations and projected-content
write-intent contract described below are local candidates and are not yet
deployed.

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

Migration `0097` extends this to content-changing operations. A proposed
snapshot is written and checksum-verified in private R2 behind a durable D1
write intent. One D1 batch then applies the proposal or Claude correction,
claims the unique `(document_id, revision)` fence, advances the document,
attaches a ready immutable version and marks the intent attached. A failed
batch leaves the document unchanged. The scheduled reconciler deletes stale,
unreferenced objects or repairs an already-attached intent.

Accepted collaboration proposals use this transaction directly. A corrected
Analysis version linked through the original Builder handoff can be explicitly
returned to the Builder only while the source revision is still current. The
RU/UZ analysis UI disables the action after any unrelated Builder change.

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
immutability, lifecycle checkpoint ordering, projected proposal application,
Builder→Analysis→Builder correction return, attach failure, orphan cleanup,
typed errors, trigger enforcement and migration integrity. The files are
registered in the mandatory platform test runner. Private pre/post backups,
SHA round trips, isolated restores,
ordered `0096` application, schema/FK checks, exact Worker deployment, CI and
anonymous Access-boundary probes passed. See
`STAGING-0096-BUILDER-VERSIONS-EVIDENCE.md`.

Authenticated RU/UZ owner create/list/restore/replay with a synthetic document
remains open. It is not inferred from the anonymous Access redirect.

Rollback is application-first: return to the previous Worker. Migration `0096`
is expand-only, so unused metadata tables may remain until a later reviewed
contract migration. Production requires its own explicit approval.

Migration `0097`, its route/UI integration and scheduler reconciliation remain
local until a fresh staging backup, ordered migration, exact deploy and
authenticated synthetic lifecycle proof are explicitly authorized.
