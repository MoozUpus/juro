import { assertSafeWrite, requireApiUser } from "../../../../../../lib/document-builder/auth/api";
import { apiError, badRequest, forbidden, jsonResponse, notFound } from "../../../../../../lib/document-builder/auth/responses";
import { getDocumentAccess, loadStoredDocument } from "../../../../../../lib/document-builder/permissions";
import { addActivity, addNotification, isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

async function snapshot(documentId: string): Promise<Record<string, unknown>> {
  const db = requireD1();
  const [collaborators, comments, proposals, activity] = await Promise.all([
    db.prepare(
      `SELECT c.id, c.user_id AS userId, u.email, COALESCE(u.full_name, u.email) AS displayName,
       c.status, c.confirmed_at AS confirmedAt, c.opened_at AS openedAt,
       c.can_view AS canView, c.can_download AS canDownload,
       COALESCE(sa.view_allowed, 0) AS signedViewAllowed,
       COALESCE(sa.download_allowed, 0) AS signedDownloadAllowed,
       COALESCE(sa.opened, 0) AS signedOpened,
       COALESCE(sa.restored_view_only, 0) AS restoredViewOnly
       FROM document_collaborators c JOIN user_profiles u ON u.id = c.user_id
       LEFT JOIN signed_document_access sa ON sa.document_id = c.document_id AND sa.collaborator_user_id = c.user_id
       WHERE c.document_id = ? AND c.status <> 'revoked' ORDER BY c.created_at`,
    ).bind(documentId).all(),
    db.prepare(
      `SELECT c.id, c.author_user_id AS authorUserId, COALESCE(u.full_name, u.email) AS authorName,
       c.body, c.anchor, c.created_at AS createdAt
       FROM document_comments c JOIN user_profiles u ON u.id = c.author_user_id
       WHERE c.document_id = ? ORDER BY c.created_at`,
    ).bind(documentId).all(),
    db.prepare(
      `SELECT id, author_user_id AS authorUserId, old_text AS oldText, new_text AS newText, anchor,
       owner_accepted AS ownerAccepted, collaborator_accepted AS collaboratorAccepted, status, created_at AS createdAt
       FROM document_change_proposals WHERE document_id = ? ORDER BY created_at DESC`,
    ).bind(documentId).all(),
    db.prepare("SELECT id, type, created_at AS createdAt FROM activity_events WHERE document_id = ? ORDER BY created_at DESC LIMIT 100")
      .bind(documentId).all(),
  ]);
  return {
    collaborators: collaborators.results.map((item) => ({ ...item, canView: Boolean(item.canView), canDownload: Boolean(item.canDownload), signedViewAllowed: Boolean(item.signedViewAllowed), signedDownloadAllowed: Boolean(item.signedDownloadAllowed), signedOpened: Boolean(item.signedOpened), restoredViewOnly: Boolean(item.restoredViewOnly) })),
    comments: comments.results,
    proposals: proposals.results.map((item) => ({ ...item, ownerAccepted: Boolean(item.ownerAccepted), collaboratorAccepted: Boolean(item.collaboratorAccepted) })),
    activity: activity.results,
  };
}

export async function GET(_request: Request, context: Context): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const access = await getDocumentAccess(id, user.id);
    if (!access?.canView) return forbidden();
    return jsonResponse(await snapshot(id));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const access = await getDocumentAccess(id, user.id);
    if (!access?.canView) return forbidden();
    const document = await loadStoredDocument(id, user.id);
    if (!document) return notFound();
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const db = requireD1();
    const now = isoNow();

    if (action === "invite") {
      if (access.role !== "owner") return forbidden();
      const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
      if (!identifier) return badRequest("Введите email или номер телефона.");
      const candidates = await db.prepare(
        "SELECT id, email, COALESCE(full_name, email) AS displayName FROM user_profiles WHERE lower(email) = lower(?) OR phone = ? LIMIT 2",
      ).bind(identifier, identifier).all<{ id: string; email: string; displayName: string }>();
      if (candidates.results.length !== 1) {
        return jsonResponse({ error: candidates.results.length ? "Найдено несколько профилей. Уточните email." : "Пользователь JURO с такими данными не найден. Приглашение не создано.", code: "USER_NOT_FOUND" }, { status: 404 });
      }
      const invitee = candidates.results[0];
      if (invitee.id === user.id) return badRequest("Нельзя пригласить самого себя.");
      const existing = await db.prepare("SELECT id FROM document_collaborators WHERE document_id = ? AND user_id = ? LIMIT 1").bind(id, invitee.id).first<{ id: string }>();
      if (existing) {
        await db.prepare("UPDATE document_collaborators SET invited_by_user_id = ?, role = 'counterparty', can_view = 1, status = 'invited', opened_at = NULL, confirmed_at = NULL, updated_at = ? WHERE id = ?")
          .bind(user.id, now, existing.id).run();
      } else {
        await db.prepare(
          "INSERT INTO document_collaborators (id, document_id, user_id, invited_by_user_id, role, can_view, can_download, status, opened_at, confirmed_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'counterparty', 1, 0, 'invited', NULL, NULL, ?, ?)",
        ).bind(crypto.randomUUID(), id, invitee.id, user.id, now, now).run();
      }
      await addNotification(invitee.id, id, "invitation", "Приглашение к документу", `${user.fullName || user.email} приглашает вас проверить документ «${document.title}».`);
      await addActivity(id, user.id, "invitation_sent");
      return jsonResponse({ invited: true, user: invitee, snapshot: await snapshot(id) });
    }

    if (action === "comment") {
      const text = typeof body.body === "string" ? body.body.trim() : "";
      if (!text || text.length > 10_000) return badRequest("Введите комментарий до 10 000 символов.");
      await db.prepare("INSERT INTO document_comments (id, document_id, author_user_id, body, anchor, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), id, user.id, text, typeof body.anchor === "string" ? body.anchor : null, now).run();
      if (access.role === "collaborator") {
        await addNotification(document.ownerUserId, id, "comment_added", "Добавлен комментарий", `${user.fullName || user.email} оставил(а) комментарий к документу.`);
      } else {
        const collaborators = await db.prepare("SELECT user_id AS userId FROM document_collaborators WHERE document_id = ? AND status <> 'revoked'").bind(id).all<{ userId: string }>();
        await Promise.all(collaborators.results.map((item) => addNotification(item.userId, id, "comment_added", "Добавлен комментарий", "Создатель документа оставил комментарий.")));
      }
      return jsonResponse({ created: true, snapshot: await snapshot(id) }, { status: 201 });
    }

    if (action === "proposal") {
      const oldText = typeof body.oldText === "string" ? body.oldText.trim() : "";
      const newText = typeof body.newText === "string" ? body.newText.trim() : "";
      if (!oldText || !newText || oldText === newText) return badRequest("Укажите различающиеся исходный и предложенный тексты.");
      if (!document.finalContent.includes(oldText)) return badRequest("Исходный фрагмент не найден в актуальном документе.", "STALE_PROPOSAL");
      const proposalId = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO document_change_proposals (id, document_id, author_user_id, old_text, new_text, anchor, owner_accepted, collaborator_accepted, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
      ).bind(proposalId, id, user.id, oldText, newText, typeof body.anchor === "string" ? body.anchor : null, access.role === "owner" ? 1 : 0, access.role === "collaborator" ? 1 : 0, now, now).run();
      if (access.role === "collaborator") await addNotification(document.ownerUserId, id, "change_proposed", "Предложено изменение", `${user.fullName || user.email} предложил(а) изменение документа.`);
      else {
        const collaborators = await db.prepare("SELECT user_id AS userId FROM document_collaborators WHERE document_id = ? AND status <> 'revoked'").bind(id).all<{ userId: string }>();
        await Promise.all(collaborators.results.map((item) => addNotification(item.userId, id, "change_proposed", "Предложено изменение", "Создатель предложил изменение документа.")));
      }
      await addActivity(id, user.id, "change_proposed");
      return jsonResponse({ created: true, proposalId, snapshot: await snapshot(id) }, { status: 201 });
    }

    if (action === "accept_proposal") {
      const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
      const proposal = await db.prepare(
        "SELECT id, old_text AS oldText, new_text AS newText, owner_accepted AS ownerAccepted, collaborator_accepted AS collaboratorAccepted, status FROM document_change_proposals WHERE id = ? AND document_id = ? LIMIT 1",
      ).bind(proposalId, id).first<{ id: string; oldText: string; newText: string; ownerAccepted: number; collaboratorAccepted: number; status: string }>();
      if (!proposal || proposal.status !== "pending") return notFound("Предложение недоступно.");
      const ownerAccepted = access.role === "owner" ? true : Boolean(proposal.ownerAccepted);
      const collaboratorAccepted = access.role === "collaborator" ? true : Boolean(proposal.collaboratorAccepted);
      if (ownerAccepted && collaboratorAccepted) {
        const current = await db.prepare("SELECT final_content AS finalContent FROM document_current_content WHERE document_id = ?").bind(id).first<{ finalContent: string }>();
        if (!current?.finalContent.includes(proposal.oldText)) return jsonResponse({ error: "Документ уже изменён; предложение устарело.", code: "STALE_PROPOSAL" }, { status: 409 });
        const nextText = current.finalContent.replace(proposal.oldText, proposal.newText);
        await db.batch([
          db.prepare("UPDATE document_change_proposals SET owner_accepted = 1, collaborator_accepted = 1, status = 'applied', updated_at = ? WHERE id = ?").bind(now, proposalId),
          db.prepare("UPDATE document_current_content SET final_content = ?, manually_edited = 1, updated_at = ? WHERE document_id = ?").bind(nextText, now, id),
          db.prepare("UPDATE documents SET status = CASE WHEN status = 'Согласован' THEN 'Готов' ELSE status END, revision = revision + 1, updated_at = ? WHERE id = ?").bind(now, id),
        ]);
        await addActivity(id, user.id, "change_agreed");
      } else {
        await db.prepare("UPDATE document_change_proposals SET owner_accepted = ?, collaborator_accepted = ?, updated_at = ? WHERE id = ?")
          .bind(ownerAccepted ? 1 : 0, collaboratorAccepted ? 1 : 0, now, proposalId).run();
      }
      const notifyUserIds = access.role === "owner"
        ? (await db.prepare("SELECT user_id AS userId FROM document_collaborators WHERE document_id = ? AND status <> 'revoked'").bind(id).all<{ userId: string }>()).results.map((item) => item.userId)
        : [document.ownerUserId];
      await Promise.all(notifyUserIds.map((userId) => addNotification(userId, id, "change_confirmed", "Изменение подтверждено", ownerAccepted && collaboratorAccepted ? "Изменение согласовано обеими сторонами и применено." : "Одна из сторон подтвердила предложенное изменение.")));
      return jsonResponse({ accepted: true, applied: ownerAccepted && collaboratorAccepted, snapshot: await snapshot(id) });
    }

    if (action === "reject_proposal") {
      const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
      await db.prepare("UPDATE document_change_proposals SET status = 'rejected', updated_at = ? WHERE id = ? AND document_id = ? AND status = 'pending'")
        .bind(now, proposalId, id).run();
      if (access.role === "collaborator") await addNotification(document.ownerUserId, id, "agreement_rejected", "Изменение отклонено", `${user.fullName || user.email} отклонил(а) предложенное изменение.`);
      return jsonResponse({ rejected: true, snapshot: await snapshot(id) });
    }

    if (action === "confirm_data") {
      if (access.role !== "collaborator") return forbidden();
      await db.prepare("UPDATE document_collaborators SET confirmed_at = ?, status = 'confirmed', updated_at = ? WHERE document_id = ? AND user_id = ?")
        .bind(now, now, id, user.id).run();
      await addNotification(document.ownerUserId, id, "agreement_completed", "Данные подтверждены", `${user.fullName || user.email} подтвердил(а) данные документа.`);
      return jsonResponse({ confirmed: true, snapshot: await snapshot(id) });
    }

    if (action === "signed_access") {
      if (access.role !== "owner" || !document.signedFileId) return forbidden();
      const collaboratorUserId = typeof body.collaboratorUserId === "string" ? body.collaboratorUserId : "";
      const collaborator = await db.prepare("SELECT user_id AS userId FROM document_collaborators WHERE document_id = ? AND user_id = ? AND status <> 'revoked' LIMIT 1")
        .bind(id, collaboratorUserId).first<{ userId: string }>();
      if (!collaborator) return notFound("Участник не найден.");
      const existing = await db.prepare("SELECT id, restored_view_only AS restoredViewOnly FROM signed_document_access WHERE document_id = ? AND collaborator_user_id = ? LIMIT 1")
        .bind(id, collaboratorUserId).first<{ id: string; restoredViewOnly: number }>();
      const viewAllowed = Boolean(body.viewAllowed);
      const downloadAllowed = Boolean(body.downloadAllowed);
      if (existing?.restoredViewOnly && downloadAllowed) return badRequest("После восстановления из архива скачивание подписанной версии нельзя разрешить повторно.", "DOWNLOAD_LOCKED_AFTER_RESTORE");
      if (existing) {
        await db.prepare("UPDATE signed_document_access SET view_allowed = ?, download_allowed = ?, updated_at = ? WHERE id = ?")
          .bind(viewAllowed ? 1 : 0, viewAllowed && downloadAllowed ? 1 : 0, now, existing.id).run();
      } else {
        await db.prepare("INSERT INTO signed_document_access (id, document_id, collaborator_user_id, view_allowed, download_allowed, opened, restored_view_only, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)")
          .bind(crypto.randomUUID(), id, collaboratorUserId, viewAllowed ? 1 : 0, viewAllowed && downloadAllowed ? 1 : 0, now, now).run();
      }
      return jsonResponse({ updated: true, viewAllowed, downloadAllowed: viewAllowed && downloadAllowed });
    }

    if (action === "revoke_collaborator") {
      if (access.role !== "owner") return forbidden();
      const collaboratorUserId = typeof body.collaboratorUserId === "string" ? body.collaboratorUserId : "";
      await db.batch([
        db.prepare("UPDATE document_collaborators SET status = 'revoked', can_view = 0, can_download = 0, updated_at = ? WHERE document_id = ? AND user_id = ?").bind(now, id, collaboratorUserId),
        db.prepare("UPDATE signed_document_access SET view_allowed = 0, download_allowed = 0, updated_at = ? WHERE document_id = ? AND collaborator_user_id = ?").bind(now, id, collaboratorUserId),
      ]);
      await addActivity(id, user.id, "access_revoked");
      return jsonResponse({ revoked: true, snapshot: await snapshot(id) });
    }

    return badRequest("Неизвестное действие совместной работы.");
  } catch (error) {
    return apiError(error);
  }
}
