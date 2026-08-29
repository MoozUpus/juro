import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createScopedCostBudgetPolicyVersion,
  evaluateScopedCostBudgets,
  readScopedCostBudgetDashboard,
  ScopedCostBudgetError,
} from "../lib/ai/scoped-cost-budget";
import { createAiModelPriceVersion, recordProviderUsage } from "../lib/ai/provider-usage";
import { executeOperationalAlertEmail } from "../lib/operations/alert-email";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = "2026-08-29T10:00:00.000Z";

function seed(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]) {
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES ('budget-user','budget@example.test',?,?)")
    .run(now, now);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES ('budget-workspace','individual','Budget',?,?)")
    .run(now, now);
  sqlite.prepare(`INSERT INTO workspace_members
    (id,workspace_id,user_id,role,status,joined_at,created_at,updated_at)
    VALUES ('budget-member','budget-workspace','budget-user','owner','active',?,?,?)`).run(now, now, now);
}

test("0162 enforces feature Deep and user hard budgets with one daily/monthly alert each", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const originalFetch = globalThis.fetch;
  try {
    seed(sqlite);
    await createAiModelPriceVersion({
      db: d1,
      actorUserId: "budget-user",
      now: new Date(now),
      value: {
        provider: "openai",
        model: "gpt-scope-budget-test",
        operation: "responses",
        inputMicrousdPerMillionTokens: 1_000_000,
        outputMicrousdPerMillionTokens: 0,
        cachedInputMicrousdPerMillionTokens: 0,
        effectiveFrom: "2026-08-01T00:00:00.000Z",
        sourceUrl: "https://openai.com/api/pricing/",
      },
    });
    await createScopedCostBudgetPolicyVersion({
      db: d1,
      environment: "development",
      actorUserId: "budget-user",
      now: new Date(now),
      value: {
        scopeType: "feature",
        scopeKey: "legal_chat",
        dailyCostLimitMicrousd: 100,
        monthlyCostLimitMicrousd: 1_000,
        action: "disable_deep",
        enabled: true,
        effectiveFrom: "2026-08-29T09:00:00.000Z",
      },
    });
    await recordProviderUsage({
      db: d1,
      environment: "development",
      workspaceId: "budget-workspace",
      userId: "budget-user",
      feature: "legal_chat",
      operation: "responses",
      provider: "openai",
      model: "gpt-scope-budget-test",
      inputTokens: 100,
      status: "succeeded",
      startedAt: "2026-08-29T09:59:59.000Z",
      completedAt: now,
      eventId: "scope-budget-usage-1",
    });

    await assert.rejects(
      () => evaluateScopedCostBudgets({
        db: d1,
        environment: "development",
        feature: "legal_chat",
        userId: "budget-user",
        reasoningMode: "deep",
        now,
      }),
      (error: unknown) => error instanceof ScopedCostBudgetError
        && error.code === "AI_COST_DEEP_DISABLED"
        && error.scopeType === "feature",
    );
    const balanced = await evaluateScopedCostBudgets({
      db: d1,
      environment: "development",
      feature: "legal_chat",
      userId: "budget-user",
      reasoningMode: "balanced",
      now,
    });
    assert.equal(balanced[0]?.dailyLimitReached, true);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM ai_scope_budget_events").get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM ai_scope_budget_alert_jobs").get() as { count: number }).count, 1);

    await createScopedCostBudgetPolicyVersion({
      db: d1,
      environment: "development",
      actorUserId: "budget-user",
      now: new Date(now),
      value: {
        scopeType: "user",
        scopeKey: "budget-user",
        dailyCostLimitMicrousd: 50,
        monthlyCostLimitMicrousd: 100,
        action: "block_calls",
        enabled: true,
        effectiveFrom: "2026-08-29T09:30:00.000Z",
      },
    });
    await assert.rejects(
      () => evaluateScopedCostBudgets({
        db: d1,
        environment: "development",
        feature: "legal_chat",
        userId: "budget-user",
        reasoningMode: "balanced",
        now,
      }),
      (error: unknown) => error instanceof ScopedCostBudgetError
        && error.code === "AI_COST_BUDGET_EXHAUSTED"
        && error.scopeType === "user",
    );
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM ai_scope_budget_events").get() as { count: number }).count, 3);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM ai_scope_budget_alert_jobs").get() as { count: number }).count, 3);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM job_outbox WHERE idempotency_key LIKE 'scope_budget_alert_%'").get() as { count: number }).count, 3);

    const dashboard = await readScopedCostBudgetDashboard({
      db: d1,
      environment: "development",
      now: new Date(now),
    });
    assert.equal(dashboard.scopeBudgetStatuses.length, 2);
    assert.equal(dashboard.scopeBudgetEvents.some((event) => event.periodType === "daily"), true);
    assert.equal(dashboard.scopeBudgetEvents.some((event) => event.periodType === "monthly"), true);

    const alert = sqlite.prepare(
      "SELECT id FROM ai_scope_budget_alert_jobs WHERE scope_type='feature' LIMIT 1",
    ).get() as { id: string };
    let deliveryCalls = 0;
    globalThis.fetch = async (_input, init) => {
      deliveryCalls += 1;
      const body = JSON.parse(String(init?.body)) as { to: string[]; subject: string; html: string };
      assert.deepEqual(body.to, ["ops@example.test"]);
      assert.match(body.subject, /AI budget: feature daily/);
      assert.match(body.html, /legal_chat/);
      assert.doesNotMatch(body.html, /budget@example\.test|Budget/);
      return Response.json({ id: "resend_scope_budget_1" });
    };
    const env = {
      DB: d1,
      RESEND_API_KEY: "synthetic-resend-key",
      EMAIL_FROM: "JURO <no-reply@juro.uz>",
      OPERATIONS_ALERT_EMAIL: "ops@example.test",
    };
    assert.deepEqual(await executeOperationalAlertEmail(env, alert.id), {
      providerMessageId: "resend_scope_budget_1",
      alreadySent: false,
    });
    assert.deepEqual(await executeOperationalAlertEmail(env, alert.id), {
      providerMessageId: "resend_scope_budget_1",
      alreadySent: true,
    });
    assert.equal(deliveryCalls, 1);
    assert.throws(
      () => sqlite.prepare("UPDATE ai_scope_budget_policy_versions SET enabled=0").run(),
      /AI_SCOPE_BUDGET_POLICY_IMMUTABLE/,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM ai_scope_budget_events").run(),
      /AI_SCOPE_BUDGET_EVENT_IMMUTABLE/,
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("0162 reports unpriced scoped usage without inventing cost", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    await createScopedCostBudgetPolicyVersion({
      db: d1,
      environment: "development",
      actorUserId: "budget-user",
      now: new Date(now),
      value: {
        scopeType: "feature",
        scopeKey: "document_search",
        dailyCostLimitMicrousd: 100,
        monthlyCostLimitMicrousd: 1_000,
        action: "block_calls",
        enabled: true,
        effectiveFrom: "2026-08-29T09:00:00.000Z",
      },
    });
    await recordProviderUsage({
      db: d1,
      environment: "development",
      workspaceId: "budget-workspace",
      userId: "budget-user",
      feature: "document_search",
      operation: "embeddings",
      provider: "openai",
      model: "unpriced-model",
      inputTokens: 40,
      status: "succeeded",
      startedAt: "2026-08-29T09:59:59.000Z",
      completedAt: now,
      eventId: "scope-budget-unpriced-1",
    });
    const status = await evaluateScopedCostBudgets({
      db: d1,
      environment: "development",
      feature: "document_search",
      userId: "budget-user",
      reasoningMode: null,
      now,
    });
    assert.equal(status[0]?.pricingIncomplete, true);
    assert.equal(status[0]?.dailyCostMicrousd, 0);
    assert.equal(status[0]?.dailyLimitReached, false);
    const event = sqlite.prepare(
      "SELECT reason,observed_value AS observedValue,threshold_value AS thresholdValue FROM ai_scope_budget_events",
    ).get() as Record<string, unknown>;
    assert.deepEqual({ ...event }, {
      reason: "unpriced_usage",
      observedValue: 1,
      thresholdValue: null,
    });
  } finally {
    sqlite.close();
  }
});

