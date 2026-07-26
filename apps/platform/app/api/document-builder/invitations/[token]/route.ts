import { assertSafeWrite, requireApiUser } from "../../../../../lib/document-builder/auth/api";
import { apiError, forbidden, jsonResponse, notFound } from "../../../../../lib/document-builder/auth/responses";
import { sha256 } from "../../../../../lib/document-builder/share-links/crypto";
import { isoNow } from "../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  acceptDocumentInvitation,
  declineDocumentInvitation,
} from "../../../../../lib/document-builder/permissions/invitation-transition";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };

interface InvitationRow {
  id: string;
  documentId: string;
  documentTitle: string;
  invitedByUserId: string;
  targetUserId: string | null;
  targetIdentifierHash: string | null;
  role: string;
  partyNumber: number | null;
  expiresAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  revokedAt: string | null;
}

async function loadInvitation(token: string): Promise<InvitationRow | null> {
  const db = requireD1();
  return db.prepare(
    `SELECT i.id, i.document_id AS documentId, d.title AS documentTitle,
      i.invited_by_user_id AS invitedByUserId, i.target_user_id AS targetUserId,
      i.target_identifier_hash AS targetIdentifierHash, i.role, i.party_number AS partyNumber,
      i.expires_at AS expiresAt, i.accepted_at AS acceptedAt, i.declined_at AS declinedAt, i.revoked_at AS revokedAt
     FROM document_invitations i JOIN documents d ON d.id = i.document_id
     WHERE i.token_hash = ? LIMIT 1`,
  ).bind(await sha256(token)).first<InvitationRow>();
}

async function canUseInvitation(invitation: InvitationRow, user: { id: string; email: string; phone: string | null }): Promise<boolean> {
  if (invitation.targetUserId) return invitation.targetUserId === user.id;
  if (!invitation.targetIdentifierHash) return false;
  const candidateHashes = [await sha256(user.email.toLocaleLowerCase())];
  if (user.phone) candidateHashes.push(await sha256(user.phone.toLocaleLowerCase()));
  return candidateHashes.includes(invitation.targetIdentifierHash);
}

function activeError(invitation: InvitationRow): Response | null {
  if (invitation.revokedAt) return jsonResponse({ error: "Приглашение отозвано.", code: "INVITATION_REVOKED" }, { status: 410 });
  if (invitation.declinedAt) return jsonResponse({ error: "Приглашение отклонено.", code: "INVITATION_DECLINED" }, { status: 410 });
  if (invitation.acceptedAt) return jsonResponse({ error: "Приглашение уже принято.", code: "INVITATION_ACCEPTED", documentId: invitation.documentId }, { status: 409 });
  if (invitation.expiresAt <= isoNow()) return jsonResponse({ error: "Срок действия приглашения истёк.", code: "INVITATION_EXPIRED" }, { status: 410 });
  return null;
}

export async function GET(_request: Request, context: Context): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { token } = await context.params;
    const invitation = await loadInvitation(token);
    if (!invitation) return notFound("Приглашение не найдено.");
    const inactive = activeError(invitation);
    if (inactive) return inactive;
    if (!await canUseInvitation(invitation, user)) return forbidden("Это приглашение предназначено другому пользователю.");
    return jsonResponse({ documentTitle: invitation.documentTitle, role: invitation.role, partyNumber: invitation.partyNumber, expiresAt: invitation.expiresAt });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const { token } = await context.params;
    const invitation = await loadInvitation(token);
    if (!invitation) return notFound("Приглашение не найдено.");
    const inactive = activeError(invitation);
    if (inactive) return inactive;
    if (!await canUseInvitation(invitation, user)) return forbidden("Это приглашение предназначено другому пользователю.");
    const body = await request.json() as { action?: string };
    const db = requireD1();
    const now = isoNow();
    if (body.action === "decline") {
      const declined = await declineDocumentInvitation(db, {
        invitationId: invitation.id,
        documentId: invitation.documentId,
        userId: user.id,
        now,
      });
      if (!declined) {
        const current = await loadInvitation(token);
        return current
          ? activeError(current) ?? jsonResponse(
            { error: "Приглашение уже изменено.", code: "INVITATION_CONFLICT" },
            { status: 409 },
          )
          : notFound("Приглашение не найдено.");
      }
      return jsonResponse({ declined: true });
    }
    if (body.action !== "accept") return jsonResponse({ error: "Неизвестное действие.", code: "BAD_ACTION" }, { status: 400 });
    const accepted = await acceptDocumentInvitation(db, {
      invitationId: invitation.id,
      documentId: invitation.documentId,
      userId: user.id,
      now,
    });
    if (!accepted) {
      const current = await loadInvitation(token);
      return current
        ? activeError(current) ?? jsonResponse(
          { error: "Приглашение уже изменено.", code: "INVITATION_CONFLICT" },
          { status: 409 },
        )
        : notFound("Приглашение не найдено.");
    }
    return jsonResponse({ accepted: true, documentId: invitation.documentId });
  } catch (error) {
    return apiError(error);
  }
}
