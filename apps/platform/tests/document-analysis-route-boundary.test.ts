import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("legacy document review POST cannot buffer a file or invoke an AI provider", () => {
  const route = source("app/api/platform/document-review/route.ts");
  assert.match(route, /SECURE_UPLOAD_REQUIRED/);
  assert.match(route, /document-analysis\/uploads/);
  assert.doesNotMatch(route, /request\.formData\(|arrayBuffer\(|callOpenAiJson|callAnthropic/);
});

test("secure upload routes enforce streaming, checksum, tenant, and quarantine boundaries", () => {
  const init = source("app/api/platform/document-analysis/uploads/route.ts");
  const upload = source("app/api/platform/document-analysis/uploads/[analysisId]/route.ts");
  const finalize = source("app/api/platform/document-analysis/uploads/[analysisId]/finalize/route.ts");
  for (const route of [init, upload, finalize]) {
    assert.match(route, /requireApiUser/);
    assert.match(route, /workspaceForUser/);
  }
  assert.match(init, /idempotency-key/);
  assert.match(upload, /request\.body/);
  assert.match(upload, /sha256: record\.sha256/);
  assert.match(upload, /content-length/);
  assert.match(finalize, /validateUploadMagicBytes/);
  assert.match(finalize, /await verifyArchiveBytes\(/);
  assert.doesNotMatch(finalize, /inspectArchiveBytes\(/);
  assert.match(finalize, /MALWARE_SCANNER_UNAVAILABLE/);
  assert.match(finalize, /MALWARE_SCAN_ENABLED/);
  assert.match(finalize, /MALWARE_SCANNER/);
  assert.match(finalize, /MALWARE_SCAN_QUEUE/);
  assert.match(finalize, /FILE_SCAN_QUEUED/);
  assert.match(finalize, /INSERT OR IGNORE INTO job_outbox/);
  assert.match(`${upload}\n${finalize}`, /requireQuarantineR2/);
  assert.doesNotMatch(`${upload}\n${finalize}`, /requireR2\(\)/);
  assert.doesNotMatch(`${upload}\n${finalize}`, /callOpenAiJson|callAnthropic|status='safe'|status='ready'/);
});

test("archive finalize verifies local identity, bounded expansion, and CRC before quarantine", () => {
  const archive = source("lib/document-analysis/archive-inspector.ts");
  assert.match(archive, /LOCAL_SIGNATURE/);
  assert.match(archive, /DATA_DESCRIPTOR_SIGNATURE/);
  assert.match(archive, /ARCHIVE_POLYGLOT_REJECTED/);
  assert.match(archive, /DecompressionStream\("deflate-raw"/);
  assert.match(archive, /ARCHIVE_VERIFICATION_TIMEOUT/);
  assert.match(archive, /ARCHIVE_CRC_MISMATCH/);
});

test("dashboard and review surfaces use the secure upload client", () => {
  const dashboard = source("app/_platform/DashboardClient.tsx");
  const review = source("app/_platform/DocumentReviewClient.tsx");
  const uploadClient = source("lib/document-analysis/client-upload.ts");
  assert.match(dashboard, /uploadDocumentForAnalysis\(file, locale, setUploadProgress\)/);
  assert.match(review, /uploadDocumentForAnalysis\(file, locale, setUploadProgress, uploadCaseId \|\| null\)/);
  assert.match(dashboard, /role="progressbar"/);
  assert.match(review, /role="progressbar"/);
  assert.match(uploadClient, /new XMLHttpRequest\(\)/);
  assert.match(uploadClient, /request\.upload\.addEventListener\("progress"/);
  assert.match(uploadClient, /x-juro-file-sha256/);
  assert.doesNotMatch(`${dashboard}\n${review}`, /new FormData\(\)/);
});

test("review surface polls actual background analysis states and makes retry exhaustion explicit", () => {
  const review = source("app/_platform/DocumentReviewClient.tsx");
  const reviewRoute = source("app/api/platform/document-review/route.ts");
  assert.match(review, /const analysisPending = analyses\.some/);
  for (const status of [
    "quarantined",
    "ready",
    "processing",
    "persisting",
    "awaiting_ocr",
    "ocr_processing",
    "retrying",
  ]) {
    assert.match(review, new RegExp(`"${status}"`));
  }
  assert.match(reviewRoute, /job\.job_type IN \('document\.analyze','ocr\.process'\)/);
  assert.match(reviewRoute, /job\.workspace_id=a\.workspace_id/);
  assert.match(reviewRoute, /job\.status='dead_lettered'/);
  assert.match(reviewRoute, /retryExhausted: Number\(retryExhausted\) === 1/);
  assert.match(review, /Автоматические попытки остановлены/);
  assert.match(review, /Qayta ishga tushirish kerak/);
  assert.match(review, /window\.setInterval\(\(\) => \{ void load\(\); \}, 5_000\)/);
});

test("analysis revision routes preserve auth, tenant, idempotency, and object-integrity boundaries", () => {
  const collection = source("app/api/platform/document-analysis/[analysisId]/revisions/route.ts");
  const decision = source("app/api/platform/document-analysis/[analysisId]/revisions/[revisionId]/route.ts");
  const download = source("app/api/platform/document-analysis/[analysisId]/versions/[versionId]/file/route.ts");
  for (const route of [collection, decision, download]) {
    assert.match(route, /requireApiUser/);
    assert.match(route, /workspaceForUser/);
    assert.doesNotMatch(route, /OPENAI_API_KEY|ANTHROPIC_API_KEY|callOpenAiJson|callAnthropic/);
  }
  assert.match(collection, /idempotency-key/);
  assert.match(collection, /applySuggestedRevisions/);
  assert.match(decision, /decideSuggestedRevision/);
  assert.match(download, /verifiedAnalysisVersionObject/);
  assert.match(download, /analysisVersionForDownload/);
  assert.match(download, /content-disposition/);
});

test("comparison change decisions are validated, tenant-scoped, audited, and do not merge documents", () => {
  const route = source("app/api/platform/document-comparisons/[comparisonId]/changes/[changeId]/route.ts");
  const service = source("lib/document-comparison/review-decision.ts");
  const client = source("app/_platform/ComparisonResultClient.tsx");
  assert.match(route, /decisionSchema/);
  assert.match(route, /locale: z\.enum\(\["ru", "uz"\]\)/);
  assert.match(route, /O‘zgarish topilmadi/);
  assert.match(route, /assertSafeWrite/);
  assert.match(route, /requireApiUser/);
  assert.match(route, /workspaceForUser/);
  assert.match(route, /decideComparisonChange/);
  assert.match(service, /comparison\.workspace_id=\?/);
  assert.match(service, /comparison\.owner_user_id=\?/);
  assert.match(service, /comparison_change_accepted/);
  assert.match(service, /comparison_change_rejected/);
  assert.match(service, /comparison_change_decision_cleared/);
  assert.doesNotMatch(`${route}\n${service}`, /INSERT INTO document_versions|callOpenAiJson|callAnthropic/);
  assert.match(client, /aria-pressed/);
  assert.match(client, /decisionSaving/);
  assert.match(client, /decision \?\? "pending"/);
});

test("scanner promotion requires strict evidence and never trusts document instructions", () => {
  const scanner = source("lib/document-analysis/malware-scanner.ts");
  assert.match(scanner, /malwareScannerResponseSchema/);
  assert.match(scanner, /sourceSha256 !== sourceSha256/);
  assert.match(scanner, /checksums\.sha256/);
  assert.match(scanner, /analysis_quarantined/);
  assert.match(scanner, /analysis_safe/);
  assert.match(scanner, /analysis_rejected/);
  assert.match(scanner, /FILE_UNSAFE/);
  assert.match(scanner, /DOCUMENT_ANALYSIS_QUEUE/);
  assert.match(scanner, /UPDATE document_analyses SET status='ready'/);
  assert.match(scanner, /AND status='quarantined'/);
  assert.doesNotMatch(scanner, /UPDATE document_analyses SET status='safe'/);
});

test("AI and document processors revalidate provider citations before persistence", () => {
  const aiRoute = source("app/api/platform/ai/route.ts");
  const processor = source("lib/document-analysis/processor.ts");
  assert.match(aiRoute, /enforceLegalChatSourceBoundary\(/);
  assert.match(aiRoute, /errorCode: "INVALID_AI_OUTPUT"/);
  assert.match(aiRoute, /return response\(\{[\s\S]*code: "INVALID_AI_OUTPUT"[\s\S]*\}, 422\)/);
  assert.match(aiRoute, /originalUrl: source\.officialUrl/);
  assert.match(processor, /enforceDocumentAnalysisSourceBoundary\(/);
  assert.match(processor, /enforceDocumentExcerptBoundary\(/);
  const provider = source("lib/document-analysis/provider.ts");
  assert.match(provider, /untrustedDocument\.documentText/);
  assert.match(processor, /originalUrl: source\.officialUrl/);
  assert.match(
    processor,
    /setAnalysisState\(env\.DB, row, "failed", "DOCUMENT_ANALYSIS_INVALID_OUTPUT"\)/,
  );
});

test("ZIP analysis uses the verified package extractor and never sends an opaque archive to OCR", () => {
  const processor = source("lib/document-analysis/processor.ts");
  const extractor = source("lib/document-analysis/package-extractor.ts");
  assert.match(processor, /extract:\s*extractAnalysisDocument/);
  assert.match(processor, /row\.mimeType === "application\/zip"/);
  assert.match(processor, /DOCUMENT_ANALYSIS_PACKAGE_OCR_REQUIRED/);
  assert.match(extractor, /await verifyArchiveBytes\(input\.bytes, input\.mimeType\)/);
  assert.match(extractor, /MAX_PACKAGE_PAGES = 500/);
  assert.match(extractor, /MAX_INLINE_MEMBER_BYTES = 20 \* 1024 \* 1024/);
  assert.match(extractor, /MAX_INLINE_PACKAGE_BYTES = 50 \* 1024 \* 1024/);
  assert.match(extractor, /PACKAGE_MULTI_DOCUMENT/);
});
