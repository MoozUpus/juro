import { parseJsonRequest } from "../../../../../../lib/auth/input";
import {
  assertSafeWrite,
  requireApiUser,
  withApiErrors,
} from "../../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { confirmedActionPlanPatchSchema } from "../../../../../../lib/platform/action-plan";
import { taskStatusForPlanStep, taskStatusIsTerminal } from "../../../../../../lib/platform/task-status";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

function defaultReminderAt(dueAt: string, now: string): string {
  const due = new Date(`${dueAt.slice(0, 10)}T09:00:00.000Z`);
  due.setUTCDate(due.getUTCDate() - 3);
  return due.getTime() < Date.parse(now) ? now : due.toISOString();
}

/** Applies an explicitly reviewed set of step changes as one optimistic plan revision. */
export const PATCH = withApiErrors(async function PATCH(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const { caseId } = await params;
  const parsed = await parseJsonRequest(request, confirmedActionPlanPatchSchema, 16_384);
  if (!parsed.ok) {
    return response({ error: "Некорректное изменение плана.", code: parsed.error.toUpperCase() }, parsed.error === "payload_too_large" ? 413 : 400);
  }

  const db = requireD1();
  const workspace = await workspaceForUser(user);
  const plan = await db.prepare(
    "SELECT p.id,p.current_revision AS currentRevision FROM action_plans p JOIN cases c ON c.id=p.case_id WHERE c.id=? AND c.workspace_id=? AND c.archived_at IS NULL LIMIT 1",
  ).bind(caseId, workspace.id).first<{ id: string; currentRevision: number }>();
  if (!plan) return response({ error: "Дело или план недоступны.", code: "CASE_PLAN_UNAVAILABLE" }, 404);
  if (plan.currentRevision !== parsed.data.revision) {
    return response({ error: "План изменён в другой сессии.", code: "VERSION_CONFLICT" }, 409);
  }

  const ids = parsed.data.changes.map((change) => change.id);
  const placeholders = ids.map(() => "?").join(",");
  const ownedSteps = await db.prepare(
    `SELECT id,revision FROM action_plan_steps WHERE plan_id=? AND id IN (${placeholders})`,
  ).bind(plan.id, ...ids).all<{ id: string; revision: number }>();
  if (ownedSteps.results.length !== parsed.data.changes.length
    || parsed.data.changes.some((change) => ownedSteps.results.find((step) => step.id === change.id)?.revision !== change.revision)) {
    return response({ error: "Один из шагов плана изменён или недоступен.", code: "VERSION_CONFLICT" }, 409);
  }

  const now = isoNow();
  const nextRevision = plan.currentRevision + 1;
  const changeStatements = parsed.data.changes.flatMap((change) => {
    const taskStatus = taskStatusForPlanStep(change.status);
    const reminderAt = change.dueAt && !taskStatusIsTerminal(taskStatus) ? defaultReminderAt(change.dueAt, now) : null;
    return [
      db.prepare(
        "UPDATE action_plan_steps SET status=?,due_at=?,completed_at=?,revision=revision+1,updated_at=? WHERE id=? AND plan_id=? AND revision=?",
      ).bind(change.status, change.dueAt, change.status === "completed" ? now : null, now, change.id, plan.id, change.revision),
      db.prepare(
        "UPDATE tasks SET status=?,due_at=?,completed_at=?,updated_at=? WHERE plan_step_id=? AND case_id=? AND workspace_id=?",
      ).bind(taskStatus, change.dueAt, taskStatus === "completed" ? now : null, now, change.id, caseId, workspace.id),
      db.prepare(
        "UPDATE task_reminders SET status=CASE WHEN ? THEN 'pending' ELSE 'cancelled' END,reminder_at=CASE WHEN ? IS NULL THEN reminder_at ELSE ? END,updated_at=? WHERE task_id=? AND status IN ('pending','cancelled')",
      ).bind(reminderAt !== null, reminderAt, reminderAt, now, change.id),
      db.prepare(
        "INSERT OR IGNORE INTO task_reminders (id,task_id,channel,reminder_at,status,idempotency_key,created_at,updated_at) SELECT ?,id,'in_app',?,'pending',?,?,? FROM tasks WHERE id=? AND workspace_id=? AND case_id=? AND ? IS NOT NULL",
      ).bind(`${change.id}:default`, reminderAt, `${change.id}:in_app:default`, now, now, change.id, workspace.id, caseId, reminderAt),
    ];
  });

  try {
    await db.batch([
      ...changeStatements,
      db.prepare(
        "UPDATE action_plans SET progress_percent=(SELECT CASE WHEN count(*)=0 THEN 0 ELSE round(100.0*sum(CASE WHEN status='completed' THEN 1 ELSE 0 END)/count(*)) END FROM action_plan_steps WHERE plan_id=?),status=CASE WHEN (SELECT count(*) FROM action_plan_steps WHERE plan_id=? AND status<>'completed')=0 THEN 'completed' ELSE 'in_progress' END,current_revision=current_revision+1,updated_at=? WHERE id=? AND current_revision=?",
      ).bind(plan.id, plan.id, now, plan.id, plan.currentRevision),
      db.prepare(
        "INSERT INTO action_plan_versions (id,plan_id,version,created_by_user_id,reason,snapshot_json,created_at) SELECT ?,p.id,?,?,'plan_changes_confirmed',CASE WHEN p.current_revision=? THEN json_object('version',p.current_revision,'title',p.title,'status',p.status,'progressPercent',p.progress_percent,'steps',(SELECT json_group_array(json_object('id',s.id,'ordinal',s.ordinal,'title',s.title,'description',s.description,'status',s.status,'dueAt',s.due_at,'deadlineType',s.deadline_type,'actionType',s.action_type,'templateCode',s.template_code,'revision',s.revision)) FROM (SELECT id,ordinal,title,description,status,due_at,deadline_type,action_type,template_code,revision FROM action_plan_steps WHERE plan_id=p.id ORDER BY ordinal) s)) ELSE NULL END,? FROM action_plans p WHERE p.id=?",
      ).bind(crypto.randomUUID(), nextRevision, user.id, nextRevision, now, plan.id),
      db.prepare(
        "UPDATE cases SET next_deadline_at=(SELECT min(s.due_at) FROM action_plan_steps s JOIN action_plans p ON p.id=s.plan_id WHERE p.case_id=? AND s.due_at IS NOT NULL AND s.status NOT IN ('completed','cancelled')),current_revision=current_revision+1,updated_at=? WHERE id=? AND workspace_id=?",
      ).bind(caseId, now, caseId, workspace.id),
      db.prepare(
        "INSERT INTO case_events (id,case_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'plan_changes_confirmed',?,?)",
      ).bind(crypto.randomUUID(), caseId, user.id, JSON.stringify({ planId: plan.id, planVersion: nextRevision, changeCount: parsed.data.changes.length }), now),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/action_plan_versions|NOT NULL constraint failed/i.test(message)) {
      return response({ error: "План изменён в другой сессии.", code: "VERSION_CONFLICT" }, 409);
    }
    throw error;
  }

  return response({ ok: true, planVersion: nextRevision, changeCount: parsed.data.changes.length });
});
