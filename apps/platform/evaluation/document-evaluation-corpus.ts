export const DOCUMENT_EVALUATION_FORMATS = ["docx", "text_pdf", "scanned_pdf", "jpg", "png", "zip"] as const;
export type DocumentEvaluationFormat = (typeof DOCUMENT_EVALUATION_FORMATS)[number];
export type DocumentEvaluationPackage = {
  id: string;
  format: DocumentEvaluationFormat;
  tags: readonly string[];
  expectedComparisonPeerId?: string;
  requiresHumanReview: true;
};

const tags = [
  "table", "bilingual", "low_quality", "annexes", "prompt_injection",
  "renumbered_clauses", "hidden_risk", "dates_sums", "selected_side",
] as const;

function formatFor(index: number): DocumentEvaluationFormat {
  return DOCUMENT_EVALUATION_FORMATS[index % DOCUMENT_EVALUATION_FORMATS.length]!;
}

function packageId(index: number): string {
  return `document-package-${String(index).padStart(3, "0")}`;
}

/** Synthetic test-package manifest only. Each item needs a real controlled artifact before a quality score may be recorded. */
export const documentEvaluationCorpus: readonly DocumentEvaluationPackage[] = Array.from(
  { length: 100 },
  (_, offset) => {
    const index = offset + 1;
    const comparisonPair = index <= 60 ? Math.ceil(index / 2) : null;
    const peer = comparisonPair === null
      ? undefined
      : packageId(index % 2 === 0 ? index - 1 : index + 1);
    return {
      id: packageId(index),
      format: formatFor(offset),
      tags: [tags[offset % tags.length]!, ...(comparisonPair ? ["comparison"] : [])],
      expectedComparisonPeerId: peer,
      requiresHumanReview: true,
    };
  },
);

export type DocumentEvaluationResult = {
  packageId: string;
  actualFormat: DocumentEvaluationFormat;
  criticalRisksDetected: number;
  datesAndSumsVerified?: boolean;
  ocrQuality?: number;
  comparisonPeerId?: string;
  humanReviewerId?: string;
};

export function validateDocumentEvaluationResults(
  results: readonly DocumentEvaluationResult[],
  packages: readonly DocumentEvaluationPackage[] = documentEvaluationCorpus,
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  const byId = new Map(packages.map((item) => [item.id, item]));
  const resultIds = new Set<string>();
  if (results.length !== packages.length) failures.push("RESULT_COUNT_MISMATCH");
  for (const result of results) {
    const expected = byId.get(result.packageId);
    if (!expected) failures.push(`UNKNOWN_PACKAGE:${result.packageId}`);
    if (resultIds.has(result.packageId)) failures.push(`DUPLICATE_RESULT:${result.packageId}`);
    resultIds.add(result.packageId);
    if (!expected) continue;
    if (result.actualFormat !== expected.format) failures.push(`FORMAT_MISMATCH:${result.packageId}`);
    if (!result.humanReviewerId) failures.push(`HUMAN_REVIEW_MISSING:${result.packageId}`);
    if (expected.tags.includes("dates_sums") && result.datesAndSumsVerified !== true) {
      failures.push(`DATES_SUMS_UNVERIFIED:${result.packageId}`);
    }
    if (expected.format === "scanned_pdf" && (typeof result.ocrQuality !== "number" || result.ocrQuality < 0 || result.ocrQuality > 1)) {
      failures.push(`OCR_QUALITY_MISSING:${result.packageId}`);
    }
    if (expected.expectedComparisonPeerId && result.comparisonPeerId !== expected.expectedComparisonPeerId) {
      failures.push(`COMPARISON_PEER_MISMATCH:${result.packageId}`);
    }
  }
  for (const item of packages) {
    if (!resultIds.has(item.id)) failures.push(`RESULT_MISSING:${item.id}`);
  }
  return { passed: failures.length === 0, failures };
}
