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
  assert.match(finalize, /MALWARE_SCANNER_UNAVAILABLE/);
  assert.match(`${upload}\n${finalize}`, /requireQuarantineR2/);
  assert.doesNotMatch(`${upload}\n${finalize}`, /requireR2\(\)/);
  assert.doesNotMatch(`${upload}\n${finalize}`, /callOpenAiJson|callAnthropic|status='safe'|status='ready'/);
});

test("dashboard and review surfaces use the secure upload client", () => {
  const dashboard = source("app/_platform/DashboardClient.tsx");
  const review = source("app/_platform/DocumentReviewClient.tsx");
  assert.match(dashboard, /uploadDocumentForAnalysis\(file, locale, setUploadProgress\)/);
  assert.match(review, /uploadDocumentForAnalysis\(file, locale, setUploadProgress\)/);
  assert.match(dashboard, /role="progressbar"/);
  assert.doesNotMatch(`${dashboard}\n${review}`, /new FormData\(\)/);
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
