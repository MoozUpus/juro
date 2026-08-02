import { z } from "zod";
import { parseLegalChatResponse } from "./legal-chat-schema";

export const saveAiActionPlanInputSchema = z.object({
  assistantMessageId: z.string().uuid(),
  locale: z.enum(["ru", "uz"]).default("uz"),
}).strict();

export type SaveAiActionPlanInput = z.infer<typeof saveAiActionPlanInputSchema>;

export class AiActionPlanSaveError extends Error {
  constructor(
    readonly code: "AI_ACTION_PLAN_NOT_FOUND" | "AI_ACTION_PLAN_INVALID" | "AI_ACTION_PLAN_EMPTY" | "AI_ACTION_PLAN_PERSISTENCE_FAILED",
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
  const caseId = stableId("case_ai_plan", input.assistantMessageId);
  const planId = stableId("plan_ai", input.assistantMessageId);
  const existing = await input.db.prepare(
    "SELECT id FROM cases WHERE id=? AND workspace_id=? AND owner_user_id=? LIMIT 1",
  ).bind(caseId, input.workspaceId, input.userId).first<{ id: string }>();
  if (existing) {
    const tasks = await input.db.prepare(
      "SELECT count(*) AS count FROM tasks WHERE case_id=? AND workspace_id=?",
    ).bind(caseId, input.workspaceId).first<{ count: number }>();
    return { caseId, planId, taskCount: tasks?.count ?? 0, replay: true };
  }

  const now = input.now ?? new Date().toISOString();
  const caseTitle = result.summary.replace(/\s+/g, " ").trim().slice(0, 180);
  const description = result.answer.slice(0, 2_000);
  const steps = result.actionPlan.map((step, index) => ({
    id: `${planId}:step:${index + 1}`,
    taskId: `${planId}:task:${index + 1}`,
    ordinal: index + 1,
    title: step.title,
    description: step.description,
    sourceIds: step.sourceIds,
  }));
  const snapshot = JSON.stringify({
    version: 1,
    source: "persisted_ai_answer",
    assistantMessageId: input.assistantMessageId,
    title: result.language === "ru" ? `План: ${caseTitle}` : `Reja: ${caseTitle}`,
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
      ).bind(planId, caseId, input.userId, result.language === "ru" ? `План: ${caseTitle}` : `Reja: ${caseTitle}`, now, now),
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
