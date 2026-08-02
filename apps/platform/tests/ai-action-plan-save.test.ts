import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AiActionPlanSaveError,
  saveAiActionPlanToCase,
} from "../lib/ai/action-plan-save";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const USER_ID = "user_ai_plan";
const WORKSPACE_ID = "ws_ai_plan";
const CONVERSATION_ID = "conversation_ai_plan";
const ASSISTANT_MESSAGE_ID = "21f0218d-30a1-49f7-8602-5f1b04ccd63b";
const NOW = "2026-08-03T08:00:00.000Z";

function source(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const structuredAnswer = {
  responseKind: "answer" as const,
  summary: "Взыскание задолженности по договору",
  answer: "Сохранённый структурированный ответ JURO.",
  language: "ru" as const,
  jurisdiction: "UZ" as const,
  answerMode: "detailed" as const,
  reasoningMode: "deep" as const,
  clarificationQuestions: [],
  confirmedFindings: [], assumptions: [], risks: [], sources: [], requiredDocuments: [],
  actionPlan: [
    { title: "Собрать документы", description: "Соберите договор и подтверждения оплаты.", sourceIds: [] },
    { title: "Подготовить требование", description: "Подготовьте письменное требование контрагенту.", sourceIds: [] },
  ],
  deadlines: [], successOutlook: null, urgency: "normal" as const,
  suggestedDocument: null, suggestLawyer: false, legalDatabaseAsOf: NOW,
};

function seed() {
  const fixture = sqliteD1Fixture();
  fixture.sqlite.prepare(
    "INSERT INTO workspaces (id,type,name,full_name,short_name,locale,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(WORKSPACE_ID, "individual", "AI Plan", null, null, "ru", NOW, NOW);
  fixture.sqlite.prepare(
    "INSERT INTO user_profiles (id,email,full_name,locale,account_type,default_workspace_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(USER_ID, "ai-plan@example.invalid", "AI Plan User", "ru", "individual", WORKSPACE_ID, NOW, NOW);
  fixture.sqlite.prepare(
    "INSERT INTO workspace_members (id,workspace_id,user_id,role,status,joined_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run("member_ai_plan", WORKSPACE_ID, USER_ID, "owner", "active", NOW, NOW, NOW);
  fixture.sqlite.prepare(
    "INSERT INTO conversations (id,workspace_id,owner_user_id,case_id,title,locale,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?, ?,?)",
  ).run(CONVERSATION_ID, WORKSPACE_ID, USER_ID, null, "Долг", "ru", "active", NOW, NOW);
  fixture.sqlite.prepare(
    "INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at) VALUES (?,?,?,?,?,?)",
  ).run(ASSISTANT_MESSAGE_ID, CONVERSATION_ID, "assistant", structuredAnswer.answer, JSON.stringify(structuredAnswer), NOW);
  return fixture;
}

test("explicit AI-plan confirmation persists a tenant-scoped case, immutable plan and tasks exactly once", async () => {
  const { sqlite, d1 } = seed();
  try {
    const first = await saveAiActionPlanToCase({
      db: d1, workspaceId: WORKSPACE_ID, userId: USER_ID,
      assistantMessageId: ASSISTANT_MESSAGE_ID, now: NOW,
    });
    assert.equal(first.replay, false);
    assert.equal(first.taskCount, 2);
    assert.match(first.caseId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(
      (sqlite.prepare("SELECT count(*) AS count FROM action_plan_steps WHERE plan_id=?").get(first.planId) as { count: number }).count,
      2,
    );
    assert.equal(
      (sqlite.prepare("SELECT count(*) AS count FROM tasks WHERE case_id=? AND workspace_id=?").get(first.caseId, WORKSPACE_ID) as { count: number }).count,
      2,
    );
    assert.equal(
      (sqlite.prepare("SELECT reason FROM action_plan_versions WHERE plan_id=?").get(first.planId) as { reason: string }).reason,
      "ai_plan_confirmed",
    );
    const replay = await saveAiActionPlanToCase({
      db: d1, workspaceId: WORKSPACE_ID, userId: USER_ID,
      assistantMessageId: ASSISTANT_MESSAGE_ID, now: "2026-08-03T08:01:00.000Z",
    });
    assert.deepEqual(replay, { ...first, replay: true });
    assert.equal(
      (sqlite.prepare("SELECT count(*) AS count FROM cases WHERE workspace_id=?").get(WORKSPACE_ID) as { count: number }).count,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("legacy non-UUID plan cases retain replay safety after the builder-compatible ID migration", async () => {
  const { sqlite, d1 } = seed();
  try {
    const legacyCaseId = `case_ai_plan_${ASSISTANT_MESSAGE_ID.replaceAll("-", "")}`;
    const legacyPlanId = `plan_ai_${ASSISTANT_MESSAGE_ID.replaceAll("-", "")}`;
    sqlite.prepare(
      "INSERT INTO cases (id,workspace_id,owner_user_id,account_type,locale,title,description,legal_area,status,current_revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(legacyCaseId, WORKSPACE_ID, USER_ID, "individual", "ru", "Legacy", null, "ai_proposed", "open", 1, NOW, NOW);
    sqlite.prepare(
      "INSERT INTO action_plans (id,case_id,created_by_user_id,title,status,progress_percent,current_revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    ).run(legacyPlanId, legacyCaseId, USER_ID, "Legacy", "in_progress", 0, 1, NOW, NOW);
    const replay = await saveAiActionPlanToCase({
      db: d1, workspaceId: WORKSPACE_ID, userId: USER_ID, assistantMessageId: ASSISTANT_MESSAGE_ID, now: NOW,
    });
    assert.deepEqual(replay, { caseId: legacyCaseId, planId: legacyPlanId, taskCount: 0, replay: true });
    assert.equal(
      (sqlite.prepare("SELECT count(*) AS count FROM cases WHERE workspace_id=?").get(WORKSPACE_ID) as { count: number }).count,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("AI-plan save denies a foreign workspace and incomplete response without exposing plan content", async () => {
  const { sqlite, d1 } = seed();
  try {
    await assert.rejects(
      () => saveAiActionPlanToCase({
        db: d1, workspaceId: "ws_foreign", userId: USER_ID,
        assistantMessageId: ASSISTANT_MESSAGE_ID, now: NOW,
      }),
      (error: unknown) => error instanceof AiActionPlanSaveError && error.code === "AI_ACTION_PLAN_NOT_FOUND",
    );
    sqlite.prepare("UPDATE conversation_messages SET structured_json=? WHERE id=?")
      .run(JSON.stringify({ ...structuredAnswer, responseKind: "clarification_required", actionPlan: [] }), ASSISTANT_MESSAGE_ID);
    await assert.rejects(
      () => saveAiActionPlanToCase({
        db: d1, workspaceId: WORKSPACE_ID, userId: USER_ID,
        assistantMessageId: ASSISTANT_MESSAGE_ID, now: NOW,
      }),
      (error: unknown) => error instanceof AiActionPlanSaveError && error.code === "AI_ACTION_PLAN_EMPTY",
    );
  } finally {
    sqlite.close();
  }
});

test("AI-plan route and chat require server-side ownership and explicit confirmation", () => {
  const route = source("app/api/platform/ai/action-plan/route.ts");
  const service = source("lib/ai/action-plan-save.ts");
  const client = source("app/_platform/AiLawyerClient.tsx");
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.match(route, /requireApiUser\(\)/);
  assert.match(route, /workspaceForUser\(user\)/);
  assert.match(route, /saveAiActionPlanToCase/);
  assert.match(service, /conversation\.workspace_id=\? AND conversation\.owner_user_id=\?/);
  assert.match(service, /structuredJson/);
  assert.match(service, /ai_action_plan_confirmed/);
  assert.match(client, /window\.confirm\(/);
  assert.match(client, /\/api\/platform\/ai\/action-plan/);
  assert.match(client, /assistantMessageId: answer\.messageId/);
});
