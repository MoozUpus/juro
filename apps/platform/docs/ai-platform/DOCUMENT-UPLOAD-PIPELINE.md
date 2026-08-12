# Secure document upload pipeline

Updated: 2026-08-12
Status: fail-closed upload and post-safe OCR/analysis pipeline deployed to
protected staging. The private ClamAV scanner, immutable scan-evidence schema
and malware Queue/DLQ are attached there. An EICAR probe proved the infected
terminal path; it does not prove a clean user-file analysis or any production
behavior.

## Local reliability candidate — pending staging deployment

The changes in this section are a **local candidate only**. They have not yet
been deployed to staging and do not turn the prior scanner-only evidence into a
successful clean-file, OCR, or provider-analysis claim.

### Compact quick review

`quick` remains an asynchronous document-analysis job. Its provider response is
deliberately bounded to a compact first pass (currently 1,600 output tokens),
so an ordinary document does not wait for an implicit clause-by-clause expert
report. It still has to pass the same provider schema, excerpt/source boundary,
and durable persistence checks as every other mode. A timeout, invalid
structured output, unavailable provider, or failed persistence remains an
honest non-completion; the UI must not call such a job completed.

`full` and `expert` remain the detailed paths and retain the larger structured
output budget (currently 8,192 tokens). The candidate does not relabel a
compact quick result as a full/expert analysis, nor does it make a document
analysis subject to the separate interactive-chat 30-second SLO.

### Exhausted Queue retries and operator recovery

`document.analyze` and `document.index` share the document-analysis source
queue. Once Cloudflare has exhausted a source-message retry budget, the
candidate consumes that queue's DLQ and terminalizes only the matching
execution-ledger row (`job_runs.status = dead_lettered`). The
analysis or indexing record is intentionally left in its retryable state. This
preserves the existing audited operational redrive path; it avoids both a
silent extra provider call and a record that appears permanently successful or
permanently failed when it can still be reviewed and redriven safely.

OCR uses its own source/DLQ pair and follows the same execution-ledger rule.
When its retry budget is exhausted, the parent analysis remains in an active OCR
state and its extraction stays retryable; the matching `ocr.process` ledger row
is terminalized. A bounded scheduled reconciler covers the narrow case in which
the DLQ consumer itself cannot persist that terminal ledger update after its
own retry budget. It never republishes work or changes a user-visible record;
audited operator redrive remains the sole recovery path.

The terminalizer verifies the original envelope/job/workspace bindings before
updating the ledger, records content-free degraded `queue_dlq` health evidence,
and acknowledges only after it has made (or observed) a safe terminal outcome.
An unavailable ledger is retried rather than discarded. Queue health can return
to operational only after Cloudflare reports zero live backlog for both DLQs,
there are no matching `dead_lettered` ledger rows, and a five-minute quiet
window passes. Malformed or unmatched DLQ deliveries require an explicit manual
verification; they are never automatically cleared. A DLQ delivery is therefore
evidence of retry exhaustion, not evidence that a document result was created.

### Document Review status projection

The tenant-scoped Document Review list projects retry exhaustion from the
matching `job_runs` row without exposing queue metadata to the browser. It
polls actual active analysis states — quarantine, ready, processing,
persistence, OCR waiting/processing, and retrying — as well as pending exports.
When a matching analysis or OCR job is dead-lettered, the UI stops treating that
analysis as a live background job and explains that automatic attempts stopped;
it does not misrepresent the retained file as an analysis result. An authorized
operator can use the audited redrive flow after investigation.

## Implemented lifecycle

The single-document review UI and dashboard use a three-request lifecycle:

1. `POST /api/platform/document-analysis/uploads` validates strict JSON metadata, consent, file type, the 50 MB limit, SHA-256, session, workspace, CSRF, and a tenant-scoped `Idempotency-Key`. D1 creates the `document_files`, `document_analyses`, consent, and audit records.
2. `PUT /api/platform/document-analysis/uploads/:analysisId` sends the binary request body directly to private R2. The Worker requires exact `Content-Length`, MIME, and SHA-256 evidence and asks R2 to verify SHA-256 while streaming. The R2 key is server-generated under `quarantine/{workspaceId}/{analysisId}/{fileId}` and never contains the source filename.
3. `POST /api/platform/document-analysis/uploads/:analysisId/finalize` rechecks R2 size and SHA-256 plus bounded magic bytes. ZIP/DOCX additionally require central/local-header identity, safe paths and members, exact data descriptors, streaming bounded decompression, output size and CRC32 before the record can move to `quarantined`.

Every route re-resolves the authenticated user and active workspace. A mismatched `workspaceId`, `userId`, or `analysisId` returns the same not-found boundary. Replayed initialization with the same request hash returns the original upload; a changed payload under the same key is rejected.

## Fail-closed boundary

Staging finalization enqueues `malware.scan` only after all R2 integrity and
format checks pass. The Worker streams the quarantined object through a private
service binding to ClamAV. A clean, schema-valid verdict atomically promotes an
opaque `safe-v1` object, records immutable scan evidence and enqueues
`document.analyze`. An unavailable, malformed, inconsistent or infected verdict
keeps the object unavailable; no OCR, OpenAI, Anthropic, extraction or analysis
is started from that path. Production remains fail-closed because it has no
scanner binding.

