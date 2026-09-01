import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { productAccountMilestoneCreated } from "../lib/platform/product-account-milestone";
import {
  readProductMetricsDashboard,
} from "../lib/platform/product-metrics";
import { productValueActivationStatement } from "../lib/platform/product-value-activation";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function addUser(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  id: string,
  createdAt: string,
): void {
  sqlite.prepare(
    `INSERT INTO user_profiles (id,email,locale,account_type,created_at,updated_at)
     VALUES (?,?, 'ru','individual',?,?)`,
  ).run(id, `${id}@example.test`, createdAt, createdAt);
}

function addWorkspace(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  id: string,
  createdAt: string,
): void {
  sqlite.prepare(
    `INSERT INTO workspaces (id,type,name,locale,created_at,updated_at)
     VALUES (?,'individual',?,'ru',?,?)`,
  ).run(id, id, createdAt, createdAt);
}

function addConversation(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  id: string,
  workspaceId: string,
  userId: string,
  createdAt: string,
): void {
  sqlite.prepare(
    `INSERT INTO conversations (id,workspace_id,owner_user_id,title,locale,status,created_at,updated_at)
     VALUES (?,?,?,'Question','ru','active',?,?)`,
  ).run(id, workspaceId, userId, createdAt, createdAt);
}

function addAiRun(input: {
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"];
  id: string;
  workspaceId: string;
  userId: string;
  conversationId: string;
  responseMessageId: string | null;
  status: "finalizing" | "completed";
  startedAt: string;
  completedAt: string | null;
}): void {
  input.sqlite.prepare(
    `INSERT INTO ai_runs (
       id,workspace_id,user_id,conversation_id,response_message_id,idempotency_key,
       correlation_id,provider,model,answer_mode,reasoning_mode,status,
       legal_database_as_of,instruction_hash,source_version_hash,input_tokens,
       output_tokens,cached_input_tokens,attempt_count,started_at,completed_at,
       created_at,updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,'short','fast',?,'2026-08-01',?,?,0,0,0,1,?,?,?,?)`,
  ).run(
    input.id,
    input.workspaceId,
    input.userId,
    input.conversationId,
    input.responseMessageId,
    `idem-${input.id}`,
    `corr-${input.id}`,
    "openai",
    "gpt-test",
    input.status,
    "a".repeat(64),
    "b".repeat(64),
    input.startedAt,
    input.completedAt,
    input.startedAt,
    input.completedAt ?? input.startedAt,
  );
}

test("value activation is D1-local, answer-only, and replay-safe", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const now = "2026-08-10T00:00:00.000Z";
  addUser(sqlite, "activation-user", now);
  addWorkspace(sqlite, "activation-workspace", now);
  addConversation(sqlite, "activation-conversation", "activation-workspace", "activation-user", now);
  sqlite.prepare(
    `INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at)
     VALUES ('answer-message','activation-conversation','assistant','Answer',? ,?)`,
  ).run(JSON.stringify({ responseKind: "answer" }), now);
  addAiRun({
    sqlite,
    id: "activation-run",
    workspaceId: "activation-workspace",
    userId: "activation-user",
    conversationId: "activation-conversation",
    responseMessageId: null,
    status: "finalizing",
    startedAt: now,
    completedAt: null,
  });

  const first = await d1.batch([productValueActivationStatement({
    db: d1,
    userId: "activation-user",
    workspaceId: "activation-workspace",
    aiRunId: "activation-run",
    responseMessageId: "answer-message",
    completedAt: "2026-08-10T00:01:00.000Z",
  })]);
  const replay = await d1.batch([productValueActivationStatement({
    db: d1,
    userId: "activation-user",
    workspaceId: "activation-workspace",
    aiRunId: "activation-run",
    responseMessageId: "answer-message",
    completedAt: "2026-08-10T00:02:00.000Z",
  })]);
  assert.equal(productAccountMilestoneCreated(first[0]), true);
  assert.equal(productAccountMilestoneCreated(replay[0]), false);

  sqlite.prepare(
    `INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at)
     VALUES ('clarification-message','activation-conversation','assistant','Need facts',?,?)`,
  ).run(JSON.stringify({ responseKind: "clarification_required" }), now);
  addAiRun({
    sqlite,
    id: "clarification-run",
    workspaceId: "activation-workspace",
    userId: "activation-user",
    conversationId: "activation-conversation",
    responseMessageId: null,
    status: "finalizing",
    startedAt: now,
    completedAt: null,
  });
  const clarification = await d1.batch([productValueActivationStatement({
    db: d1,
    userId: "activation-user",
    workspaceId: "activation-workspace",
    aiRunId: "clarification-run",
    responseMessageId: "clarification-message",
    completedAt: "2026-08-10T00:03:00.000Z",
  })]);
  assert.equal(productAccountMilestoneCreated(clarification[0]), false);
  assert.deepEqual(
    sqlite.prepare(
      "SELECT ai_run_id AS runId,first_completed_at AS completedAt FROM product_value_activations",
    ).all().map((row) => ({ ...row })),
    [{ runId: "activation-run", completedAt: "2026-08-10T00:01:00.000Z" }],
  );
});

