import { assertSafeWrite, requireApiUser } from "../../../../lib/document-builder/auth/api";
import { apiError, badRequest, jsonResponse } from "../../../../lib/document-builder/auth/responses";
import { isoNow } from "../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../lib/platform/workspace";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const user = await requireApiUser();
    const workspace = await workspaceForUser(user);
    const result = await requireD1().prepare(
      "SELECT id, document_id AS documentId, type, title, body, read_at AS readAt, created_at AS createdAt FROM notifications WHERE user_id = ? AND workspace_id = ? ORDER BY created_at DESC LIMIT 200",
    ).bind(user.id, workspace.id).all();
    return jsonResponse({ notifications: result.results });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const workspace = await workspaceForUser(user);
    const body = await request.json() as { id?: string; all?: boolean };
    const db = requireD1();
    if (body.all) {
      await db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND workspace_id = ? AND read_at IS NULL").bind(isoNow(), user.id, workspace.id).run();
      return jsonResponse({ updated: true });
    }
    if (!body.id) return badRequest("Не указано уведомление.");
    await db.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND workspace_id = ?").bind(isoNow(), body.id, user.id, workspace.id).run();
    return jsonResponse({ updated: true });
  } catch (error) {
    return apiError(error);
  }
}
