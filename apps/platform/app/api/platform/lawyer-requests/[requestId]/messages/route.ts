import { parseJsonRequest } from "../../../../../../lib/auth/input";
import {
  assertSafeWrite,
  requireApiUser,
  withApiErrors,
} from "../../../../../../lib/document-builder/auth/api";
import { addNotification, isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import {
  lawyerRequestMessageError,
  lawyerRequestMessageSchema,
} from "../../../../../../lib/platform/lawyer-request-message";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

type Context = { params: Promise<{ requestId: string }> };
type Participant = {
  workspaceId: string;
  caseId: string;
  clientUserId: string;
  lawyerUserId: string;
  role: "client" | "lawyer";
};

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

async function participantForRequest(
  userId: string,
  ownWorkspaceId: string,
  requestId: string,
): Promise<Participant | null> {
  const db = requireD1();
  const client = await db.prepare(
    `SELECT r.workspace_id AS workspaceId,r.case_id AS caseId,
      r.requester_user_id AS clientUserId,p.user_id AS lawyerUserId
     FROM lawyer_requests r JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id
     WHERE r.id=? AND r.workspace_id=? AND r.requester_user_id=? LIMIT 1`,
  ).bind(requestId, ownWorkspaceId, userId).first<Omit<Participant, "role">>();
  if (client) return { ...client, role: "client" };
  const lawyer = await db.prepare(
    `SELECT r.workspace_id AS workspaceId,r.case_id AS caseId,
      r.requester_user_id AS clientUserId,p.user_id AS lawyerUserId
     FROM lawyer_requests r
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id AND p.user_id=?
       AND p.status='public_approved' AND p.marketplace_status='public_approved'
     JOIN lawyer_access_grants g ON g.lawyer_request_id=r.id AND g.case_id=r.case_id
       AND g.lawyer_user_id=? AND g.revoked_at IS NULL
       AND (g.expires_at IS NULL OR g.expires_at>?)
     WHERE r.id=? LIMIT 1`,
  ).bind(userId, userId, new Date().toISOString(), requestId)
    .first<Omit<Participant, "role">>();
  return lawyer ? { ...lawyer, role: "lawyer" } : null;
}

export const GET = withApiErrors(async function GET(
  _request: Request,
  context: Context,
) {
  const user = await requireApiUser();
  const ownWorkspace = await workspaceForUser(user);
  const { requestId } = await context.params;
  const participant = await participantForRequest(
    user.id,
    ownWorkspace.id,
    requestId,
  );
  if (!participant) {
    return response({
      code: "REQUEST_UNAVAILABLE",
      error: lawyerRequestMessageError("ru", "REQUEST_UNAVAILABLE"),
    }, 404);
  }
  const db = requireD1();
  const now = isoNow();
  const [messages, unread, documents, typing, notes] = await Promise.all([
    db.prepare(
      `SELECT m.id,m.author_role AS authorRole,m.body,m.read_at AS readAt,
        m.created_at AS createdAt,m.reply_to_message_id AS replyToMessageId,
        parent.author_role AS replyAuthorRole,parent.body AS replyBody,
        m.pinned_at AS pinnedAt,m.pinned_by_user_id AS pinnedByUserId,
        a.document_id AS documentId,
        d.title AS documentTitle,d.status AS documentStatus,
        a.status AS attachmentStatus
       FROM lawyer_request_messages m
       LEFT JOIN lawyer_request_messages parent ON parent.id=m.reply_to_message_id
       LEFT JOIN lawyer_request_message_attachments a ON a.message_id=m.id
       LEFT JOIN documents d ON d.id=a.document_id
       WHERE m.lawyer_request_id=? ORDER BY m.created_at ASC,m.id ASC LIMIT 200`,
    ).bind(requestId).all(),
    db.prepare(
      `SELECT count(*) AS count FROM lawyer_request_messages
       WHERE lawyer_request_id=? AND author_user_id<>? AND read_at IS NULL`,
    ).bind(requestId, user.id).first<{ count: number }>(),
    participant.role === "client"
      ? db.prepare(
        `SELECT id,title,status,updated_at AS updatedAt FROM documents
         WHERE owner_user_id=? AND workspace_id=? AND case_id=? AND archived_at IS NULL
         ORDER BY updated_at DESC LIMIT 100`,
      ).bind(user.id, participant.workspaceId, participant.caseId).all()
      : db.prepare(
        `SELECT id,title,status,updated_at AS updatedAt FROM documents
         WHERE owner_user_id=? AND workspace_id=? AND archived_at IS NULL
         ORDER BY updated_at DESC LIMIT 100`,
      ).bind(user.id, ownWorkspace.id).all(),
    db.prepare(
      `SELECT role,expires_at AS expiresAt
       FROM lawyer_request_message_typing
       WHERE lawyer_request_id=? AND user_id<>? AND expires_at>?
       ORDER BY updated_at DESC LIMIT 1`,
    ).bind(requestId, user.id, now).first<{ role: "client" | "lawyer"; expiresAt: string }>(),
    participant.role === "lawyer"
      ? db.prepare(
        `SELECT n.id,n.body,n.document_id AS documentId,d.title AS documentTitle,
          n.converted_task_id AS convertedTaskId,n.created_at AS createdAt,
          p.display_name AS authorName
         FROM lawyer_request_internal_notes n
         JOIN lawyer_profiles p ON p.user_id=n.author_user_id
         LEFT JOIN documents d ON d.id=n.document_id
         WHERE n.lawyer_request_id=? AND n.author_user_id=?
         ORDER BY n.created_at DESC LIMIT 100`,
      ).bind(requestId, user.id).all()
      : Promise.resolve({ results: [] }),
  ]);
  return response({
    messages: messages.results,
    unreadCount: Number(unread?.count ?? 0),
    documents: documents.results,
    role: participant.role,
    typing: typing ? { role: typing.role, expiresAt: typing.expiresAt } : null,
    notes: notes.results,
    context: { requestId, caseId: participant.caseId },
  });
});

export const POST = withApiErrors(async function POST(
  request: Request,
  context: Context,
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const ownWorkspace = await workspaceForUser(user);
  const { requestId } = await context.params;
  const parsed = await parseJsonRequest(request, lawyerRequestMessageSchema, 8_192);
  const locale = parsed.ok ? parsed.data.locale : "ru";
  if (!parsed.ok) {
    return response({
      code: "INVALID_INPUT",
      error: lawyerRequestMessageError(locale, "INVALID_INPUT"),
    }, parsed.error === "payload_too_large" ? 413 : 400);
  }
  const participant = await participantForRequest(
    user.id,
    ownWorkspace.id,
    requestId,
  );
  if (!participant) {
    return response({
      code: "REQUEST_UNAVAILABLE",
      error: lawyerRequestMessageError(locale, "REQUEST_UNAVAILABLE"),
    }, 404);
  }
  const db = requireD1();
  const now = isoNow();

  if (parsed.data.action === "typing") {
    if (!parsed.data.typing) {
      await db.prepare(
        `DELETE FROM lawyer_request_message_typing
         WHERE lawyer_request_id=? AND user_id=?`,
      ).bind(requestId, user.id).run();
      return response({ ok: true, typing: false });
    }
    const expiresAt = new Date(Date.parse(now) + 8_000).toISOString();
    await db.prepare(
      `INSERT INTO lawyer_request_message_typing
        (lawyer_request_id,user_id,role,expires_at,updated_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(lawyer_request_id,user_id) DO UPDATE SET
         expires_at=excluded.expires_at,updated_at=excluded.updated_at`,
    ).bind(requestId, user.id, participant.role, expiresAt, now).run();
    return response({ ok: true, typing: true, expiresAt });
  }

  if (parsed.data.action === "mark_read") {
    const results = await db.batch([
      db.prepare(
        `UPDATE lawyer_request_messages SET read_at=?
         WHERE lawyer_request_id=? AND author_user_id<>? AND read_at IS NULL`,
      ).bind(now, requestId, user.id),
      db.prepare(
        `UPDATE lawyer_request_message_attachments SET status='viewed',updated_at=?
         WHERE lawyer_request_id=? AND recipient_user_id=? AND status='sent'`,
      ).bind(now, requestId, user.id),
    ]);
    const changed = results.reduce(
      (sum, result) => sum + Number(result.meta?.changes ?? 0),
      0,
    );
    if (changed) {
      await db.prepare(
        `INSERT INTO workspace_audit_events
          (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'lawyer_request',?,'lawyer_request_messages_read',?,?)`,
      ).bind(
        crypto.randomUUID(),
        participant.workspaceId,
        user.id,
        requestId,
        JSON.stringify({ changed }),
        now,
      ).run();
    }
    return response({ ok: true, unreadCount: 0, changed });
  }

  if (parsed.data.action === "pin") {
    const message = await db.prepare(
      `SELECT id,pinned_at AS pinnedAt FROM lawyer_request_messages
       WHERE id=? AND lawyer_request_id=? LIMIT 1`,
    ).bind(parsed.data.messageId, requestId)
      .first<{ id: string; pinnedAt: string | null }>();
    if (!message) {
      return response({
        code: "MESSAGE_UNAVAILABLE",
        error: lawyerRequestMessageError(locale, "MESSAGE_UNAVAILABLE"),
      }, 404);
    }
    const pinnedAt = parsed.data.pinned ? now : null;
    await db.batch([
      ...(parsed.data.pinned ? [db.prepare(
        `UPDATE lawyer_request_messages
         SET pinned_at=NULL,pinned_by_user_id=NULL
         WHERE lawyer_request_id=? AND pinned_at IS NOT NULL AND id<>?`,
      ).bind(requestId, message.id)] : []),
      db.prepare(
        `UPDATE lawyer_request_messages
         SET pinned_at=?,pinned_by_user_id=?
         WHERE id=? AND lawyer_request_id=?`,
      ).bind(
        pinnedAt,
        parsed.data.pinned ? user.id : null,
        message.id,
        requestId,
      ),
      db.prepare(
        `INSERT INTO workspace_audit_events
          (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'lawyer_request_message',?,?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        participant.workspaceId,
        user.id,
        message.id,
        parsed.data.pinned
          ? "lawyer_request_message_pinned"
          : "lawyer_request_message_unpinned",
        JSON.stringify({ requestId }),
        now,
      ),
    ]);
    return response({ ok: true, messageId: message.id, pinnedAt });
  }

  if (parsed.data.action === "note_create") {
    if (participant.role !== "lawyer") {
      return response({
        code: "LAWYER_ONLY",
        error: lawyerRequestMessageError(locale, "LAWYER_ONLY"),
      }, 403);
    }
    const document = parsed.data.documentId
      ? await db.prepare(
        `SELECT id,title FROM documents
         WHERE id=? AND owner_user_id=? AND workspace_id=? AND archived_at IS NULL
         LIMIT 1`,
      ).bind(parsed.data.documentId, user.id, ownWorkspace.id)
        .first<{ id: string; title: string }>()
      : null;
    if (parsed.data.documentId && !document) {
      return response({
        code: "DOCUMENT_UNAVAILABLE",
        error: lawyerRequestMessageError(locale, "DOCUMENT_UNAVAILABLE"),
      }, 404);
    }
    const id = crypto.randomUUID();
    const author = await db.prepare(
      "SELECT display_name AS authorName FROM lawyer_profiles WHERE user_id=? LIMIT 1",
    ).bind(user.id).first<{ authorName: string }>();
    await db.batch([
      db.prepare(
        `INSERT INTO lawyer_request_internal_notes
          (id,lawyer_request_id,case_id,author_user_id,body,document_id,converted_task_id,created_at)
         VALUES (?,?,?,?,?,?,NULL,?)`,
      ).bind(id, requestId, participant.caseId, user.id, parsed.data.body, document?.id ?? null, now),
      db.prepare(
        `INSERT INTO workspace_audit_events
          (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'lawyer_request_internal_note',?,'lawyer_request_internal_note_created',?,?)`,
      ).bind(
        crypto.randomUUID(),
        participant.workspaceId,
        user.id,
        id,
        JSON.stringify({ requestId, caseId: participant.caseId, documentId: document?.id ?? null }),
        now,
      ),
    ]);
    return response({
      ok: true,
      note: {
        id,
        body: parsed.data.body,
        documentId: document?.id ?? null,
        documentTitle: document?.title ?? null,
        convertedTaskId: null,
        createdAt: now,
        authorName: author?.authorName || (locale === "ru" ? "Юрист" : "Yurist"),
      },
    }, 201);
  }

  if (parsed.data.action === "note_to_task") {
    if (participant.role !== "lawyer") {
      return response({
        code: "LAWYER_ONLY",
        error: lawyerRequestMessageError(locale, "LAWYER_ONLY"),
      }, 403);
    }
    const note = await db.prepare(
      `SELECT id,body,converted_task_id AS convertedTaskId
       FROM lawyer_request_internal_notes
       WHERE id=? AND lawyer_request_id=? AND author_user_id=? LIMIT 1`,
    ).bind(parsed.data.noteId, requestId, user.id)
      .first<{ id: string; body: string; convertedTaskId: string | null }>();
    if (!note || note.convertedTaskId) {
      return response({
        code: "NOTE_UNAVAILABLE",
        error: lawyerRequestMessageError(locale, "NOTE_UNAVAILABLE"),
      }, note ? 409 : 404);
    }
    const taskId = note.id;
    const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt).toISOString() : null;
    await db.batch([
      db.prepare(
        `INSERT INTO tasks
          (id,workspace_id,case_id,plan_step_id,owner_user_id,title,description,due_at,deadline_type,status,created_at,updated_at,completed_at)
         VALUES (?,?,?,NULL,?,?,?,?, 'calendar_days','planned',?,?,NULL)`,
      ).bind(
        taskId,
        participant.workspaceId,
        participant.caseId,
        user.id,
        parsed.data.title,
        note.body.slice(0, 2_000),
        dueAt,
        now,
        now,
      ),
      db.prepare(
        `UPDATE lawyer_request_internal_notes SET converted_task_id=?
         WHERE id=? AND lawyer_request_id=? AND author_user_id=? AND converted_task_id IS NULL`,
      ).bind(taskId, note.id, requestId, user.id),
      db.prepare(
        `INSERT INTO workspace_audit_events
          (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'task',?,'lawyer_internal_note_converted_to_task',?,?)`,
      ).bind(
        crypto.randomUUID(),
        participant.workspaceId,
        user.id,
        taskId,
        JSON.stringify({ requestId, caseId: participant.caseId, noteId: note.id, dueAt }),
        now,
      ),
      db.prepare(
        `INSERT INTO case_events
          (id,case_id,actor_user_id,event_type,metadata_json,created_at)
         VALUES (?,?,?,'lawyer_task_created',?,?)`,
      ).bind(
        crypto.randomUUID(),
        participant.caseId,
        user.id,
        JSON.stringify({ requestId, taskId, source: "internal_note" }),
        now,
      ),
    ]);
    await addNotification(
      participant.clientUserId,
      null,
      "lawyer_task_created",
      locale === "ru" ? "Юрист добавил задачу" : "Yurist vazifa qo‘shdi",
      parsed.data.title,
    );
    return response({ ok: true, task: { id: taskId, status: "planned", dueAt } }, 201);
  }

  const document = parsed.data.documentId
    ? await (participant.role === "client"
      ? db.prepare(
        `SELECT id,title,status FROM documents
         WHERE id=? AND owner_user_id=? AND workspace_id=? AND case_id=?
           AND archived_at IS NULL LIMIT 1`,
      ).bind(
        parsed.data.documentId,
        user.id,
        participant.workspaceId,
        participant.caseId,
      )
      : db.prepare(
        `SELECT id,title,status FROM documents
         WHERE id=? AND owner_user_id=? AND workspace_id=?
           AND archived_at IS NULL LIMIT 1`,
      ).bind(parsed.data.documentId, user.id, ownWorkspace.id))
      .first<{ id: string; title: string; status: string }>()
    : null;
  if (parsed.data.documentId && !document) {
    return response({
      code: "DOCUMENT_UNAVAILABLE",
      error: lawyerRequestMessageError(locale, "DOCUMENT_UNAVAILABLE"),
    }, 404);
  }
  const reply = parsed.data.replyToMessageId
    ? await db.prepare(
      `SELECT id,author_role AS authorRole,body
       FROM lawyer_request_messages
       WHERE id=? AND lawyer_request_id=? LIMIT 1`,
    ).bind(parsed.data.replyToMessageId, requestId)
      .first<{ id: string; authorRole: "owner" | "lawyer"; body: string }>()
    : null;
  if (parsed.data.replyToMessageId && !reply) {
    return response({
      code: "MESSAGE_UNAVAILABLE",
      error: lawyerRequestMessageError(locale, "MESSAGE_UNAVAILABLE"),
    }, 404);
  }

  const id = crypto.randomUUID();
  const recipientUserId = participant.role === "client"
    ? participant.lawyerUserId
    : participant.clientUserId;
  const authorRole = participant.role === "client" ? "owner" : "lawyer";
  const attachmentId = document ? crypto.randomUUID() : null;
  await db.batch([
    db.prepare(
      `INSERT INTO lawyer_request_messages
        (id,lawyer_request_id,author_user_id,author_role,body,read_at,reply_to_message_id,created_at)
       VALUES (?,?,?,?,?,NULL,?,?)`,
    ).bind(
      id,
      requestId,
      user.id,
      authorRole,
      parsed.data.body,
      reply?.id ?? null,
      now,
    ),
    ...(document && attachmentId ? [
      db.prepare(
        `INSERT INTO lawyer_request_message_attachments
          (id,message_id,lawyer_request_id,document_id,shared_by_user_id,recipient_user_id,status,created_at,updated_at)
         VALUES (?,?,?,?,?,?,'sent',?,?)`,
      ).bind(
        attachmentId,
        id,
        requestId,
        document.id,
        user.id,
        recipientUserId,
        now,
        now,
      ),
    ] : []),
    db.prepare(
      `INSERT INTO workspace_audit_events
        (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'lawyer_request_message',?,'lawyer_request_message_sent',?,?)`,
    ).bind(
      crypto.randomUUID(),
      participant.workspaceId,
      user.id,
      id,
      JSON.stringify({
        requestId,
        authorRole,
        documentId: document?.id ?? null,
        replyToMessageId: reply?.id ?? null,
      }),
      now,
    ),
    db.prepare(
      `INSERT INTO case_events
        (id,case_id,actor_user_id,event_type,metadata_json,created_at)
       VALUES (?,?,?,'lawyer_request_message_sent',?,?)`,
    ).bind(
      crypto.randomUUID(),
      participant.caseId,
      user.id,
      JSON.stringify({ requestId, messageId: id, hasDocument: Boolean(document) }),
      now,
    ),
    db.prepare(
      `INSERT INTO notifications
        (id,workspace_id,user_id,document_id,target_type,target_id,type,title,body,read_at,created_at)
       VALUES (?,(SELECT default_workspace_id FROM user_profiles WHERE id=?),?,?,'lawyer_request_message',?,
         'lawyer_request_message_received',?,?,NULL,?)`,
    ).bind(
      crypto.randomUUID(),
      recipientUserId,
      recipientUserId,
      document?.id ?? null,
      requestId,
      locale === "ru" ? "Новое сообщение по делу" : "Ish bo‘yicha yangi xabar",
      parsed.data.body || document?.title || "",
      now,
    ),
  ]);
  return response({
    ok: true,
    message: {
      id,
      authorRole,
      body: parsed.data.body,
      readAt: null,
      createdAt: now,
      documentId: document?.id ?? null,
      documentTitle: document?.title ?? null,
      documentStatus: document?.status ?? null,
      attachmentStatus: document ? "sent" : null,
      replyToMessageId: reply?.id ?? null,
      replyAuthorRole: reply?.authorRole ?? null,
      replyBody: reply?.body ?? null,
      pinnedAt: null,
      pinnedByUserId: null,
    },
  }, 201);
});