test("product dashboard calculates mature cohorts, TTFV, cost, reliability, and provider availability", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const signupAt = "2026-08-10T00:00:00.000Z";
  for (let index = 0; index < 30; index += 1) {
    const userId = `metrics-user-${index}`;
    const workspaceId = `metrics-workspace-${index}`;
    addUser(sqlite, userId, signupAt);
    addWorkspace(sqlite, workspaceId, signupAt);
    if (index >= 20) continue;
    const conversationId = `metrics-conversation-${index}`;
    const responseMessageId = `metrics-response-${index}`;
    const runId = `metrics-run-${index}`;
    const completedAt = index < 10
      ? "2026-08-10T01:00:00.000Z"
      : "2026-08-10T02:00:00.000Z";
    addConversation(sqlite, conversationId, workspaceId, userId, signupAt);
    sqlite.prepare(
      `INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at)
       VALUES (?,?,'assistant','Answer',?,?)`,
    ).run(responseMessageId, conversationId, JSON.stringify({ responseKind: "answer" }), completedAt);
    addAiRun({
      sqlite,
      id: runId,
      workspaceId,
      userId,
      conversationId,
      responseMessageId,
      status: "completed",
      startedAt: signupAt,
      completedAt,
    });
    sqlite.prepare(
      "INSERT INTO product_value_activations (user_id,ai_run_id,first_completed_at) VALUES (?,?,?)",
    ).run(userId, runId, completedAt);
    if (index < 10) {
      sqlite.prepare(
        `INSERT INTO cases (id,workspace_id,owner_user_id,account_type,locale,title,legal_area,status,created_at,updated_at)
         VALUES (?,?,?,'individual','ru','Case','contracts','open','2026-08-11T01:00:00.000Z','2026-08-11T01:00:00.000Z')`,
      ).run(`metrics-case-${index}`, workspaceId, userId);
    }
  }

  sqlite.prepare(
    `INSERT INTO ai_model_price_versions (
       id,provider,model,operation,input_microusd_per_million_tokens,
       output_microusd_per_million_tokens,cached_input_microusd_per_million_tokens,
       currency,effective_from,source_url,created_by_user_id,created_at
     ) VALUES ('metrics-price','openai','gpt-test','responses',1,1,0,'USD',?,NULL,'metrics-user-0',?)`,
  ).run(signupAt, signupAt);
  for (let index = 0; index < 20; index += 1) {
    sqlite.prepare(
      `INSERT INTO ai_provider_usage_events (
         id,environment,usage_day,workspace_id,user_id,feature,operation,provider,model,
         request_count,input_tokens,output_tokens,cached_input_tokens,item_count,status,
         price_version_id,estimated_cost_microusd,started_at,completed_at,created_at
       ) VALUES (?,'production','2026-08-10',?,?,'legal_chat','responses','openai','gpt-test',
         1,100,100,0,0,'succeeded','metrics-price',1000,?,?,?)`,
    ).run(
      `provider-usage-${index}`,
      `metrics-workspace-${index}`,
      `metrics-user-${index}`,
      signupAt,
      "2026-08-10T02:00:00.000Z",
      "2026-08-10T02:00:00.000Z",
    );
  }

  for (let index = 0; index < 40; index += 1) {
    const occurredAt = `2026-08-20T00:00:${String(index).padStart(2, "0")}.000Z`;
    const fallback = index < 20 ? "anthropic_to_openai" : "none";
    sqlite.prepare(
      `INSERT INTO ai_slo_telemetry_events (
         id,environment,correlation_hash,request_kind,auth_kind,answer_mode,reasoning_mode,
         provider,model,outcome,fallback,end_to_end_ms,first_useful_stage,
         first_useful_latency_ms,first_useful_pass,full_response_pass,safe_error_code,
         occurred_at,created_at
       ) VALUES (?,'production',?,'legal_chat','authenticated','short','fast',
         'openai','gpt-test','completed',?,1000,'provider_validated',500,1,1,NULL,?,?)`,
    ).run(
      `slo-${index}`,
      index.toString(16).padStart(64, "0"),
      fallback,
      occurredAt,
      occurredAt,
    );
  }

  for (const provider of ["openai", "anthropic"] as const) {
    for (let index = 0; index < 40; index += 1) {
      const checkedAt = `2026-08-21T00:00:${String(index).padStart(2, "0")}.000Z`;
      sqlite.prepare(
        `INSERT INTO dependency_health_checks (
           id,environment,dependency_key,state,checked_at,latency_ms,safe_error_code,evidence_kind,created_at
         ) VALUES (?,'production',?,?,?,100,NULL,'synthetic_probe',?)`,
      ).run(
        `${provider}-health-${index}`,
        provider,
        index < 10 ? "degraded" : "operational",
        checkedAt,
        checkedAt,
      );
    }
  }

  const dashboard = await readProductMetricsDashboard({
    db: d1,
    environment: "production",
    days: 30,
    now: new Date("2026-09-01T00:00:00.000Z"),
  });
  assert.deepEqual(dashboard.activation, {
    status: "sufficient",
    minimumSampleSize: 10,
    numerator: 20,
    denominator: 30,
    rate: 2 / 3,
  });
  assert.deepEqual(dashboard.workflowProgression, {
    status: "sufficient",
    minimumSampleSize: 10,
    numerator: 10,
    denominator: 20,
    rate: 0.5,
  });
  assert.deepEqual(dashboard.timeToFirstValue, {
    status: "sufficient",
    minimumSampleSize: 10,
    observed: 20,
    p50Ms: 3_600_000,
    p95Ms: 7_200_000,
  });
  assert.deepEqual(dashboard.successfulAnswerCost, {
    status: "sufficient",
    minimumSampleSize: 10,
    completedAnswers: 20,
    pricingComplete: true,
    microusdPerAnswer: 1_000,
  });
  assert.equal(dashboard.aiReliability.completion.rate, 1);
  assert.equal(dashboard.aiReliability.fallback.rate, 0.5);
  assert.deepEqual(
    dashboard.providerAvailability.map((item) => [item.provider, item.currentState, item.availability.rate]),
    [["anthropic", "operational", 0.75], ["openai", "operational", 0.75]],
  );
  assert.doesNotMatch(JSON.stringify(dashboard), /metrics-user|metrics-workspace|metrics-run/);

  sqlite.prepare(
    `INSERT INTO ai_provider_usage_events (
       id,environment,usage_day,workspace_id,user_id,feature,operation,provider,model,
       request_count,input_tokens,output_tokens,cached_input_tokens,item_count,status,
       price_version_id,estimated_cost_microusd,started_at,completed_at,created_at
     ) VALUES ('provider-usage-unpriced','production','2026-08-10','metrics-workspace-0',
       'metrics-user-0','legal_chat','responses','openai','unpriced-model',1,1,1,0,0,
       'succeeded',NULL,NULL,?,?,?)`,
  ).run(signupAt, "2026-08-10T02:00:00.000Z", "2026-08-10T02:00:00.000Z");
  const incompletePricing = await readProductMetricsDashboard({
    db: d1,
    environment: "production",
    days: 30,
    now: new Date("2026-09-01T00:00:00.000Z"),
  });
  assert.deepEqual(incompletePricing.successfulAnswerCost, {
    status: "incomplete_pricing",
    minimumSampleSize: 10,
    completedAnswers: 20,
    pricingComplete: false,
    microusdPerAnswer: null,
  });
});

