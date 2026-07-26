import { normalizeEmail, sha256 } from "../../../../../../lib/auth/crypto";
import { identityEvidenceMatches } from "../../../../../../lib/auth/identity-evidence";
import { runtimeIdentityProtection } from "../../../../../../lib/auth/identity-runtime";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const body = await request.json().catch(() => null) as { token?: string } | null;
  if (!body?.token || body.token.length > 256) return response({ error: "Ссылка приглашения недействительна." }, 400);
  const tokenHash = await sha256(body.token);
  const normalizedEmail = normalizeEmail(user.email);
  const db = requireD1();
  const invitation = await db.prepare(
    `SELECT id,workspace_id AS workspaceId,role,
      email_hash AS emailHash,email_lookup_hash AS emailLookupHash,
      email_lookup_key_version AS emailLookupKeyVersion,
      expires_at AS expiresAt
     FROM workspace_invitations
     WHERE token_hash=? AND accepted_at IS NULL AND revoked_at IS NULL LIMIT 1`,
  ).bind(tokenHash).first<{
    id: string;
    workspaceId: string;
    role: string;
    emailHash: string;
    emailLookupHash: string | null;
    emailLookupKeyVersion: string | null;
    expiresAt: string;
  }>();
  const matches = invitation && await identityEvidenceMatches(
    runtimeIdentityProtection(),
    {
      normalizedValue: normalizedEmail,
      purpose: "workspace-invitation-email",
      legacyHash: invitation.emailHash,
      lookupHash: invitation.emailLookupHash,
      lookupKeyVersion: invitation.emailLookupKeyVersion,
    },
  );
  if (!invitation || !matches) return response({ error: "Приглашение не найдено для этого аккаунта." }, 403);
  if (Date.parse(invitation.expiresAt) <= Date.now()) return response({ code: "INVITATION_EXPIRED", error: "Срок действия приглашения истёк." }, 410);
  const now = isoNow();
  await db.batch([
    db.prepare(
      `INSERT INTO workspace_members (id,workspace_id,user_id,role,status,joined_at,created_at,updated_at)
       VALUES (?,?,?,?,'active',?,?,?)
       ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=excluded.role,status='active',updated_at=excluded.updated_at`,
    ).bind(crypto.randomUUID(), invitation.workspaceId, user.id, invitation.role, now, now, now),
    db.prepare("UPDATE workspace_invitations SET accepted_at=?,updated_at=? WHERE id=?").bind(now, now, invitation.id),
    db.prepare("UPDATE user_profiles SET default_workspace_id=?,account_type='business',updated_at=? WHERE id=?").bind(invitation.workspaceId, now, user.id),
    db.prepare("INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,created_at) VALUES (?,?,?,'invitation',?,'invitation_accepted',?)").bind(crypto.randomUUID(), invitation.workspaceId, user.id, invitation.id, now),
  ]);
  return response({ ok: true, redirectTo: "/main" });
});
