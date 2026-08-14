import { z } from "zod";

import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../../lib/auth/staff-http";
import { requireD1, runtimeEnv } from "../../../../../../lib/document-builder/storage/runtime";
import {
  exportLegalEvaluationHumanEvidence,
  LegalEvaluationHumanEvidenceError,
} from "../../../../../../evaluation/legal-evaluation-human-evidence";

const requestSchema = z.object({
  evaluationRunId: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();
const privateHeaders = { "cache-control": "private, no-store", pragma: "no-cache" };

async function post(request: Request): Promise<Response> {
  if (runtimeEnv().APP_ENV !== "staging") return new Response(null, { status: 404, headers: privateHeaders });
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "ai.quality.review", { freshMfaWithinMs: 15 * 60 * 1_000 });
  const parsed = await parseJsonRequest(request, requestSchema, 1_024);
  if (!parsed.ok) return Response.json({ code: "LEGAL_EVALUATION_HUMAN_EVIDENCE_INVALID" }, { status: 400, headers: privateHeaders });
  const db = requireD1(); const now = new Date();
  try {
    const evidence = await exportLegalEvaluationHumanEvidence({ db, evaluationRunId: parsed.data.evaluationRunId, now });
    void staff;
    return Response.json({ evidence }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof LegalEvaluationHumanEvidenceError) {
      const status = error.code === "LEGAL_EVALUATION_HUMAN_EVIDENCE_NOT_FOUND" ? 404 : 409;
      return Response.json({ code: error.code }, { status, headers: privateHeaders });
    }
    throw error;
  }
}

export const POST = withPlatformStaffErrors(post);