test("small cohorts are returned without exact counts", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  for (let index = 0; index < 9; index += 1) {
    addUser(sqlite, `small-user-${index}`, "2026-08-10T00:00:00.000Z");
  }
  const dashboard = await readProductMetricsDashboard({
    db: d1,
    environment: "development",
    days: 30,
    now: new Date("2026-09-01T00:00:00.000Z"),
  });
  assert.deepEqual(dashboard.activation, {
    status: "insufficient",
    minimumSampleSize: 10,
    numerator: null,
    denominator: null,
    rate: null,
  });
  assert.equal(JSON.stringify(dashboard).includes("small-user"), false);
  await assert.rejects(
    readProductMetricsDashboard({
      db: d1,
      environment: "development",
      days: 31,
      now: new Date("2026-09-01T00:00:00.000Z"),
    }),
    /PRODUCT_METRICS_WINDOW_INVALID/,
  );
});

test("small positive cohort cells and their complements are privacy-suppressed", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const signupAt = "2026-08-10T00:00:00.000Z";
  for (let index = 0; index < 20; index += 1) {
    addUser(sqlite, `suppressed-user-${index}`, signupAt);
  }
  addWorkspace(sqlite, "suppressed-workspace", signupAt);
  addConversation(
    sqlite,
    "suppressed-conversation",
    "suppressed-workspace",
    "suppressed-user-0",
    signupAt,
  );
  sqlite.prepare(
    `INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at)
     VALUES ('suppressed-response','suppressed-conversation','assistant','Answer',?,?)`,
  ).run(JSON.stringify({ responseKind: "answer" }), "2026-08-10T01:00:00.000Z");
  addAiRun({
    sqlite,
    id: "suppressed-run",
    workspaceId: "suppressed-workspace",
    userId: "suppressed-user-0",
    conversationId: "suppressed-conversation",
    responseMessageId: "suppressed-response",
    status: "completed",
    startedAt: signupAt,
    completedAt: "2026-08-10T01:00:00.000Z",
  });
  sqlite.prepare(
    "INSERT INTO product_value_activations (user_id,ai_run_id,first_completed_at) VALUES (?,?,?)",
  ).run("suppressed-user-0", "suppressed-run", "2026-08-10T01:00:00.000Z");

  const dashboard = await readProductMetricsDashboard({
    db: d1,
    environment: "development",
    days: 30,
    now: new Date("2026-09-01T00:00:00.000Z"),
  });
  assert.deepEqual(dashboard.activation, {
    status: "suppressed",
    minimumSampleSize: 10,
    numerator: null,
    denominator: null,
    rate: null,
  });
});

