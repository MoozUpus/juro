import { assertSafeWrite } from "../../../../../../lib/document-builder/auth/api";
import { apiError, badRequest, jsonResponse } from "../../../../../../lib/document-builder/auth/responses";
import { addHours, randomToken, sha256 } from "../../../../../../lib/document-builder/share-links/crypto";
import {
  activeSignedShareVerificationGuard,
  clearSignedShareVerificationGuardStatement,
  recordSignedShareVerificationFailure,
} from "../../../../../../lib/document-builder/share-links/verification-guard";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const { token } = await context.params;
    const body = await request.json() as { code?: string };
    const code = typeof body.code === "string" ? body.code : "";
    if (!/^\d{4}$/.test(code)) return badRequest("Доступ запрещён", "ACCESS_DENIED");
    const tokenHash = await sha256(token);
    const db = requireD1();
    const share = await db.prepare(
      `SELECT s.id, s.access_code_hash AS accessCodeHash, s.expires_at AS expiresAt,
       s.deactivated_at AS deactivatedAt, s.deleted_at AS deletedAt, f.archived_at AS archivedAt
       FROM standalone_signed_pdf_shares s JOIN document_files f ON f.id = s.file_id
       WHERE s.token_hash = ? LIMIT 1`,
    ).bind(tokenHash).first<{ id: string; accessCodeHash: string; expiresAt: string; deactivatedAt: string | null; deletedAt: string | null; archivedAt: string | null }>();
    const now = isoNow();
    if (!share || share.deletedAt || share.expiresAt <= now) {
      return jsonResponse({ error: "Срок действия ссылки истёк", code: "LINK_EXPIRED" }, { status: 410 });
    }
    if (share.deactivatedAt || share.archivedAt) return jsonResponse({ error: "Доступ запрещён", code: "ACCESS_DENIED" }, { status: 403 });
    const activeGuard = await activeSignedShareVerificationGuard(db, share.id, now);
    if (activeGuard) {
      return jsonResponse(
        { error: "Слишком много попыток. Попробуйте позже.", code: "TOO_MANY_ATTEMPTS" },
        { status: 429, headers: { "retry-after": String(activeGuard.retryAfterSeconds) } },
      );
    }
    if (await sha256(code) !== share.accessCodeHash) {
      const guard = await recordSignedShareVerificationFailure(db, share.id, now);
      if (guard.lockedUntil) {
        return jsonResponse(
          { error: "Слишком много попыток. Попробуйте позже.", code: "TOO_MANY_ATTEMPTS" },
          { status: 429, headers: { "retry-after": String(guard.retryAfterSeconds) } },
        );
      }
      return jsonResponse({ error: "Доступ запрещён", code: "ACCESS_DENIED" }, { status: 403 });
    }
    const session = randomToken(32);
    const sessionHash = await sha256(session);
    const sessionExpiresAt = addHours(now, 1);
    await db.batch([
      clearSignedShareVerificationGuardStatement(db, share.id, now),
      db.prepare("INSERT INTO signed_share_sessions (id, share_id, session_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), share.id, sessionHash, sessionExpiresAt, now),
    ]);
    const response = jsonResponse({ viewerUrl: `/api/document-builder/standalone-signed-shares/${token}/file` });
    response.headers.append("set-cookie", `juro_signed_share_session=${session}; Path=/api/document-builder/standalone-signed-shares/${token}/file; Max-Age=3600; HttpOnly; Secure; SameSite=Strict`);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
