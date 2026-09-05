import { z } from "zod";
import { parseLegalChatResponse } from "./legal-chat-schema";
import { aiText } from "./localization";

export const saveAiActionPlanInputSchema = z.object({
  assistantMessageId: z.string().uuid(),
  targetCaseId: z.string().uuid().optional(),
  locale: z.enum(["ru", "uz", "en"]).default("uz"),
}).strict();

export type SaveAiActionPlanInput = z.infer<typeof saveAiActionPlanInputSchema>;

export class AiActionPlanSaveError extends Error {
  constructor(
    readonly code:
      | "AI_ACTION_PLAN_NOT_FOUND"
      | "AI_ACTION_PLAN_CASE_NOT_FOUND"
      | "AI_ACTION_PLAN_INVALID"
      | "AI_ACTION_PLAN_EMPTY"
      | "AI_ACTION_PLAN_PERSISTENCE_FAILED",
  ) {
    super(code);
    this.name = "AiActionPlanSaveError";
  }
}

type StoredPlanMessage = {
  structuredJson: string | null;
  accountType: string;
};

function stableId(prefix: string, assistantMessageId: string): string {
  return `${prefix}_${assistantMessageId.replaceAll("-", "")}`;
}

/**
 * Derive a deterministic UUIDv5-shaped case ID from the persisted UUIDv4
 * message identity. Existing builder context links only accept UUIDs.
 */
function stableCaseId(assistantMessageId: string): string {
  return `${assistantMessageId.slice(0, 14)}5${assistantMessageId.slice(15)}`.toLowerCase();
}