test("downstream cohort cells cannot reveal a suppressed activation complement", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const signupAt = "2026-08-10T00:00:00.000Z";
  for (let index = 0; index < 21; index += 1) {
    addUser(sqlite, `dependent-user-${index}`, signupAt);
    if (index >= 20) continue;
    const userId = `dependent-user-${index}`;
    const workspaceId = `dependent-workspace-${index}`;
    const conversationId = `dependent-conversation-${index}`;
    const responseMessageId = `dependent-response-${index}`;
    const runId = `dependent-run-${index}`;
    addWorkspace(sqlite, workspaceId, signupAt);
    addConversation(sqlite, conversationId, workspaceId, userId, signupAt);
    sqlite.prepare(
      `INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at)
       VALUES (?,?,'assistant','Answer',?,?)`,
    ).run(
      responseMessageId,
      conversationId,
      JSON.stringify({ responseKind: "answer" }),
      "2026-08-10T01:00:00.000Z",
    );
    addAiRun({
      sqlite,
      id: runId,
      workspaceId,
      userId,
      conversationId,
      responseMessageId,
      status: "completed",
      startedAt: signupAt,
      completedAt: "2026-08-10T01:00:00.000Z",
    });
    sqlite.prepare(
      "INSERT INTO product_value_activations (user_id,ai_run_id,first_completed_at) VALUES (?,?,?)",
    ).run(userId, runId, "2026-08-10T01:00:00.000Z");
    if (index < 10) {
      sqlite.prepare(
        `INSERT INTO cases (id,workspace_id,owner_user_id,account_type,locale,title,legal_area,status,created_at,updated_at)
         VALUES (?,?,?,'individual','ru','Case','contracts','open','2026-08-11T01:00:00.000Z','2026-08-11T01:00:00.000Z')`,
      ).run(`dependent-case-${index}`, workspaceId, userId);
    }
  }

  const dashboard = await readProductMetricsDashboard({
    db: d1,
    environment: "development",
    days: 30,
    now: new Date("2026-09-01T00:00:00.000Z"),
  });
  assert.equal(dashboard.activation.status, "suppressed");
  assert.deepEqual(dashboard.timeToFirstValue, {
    status: "insufficient",
    minimumSampleSize: 10,
    observed: null,
    p50Ms: null,
    p95Ms: null,
  });
  assert.deepEqual(dashboard.workflowProgression, {
    status: "suppressed",
    minimumSampleSize: 10,
    numerator: null,
    denominator: null,
    rate: null,
  });
});

test("admin product metrics stay MFA-gated, no-store, noindex, and locale-complete", () => {
  const route = source("app/api/platform/admin/product-metrics/route.ts");
  const page = source("app/[locale]/admin/product-metrics/page.tsx");
  const consoleSource = source("app/_staff/ProductMetricsConsole.tsx");
  const migration = source("drizzle/0151_product_value_activations.sql");
  const analytics = source("lib/platform/analytics.ts");

  assert.match(route, /staff\.operations\.manage/);
  assert.match(route, /freshMfaWithinMs:\s*15 \* 60 \* 1_000/);
  assert.match(route, /private, no-store/);
  assert.match(page, /index: false, follow: false, nocache: true/);
  assert.match(consoleSource, /Ключевые метрики JURO/);
  assert.match(consoleSource, /JURO asosiy ko‘rsatkichlari/);
  assert.match(migration, /product_value_activations/);
  assert.match(migration, /product_kpi_user_profiles_created_idx/);
  assert.match(migration, /product_kpi_ai_runs_completed_idx/);
  assert.match(migration, /product_kpi_provider_usage_completed_idx/);
  assert.match(migration, /product_kpi_cases_owner_created_idx/);
  assert.match(analytics, /first_legal_answer_completed/);
});
