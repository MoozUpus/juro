import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest } from "../../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import {
  legalEvaluationEvidenceExportRequestSchema,
  LegalEvaluationEvidenceError,
  exportLegalEvaluationPersistedEvidence,
} from "../../../../../../evaluation/legal-evaluation-persisted-evidence";
import {
  AiQualityReviewError,
  recordAiQualityEvaluationEvidenceExport,
} from "../../../../../../lib/ai/quality-review";

const privateHeaders = { "cache-control": "private, no-store", pragma: "no-cache" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}

export async function POST(request: Request): Promise<Response> {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "ai.quality.review", {
    freshMfaWithinMs: 15 * 60 * 1_000,
  });
  const parsed = await parseJsonRequest(
    request,
    legalEvaluationEvidenceExportRequestSchema,
    2_000_000,
  );
  if (!parsed.ok) {
    return json({
      code: parsed.error === "payload_too_large"
        ? "PAYLOAD_TOO_LARGE"
        : "LEGAL_EVALUATION_EVIDENCE_INVALID",
    }, parsed.error === "payload_too_large" ? 413 : 400);
  }
  const db = requireD1();
  const now = new Date();
  try {
    const evidence = await exportLegalEvaluationPersistedEvidence({
      db,
      resultsEnvelope: parsed.data.resultsEnvelope,
      now,
    });
    const receipt = await recordAiQualityEvaluationEvidenceExport({
      db,
      staff,
      evaluationRunId: evidence.evaluationRunId,
      applicationCommit: evidence.applicationCommit,
      corpusSha256: evidence.corpusSha256,
      resultsEnvelopeSha256: evidence.resultsEnvelopeSha256,
      exportDigest: evidence.exportDigest,
      recordCount: evidence.records.length,
      now,
    });
    return json({ evidence, receipt });
  } catch (error) {
    if (error instanceof LegalEvaluationEvidenceError) {
      if (error.code === "LEGAL_EVALUATION_EVIDENCE_INVALID") return json({ code: error.code }, 400);
      if (error.code === "LEGAL_EVALUATION_EVIDENCE_NOT_FOUND") return json({ code: error.code }, 404);
      return json({ code: error.code }, 409);
    }
    if (error instanceof AiQualityReviewError) return json({ code: error.code }, 409);
    throw error;
  }
}
