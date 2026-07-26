import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

export const PATCH = withApiErrors(async function PATCH(request: Request, { params }: { params: Promise<{ factId: string }> }) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { factId } = await params;
  const body = await request.json().catch(() => null) as { status?: string; statement?: string } | null;
  if (!body || !["confirmed", "rejected", "proposed"].includes(body.status ?? "")) {
    return Response.json({ error: "Недопустимый статус факта." }, { status: 400 });
  }
  const statement = body.statement?.trim().slice(0, 2_000);
  const now = isoNow();
  const result = await requireD1().prepare(
    `UPDATE confirmed_facts SET status=?,statement=COALESCE(?,statement),
      confirmed_by_user_id=CASE WHEN ?='confirmed' THEN ? ELSE NULL END,
      confirmed_at=CASE WHEN ?='confirmed' THEN ? ELSE NULL END,updated_at=?
     WHERE id=? AND conversation_id IN (
       SELECT id FROM conversations WHERE workspace_id=? AND owner_user_id=?
     )`,
  ).bind(body.status, statement || null, body.status, user.id, body.status, now, now, factId, workspace.id, user.id).run();
  if (!result.meta.changes) return Response.json({ error: "Факт не найден." }, { status: 404 });
  return Response.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
});
