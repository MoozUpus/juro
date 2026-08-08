import { parseJsonRequest } from "../../../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../../lib/document-builder/storage/runtime";
import {
  KnowledgeBaseError,
  knowledgeBaseFeedbackSchema,
  recordKnowledgeBaseFeedback,
} from "../../../../../../../lib/platform/knowledge-base";
import { workspaceForUser } from "../../../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const POST = withApiErrors(async function POST(request: Request, { params }: { params: Promise<{ articleSlug: string }> }) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const parsed = await parseJsonRequest(request, knowledgeBaseFeedbackSchema, 1_024);
  if (!parsed.ok) {
    return response({ code: "INVALID_INPUT", error: "Проверьте оценку статьи / Maqola bahosini tekshiring." }, parsed.error === "payload_too_large" ? 413 : 400);
  }
  const { articleSlug } = await params;
  try {
    const result = await recordKnowledgeBaseFeedback({
      db: requireD1(), workspaceId: workspace.id, userId: user.id, articleSlug,
      ...parsed.data, idempotencyKey: request.headers.get("idempotency-key") ?? "",
    });
    return response(result, result.changed ? 201 : 200);
  } catch (error) {
    if (error instanceof KnowledgeBaseError) return response({ code: error.code, error: error.message }, error.status);
    throw error;
  }
});