The previous multipart `POST /api/platform/document-review` no longer stores a file or invokes AI. It returns `SECURE_UPLOAD_REQUIRED`. `GET /api/platform/document-review` remains for the existing analysis list and previously completed records.

New staging quarantine objects use the separate private quarantine binding and opaque `quarantine-v2` keys. Legacy objects remain readable only through the backward-compatible inventory/deletion path; no automatic cross-bucket move is claimed.

## Post-safe extraction and OCR

An existing server-verified `analysis_safe` object first uses the bounded local
PDF/DOCX extractor. Images, unreadable scans, and files above the 20 MB inline
boundary create an identifiers-only `ocr.process` outbox event. The attached OCR
Queue consumer rechecks tenant ownership, safe state, R2 size, and source SHA-256,
then calls the Workers AI `toMarkdown` binding.

The normalized result is written to an immutable private R2 derivative and
recorded in `file_extractions`; successful replay verifies the same bytes without
a second provider call. The consumer then returns the analysis to `ready` and
enqueues the existing Anthropic-primary/OpenAI-fallback analysis. Image-derived
text remains explicitly marked for review.

For `application/zip`, the document-analysis extractor repeats the deep archive
verification, processes text PDF/DOCX members in deterministic order, preserves
file boundaries in the untrusted provider input, caps known text-PDF pages at
500, and limits inline expanded members to 20 MB / the package working set to
50 MB. If a member requires OCR, the analysis is queued as `awaiting_ocr`; the
opaque ZIP itself is never sent to a provider. The OCR consumer repeats all
archive checks, validates each member's magic bytes and nested DOCX structure,
and sends one bounded batch with opaque per-member names to Workers AI.

The consumer requires an exact one-to-one match between requested and returned
opaque identities, expected MIME, bounded token evidence, and non-empty text.
Reordered results are safe; duplicates, omissions, or unexpected identities
fail closed before derivative creation. Original filenames are restored only as
quoted untrusted text boundaries in the deterministic combined derivative.
For every bounded package, JURO also derives a deterministic review context:
one tentative primary document, member roles, role-based links, explicit
filename references and exact normalized-text duplicate evidence. The graph is
capped at 120 prioritized edges, validated when the immutable derivative is
reloaded, persisted with the normalized analysis and sent only inside
`untrustedDocument.packageContext`. The RU/UZ result surface explains that these
links are hypotheses to verify, not legal facts.
ZIP packages above 20 MB compressed input are rejected before an upload state is
created. A package that crosses a per-member or decoded working-set boundary
only discovered after safe extraction, or text above the 160,000-character
single-request boundary, is terminally marked `failed` with
`DOCUMENT_ANALYSIS_CAPACITY_REQUIRED`. It is never sent to OCR as an opaque ZIP,
never sent to a language-model provider, and is not presented as background work
that will complete later. The UI directs the user to split the material until a
privacy-approved streaming extractor and chunk-synthesis worker are actually
deployed. Scanned-PDF page count and page coordinates are not supplied by
`toMarkdown` and remain release gates.

## Supported intake formats

- PDF;
- DOCX;
- JPEG;
- PNG;
- ZIP.

MIME and extension must agree at initialization. Finalization checks PDF, PNG, JPEG, and ZIP-container signatures. A DOCX container is not treated as structurally valid merely because it starts with ZIP magic; its OOXML structure and archive integrity are verified before quarantine. Malware clearance remains a separate mandatory gate.

## Evidence

- TypeScript and generated Cloudflare types pass.
- Targeted package extractor/analysis processor/provider/OCR tests for the current local slice: 24/24.
- Cloudflare config/migration/Queue regression tests: 84/84.
- OCR tests prove tenant denial before R2/provider access, source-integrity
  failure, retryable provider absence, immutable derivative creation, and replay.
- Account deletion proves the private derivative is deleted R2-first and its D1
  row cascades without touching another user's object.

Authenticated staging package OCR/provider execution is not claimed.

## Next gates

1. Execute an eligible clean synthetic file through scanner clearance, OCR and
   provider analysis in protected staging; the EICAR proof intentionally covers
   the infected path only.
2. Run the complete 100-package/30-comparison reviewed evaluation, including
   clean-scan OCR quality.
3. Add page coordinates and scanned-PDF page-count evidence plus over-budget
   streaming extraction; deploy and verify the separately pending
   corrections/redline/export candidates only after their own migration
   authorization.

## Reviewable corrections — local candidate

After extraction capacity checks and before provider analysis, the normalized
text is stored once as an immutable content-addressed private R2 artifact. A
validated provider risk becomes a reviewable suggestion only when it contains a
non-empty exact excerpt and distinct proposed wording. The RU/UZ review surface
shows old/new text, reason, linked source identifiers and explicit accept/reject
controls. Applying selected or all available suggestions creates a new Markdown
artifact and never overwrites the upload.

Missing, repeated and overlapping excerpts fail closed as stale or ambiguous.
The API is authenticated, CSRF-protected for writes, tenant-scoped, bounded by
Zod, idempotent and checksum-verifying on download. This does not yet preserve
DOCX/PDF layout, emit a visual redline, or prove provider-generated corrections
in staging; those claims remain open.
