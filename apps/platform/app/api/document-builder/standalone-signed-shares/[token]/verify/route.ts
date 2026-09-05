import { z } from "zod";
import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../../lib/document-builder/auth/api";
import { apiError, badRequest, jsonResponse } from "../../../../../../lib/document-builder/auth/responses";
import { addHours, randomToken, sha256 } from "../../../../../../lib/document-builder/share-links/crypto";
import {
  reserveSignedShareAttempt,
  signedShareRetryAfterSeconds,
} from "../../../../../../lib/document-builder/share-links/verification-attempts";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };
const verificationSchema = z.object({
  code: z.string().regex(/^(?:\d{4}|\d{6})$/u),
}).strict();

function lockedResponse(retryAfter: number): Response {
  return Response.json(
    { error: "Доступ временно ограничен. Повторите попытку позже.", code: "ACCESS_TEMPORARILY_LOCKED" },
    {
      status: 429,
      headers: {
        "cache-control": "private, no-store",
        pragma: "no-cache",
        "retry-after": String(retryAfter),
      },
    },
  );
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const { token } = await context.params;
    const parsed = await parseJsonRequest(request, verificationSchema, 128);
    if (!parsed.ok) return badRequest("Доступ запрещён", "ACCESS_DENIED");
    const code = parsed.data.code;
    const tokenHash = await sha256(token);
    const db = requireD1();
    const share = await db.prepare(
      `SELECT s.id, s.access_code_hash AS accessCodeHash, s.access_code_digits AS accessCodeDigits,
       s.expires_at AS expiresAt,
       s.deactivated_at AS deactivatedAt, s.deleted_at AS deletedAt, f.archived_at AS archivedAt
       FROM standalone_signed_pdf_shares s JOIN document_files f ON f.id = s.file_id
       WHERE s.token_hash = ? LIMIT 1`,
    ).bind(tokenHash).first<{ id: string; accessCodeHash: string; accessCodeDigits: number; expiresAt: string; deactivatedAt: string | null; deletedAt: string | null; archivedAt: string | null }>();
    const nowDate = new Date();
    const now = nowDate.toISOString();
    if (!share || share.deletedAt || share.expiresAt <= now) {
      return jsonResponse({ error: "Срок действия ссылки истёк", code: "LINK_EXPIRED" }, { status: 410 });
    }
    if (share.deactivatedAt || share.archivedAt) return jsonResponse({ error: "Доступ запрещён", code: "ACCESS_DENIED" }, { status: 403 });
    const reservation = await reserveSignedShareAttempt(db, share.id, nowDate);
    if (!reservation) return lockedResponse(signedShareRetryAfterSeconds(nowDate, null));
    const codeMatches = code.length === share.accessCodeDigits && await sha256(code) === share.accessCodeHash;
    if (!codeMatches) {
      if (reservation.lockedUntil) {
        return lockedResponse(signedShareRetryAfterSeconds(nowDate, reservation.lockedUntil));
      }
      return jsonResponse({ error: "Доступ запрещён", code: "ACCESS_DENIED" }, { status: 403 });
    }
    const session = randomToken(32);
    const sessionHash = await sha256(session);
    const sessionExpiresAt = addHours(now, 1);
    await db.batch([
      db.prepare("UPDATE standalone_signed_pdf_shares SET verification_attempt_count=0,verification_window_started_at=NULL,verification_locked_until=NULL WHERE id=?").bind(share.id),
      db.prepare("DELETE FROM signed_share_sessions WHERE share_id=? AND expires_at<=?").bind(share.id, now),
      db.prepare(`DELETE FROM signed_share_sessions WHERE share_id=? AND id IN (
        SELECT id FROM signed_share_sessions WHERE share_id=? ORDER BY created_at DESC,id DESC LIMIT -1 OFFSET 4
      )`).bind(share.id, share.id),
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
