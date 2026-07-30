# Secure document upload pipeline

Updated: 2026-07-30
Status: Phase 5 fail-closed upload slice implemented locally; real malware scanner and downstream OCR/AI remain disabled.

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

## Supported intake formats

- PDF;
- DOCX;
- JPEG;
- PNG;
- ZIP.

MIME and extension must agree at initialization. Finalization checks PDF, PNG, JPEG, and ZIP-container signatures. A DOCX container is not treated as structurally valid or safe merely because it starts with ZIP magic; archive traversal, decompression ratio, nested archive, file-count, timeout, and `[Content_Types].xml` checks belong after a real malware scan and remain an open gate.

## Evidence

- TypeScript and lint pass.
- Targeted validation/idempotency/tenant tests: 3/3.
- Full platform tests, staging build, and staging artifact validation pass.
- The build manifest includes all three new API routes.
- The R2 implementation follows the current official Workers API contract for streaming `put`, SHA-256 put validation, strong read-after-write consistency, and `head` checks.

Authenticated staging HTTP/R2 evidence is not claimed until the Access-protected browser or an approved service-token flow is available. Anonymous Access denial is a boundary check, not an upload success test.

## Next gates

1. Select and connect a privacy-approved real malware scanner; production must fail closed if it is required but unavailable.
2. Add scan-result and extraction/OCR evidence, Queue consumer/DLQ, idempotent status transitions, and quarantined-object retention.
3. Implement archive safety limits before extraction.
4. Permit download/AI only from a server-verified `safe`/`ready` state.
5. Add multi-file package and 500-page accounting without weakening the per-file boundary.
