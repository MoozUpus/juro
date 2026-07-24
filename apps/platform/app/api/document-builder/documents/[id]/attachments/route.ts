import { assertSafeWrite, requireApiUser } from "../../../../../../lib/document-builder/auth/api";
import { apiError, badRequest, forbidden, jsonResponse, notFound } from "../../../../../../lib/document-builder/auth/responses";
import { requireOwner } from "../../../../../../lib/document-builder/permissions";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { deletePrivateObject, putPrivateObject, sanitizeFileName, validateUpload } from "../../../../../../lib/document-builder/storage/files";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    if (!(await requireOwner(id, user.id))) return forbidden();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("Файл не выбран.");
    const error = validateUpload(file);
    if (error) return badRequest(error, "INVALID_FILE");
    const fileId = crypto.randomUUID();
    const attachmentId = crypto.randomUUID();
    const safeName = sanitizeFileName(file.name);
    const extension = safeName.split(".").pop()?.toLocaleLowerCase() ?? "bin";
    const key = `users/${user.id}/documents/${id}/attachments/${fileId}.${extension}`;
    await putPrivateObject(key, await file.arrayBuffer(), file.type, { documentId: id, originalName: safeName });
    const now = isoNow();
    const visible = form.get("visibleToCollaborator") === "true";
    const db = requireD1();
    await db.batch([
      db.prepare("INSERT INTO document_files (id, document_id, owner_user_id, kind, r2_key, file_name, mime_type, size_bytes, archived_at, created_at, updated_at) VALUES (?, ?, ?, 'attachment', ?, ?, ?, ?, NULL, ?, ?)")
        .bind(fileId, id, user.id, key, safeName, file.type, file.size, now, now),
      db.prepare("INSERT INTO document_attachments (id, document_id, file_id, visible_to_collaborator, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(attachmentId, id, fileId, visible ? 1 : 0, now),
    ]);
    return jsonResponse({ attachment: { id: attachmentId, fileId, fileName: safeName, mimeType: file.type, sizeBytes: file.size, visibleToCollaborator: visible, createdAt: now } }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    if (!(await requireOwner(id, user.id))) return forbidden();
    const body = await request.json() as { attachmentId?: string; visibleToCollaborator?: boolean };
    if (!body.attachmentId) return badRequest("Не указано вложение.");
    const result = await requireD1().prepare("UPDATE document_attachments SET visible_to_collaborator = ? WHERE id = ? AND document_id = ?")
      .bind(body.visibleToCollaborator ? 1 : 0, body.attachmentId, id).run();
    if (!result.meta.changes) return notFound("Вложение не найдено.");
    return jsonResponse({ updated: true, visibleToCollaborator: Boolean(body.visibleToCollaborator) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    if (!(await requireOwner(id, user.id))) return forbidden();
    const body = await request.json() as { attachmentId?: string };
    if (!body.attachmentId) return badRequest("Не указано вложение.");
    const db = requireD1();
    const attachment = await db.prepare(
      "SELECT f.id AS fileId, f.r2_key AS r2Key FROM document_attachments a JOIN document_files f ON f.id = a.file_id WHERE a.id = ? AND a.document_id = ? LIMIT 1",
    ).bind(body.attachmentId, id).first<{ fileId: string; r2Key: string }>();
    if (!attachment) return notFound("Вложение не найдено.");
    await db.prepare("DELETE FROM document_files WHERE id = ? AND document_id = ?").bind(attachment.fileId, id).run();
    await deletePrivateObject(attachment.r2Key);
    return jsonResponse({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
