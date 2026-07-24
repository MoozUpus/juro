import { assertSafeWrite, requireApiUser } from "../../../../../../lib/document-builder/auth/api";
import { apiError, badRequest, forbidden, jsonResponse } from "../../../../../../lib/document-builder/auth/responses";
import { requireOwner } from "../../../../../../lib/document-builder/permissions";
import { addDays, randomToken, sha256 } from "../../../../../../lib/document-builder/share-links/crypto";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const access = await requireOwner(id, user.id);
    if (!access) return forbidden();
    const body = await request.json() as { action?: string };
    const db = requireD1();
    const now = isoNow();
    if (body.action === "revoke") {
      await db.prepare("UPDATE document_share_links SET revoked_at = ? WHERE document_id = ? AND owner_user_id = ? AND revoked_at IS NULL")
        .bind(now, id, user.id).run();
      return jsonResponse({ revoked: true });
    }
    if (body.action !== "create") return badRequest("Неизвестное действие.");
    if (access.document.status === "Черновик" || access.document.status === "Архив") {
      return badRequest("Публичную ссылку можно создать только для готового документа.");
    }
    const token = randomToken(32);
    const hash = await sha256(token);
    const expiresAt = addDays(now, 7);
    await db.batch([
      db.prepare("UPDATE document_share_links SET revoked_at = ? WHERE document_id = ? AND owner_user_id = ? AND revoked_at IS NULL").bind(now, id, user.id),
      db.prepare("INSERT INTO document_share_links (id, document_id, owner_user_id, token_hash, public_token, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)")
        .bind(crypto.randomUUID(), id, user.id, hash, token, expiresAt, now),
    ]);
    const origin = new URL(request.url).origin;
    return jsonResponse({ url: `${origin}/document-builder/share/${token}`, expiresAt });
  } catch (error) {
    return apiError(error);
  }
}
