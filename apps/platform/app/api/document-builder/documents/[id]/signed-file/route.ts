import { assertSafeWrite, requireApiUser } from "../../../../../../lib/document-builder/auth/api";
import { apiError, badRequest, forbidden, jsonResponse } from "../../../../../../lib/document-builder/auth/responses";
import { requireOwner } from "../../../../../../lib/document-builder/permissions";
import { addActivity, isoNow } from "../../../../../../lib/document-builder/storage/db";
import { putPrivateObject, sanitizeFileName, validateUpload } from "../../../../../../lib/document-builder/storage/files";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const access = await requireOwner(id, user.id);
    if (!access?.workspaceId) return forbidden();
    if (access.document.signedFileId) return jsonResponse({ error: "Подписанный PDF уже загружен и не может быть заменён.", code: "SIGNED_FILE_EXISTS" }, { status: 409 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("PDF-файл не выбран.");
    const validationError = validateUpload(file, true);
    if (validationError) return badRequest(validationError, "INVALID_SIGNED_FILE");
    const fileId = crypto.randomUUID();
    const safeName = sanitizeFileName(file.name);
    const key = `users/${user.id}/documents/${id}/signed/${fileId}.pdf`;
    await putPrivateObject(key, await file.arrayBuffer(), "application/pdf", { documentId: id, kind: "signed_pdf" });
    const now = isoNow();
    const db = requireD1();
    await db.batch([
      db.prepare("INSERT INTO document_files (id, workspace_id, document_id, owner_user_id, kind, r2_key, file_name, mime_type, size_bytes, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'signed_pdf', ?, ?, 'application/pdf', ?, NULL, ?, ?)")
        .bind(fileId, access.workspaceId, id, user.id, key, safeName, file.size, now, now),
      db.prepare("UPDATE documents SET signed_file_id = ?, status = 'Подписан', revision = revision + 1, updated_at = ? WHERE id = ?").bind(fileId, now, id),
    ]);
    await addActivity(id, user.id, "signed_pdf_uploaded");
    return jsonResponse({ file: { id: fileId, fileName: safeName, mimeType: "application/pdf", sizeBytes: file.size, url: `/api/document-builder/documents/${id}/files/${fileId}?inline=1` }, status: "Подписан" }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
