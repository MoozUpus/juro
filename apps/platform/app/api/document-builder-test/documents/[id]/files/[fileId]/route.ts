import { requireApiUser } from "../../../../../../../lib/document-builder/auth/api";
import { apiError, forbidden, notFound } from "../../../../../../../lib/document-builder/auth/responses";
import { addActivity } from "../../../../../../../lib/document-builder/storage/db";
import { getPrivateObject, sanitizeFileName } from "../../../../../../../lib/document-builder/storage/files";
import { requireD1 } from "../../../../../../../lib/document-builder/storage/runtime";
import { getDocumentAccess } from "../../../../../../../lib/document-builder/permissions";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; fileId: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id, fileId } = await context.params;
    const access = await getDocumentAccess(id, user.id);
    if (!access?.canView) return forbidden();
    const db = requireD1();
    const file = await db.prepare(
      "SELECT id, owner_user_id AS ownerUserId, kind, r2_key AS r2Key, file_name AS fileName, mime_type AS mimeType, size_bytes AS sizeBytes FROM document_files WHERE id = ? AND document_id = ? LIMIT 1",
    ).bind(fileId, id).first<{ id: string; ownerUserId: string; kind: string; r2Key: string; fileName: string; mimeType: string; sizeBytes: number }>();
    if (!file) return notFound("Файл не найден.");
    let allowed = access.role === "owner" || access.canDownload;
    let signedInline = false;
    const requestedInline = new URL(request.url).searchParams.get("inline") === "1";
    if (file.kind === "attachment" && access.role === "collaborator" && requestedInline) {
      const visible = await db.prepare(
        "SELECT 1 AS allowed FROM document_attachments WHERE document_id = ? AND file_id = ? AND visible_to_collaborator = 1 LIMIT 1",
      ).bind(id, fileId).first<{ allowed: number }>();
      allowed = Boolean(visible);
    }
    if (file.kind === "signed_pdf" && access.role === "collaborator") {
      const signedAccess = await db.prepare(
        "SELECT view_allowed AS viewAllowed, download_allowed AS downloadAllowed FROM signed_document_access WHERE document_id = ? AND collaborator_user_id = ? LIMIT 1",
      ).bind(id, user.id).first<{ viewAllowed: number; downloadAllowed: number }>();
      const inline = requestedInline;
      allowed = inline ? Boolean(signedAccess?.viewAllowed) : Boolean(signedAccess?.downloadAllowed);
      signedInline = inline;
      if (allowed && inline) {
        await db.prepare("UPDATE signed_document_access SET opened = 1, updated_at = datetime('now') WHERE document_id = ? AND collaborator_user_id = ?")
          .bind(id, user.id).run();
      }
    }
    if (!allowed) return forbidden("Скачивание этого файла не разрешено.");
    const object = await getPrivateObject(file.r2Key);
    if (!object) return notFound("Файл недоступен в хранилище.");
    const inline = signedInline || requestedInline;
    const disposition = inline ? "inline" : "attachment";
    const safeName = sanitizeFileName(file.fileName).replace(/"/g, "");
    const headers = new Headers({
      "content-type": file.mimeType,
      "content-length": String(object.size),
      "content-disposition": `${disposition}; filename="document"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    });
    if (file.kind !== "signed_pdf") await addActivity(id, user.id, "document_downloaded", { kind: file.kind });
    return new Response(object.body, { headers });
  } catch (error) {
    return apiError(error);
  }
}
