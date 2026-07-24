import { assertSafeWrite, requireApiUser } from "../../../../../../lib/document-builder/auth/api";
import { apiError, badRequest, forbidden, jsonResponse } from "../../../../../../lib/document-builder/auth/responses";
import { addHours, fourDigitCode, randomToken, sha256 } from "../../../../../../lib/document-builder/share-links/crypto";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const db = requireD1();
    const file = await db.prepare("SELECT id, archived_at AS archivedAt FROM document_files WHERE id = ? AND owner_user_id = ? AND kind = 'standalone_signed_pdf' LIMIT 1")
      .bind(id, user.id).first<{ id: string; archivedAt: string | null }>();
    if (!file) return forbidden();
    const share = await db.prepare(
      `SELECT id, public_token AS publicToken, access_code AS accessCode, expires_at AS expiresAt,
       deactivated_at AS deactivatedAt, deleted_at AS deletedAt
       FROM standalone_signed_pdf_shares WHERE file_id = ? AND owner_user_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
    ).bind(id, user.id).first<{ id: string; publicToken: string; accessCode: string; expiresAt: string; deactivatedAt: string | null; deletedAt: string | null }>();
    if (!share) return jsonResponse({ share: null });
    const now = isoNow();
    const active = !file.archivedAt && !share.deactivatedAt && share.expiresAt > now;
    const expired = share.expiresAt <= now;
    if (expired && share.accessCode) {
      await db.prepare("UPDATE standalone_signed_pdf_shares SET access_code = '', access_code_hash = '' WHERE id = ?")
        .bind(share.id).run();
    }
    const origin = new URL(request.url).origin;
    return jsonResponse({ share: {
      id: share.id,
      url: `${origin}/document-builder/signed-share/${share.publicToken}`,
      code: active ? share.accessCode : null,
      status: active ? "active" : expired ? "expired" : "inactive",
    } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const body = await request.json() as { action?: string };
    const db = requireD1();
    const file = await db.prepare("SELECT id, archived_at AS archivedAt FROM document_files WHERE id = ? AND owner_user_id = ? AND kind = 'standalone_signed_pdf' LIMIT 1")
      .bind(id, user.id).first<{ id: string; archivedAt: string | null }>();
    if (!file) return forbidden();
    const now = isoNow();
    const latest = await db.prepare(
      `SELECT id, access_code AS accessCode, expires_at AS expiresAt, deactivated_at AS deactivatedAt,
       deleted_at AS deletedAt FROM standalone_signed_pdf_shares WHERE file_id = ? AND owner_user_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    ).bind(id, user.id).first<{ id: string; accessCode: string; expiresAt: string; deactivatedAt: string | null; deletedAt: string | null }>();

    if (body.action === "delete_expired") {
      if (!latest || latest.expiresAt > now) return badRequest("Удалить можно только истёкшую ссылку.");
      await db.prepare("UPDATE standalone_signed_pdf_shares SET access_code = '', access_code_hash = '', deleted_at = ? WHERE id = ?")
        .bind(now, latest.id).run();
      return jsonResponse({ deleted: true });
    }
    if (body.action !== "create") return badRequest("Неизвестное действие.");
    if (file.archivedAt) return badRequest("Ссылка недоступна для архивного файла.", "FILE_ARCHIVED");
    if (latest && latest.expiresAt <= now) {
      if (!latest.deletedAt) {
        await db.prepare("UPDATE standalone_signed_pdf_shares SET access_code = '', access_code_hash = '' WHERE id = ?").bind(latest.id).run();
      }
      return jsonResponse({ error: "Срок действия ссылки истёк. Для этого файла новую ссылку создать нельзя.", code: "LINK_EXPIRED_PERMANENT" }, { status: 409 });
    }
    const reuseCode = latest && latest.expiresAt > now ? latest.accessCode : null;
    const code = reuseCode || fourDigitCode();
    const token = randomToken(32);
    const [tokenHash, codeHash] = await Promise.all([sha256(token), sha256(code)]);
    const expiresAt = addHours(now, 24);
    const shareId = crypto.randomUUID();
    await db.batch([
      db.prepare("UPDATE standalone_signed_pdf_shares SET deactivated_at = ? WHERE file_id = ? AND owner_user_id = ? AND deactivated_at IS NULL AND deleted_at IS NULL").bind(now, id, user.id),
      db.prepare("INSERT INTO standalone_signed_pdf_shares (id, file_id, owner_user_id, token_hash, public_token, access_code, access_code_hash, expires_at, deactivated_at, deleted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)")
        .bind(shareId, id, user.id, tokenHash, token, code, codeHash, expiresAt, now),
    ]);
    const origin = new URL(request.url).origin;
    return jsonResponse({ share: { id: shareId, url: `${origin}/document-builder/signed-share/${token}`, code, status: "active" } }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
