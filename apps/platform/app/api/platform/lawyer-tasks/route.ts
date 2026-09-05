import { parseJsonRequest } from "../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { addNotification, isoNow } from "../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { lawyerText } from "../../../../lib/platform/lawyer-localization";
import { activeLawyerWorkspaceParticipant } from "../../../../lib/platform/lawyer-workspace-access";
import { lawyerTaskOperationSchema, lawyerWorkspaceOperationError } from "../../../../lib/platform/lawyer-workspace-operations";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

const transitions: Record<string, readonly string[]> = {
  planned: ["in_progress", "waiting_information", "waiting_counterparty", "completed", "cancelled"],
  in_progress: ["waiting_information", "waiting_counterparty", "completed", "cancelled"],
  waiting_information: ["in_progress", "completed", "cancelled"],
  waiting_counterparty: ["in_progress", "completed", "cancelled"],
  overdue: ["in_progress", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const parsed = await parseJsonRequest(request, lawyerTaskOperationSchema, 8_192);
  const locale = parsed.ok ? parsed.data.locale : "ru";
  if (!parsed.ok) return response({ code: "INVALID_INPUT", error: lawyerWorkspaceOperationError(locale, "INVALID_INPUT") }, parsed.error === "payload_too_large" ? 413 : 400);

  const db = requireD1();
  const now = isoNow();
  const participant = await activeLawyerWorkspaceParticipant(db, user.id, parsed.data.requestId, now);
  if (!participant || participant.role !== "lawyer") {
    return response({ code: "REQUEST_UNAVAILABLE", error: lawyerWorkspaceOperationError(locale, "REQUEST_UNAVAILABLE") }, 404);
  }

  if (parsed.data.action === "create") {
    const id = crypto.randomUUID();
    const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt).toISOString() : null;
    await db.batch([
      db.prepare(
        `INSERT INTO tasks
          (id,workspace_id,case_id,plan_step_id,owner_user_id,title,description,due_at,deadline_type,status,created_at,updated_at,completed_at)
         VALUES (?,?,?,NULL,?,?,?,?, 'calendar_days','planned',?,?,NULL)`,
      ).bind(id, participant.workspaceId, participant.caseId, user.id, parsed.data.title, parsed.data.description || null, dueAt, now, now),
      db.prepare(
        `INSERT INTO workspace_audit_events
          (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'task',?,'lawyer_task_created',?,?)`,
      ).bind(crypto.randomUUID(), participant.workspaceId, user.id, id, JSON.stringify({ requestId: participant.requestId, caseId: participant.caseId, dueAt }), now),
      db.prepare(
        "INSERT INTO case_events (id,case_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'lawyer_task_created',?,?)",
      ).bind(crypto.randomUUID(), participant.caseId, user.id, JSON.stringify({ requestId: participant.requestId, taskId: id, title: parsed.data.title }), now),
    ]);
    await addNotification(participant.clientUserId, null, "lawyer_task_created", lawyerText(participant.clientLocale, "Юрист добавил задачу", "Yurist vazifa qo‘shdi", "A lawyer added a task"), parsed.data.title);
    return response({ ok: true, task: { id, status: "planned", dueAt } }, 201);
  }

  const task = await db.prepare(
    `SELECT id,status,owner_user_id AS ownerUserId,plan_step_id AS planStepId
     FROM tasks WHERE id=? AND workspace_id=? AND case_id=? LIMIT 1`,
  ).bind(parsed.data.taskId, participant.workspaceId, participant.caseId).first<{ id: string; status: string; ownerUserId: string; planStepId: string | null }>();
  if (!task) return response({ code: "TASK_UNAVAILABLE", error: lawyerWorkspaceOperationError(locale, "TASK_UNAVAILABLE") }, 404);

  if (parsed.data.action === "comment") {
    const id = crypto.randomUUID();
    await db.batch([
      db.prepare(
        "INSERT INTO lawyer_task_comments (id,task_id,author_user_id,body,created_at,updated_at) VALUES (?,?,?,?,?,?)",
      ).bind(id, task.id, user.id, parsed.data.body, now, now),
      db.prepare(
        `INSERT INTO workspace_audit_events
          (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'task',?,'lawyer_task_comment_added',?,?)`,
      ).bind(crypto.randomUUID(), participant.workspaceId, user.id, task.id, JSON.stringify({ requestId: participant.requestId, commentId: id }), now),
      db.prepare(
        "INSERT INTO case_events (id,case_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'lawyer_task_comment_added',?,?)",
      ).bind(crypto.randomUUID(), participant.caseId, user.id, JSON.stringify({ requestId: participant.requestId, taskId: task.id, commentId: id }), now),
    ]);
    await addNotification(
      participant.clientUserId,
      null,
      "lawyer_task_comment",
      lawyerText(participant.clientLocale, "Комментарий юриста к задаче", "Yuristning vazifa izohi", "A lawyer commented on a task"),
      lawyerText(participant.clientLocale, "Откройте дело, чтобы прочитать комментарий.", "Izohni o‘qish uchun ishni oching.", "Open the case to read the comment."),
    );
    return response({ ok: true, comment: { id, body: parsed.data.body, createdAt: now } }, 201);
  }

  if (task.ownerUserId !== user.id || task.planStepId) {
    return response({ code: "TASK_UNAVAILABLE", error: lawyerWorkspaceOperationError(locale, "TASK_UNAVAILABLE") }, 403);
  }
  if (task.status !== parsed.data.status && !(transitions[task.status] || []).includes(parsed.data.status)) {
    return response({ code: "INVALID_TRANSITION", error: lawyerWorkspaceOperationError(locale, "INVALID_TRANSITION") }, 409);
  }
  const hasDueAt = Object.prototype.hasOwnProperty.call(parsed.data, "dueAt");
  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt).toISOString() : null;
  const completedAt = parsed.data.status === "completed" ? now : null;
  await db.batch([
    db.prepare(
      `UPDATE tasks SET status=?,due_at=CASE WHEN ?=1 THEN ? ELSE due_at END,
       completed_at=?,updated_at=? WHERE id=? AND workspace_id=? AND case_id=? AND owner_user_id=? AND plan_step_id IS NULL`,
    ).bind(parsed.data.status, hasDueAt ? 1 : 0, dueAt, completedAt, now, task.id, participant.workspaceId, participant.caseId, user.id),
    db.prepare(
      `INSERT INTO workspace_audit_events
        (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'task',?,'lawyer_task_updated',?,?)`,
    ).bind(crypto.randomUUID(), participant.workspaceId, user.id, task.id, JSON.stringify({ requestId: participant.requestId, fromStatus: task.status, toStatus: parsed.data.status, dueAtChanged: hasDueAt }), now),
    db.prepare(
      "INSERT INTO case_events (id,case_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'lawyer_task_updated',?,?)",
    ).bind(crypto.randomUUID(), participant.caseId, user.id, JSON.stringify({ requestId: participant.requestId, taskId: task.id, fromStatus: task.status, toStatus: parsed.data.status, dueAtChanged: hasDueAt }), now),
  ]);
  await addNotification(
    participant.clientUserId,
    null,
    "lawyer_task_updated",
    lawyerText(participant.clientLocale, "Юрист обновил задачу", "Yurist vazifani yangiladi", "A lawyer updated a task"),
    lawyerText(participant.clientLocale, "Статус задачи изменён.", "Vazifa holati o‘zgardi.", "The task status has changed."),
  );
  return response({ ok: true, task: { id: task.id, status: parsed.data.status, dueAt: hasDueAt ? dueAt : undefined } });
});
