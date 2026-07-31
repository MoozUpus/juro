# Secure document upload pipeline

Updated: 2026-07-31
Status: fail-closed upload and post-safe OCR/analysis pipeline implemented locally; real malware promotion remains disabled.

## Implemented lifecycle

The single-document review UI and dashboard use a three-request lifecycle:

1. `POST /api/platform/document-analysis/uploads` validates strict JSON metadata, consent, file type, the 50 MB limit, SHA-256, session, workspace, CSRF, and a tenant-scoped `Idempotency-Key`. D1 creates the `document_files`, `document_analyses`, consent, and audit records.
2. `PUT /api/platform/document-analysis/uploads/:analysisId` sends the binary request body directly to private R2. The Worker requires exact `Content-Length`, MIME, and SHA-256 evidence and asks R2 to verify SHA-256 while streaming. The R2 key is server-generated under `quarantine/{workspaceId}/{analysisId}/{fileId}` and never contains the source filename.
3. `POST /api/platform/document-analysis/uploads/:analysisId/finalize` rechecks R2 size and SHA-256, performs a bounded magic-byte check, and moves the record to `quarantined`.

Every route re-resolves the authenticated user and active workspace. A mismatched `workspaceId`, `userId`, or `analysisId` returns the same not-found boundary. Replayed initialization with the same request hash returns the original upload; a changed payload under the same key is rejected.

## Fail-closed boundary

The staging malware scanner is not connected. Finalization therefore records `MALWARE_SCANNER_UNAVAILABLE`, keeps the object unavailable through the normal download route, and returns `FILE_SCAN_UNAVAILABLE`. No OCR, OpenAI, Anthropic, document extraction, or analysis job is started.

The previous multipart `POST /api/platform/document-review` no longer stores a file or invokes AI. It returns `SECURE_UPLOAD_REQUIRED`. `GET /api/platform/document-review` remains for the existing analysis list and previously completed records.

The quarantine object currently uses a safe prefix in the environment primary private bucket rather than the separate quarantine binding. This preserves the existing account-deletion R2 inventory/purge path. Moving quarantine to its dedicated bucket requires a cross-bucket purge manifest and restore test first.

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

## Supported intake formats

- PDF;
- DOCX;
- JPEG;
- PNG;
- ZIP.

MIME and extension must agree at initialization. Finalization checks PDF, PNG, JPEG, and ZIP-container signatures. A DOCX container is not treated as structurally valid or safe merely because it starts with ZIP magic; archive traversal, decompression ratio, nested archive, file-count, timeout, and `[Content_Types].xml` checks belong after a real malware scan and remain an open gate.

## Evidence

- TypeScript and generated Cloudflare types pass.
- Targeted processor/provider/upload/OCR/export tests: 18/18.
- Cloudflare config/migration/Queue regression tests: 84/84.
- OCR tests prove tenant denial before R2/provider access, source-integrity
  failure, retryable provider absence, immutable derivative creation, and replay.
- Account deletion proves the private derivative is deleted R2-first and its D1
  row cascades without touching another user's object.

Authenticated staging OCR/provider execution is not claimed until migration

## Next gates

1. Connect a privacy-approved real malware scanner; production must fail closed while it is unavailable.
2. Apply `0042`, deploy protected staging, and execute an eligible safe-file OCR/provider smoke test.
3. Run the complete 100-package/30-comparison reviewed evaluation, including clean-scan OCR quality.
4. Add multi-file/ZIP package extraction, 500-page accounting, coordinates, corrections, and redline artifacts.
