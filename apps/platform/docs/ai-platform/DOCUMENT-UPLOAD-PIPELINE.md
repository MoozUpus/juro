# Secure document upload pipeline

Updated: 2026-08-06
Status: fail-closed upload and post-safe OCR/analysis pipeline deployed to
protected staging. The private ClamAV scanner, immutable scan-evidence schema
and malware Queue/DLQ are attached there. An EICAR probe proved the infected
terminal path; it does not prove a clean user-file analysis or any production
behavior.

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
Packages above 20 MB compressed input, 20 MB per expanded member, or 50 MB total
expanded working set remain in `awaiting_external_extraction`. Scanned-PDF page
count and page coordinates are not supplied by `toMarkdown` and remain release
gates.

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