test("0162 scoped budgets guard real cost-bearing routes and remain staff controlled", () => {
  const legalChat = readFileSync(new URL("../app/api/platform/ai/route.ts", import.meta.url), "utf8");
  const guestChat = readFileSync(new URL("../app/api/guest/ai/route.ts", import.meta.url), "utf8");
  const analysis = readFileSync(new URL("../lib/document-analysis/processor.ts", import.meta.url), "utf8");
  const vectors = readFileSync(new URL("../lib/document-analysis/user-document-vectors.ts", import.meta.url), "utf8");
  const adminRoute = readFileSync(new URL("../app/api/platform/admin/costs/route.ts", import.meta.url), "utf8");
  const adminClient = readFileSync(new URL("../app/_staff/CostConsole.tsx", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../worker/platform-jobs.ts", import.meta.url), "utf8");

  for (const source of [legalChat, guestChat, analysis, vectors]) {
    assert.match(source, /evaluateScopedCostBudgets/);
  }
  assert.match(legalChat, /reasoningMode/);
  assert.match(adminRoute, /action: z\.literal\("scope_policy"\)/);
  assert.match(adminRoute, /freshMfaWithinMs: 15 \* 60 \* 1000/);
  assert.match(adminClient, /action: "scope_policy"/);
  assert.match(adminClient, /disable_deep/);
  assert.match(worker, /ai_scope_budget_alert_jobs/);
});
