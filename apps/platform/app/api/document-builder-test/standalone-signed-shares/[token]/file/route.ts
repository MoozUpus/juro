import { apiError, forbidden, notFound } from "../../../../../../lib/document-builder/auth/responses";
import { sha256 } from "../../../../../../lib/document-builder/share-links/crypto";
import { getPrivateObject, sanitizeFileName } from "../../../../../../lib/document-builder/storage/files";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };

function cookieValue(request: Request, key: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === key) return value.join("=");
  }
  return null;
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const { token } = await context.params;
    const session = cookieValue(request, "juro_signed_share_session");
    if (!session) return forbidden("Доступ запрещён");
    const [tokenHash, sessionHash] = await Promise.all([sha256(token), sha256(session)]);
    const record = await requireD1().prepare(
      `SELECT f.r2_key AS r2Key, f.file_name AS fileName, s.expires_at AS expiresAt,
       s.deactivated_at AS deactivatedAt, s.deleted_at AS deletedAt, f.archived_at AS archivedAt,
       ss.expires_at AS sessionExpiresAt
       FROM standalone_signed_pdf_shares s
       JOIN document_files f ON f.id = s.file_id
       JOIN signed_share_sessions ss ON ss.share_id = s.id AND ss.session_hash = ?
       WHERE s.token_hash = ? LIMIT 1`,
    ).bind(sessionHash, tokenHash).first<{ r2Key: string; fileName: string; expiresAt: string; deactivatedAt: string | null; deletedAt: string | null; archivedAt: string | null; sessionExpiresAt: string }>();
    const now = new Date().toISOString();
    if (!record || record.deletedAt || record.deactivatedAt || record.archivedAt || record.expiresAt <= now || record.sessionExpiresAt <= now) return forbidden("Доступ запрещён");
    const object = await getPrivateObject(record.r2Key);
    if (!object) return notFound("Файл недоступен.");
    const name = sanitizeFileName(record.fileName);
    return new Response(object.body, { headers: {
      "content-type": "application/pdf",
      "content-length": String(object.size),
      "content-disposition": `inline; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive",
    } });
  } catch (error) {
    return apiError(error);
  }
}
