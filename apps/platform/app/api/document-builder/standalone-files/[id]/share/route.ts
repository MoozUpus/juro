import { assertSafeWrite, requireApiUser } from "../../../../../../lib/document-builder/auth/api";
import { apiError, badRequest, forbidden, jsonResponse } from "../../../../../../lib/document-builder/auth/responses";
import { parseIdentityKeyring } from "../../../../../../lib/auth/keyring";
import { addHours, fourDigitCode, randomToken, sha256 } from "../../../../../../lib/document-builder/share-links/crypto";
import { protectSignedShareSecret, resolveSignedShareSecret, type SignedShareSecretRow } from "../../../../../../lib/document-builder/share-links/protected-secret";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1, runtimeEnv } from "../../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const user = await requireApiUser();
    const workspace = await workspaceForUser(user);
    const { id } = await context.params;
    const db = requireD1();
    const keyring = parseIdentityKeyring(runtimeEnv().IDENTITY_KEYRING);
    const file = await db.prepare("SELECT id, archived_at AS archivedAt FROM document_files WHERE id = ? AND owner_user_id = ? AND workspace_id = ? AND kind = 'standalone_signed_pdf' LIMIT 1")
      .bind(id, user.id, workspace.id).first<{ id: string; archivedAt: string | null }>();
    if (!file) return forbidden();
    const share = await db.prepare(
      `SELECT id, owner_user_id AS ownerUserId,
       public_token AS publicToken, public_token_ciphertext AS publicTokenCiphertext,
       public_token_iv AS publicTokenIv, public_token_key_version AS publicTokenKeyVersion,
       access_code AS accessCode, access_code_ciphertext AS accessCodeCiphertext,
       access_code_iv AS accessCodeIv, access_code_key_version AS accessCodeKeyVersion,
       expires_at AS expiresAt,
       deactivated_at AS deactivatedAt, deleted_at AS deletedAt
       FROM standalone_signed_pdf_shares WHERE file_id = ? AND owner_user_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
    ).bind(id, user.id).first<SignedShareSecretRow & { expiresAt: string; deactivatedAt: string | null; deletedAt: string | null }>();
    if (!share) return jsonResponse({ share: null });
    const now = isoNow();
    const active = !file.archivedAt && !share.deactivatedAt && share.expiresAt > now;
    const expired = share.expiresAt <= now;
    const publicToken = await resolveSignedShareSecret(keyring, share, "publicToken");
    const accessCode = !expired
      ? await resolveSignedShareSecret(keyring, share, "accessCode")
      : null;
    if (publicToken.needsBackfill || accessCode?.needsBackfill) {
      const [protectedToken, protectedCode] = await Promise.all([
        publicToken.needsBackfill
          ? protectSignedShareSecret(keyring, share, "publicToken", publicToken.plaintext)
          : null,
        accessCode?.needsBackfill
          ? protectSignedShareSecret(keyring, share, "accessCode", accessCode.plaintext)
          : null,
      ]);
      await db.prepare(
        `UPDATE standalone_signed_pdf_shares SET
         public_token = CASE WHEN ? IS NULL THEN public_token ELSE '' END,
         public_token_ciphertext = COALESCE(?, public_token_ciphertext),
         public_token_iv = COALESCE(?, public_token_iv),
         public_token_key_version = COALESCE(?, public_token_key_version),
         access_code = CASE WHEN ? IS NULL THEN access_code ELSE '' END,
         access_code_ciphertext = COALESCE(?, access_code_ciphertext),
         access_code_iv = COALESCE(?, access_code_iv),
         access_code_key_version = COALESCE(?, access_code_key_version)
         WHERE id = ?`,
      ).bind(
        protectedToken?.ciphertext ?? null,
        protectedToken?.ciphertext ?? null,
        protectedToken?.iv ?? null,
        protectedToken?.keyVersion ?? null,
        protectedCode?.ciphertext ?? null,
        protectedCode?.ciphertext ?? null,
        protectedCode?.iv ?? null,
        protectedCode?.keyVersion ?? null,
        share.id,
      ).run();
    }
    if (expired) {
      await db.prepare(
        `UPDATE standalone_signed_pdf_shares SET
         public_token = '', token_hash = '', public_token_ciphertext = NULL,
         public_token_iv = NULL, public_token_key_version = NULL,
         access_code = '', access_code_hash = '', access_code_ciphertext = NULL,
         access_code_iv = NULL, access_code_key_version = NULL
         WHERE id = ?`,
      ).bind(share.id).run();
    }
    const origin = new URL(request.url).origin;
    return jsonResponse({ share: {
      id: share.id,
      url: `${origin}/document-builder/signed-share/${publicToken.plaintext}`,
      code: active ? accessCode?.plaintext ?? null : null,
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
    const workspace = await workspaceForUser(user);
    const { id } = await context.params;
    const body = await request.json() as { action?: string };
    const db = requireD1();
    const keyring = parseIdentityKeyring(runtimeEnv().IDENTITY_KEYRING);
    const file = await db.prepare("SELECT id, archived_at AS archivedAt FROM document_files WHERE id = ? AND owner_user_id = ? AND workspace_id = ? AND kind = 'standalone_signed_pdf' LIMIT 1")
      .bind(id, user.id, workspace.id).first<{ id: string; archivedAt: string | null }>();
    if (!file) return forbidden();
    const now = isoNow();
    const latest = await db.prepare(
      `SELECT id, owner_user_id AS ownerUserId,
       access_code AS accessCode, access_code_ciphertext AS accessCodeCiphertext,
       access_code_iv AS accessCodeIv, access_code_key_version AS accessCodeKeyVersion,
       expires_at AS expiresAt, deactivated_at AS deactivatedAt,
       deleted_at AS deletedAt FROM standalone_signed_pdf_shares WHERE file_id = ? AND owner_user_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    ).bind(id, user.id).first<SignedShareSecretRow & { expiresAt: string; deactivatedAt: string | null; deletedAt: string | null }>();

    if (body.action === "delete_expired") {
      if (!latest || latest.expiresAt > now) return badRequest("Удалить можно только истёкшую ссылку.");
      await db.prepare(
        `UPDATE standalone_signed_pdf_shares SET
         public_token = '', token_hash = '', public_token_ciphertext = NULL,
         public_token_iv = NULL, public_token_key_version = NULL,
         access_code = '', access_code_hash = '', access_code_ciphertext = NULL,
         access_code_iv = NULL, access_code_key_version = NULL, deleted_at = ?
         WHERE id = ?`,
      )
        .bind(now, latest.id).run();
      return jsonResponse({ deleted: true });
    }
    if (body.action !== "create") return badRequest("Неизвестное действие.");
    if (file.archivedAt) return badRequest("Ссылка недоступна для архивного файла.", "FILE_ARCHIVED");
    if (latest && latest.expiresAt <= now) {
      if (!latest.deletedAt) {
        await db.prepare(
          `UPDATE standalone_signed_pdf_shares SET
           public_token = '', token_hash = '', public_token_ciphertext = NULL,
           public_token_iv = NULL, public_token_key_version = NULL,
           access_code = '', access_code_hash = '', access_code_ciphertext = NULL,
           access_code_iv = NULL, access_code_key_version = NULL
           WHERE id = ?`,
        ).bind(latest.id).run();
      }
      return jsonResponse({ error: "Срок действия ссылки истёк. Для этого файла новую ссылку создать нельзя.", code: "LINK_EXPIRED_PERMANENT" }, { status: 409 });
    }
    const reuseCode = latest && latest.expiresAt > now
      ? (await resolveSignedShareSecret(keyring, latest, "accessCode")).plaintext
      : null;
    const code = reuseCode || fourDigitCode();
    const token = randomToken(32);
    const [tokenHash, codeHash] = await Promise.all([sha256(token), sha256(code)]);
    const expiresAt = addHours(now, 24);
    const shareId = crypto.randomUUID();
    const secretContext = { id: shareId, ownerUserId: user.id };
    const [protectedToken, protectedCode] = await Promise.all([
      protectSignedShareSecret(keyring, secretContext, "publicToken", token),
      protectSignedShareSecret(keyring, secretContext, "accessCode", code),
    ]);
    await db.batch([
      db.prepare("UPDATE standalone_signed_pdf_shares SET deactivated_at = ? WHERE file_id = ? AND owner_user_id = ? AND deactivated_at IS NULL AND deleted_at IS NULL").bind(now, id, user.id),
      db.prepare(
        `INSERT INTO standalone_signed_pdf_shares
         (id, file_id, owner_user_id, token_hash, public_token, public_token_ciphertext,
          public_token_iv, public_token_key_version, access_code, access_code_hash,
          access_code_ciphertext, access_code_iv, access_code_key_version,
          expires_at, deactivated_at, deleted_at, created_at)
         VALUES (?, ?, ?, ?, '', ?, ?, ?, '', ?, ?, ?, ?, ?, NULL, NULL, ?)`,
      ).bind(
        shareId, id, user.id, tokenHash,
        protectedToken.ciphertext, protectedToken.iv, protectedToken.keyVersion,
        codeHash, protectedCode.ciphertext, protectedCode.iv, protectedCode.keyVersion,
        expiresAt, now,
      ),
    ]);
    const origin = new URL(request.url).origin;
    return jsonResponse({ share: { id: shareId, url: `${origin}/document-builder/signed-share/${token}`, code, status: "active" } }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
