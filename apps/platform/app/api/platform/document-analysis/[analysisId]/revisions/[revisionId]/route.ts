import { z } from "zod";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../../lib/document-builder/storage/runtime";
import { AnalysisRevisionError, decideSuggestedRevision } from "../../../../../../../lib/document-analysis/revisions";
import { workspaceForUser } from "../../../../../../../lib/platform/workspace";

const decisionSchema = z.object({ decision: z.enum(["accepted", "rejected"]) }).strict();
const response = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "cache-control": "private, no-store", pragma: "no-cache" },
});

export const PATCH = withApiErrors(async function PATCH(
  request: Request,
  context: { params: Promise<{ analysisId: string; revisionId: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { analysisId, revisionId } = await context.params;
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ code: "ANALYSIS_REVISION_INVALID_DECISION", error: "Некорректное решение." }, 400);
  try {
    return response(await decideSuggestedRevision(requireD1(), {
      analysisId, revisionId, workspaceId: workspace.id, userId: user.id,
      decision: parsed.data.decision,
    }));
  } catch (error) {
    if (error instanceof AnalysisRevisionError) {
      return response({ code: error.code, error: error.code === "ANALYSIS_REVISION_NOT_FOUND" ? "Исправление не найдено." : "Решение не сохранено." }, error.status);
    }
    throw error;
  }
});
