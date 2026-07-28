import { normalizeEmail, randomToken, sha256 } from "../../../../lib/auth/crypto";
import {
  prepareEncryptedIdentityEvidence,
  resolveEncryptedIdentityEvidence,
} from "../../../../lib/auth/identity-evidence";
import {
  resolveUserIdentity,
  userIdByEmail,
  userIdentitySelect,
  type UserIdentityRow,
} from "../../../../lib/auth/identity-protection";
import { runtimeIdentityProtection } from "../../../../lib/auth/identity-runtime";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../lib/document-builder/storage/db";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { isWorkspaceRole, requireTeamManager } from "../../../../lib/platform/permissions";
import { workspaceForUser } from "../../../../lib/platform/workspace";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITABLE_ROLES = new Set(["admin", "lawyer", "employee", "viewer", "external"]);

type WorkspaceInvitationRow = {
  id: string;
  workspaceId: string;
  email: string | null;
  emailCiphertext: string | null;
  emailIv: string | null;
  emailKeyVersion: string | null;
  emailLookupHash: string | null;
  emailLookupKeyVersion: string | null;
  role: string;
  expiresAt: string;
  createdAt: string;
};

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const [workspaceRow, members, invitations] = await db.batch([
    db.prepare("SELECT id,name,type,locale FROM workspaces WHERE id=? LIMIT 1").bind(workspace.id),
    db.prepare(
      `SELECT m.id,m.user_id AS userId,m.role,m.status,m.joined_at AS joinedAt,
        u.full_name AS fullName,${userIdentitySelect("u")}
       FROM workspace_members m JOIN user_profiles u ON u.id=m.user_id
       WHERE m.workspace_id=? AND m.status='active'
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        u.full_name,m.joined_at`,
    ).bind(workspace.id),
    db.prepare(
      `SELECT id,workspace_id AS workspaceId,email,
        email_ciphertext AS emailCiphertext,email_iv AS emailIv,
        email_key_version AS emailKeyVersion,
        email_lookup_hash AS emailLookupHash,
        email_lookup_key_version AS emailLookupKeyVersion,
        role,expires_at AS expiresAt,created_at AS createdAt
       FROM workspace_invitations
       WHERE workspace_id=? AND accepted_at IS NULL AND revoked_at IS NULL
       ORDER BY created_at DESC`,
    ).bind(workspace.id),
  ]);
  const identityContext = runtimeIdentityProtection();
  const resolvedMembers = await Promise.all(
    (members.results as Array<UserIdentityRow & {
      userId: string;
      role: string;
      status: string;
      joinedAt: string;
      fullName: string | null;
    }>).map(async member => {
      const identity = await resolveUserIdentity(
        identityContext,
        { ...member, id: member.userId },
      );
      return {
        id: member.id,
        userId: member.userId,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt,
        fullName: member.fullName,
        email: identity.email,
      };
    }),
  );
  const resolvedInvitations = await Promise.all(
    (invitations.results as WorkspaceInvitationRow[]).map(
      async invitation => {
        const identity = await resolveEncryptedIdentityEvidence(
          identityContext,
          {
            rawValue: invitation.email,
            ciphertext: invitation.emailCiphertext,
            iv: invitation.emailIv,
            keyVersion: invitation.emailKeyVersion,
            lookupHash: invitation.emailLookupHash,
            lookupKeyVersion: invitation.emailLookupKeyVersion,
            purpose: "workspace-invitation-email",
            subjectId: invitation.workspaceId,
            recordId: invitation.id,
            normalize: normalizeEmail,
          },
        );
        return {
          id: invitation.id,
          email: identity.value,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
        };
      },
    ),
  );
  return response({
    workspace: workspaceRow.results[0] ?? null,
    currentRole: workspace.role,
    members: resolvedMembers,
    invitations: resolvedInvitations,
  });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  requireTeamManager(workspace.role);
  const env = runtimeEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return response({ code: "EMAIL_PROVIDER_UNAVAILABLE", error: "Приглашение не отправлено: почтовый провайдер не настроен." }, 503);
  }

  const body = await request.json().catch(() => null) as { email?: string; role?: string; locale?: string } | null;
  const email = normalizeEmail(body?.email ?? "");
  const role = body?.role;
  const locale = body?.locale === "uz" ? "uz" : "ru";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return response({ error: locale === "ru" ? "Проверьте email участника." : "Ishtirokchi emailini tekshiring." }, 400);
  }
  if (!isWorkspaceRole(role) || !INVITABLE_ROLES.has(role)) {
    return response({ error: locale === "ru" ? "Выберите допустимую роль." : "Ruxsat etilgan rolni tanlang." }, 400);
  }

  const db = requireD1();
  const identityContext = runtimeIdentityProtection();
  const emailHash = await sha256(email);
  const existingUserId = await userIdByEmail(db, identityContext, email);
  const existingMember = existingUserId
    ? await db.prepare(
      `SELECT id FROM workspace_members
       WHERE workspace_id=? AND user_id=? AND status='active' LIMIT 1`,
    ).bind(workspace.id, existingUserId).first()
    : null;
  if (existingMember) return response({ error: locale === "ru" ? "Этот пользователь уже в команде." : "Bu foydalanuvchi allaqachon jamoada." }, 409);

  const now = isoNow();
  const invitationId = crypto.randomUUID();
  const emailEvidence = await prepareEncryptedIdentityEvidence(
    identityContext,
    {
      plaintext: email,
      normalizedValue: email,
      purpose: "workspace-invitation-email",
      subjectId: workspace.id,
      recordId: invitationId,
    },
  );
  const rawToken = randomToken(32);
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.batch([
    db.prepare(
      "UPDATE workspace_invitations SET revoked_at=?,updated_at=? WHERE workspace_id=? AND email_hash=? AND accepted_at IS NULL AND revoked_at IS NULL",
    ).bind(now, now, workspace.id, emailHash),
    db.prepare(
      `INSERT INTO workspace_invitations
       (id,workspace_id,invited_by_user_id,email,email_hash,
        email_ciphertext,email_iv,email_key_version,
        email_lookup_hash,email_lookup_key_version,
        token_hash,role,expires_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      invitationId,
      workspace.id,
      user.id,
      email,
      emailHash,
      emailEvidence.ciphertext,
      emailEvidence.iv,
      emailEvidence.keyVersion,
      emailEvidence.lookupHash,
      emailEvidence.lookupKeyVersion,
      tokenHash,
      role,
      expiresAt,
      now,
      now,
    ),
  ]);

  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = env.APP_URL && /^https:\/\/[^/]+$/i.test(env.APP_URL) ? env.APP_URL : requestOrigin;
  const inviteUrl = new URL(`/invite/${encodeURIComponent(rawToken)}?lang=${locale}`, configuredOrigin).toString();
  const subject = locale === "ru" ? "Приглашение в пространство JURO" : "JURO makoniga taklif";
  const safeUrl = escapeHtml(inviteUrl);
  const html = locale === "ru"
    ? `<div style="font-family:Arial,sans-serif;color:#102333"><h2>Вас пригласили в JURO</h2><p>Откройте защищённую ссылку, войдите под адресом ${escapeHtml(email)} и подтвердите участие.</p><p><a href="${safeUrl}">Принять приглашение</a></p><p>Ссылка действует 7 дней.</p></div>`
    : `<div style="font-family:Arial,sans-serif;color:#102333"><h2>Siz JURO makoniga taklif qilindingiz</h2><p>Himoyalangan havolani oching, ${escapeHtml(email)} manzili bilan kiring va ishtirokni tasdiqlang.</p><p><a href="${safeUrl}">Taklifni qabul qilish</a></p><p>Havola 7 kun amal qiladi.</p></div>`;

  let sent: Response | null = null;
  try {
    sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [email], subject, html }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    sent = null;
  }
  if (!sent?.ok) {
    await db.prepare("UPDATE workspace_invitations SET revoked_at=?,updated_at=? WHERE id=?").bind(isoNow(), isoNow(), invitationId).run();
    return response({ code: "EMAIL_PROVIDER_ERROR", error: locale === "ru" ? "Приглашение не отправлено. Попробуйте позже." : "Taklif yuborilmadi. Keyinroq urinib ko‘ring." }, 502);
  }
  await db.prepare(
    "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'invitation',?,'invitation_sent',?,?)",
  ).bind(crypto.randomUUID(), workspace.id, user.id, invitationId, JSON.stringify({ role }), now).run();
  return response({ ok: true, invitationId, expiresAt }, 201);
});
