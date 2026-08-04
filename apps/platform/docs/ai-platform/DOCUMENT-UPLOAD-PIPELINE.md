# Secure document upload pipeline

Updated: 2026-08-04
Status: fail-closed upload and post-safe OCR/analysis pipeline implemented locally; real malware promotion remains disabled.

## Implemented lifecycle

The single-document review UI and dashboard use a three-request lifecycle:

1. `POST /api/platform/document-analysis/uploads` validates strict JSON metadata, consent, file type, the 50 MB limit, SHA-256, session, workspace, CSRF, and a tenant-scoped `Idempotency-Key`. D1 creates the `document_files`, `document_analyses`, consent, and audit records.
2. `PUT /api/platform/document-analysis/uploads/:analysisId` sends the binary request body directly to private R2. The Worker requires exact `Content-Length`, MIME, and SHA-256 evidence and asks R2 to verify SHA-256 while streaming. The R2 key is server-generated under `quarantine/{workspaceId}/{analysisId}/{fileId}` and never contains the source filename.
3. `POST /api/platform/document-analysis/uploads/:analysisId/finalize` rechecks R2 size and SHA-256 plus bounded magic bytes. ZIP/DOCX additionally require central/local-header identity, safe paths and members, exact data descriptors, streaming bounded decompression, output size and CRC32 before the record can move to `quarantined`.

Every route re-resolves the authenticated user and active workspace. A mismatched `workspaceId`, `userId`, or `analysisId` returns the same not-found boundary. Replayed initialization with the same request hash returns the original upload; a changed payload under the same key is rejected.

## Fail-closed boundary

The staging malware scanner is not connected. Finalization therefore records `MALWARE_SCANNER_UNAVAILABLE`, keeps the object unavailable through the normal download route, and returns `FILE_SCAN_UNAVAILABLE`. No OCR, OpenAI, Anthropic, document extraction, or analysis job is started.

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
- Targeted package extractor/analysis scheduler/OCR processor tests for this local slice: 14/14.
- Cloudflare config/migration/Queue regression tests: 84/84.
- OCR tests prove tenant denial before R2/provider access, source-integrity
  failure, retryable provider absence, immutable derivative creation, and replay.
- Account deletion proves the private derivative is deleted R2-first and its D1
  row cascades without touching another user's object.

Authenticated staging package OCR/provider execution is not claimed.

## Next gates

1. Connect a privacy-approved real malware scanner; production must fail closed while it is unavailable.
2. Apply pending migration `0068`, deploy protected staging, and execute an eligible safe-file OCR/provider smoke test only after scanner clearance exists.
3. Run the complete 100-package/30-comparison reviewed evaluation, including clean-scan OCR quality.
4. Add page coordinates and scanned-PDF page-count evidence, over-budget streaming extraction, corrections, and redline artifacts.
