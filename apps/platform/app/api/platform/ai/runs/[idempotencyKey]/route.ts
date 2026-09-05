import { requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { readAiRunStatus } from "../../../../../../lib/ai/run-store";
import { workspaceForUser, workspaceForUserById } from "../../../../../../lib/platform/workspace";
import { isWorkspaceId } from "../../../../../../lib/platform/routing";

type Context = { params: Promise<{ idempotencyKey: string }> };

function privateJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

export const GET = withApiErrors(async function GET(request: Request, context: Context) {
  const user = await requireApiUser(request);
  const requestedWorkspaceId = request.headers.get("x-juro-workspace-id");
  const workspace = requestedWorkspaceId
    ? (isWorkspaceId(requestedWorkspaceId)
      ? await workspaceForUserById(user.id, requestedWorkspaceId)
      : null)
    : await workspaceForUser(user);
  if (!workspace) return privateJson({ code: "WORKSPACE_UNAVAILABLE" }, 404);
  const { idempotencyKey } = await context.params;
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return privateJson({ code: "INVALID_IDEMPOTENCY_KEY" }, 400);
  }
  const status = await readAiRunStatus({
    db: requireD1(),
    workspaceId: workspace.id,
    userId: user.id,
    idempotencyKey,
  });
  if (status.kind === "missing") return privateJson({ code: "AI_RUN_NOT_FOUND" }, 404);
  return privateJson(status, status.kind === "processing" ? 202 : 200);
});
