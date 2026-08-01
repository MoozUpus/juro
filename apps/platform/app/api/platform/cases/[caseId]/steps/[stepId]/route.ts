import { parseJsonRequest } from "../../../../../../../lib/auth/input";
import {
  assertSafeWrite,
  requireApiUser,
  withApiErrors,
} from "../../../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../../lib/document-builder/storage/runtime";
import { actionPlanStepPatchSchema } from "../../../../../../../lib/platform/action-plan";
import { workspaceForUser } from "../../../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

type PlanStepSnapshot = {
  id: string;
  ordinal: number;
  title: string;
  description: string | null;
  status: string;
  dueAt: string | null;
  deadlineType: string;
  actionType: string | null;
  templateCode: string | null;
  revision: number;
};

export const PATCH = withApiErrors(async function PATCH(
  request: Request,
  { params }: { params: Promise<{ caseId: string; stepId: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const { caseId, stepId } = await params;
  const parsed = await parseJsonRequest(request, actionPlanStepPatchSchema, 2_048);
  if (!parsed.ok) {
    return response({
      error: "Некорректное изменение шага.",
      code: parsed.error.toUpperCase(),
    }, parsed.error === "payload_too_large" ? 413 : 400);
  }

  const db = requireD1();
  const workspace = await workspaceForUser(user);
  const owned = await db.prepare(
    "SELECT s.plan_id AS planId,p.title AS planTitle,p.current_revision AS planRevision FROM action_plan_steps s JOIN action_plans p ON p.id=s.plan_id JOIN cases c ON c.id=p.case_id WHERE s.id=? AND c.id=? AND c.workspace_id=? LIMIT 1",
  ).bind(stepId, caseId, workspace.id).first<{
    planId: string;
    planTitle: string;
    planRevision: number;
  }>();
  if (!owned) {
    return response({
      error: "Дело или шаг недоступны.",
      code: "CASE_STEP_UNAVAILABLE",
    }, 404);
  }

  const now = isoNow();
  const result = await db.prepare(
    "UPDATE action_plan_steps SET status=?,due_at=?,completed_at=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
  ).bind(
    parsed.data.status,
    parsed.data.dueAt,
    parsed.data.status === "completed" ? now : null,
    now,
    stepId,
    parsed.data.revision,
  ).run();
  if (!result.meta.changes) {
    return response({
      error: "Шаг уже изменён в другой сессии.",
      code: "VERSION_CONFLICT",
    }, 409);
  }

  const [counts, deadline, currentSteps] = await Promise.all([
    db.prepare(
      "SELECT count(*) AS total,sum(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS done FROM action_plan_steps WHERE plan_id=?",
    ).bind(owned.planId).first<{ total: number; done: number }>(),
    db.prepare(
      "SELECT min(s.due_at) AS nextDeadlineAt FROM action_plan_steps s JOIN action_plans p ON p.id=s.plan_id WHERE p.case_id=? AND s.due_at IS NOT NULL AND s.status NOT IN ('completed','cancelled')",
    ).bind(caseId).first<{ nextDeadlineAt: string | null }>(),
    db.prepare(
      "SELECT id,ordinal,title,description,status,due_at AS dueAt,deadline_type AS deadlineType,action_type AS actionType,template_code AS templateCode,revision FROM action_plan_steps WHERE plan_id=? ORDER BY ordinal ASC",
    ).bind(owned.planId).all<PlanStepSnapshot>(),
  ]);
  const progress = counts?.total
    ? Math.round(((counts.done || 0) / counts.total) * 100)
    : 0;
  const planStatus = progress === 100 ? "completed" : "in_progress";
  const nextDeadlineAt = deadline?.nextDeadlineAt ?? null;
  const version = owned.planRevision + 1;
  const snapshot = JSON.stringify({
    version,
    title: owned.planTitle,
    status: planStatus,
    progressPercent: progress,
    steps: currentSteps.results,
  });

  await db.batch([
    db.prepare(
      "UPDATE action_plans SET progress_percent=?,status=?,current_revision=?,updated_at=? WHERE id=? AND current_revision=?",
    ).bind(progress, planStatus, version, now, owned.planId, owned.planRevision),
    db.prepare(
      "UPDATE cases SET next_deadline_at=?,current_revision=current_revision+1,updated_at=? WHERE id=?",
    ).bind(nextDeadlineAt, now, caseId),
    db.prepare(
      "INSERT INTO action_plan_versions (id,plan_id,version,created_by_user_id,reason,snapshot_json,created_at) VALUES (?,?,?,?,?,?,?)",
    ).bind(crypto.randomUUID(), owned.planId, version, user.id, "step_updated", snapshot, now),
    db.prepare(
      "INSERT INTO case_events (id,case_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'step_updated',?,?)",
    ).bind(
      crypto.randomUUID(),
      caseId,
      user.id,
      JSON.stringify({
        stepId,
        status: parsed.data.status,
        dueAt: parsed.data.dueAt,
        planVersion: version,
      }),
      now,
    ),
  ]);

  return response({
    ok: true,
    progress,
    revision: parsed.data.revision + 1,
    planVersion: version,
    nextDeadlineAt,
  });
});