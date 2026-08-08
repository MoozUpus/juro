import { requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { getPrivateObject } from "../../../../../../lib/document-builder/storage/files";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

export const GET = withApiErrors(async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { fileId } = await params;
  const file = await requireD1().prepare(
    "SELECT r2_key AS r2Key,file_name AS fileName,mime_type AS mimeType FROM document_files WHERE id=? AND workspace_id=? AND owner_user_id=? AND kind='review_upload' LIMIT 1",
  ).bind(fileId, workspace.id, user.id).first<{ r2Key: string; fileName: string; mimeType: string }>();
  if (!file) return Response.json({ error: "Файл не найден." }, { status: 404 });
  const object = await getPrivateObject(file.r2Key);
  if (!object) return Response.json({ error: "Файл недоступен." }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": file.mimeType,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
