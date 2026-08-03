import { requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { readAiRunStatus } from "../../../../../../lib/ai/run-store";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

type Context = { params: Promise<{ idempotencyKey: string }> };

function privateJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

export const GET = withApiErrors(async function GET(_request: Request, context: Context) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
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