function stableChildUuid(
  assistantMessageId: string,
  ordinal: number,
  kind: "step" | "task",
  destinationCaseId?: string,
): string {
  const bytes = assistantMessageId.replaceAll("-", "").toLowerCase().split("");
  if (destinationCaseId) {
    const destination = destinationCaseId.replaceAll("-", "").toLowerCase();
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (Number.parseInt(bytes[index], 16) ^ Number.parseInt(destination[index], 16)).toString(16);
    }
  }
  const suffix = `${kind === "step" ? "a" : "b"}${ordinal.toString(16).padStart(7, "0")}`;
  bytes.splice(24, 8, ...suffix);
  const compact = bytes.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-5${compact.slice(13, 16)}-8${compact.slice(17, 20)}-${compact.slice(20)}`;
}

function caseAccountType(value: string): "individual" | "entrepreneur" | "lawyer" | "business" {
  return value === "business" || value === "entrepreneur" || value === "lawyer"
    ? value
    : "individual";
}

function parseStoredPlan(raw: string | null) {
  if (!raw) throw new AiActionPlanSaveError("AI_ACTION_PLAN_INVALID");
  try {
    const result = parseLegalChatResponse(JSON.parse(raw));
    if (result.responseKind !== "answer") {
      throw new AiActionPlanSaveError("AI_ACTION_PLAN_EMPTY");
    }
    if (!result.actionPlan.length) {
      throw new AiActionPlanSaveError("AI_ACTION_PLAN_EMPTY");
    }
    return result;
  } catch (error) {
    if (error instanceof AiActionPlanSaveError) throw error;
    throw new AiActionPlanSaveError("AI_ACTION_PLAN_INVALID");
  }
}

/**
 * Converts only an already persisted, tenant-owned structured AI answer into a
 * case. The browser never submits plan step text, sources, or case content.
 */
export async function saveAiActionPlanToCase(input: {
  db: D1Database;
  workspaceId: string;
  userId: string;
  assistantMessageId: string;
  targetCaseId?: string;
  now?: string;
}): Promise<{ caseId: string; planId: string; taskCount: number; replay: boolean }> {
  const stored = await input.db.prepare(`
    SELECT message.structured_json AS structuredJson,profile.account_type AS accountType
    FROM conversation_messages message
    INNER JOIN conversations conversation ON conversation.id=message.conversation_id
    INNER JOIN user_profiles profile ON profile.id=conversation.owner_user_id
    WHERE message.id=? AND message.author_type='assistant'
      AND conversation.workspace_id=? AND conversation.owner_user_id=?
    LIMIT 1
  `).bind(input.assistantMessageId, input.workspaceId, input.userId).first<StoredPlanMessage>();
  if (!stored) throw new AiActionPlanSaveError("AI_ACTION_PLAN_NOT_FOUND");
  const result = parseStoredPlan(stored.structuredJson);
  if (input.targetCaseId) {
    return appendAiActionPlanToCase(input, result);
  }
  const caseId = stableCaseId(input.assistantMessageId);
  const planId = stableId("plan_ai", input.assistantMessageId);
  const legacyCaseId = stableId("case_ai_plan", input.assistantMessageId);
  const existing = await input.db.prepare(
    "SELECT id FROM cases WHERE id IN (?,?) AND workspace_id=? AND owner_user_id=? LIMIT 1",
  ).bind(caseId, legacyCaseId, input.workspaceId, input.userId).first<{ id: string }>();
  if (existing) {
    const existingPlan = await input.db.prepare(
      "SELECT id FROM action_plans WHERE case_id=? LIMIT 1",
    ).bind(existing.id).first<{ id: string }>();
    const tasks = await input.db.prepare(
      "SELECT count(*) AS count FROM tasks WHERE case_id=? AND workspace_id=?",
    ).bind(existing.id, input.workspaceId).first<{ count: number }>();
    return { caseId: existing.id, planId: existingPlan?.id ?? planId, taskCount: tasks?.count ?? 0, replay: true };
  }

  const now = input.now ?? new Date().toISOString();
  const caseTitle = result.summary.replace(/\s+/g, " ").trim().slice(0, 180);
  const description = result.answer.slice(0, 2_000);
  const steps = result.actionPlan.map((step, index) => ({
    id: stableChildUuid(input.assistantMessageId, index + 1, "step"),
    taskId: stableChildUuid(input.assistantMessageId, index + 1, "task"),
    ordinal: index + 1,
    title: step.title,
    description: step.description,
    sourceIds: step.sourceIds,
  }));
  const snapshot = JSON.stringify({
    version: 1,
    source: "persisted_ai_answer",
    assistantMessageId: input.assistantMessageId,
    title: aiText(result.language, `План: ${caseTitle}`, `Reja: ${caseTitle}`, `Plan: ${caseTitle}`),
    status: "in_progress",
    progressPercent: 0,
    steps: steps.map(({ id, ordinal, title, description, sourceIds }) => ({ id, ordinal, title, description, sourceIds })),
  });
  try {
    await input.db.batch([
      input.db.prepare(
        "INSERT INTO cases (id,workspace_id,owner_user_id,account_type,locale,title,description,legal_area,status,current_revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'ai_proposed','open',1,?,?)",
      ).bind(caseId, input.workspaceId, input.userId, caseAccountType(stored.accountType), result.language, caseTitle, description, now, now),
      input.db.prepare(
        "INSERT INTO action_plans (id,case_id,created_by_user_id,title,status,progress_percent,current_revision,created_at,updated_at) VALUES (?,?,?,?,'in_progress',0,1,?,?)",
      ).bind(planId, caseId, input.userId, aiText(result.language, `План: ${caseTitle}`, `Reja: ${caseTitle}`, `Plan: ${caseTitle}`), now, now),
      ...steps.flatMap((step) => [
        input.db.prepare(
          "INSERT INTO action_plan_steps (id,plan_id,ordinal,title,description,status,deadline_type,action_type,revision,created_at,updated_at) VALUES (?,?,?,?,?,'not_started','calendar_days','ai_proposed',1,?,?)",
        ).bind(step.id, planId, step.ordinal, step.title, step.description, now, now),
        input.db.prepare(
          "INSERT INTO tasks (id,workspace_id,case_id,plan_step_id,owner_user_id,title,description,legal_basis,deadline_type,status,created_at,updated_at,completed_at) VALUES (?,?,?,?,?,?,?,?,'calendar_days','planned',?,?,NULL)",
        ).bind(step.taskId, input.workspaceId, caseId, step.id, input.userId, step.title, step.description, JSON.stringify({ sourceIds: step.sourceIds }), now, now),
      ]),
      input.db.prepare(
        "INSERT INTO action_plan_versions (id,plan_id,version,created_by_user_id,reason,snapshot_json,created_at) VALUES (?,?,1,?,'ai_plan_confirmed',?,?)",
      ).bind(`${planId}:version:1`, planId, input.userId, snapshot, now),
      input.db.prepare(
        "INSERT INTO case_events (id,case_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'ai_action_plan_confirmed',?,?)",
      ).bind(`${caseId}:event`, caseId, input.userId, JSON.stringify({ assistantMessageId: input.assistantMessageId, stepCount: steps.length }), now),
      input.db.prepare(
        "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'case',?,'ai_action_plan_saved',?,?)",
      ).bind(`${caseId}:audit`, input.workspaceId, input.userId, caseId, JSON.stringify({ assistantMessageId: input.assistantMessageId, planId, taskCount: steps.length }), now),
    ]);
  } catch (error) {
    if (error instanceof AiActionPlanSaveError) throw error;
    throw new AiActionPlanSaveError("AI_ACTION_PLAN_PERSISTENCE_FAILED");
  }
  return { caseId, planId, taskCount: steps.length, replay: false };
}

type ExistingCasePlan = {
  caseId: string;
  caseTitle: string;
  planId: string | null;
  planTitle: string | null;
  planRevision: number | null;
};

type ExistingPlanStep = {
  id: string;
  ordinal: number;
  title: string;
  description: string | null;
  status: string;
  dueAt: string | null;
  deadlineType: string;
  actionType: string;
  templateCode: string | null;
  revision: number;
};

async function appendAiActionPlanToCase(
  input: {
    db: D1Database;
    workspaceId: string;
    userId: string;
    assistantMessageId: string;
    targetCaseId?: string;
    now?: string;
  },
  result: ReturnType<typeof parseStoredPlan>,
): Promise<{ caseId: string; planId: string; taskCount: number; replay: boolean }> {
  const caseId = input.targetCaseId!;
  const target = await input.db.prepare(`
    SELECT c.id AS caseId,c.title AS caseTitle,p.id AS planId,p.title AS planTitle,
      p.current_revision AS planRevision
    FROM cases c
    LEFT JOIN action_plans p ON p.case_id=c.id
    WHERE c.id=? AND c.workspace_id=? AND c.archived_at IS NULL
    LIMIT 1
  `).bind(caseId, input.workspaceId).first<ExistingCasePlan>();
  if (!target) throw new AiActionPlanSaveError("AI_ACTION_PLAN_CASE_NOT_FOUND");

  const auditId = `ai-plan-append:${caseId}:${input.assistantMessageId}`;
  const replay = await input.db.prepare(
    `SELECT json_extract(metadata_json,'$.planId') AS planId,
      json_extract(metadata_json,'$.taskCount') AS taskCount
     FROM workspace_audit_events
     WHERE id=? AND workspace_id=? AND actor_user_id=?
       AND entity_type='case' AND entity_id=? AND action='ai_action_plan_appended'
     LIMIT 1`,
  ).bind(auditId, input.workspaceId, input.userId, caseId).first<{ planId: string; taskCount: number }>();
  if (replay?.planId) {
    return { caseId, planId: replay.planId, taskCount: Number(replay.taskCount ?? 0), replay: true };
  }

  const now = input.now ?? new Date().toISOString();
  const planId = target.planId ?? `plan_case_${caseId.replaceAll("-", "")}`;
  const currentRevision = target.planRevision ?? 0;
  const nextRevision = currentRevision + 1;
  const existingSteps = target.planId
    ? (await input.db.prepare(
      `SELECT id,ordinal,title,description,status,due_at AS dueAt,deadline_type AS deadlineType,
        action_type AS actionType,template_code AS templateCode,revision
       FROM action_plan_steps WHERE plan_id=? ORDER BY ordinal`,
    ).bind(target.planId).all<ExistingPlanStep>()).results
    : [];
  const firstOrdinal = existingSteps.reduce((maximum, step) => Math.max(maximum, step.ordinal), 0) + 1;
  const addedSteps = result.actionPlan.map((step, index) => ({
    id: stableChildUuid(input.assistantMessageId, index + 1, "step", caseId),
    taskId: stableChildUuid(input.assistantMessageId, index + 1, "task", caseId),
    ordinal: firstOrdinal + index,
    title: step.title,
    description: step.description,
    sourceIds: step.sourceIds,
  }));
  const planTitle = target.planTitle
    ?? aiText(result.language, `План: ${target.caseTitle}`, `Reja: ${target.caseTitle}`, `Plan: ${target.caseTitle}`);
  const completedStepCount = existingSteps.filter((step) => step.status === "completed").length;
  const nextProgressPercent = Math.round(100 * completedStepCount / (existingSteps.length + addedSteps.length));
  const snapshot = JSON.stringify({
    version: nextRevision,
    source: "persisted_ai_answer",
    assistantMessageId: input.assistantMessageId,
    title: planTitle,
    status: "in_progress",
    progressPercent: nextProgressPercent,
    steps: [
      ...existingSteps.map((step) => ({
        id: step.id,
        ordinal: step.ordinal,
        title: step.title,
        description: step.description,
        status: step.status,
        dueAt: step.dueAt,
        deadlineType: step.deadlineType,
        actionType: step.actionType,
        templateCode: step.templateCode,
        revision: step.revision,
      })),
      ...addedSteps.map((step) => ({
        id: step.id,
        ordinal: step.ordinal,
        title: step.title,
        description: step.description,
        status: "not_started",
        dueAt: null,
        deadlineType: "calendar_days",
        actionType: "ai_proposed",
        templateCode: null,
        revision: 1,
        sourceIds: step.sourceIds,
      })),
    ],
  });

  const statements = [
    ...(!target.planId ? [input.db.prepare(
      `INSERT INTO action_plans
       (id,case_id,created_by_user_id,title,status,progress_percent,current_revision,created_at,updated_at)
       VALUES (?,?,?,?,'in_progress',0,1,?,?)`,
    ).bind(planId, caseId, input.userId, planTitle, now, now)] : []),
    ...addedSteps.flatMap((step) => [
      input.db.prepare(
        `INSERT INTO action_plan_steps
         (id,plan_id,ordinal,title,description,status,deadline_type,action_type,revision,created_at,updated_at)
         VALUES (?,?,?,?,?,'not_started','calendar_days','ai_proposed',1,?,?)`,
      ).bind(step.id, planId, step.ordinal, step.title, step.description, now, now),
      input.db.prepare(
        `INSERT INTO tasks
         (id,workspace_id,case_id,plan_step_id,owner_user_id,title,description,legal_basis,deadline_type,status,created_at,updated_at,completed_at)
         VALUES (?,?,?,?,?,?,?,?,'calendar_days','planned',?,?,NULL)`,
      ).bind(
        step.taskId,
        input.workspaceId,
        caseId,
        step.id,
        input.userId,
        step.title,
        step.description,
        JSON.stringify({ sourceIds: step.sourceIds }),
        now,
        now,
      ),
    ]),
    ...(target.planId ? [input.db.prepare(
      `UPDATE action_plans SET status='in_progress',progress_percent=?,current_revision=current_revision+1,updated_at=?
       WHERE id=? AND case_id=? AND current_revision=?`,
    ).bind(nextProgressPercent, now, planId, caseId, currentRevision)] : []),
    input.db.prepare(
      `INSERT INTO action_plan_versions
       (id,plan_id,version,created_by_user_id,reason,snapshot_json,created_at)
       VALUES (?,?,?,?, 'ai_plan_appended',?,?)`,
    ).bind(`${planId}:version:${nextRevision}`, planId, nextRevision, input.userId, snapshot, now),
    input.db.prepare(
      `UPDATE cases SET current_revision=current_revision+1,updated_at=?
       WHERE id=? AND workspace_id=? AND archived_at IS NULL`,
    ).bind(now, caseId, input.workspaceId),
    input.db.prepare(
      `INSERT INTO case_events
       (id,case_id,actor_user_id,event_type,metadata_json,created_at)
       VALUES (?,?,?,'ai_action_plan_appended',?,?)`,
    ).bind(
      `ai-plan-append-event:${caseId}:${input.assistantMessageId}`,
      caseId,
      input.userId,
      JSON.stringify({ assistantMessageId: input.assistantMessageId, planId, planVersion: nextRevision, stepCount: addedSteps.length }),
      now,
    ),
    input.db.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'case',?,'ai_action_plan_appended',?,?)`,
    ).bind(
      auditId,
      input.workspaceId,
      input.userId,
      caseId,
      JSON.stringify({ assistantMessageId: input.assistantMessageId, planId, planVersion: nextRevision, taskCount: addedSteps.length }),
      now,
    ),
  ];
  try {
    await input.db.batch(statements);
  } catch {
    const raced = await input.db.prepare(
      `SELECT json_extract(metadata_json,'$.planId') AS planId,
        json_extract(metadata_json,'$.taskCount') AS taskCount
       FROM workspace_audit_events WHERE id=? AND workspace_id=? AND actor_user_id=? LIMIT 1`,
    ).bind(auditId, input.workspaceId, input.userId).first<{ planId: string; taskCount: number }>();
    if (raced?.planId) {
      return { caseId, planId: raced.planId, taskCount: Number(raced.taskCount ?? 0), replay: true };
    }
    throw new AiActionPlanSaveError("AI_ACTION_PLAN_PERSISTENCE_FAILED");
  }
  return { caseId, planId, taskCount: addedSteps.length, replay: false };
}
