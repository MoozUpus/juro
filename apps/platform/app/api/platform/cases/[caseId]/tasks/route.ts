import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

function defaultReminderAt(dueAt: string, now: string): string {
  const due = new Date(`${dueAt.slice(0, 10)}T09:00:00.000Z`);
  due.setUTCDate(due.getUTCDate() - 3);
  return due.getTime() < Date.parse(now) ? now : due.toISOString();
}

export const GET = withApiErrors(async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const user = await requireApiUser();
  const { caseId } = await params;
  const workspace = await workspaceForUser(user);
  const rows = await requireD1().prepare(
    "SELECT t.id,t.plan_step_id AS planStepId,t.title,t.description,t.status,t.due_at AS dueAt,t.safe_due_at AS safeDueAt,t.calculation_method AS calculationMethod,t.deadline_type AS deadlineType,t.completed_at AS completedAt FROM tasks t WHERE t.case_id=? AND t.workspace_id=? ORDER BY t.due_at IS NULL,t.due_at,t.created_at",
  ).bind(caseId, workspace.id).all();
  return response({ tasks: rows.results });
});

export const POST = withApiErrors(async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const { caseId } = await params;
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const owned = await db.prepare("SELECT id FROM cases WHERE id=? AND workspace_id=? AND archived_at IS NULL LIMIT 1").bind(caseId, workspace.id).first();
  if (!owned) return response({ error: "Дело недоступно.", code: "CASE_UNAVAILABLE" }, 404);
  const steps = await db.prepare("SELECT s.id,s.title,s.description,s.due_at AS dueAt,s.deadline_type AS deadlineType FROM action_plan_steps s JOIN action_plans p ON p.id=s.plan_id WHERE p.case_id=? ORDER BY s.ordinal").bind(caseId).all<{ id: string; title: string; description: string | null; dueAt: string | null; deadlineType: string }>();
  const now = isoNow();
  const statements = steps.results.flatMap((step) => {
    const taskId = step.id;
    const reminderAt = step.dueAt ? defaultReminderAt(step.dueAt, now) : null;
    return [
      db.prepare("INSERT OR IGNORE INTO tasks (id,workspace_id,case_id,plan_step_id,owner_user_id,title,description,due_at,deadline_type,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'planned',?,?)").bind(taskId, workspace.id, caseId, step.id, user.id, step.title, step.description, step.dueAt, step.deadlineType, now, now),
      ...(reminderAt ? [db.prepare("INSERT OR IGNORE INTO task_reminders (id,task_id,channel,reminder_at,status,idempotency_key,created_at,updated_at) VALUES (?,?,'in_app',?,'pending',?,?,?)").bind(`${taskId}:default`, taskId, reminderAt, `${taskId}:in_app:default`, now, now)] : []),
    ];
  });
  await db.batch([
    ...statements,
    db.prepare("INSERT INTO case_events (id,case_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'tasks_created',?,?)").bind(crypto.randomUUID(), caseId, user.id, JSON.stringify({ source: "action_plan", stepCount: steps.results.length }), now),
  ]);
  const count = await db.prepare("SELECT count(*) AS count FROM tasks WHERE case_id=? AND workspace_id=?").bind(caseId, workspace.id).first<{ count: number }>();
  return response({ ok: true, taskCount: count?.count ?? 0 }, 201);
});