import { assertSafeWrite, requireApiUser } from "../../../../../lib/document-builder/auth/api";
import { apiError, badRequest, forbidden, jsonResponse, notFound } from "../../../../../lib/document-builder/auth/responses";
import { deletePrivateObject, getPrivateObject, sanitizeFileName } from "../../../../../lib/document-builder/storage/files";
import { isoNow } from "../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

async function ownedFile(id: string, userId: string, workspaceId: string) {
  return requireD1().prepare(
    "SELECT id, r2_key AS r2Key, file_name AS fileName, mime_type AS mimeType, size_bytes AS sizeBytes, archived_at AS archivedAt FROM document_files WHERE id = ? AND owner_user_id = ? AND workspace_id = ? AND kind = 'standalone_signed_pdf' LIMIT 1",
  ).bind(id, userId, workspaceId).first<{ id: string; r2Key: string; fileName: string; mimeType: string; sizeBytes: number; archivedAt: string | null }>();
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const user = await requireApiUser();
    const workspace = await workspaceForUser(user);
    const { id } = await context.params;
    const file = await ownedFile(id, user.id, workspace.id);
    if (!file) return notFound("Подписанный PDF не найден.");
    const object = await getPrivateObject(file.r2Key);
    if (!object) return notFound("Файл недоступен в хранилище.");
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    const safeName = sanitizeFileName(file.fileName);
    return new Response(object.body, { headers: {
      "content-type": "application/pdf",
      "content-length": String(object.size),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    } });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const workspace = await workspaceForUser(user);
    const { id } = await context.params;
    const file = await ownedFile(id, user.id, workspace.id);
    if (!file) return forbidden();
    const body = await request.json() as { action?: string; title?: string };
    const db = requireD1();
    const now = isoNow();
    if (body.action === "rename") {
      const title = sanitizeFileName(body.title?.trim() || "");
      if (!title) return badRequest("Введите название.");
      const fileName = title.toLocaleLowerCase().endsWith(".pdf") ? title : `${title}.pdf`;
      await db.prepare("UPDATE document_files SET file_name = ?, updated_at = ? WHERE id = ? AND owner_user_id = ? AND workspace_id = ?").bind(fileName, now, id, user.id, workspace.id).run();
      return jsonResponse({ fileName });
    }
    if (body.action === "archive") {
      await db.batch([
        db.prepare("UPDATE document_files SET archived_at = ?, updated_at = ? WHERE id = ? AND owner_user_id = ? AND workspace_id = ?").bind(now, now, id, user.id, workspace.id),
        db.prepare("UPDATE standalone_signed_pdf_shares SET deactivated_at = COALESCE(deactivated_at, ?) WHERE file_id = ? AND deactivated_at IS NULL").bind(now, id),
      ]);
      return jsonResponse({ archived: true });
    }
    if (body.action === "restore") {
      await db.prepare("UPDATE document_files SET archived_at = NULL, updated_at = ? WHERE id = ? AND owner_user_id = ? AND workspace_id = ?").bind(now, id, user.id, workspace.id).run();
      return jsonResponse({ restored: true });
    }
    return badRequest("Неизвестное действие.");
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const workspace = await workspaceForUser(user);
    const { id } = await context.params;
    const file = await ownedFile(id, user.id, workspace.id);
    if (!file) return notFound("Подписанный PDF не найден.");
    await requireD1().prepare("DELETE FROM document_files WHERE id = ? AND owner_user_id = ? AND workspace_id = ?").bind(id, user.id, workspace.id).run();
    await deletePrivateObject(file.r2Key);
    return jsonResponse({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
