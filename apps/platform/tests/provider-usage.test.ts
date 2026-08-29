import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createAiModelPriceVersion,
  ProviderUsageError,
  readAiCostDashboard,
  recordProviderUsage,
} from "../lib/ai/provider-usage";
import { platformStaffRoleAllows } from "../lib/auth/staff-access";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = "2026-08-04T12:00:00.000Z";

function seed(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]) {
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES ('cost-user','cost@example.test',?,?)")
    .run(now, now);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES ('cost-workspace','individual','Cost',?,?)")
    .run(now, now);
  sqlite.prepare(`INSERT INTO workspace_members
    (id,workspace_id,user_id,role,status,joined_at,created_at,updated_at)
    VALUES ('cost-member','cost-workspace','cost-user','owner','active',?,?,?)`).run(now, now, now);
}

test("system-scoped guest usage accepts null tenant identities and remains cost-accounted", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    await createAiModelPriceVersion({
      db: d1,
      actorUserId: "cost-user",
      now: new Date(now),
      value: {
        provider: "anthropic",
        model: "guest-cost-test",
        operation: "messages",
        inputMicrousdPerMillionTokens: 1_000_000,
        outputMicrousdPerMillionTokens: 2_000_000,
        cachedInputMicrousdPerMillionTokens: 0,
        effectiveFrom: "2026-08-01T00:00:00.000Z",
        sourceUrl: "https://www.anthropic.com/pricing",
      },
    });
    const result = await recordProviderUsage({
      db: d1,
      environment: "development",
      workspaceId: null,
      userId: null,
      feature: "guest_legal_chat",
      operation: "messages",
      provider: "anthropic",
      model: "guest-cost-test",
      inputTokens: 100,
      outputTokens: 50,
      status: "succeeded",
      startedAt: "2026-08-04T11:59:59.000Z",
      completedAt: now,
      eventId: "guest-system-usage",
    });
    assert.equal(result.estimatedCostMicrousd, 200);
    const row = sqlite.prepare(
      "SELECT workspace_id AS workspaceId,user_id AS userId,scope_key AS scopeKey FROM ai_cost_daily_aggregates WHERE feature='guest_legal_chat'",
    ).get() as { workspaceId: string | null; userId: string | null; scopeKey: string };
    assert.equal(row.workspaceId, null);
    assert.equal(row.userId, null);
    assert.equal(row.scopeKey, "system");
  } finally {
    sqlite.close();
  }
});

test("0163 accounts Anthropic 5-minute cache writes without storing cached content", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    await createAiModelPriceVersion({
      db: d1,
      actorUserId: "cost-user",
      now: new Date(now),
      value: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        operation: "messages",
        inputMicrousdPerMillionTokens: 3_000_000,
        outputMicrousdPerMillionTokens: 15_000_000,
        cachedInputMicrousdPerMillionTokens: 300_000,
        effectiveFrom: "2026-08-01T00:00:00.000Z",
        sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
      },
    });
    const result = await recordProviderUsage({
      db: d1,
      environment: "development",
      workspaceId: "cost-workspace",
      userId: "cost-user",
      feature: "legal_chat",
      operation: "messages",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      inputTokens: 3_000,
      cachedInputTokens: 1_000,
      cacheCreationInputTokens: 1_000,
      status: "succeeded",
      startedAt: now,
      completedAt: now,
      eventId: "usage-anthropic-cache-write",
    });
    assert.equal(result.estimatedCostMicrousd, 7_050);
    assert.deepEqual({ ...(sqlite.prepare(
      `SELECT input_tokens AS inputTokens,cached_input_tokens AS cachedInputTokens,
        cache_creation_input_tokens AS cacheCreationInputTokens,estimated_cost_microusd AS cost
       FROM ai_provider_usage_events WHERE id='usage-anthropic-cache-write'`,
    ).get() as Record<string, unknown>) }, {
      inputTokens: 3_000,
      cachedInputTokens: 1_000,
      cacheCreationInputTokens: 1_000,
      cost: 7_050,
    });
    assert.equal(
      (sqlite.prepare(
        "SELECT cache_creation_input_tokens AS value FROM ai_cost_daily_aggregates WHERE feature='legal_chat'",
      ).get() as { value: number }).value,
      1_000,
    );
    const columns = (sqlite.prepare("PRAGMA table_info(ai_provider_usage_events)").all() as Array<{ name: string }>)
      .map((column) => column.name);
    assert.equal(columns.includes("cache_creation_input_tokens"), true);
  } finally {
    sqlite.close();
  }
});

test("0081 records priced and failed provider calls exactly once without content", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    const price = await createAiModelPriceVersion({
      db: d1,
      actorUserId: "cost-user",
      now: new Date(now),
      value: {
        provider: "openai",
        model: "text-embedding-3-large",
        operation: "embeddings",
        inputMicrousdPerMillionTokens: 130_000,
        outputMicrousdPerMillionTokens: 0,
        cachedInputMicrousdPerMillionTokens: 0,
        effectiveFrom: "2026-08-01T00:00:00.000Z",
        sourceUrl: "https://openai.com/api/pricing/",
      },
    });
    const success = await recordProviderUsage({
      db: d1,
      environment: "development",
      workspaceId: "cost-workspace",
      userId: "cost-user",
      feature: "document_search",
      operation: "embeddings",
      provider: "openai",
      model: "text-embedding-3-large",
      providerRequestId: "req_cost_1",
      inputTokens: 1_000,
      itemCount: 1,
      dimensions: 1_536,
      status: "succeeded",
      startedAt: "2026-08-04T11:59:59.000Z",
      completedAt: now,
      eventId: "usage-cost-success",
    });
    assert.equal(success.priceVersionId, price.id);
    assert.equal(success.estimatedCostMicrousd, 130);

    await recordProviderUsage({
      db: d1,
      environment: "development",
      workspaceId: "cost-workspace",
      userId: "cost-user",
      feature: "document_search",
      operation: "embeddings",
      provider: "openai",
      model: "text-embedding-3-large",
      inputTokens: 0,
      itemCount: 1,
      dimensions: 1_536,
      status: "failed",
      errorCode: "PROVIDER_HTTP_429",
      startedAt: now,
      completedAt: "2026-08-04T12:00:01.000Z",
      eventId: "usage-cost-failure",
    });

    const rows = (sqlite.prepare(
      `SELECT status,input_tokens AS inputTokens,estimated_cost_microusd AS cost,
        provider_request_id AS requestId,error_code AS errorCode
       FROM ai_provider_usage_events ORDER BY completed_at`,
    ).all() as Array<Record<string, unknown>>).map((row) => ({ ...row }));
    assert.deepEqual(rows, [
      { status: "succeeded", inputTokens: 1_000, cost: 130, requestId: "req_cost_1", errorCode: null },
      { status: "failed", inputTokens: 0, cost: null, requestId: null, errorCode: "PROVIDER_HTTP_429" },
    ]);
    const aggregate = { ...(sqlite.prepare(
      `SELECT request_count AS requests,failed_request_count AS failures,input_tokens AS inputTokens,
        estimated_cost_microusd AS cost,unpriced_request_count AS unpriced
       FROM ai_cost_daily_aggregates`,
    ).get() as Record<string, unknown>) };
    assert.deepEqual(aggregate, { requests: 2, failures: 1, inputTokens: 1_000, cost: 130, unpriced: 0 });

    await assert.rejects(
      () => recordProviderUsage({
        db: d1,
        environment: "development",
        workspaceId: "cost-workspace",
        userId: "cost-user",
        feature: "document_search",
        operation: "embeddings",
        provider: "openai",
        model: "text-embedding-3-large",
        inputTokens: 1_000,
        status: "succeeded",
        startedAt: now,
        completedAt: now,
        eventId: "usage-cost-success",
      }),
      (error: unknown) => error instanceof ProviderUsageError && error.code === "PROVIDER_USAGE_PERSISTENCE_FAILED",
    );
    assert.equal((sqlite.prepare("SELECT request_count AS count FROM ai_cost_daily_aggregates").get() as { count: number }).count, 2);

    assert.throws(
      () => sqlite.prepare("UPDATE ai_provider_usage_events SET input_tokens=5 WHERE id='usage-cost-success'").run(),
      /AI_PROVIDER_USAGE_EVENT_IMMUTABLE/,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM ai_model_price_versions WHERE id=?").run(price.id),
      /AI_MODEL_PRICE_VERSION_IMMUTABLE/,
    );
    const usageColumns = (sqlite.prepare("PRAGMA table_info(ai_provider_usage_events)").all() as Array<{ name: string }>)
      .map((column) => column.name);
    for (const forbidden of ["prompt", "answer", "document_text", "filename", "email", "phone"]) {
      assert.equal(usageColumns.includes(forbidden), false);
    }
    sqlite.prepare("DELETE FROM workspace_members WHERE workspace_id='cost-workspace'").run();
    sqlite.prepare("DELETE FROM workspaces WHERE id='cost-workspace'").run();
    sqlite.prepare("DELETE FROM user_profiles WHERE id='cost-user'").run();
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM ai_provider_usage_events").get() as { count: number }).count, 2);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM ai_model_price_versions").get() as { count: number }).count, 1);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("0081 cost admin boundary is administrator-only, fresh-MFA-gated and CSRF-protected", () => {
  const route = readFileSync(new URL("../app/api/platform/admin/costs/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/[locale]/admin/costs/page.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../app/_staff/CostConsole.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0081_provider_cost_observability.sql", import.meta.url), "utf8");

  assert.equal(platformStaffRoleAllows("administrator", "staff.operations.manage"), true);
  assert.equal(platformStaffRoleAllows("support", "staff.operations.manage"), false);
  assert.equal(platformStaffRoleAllows("legal_reviewer", "staff.operations.manage"), false);
  assert.match(route, /requirePlatformStaffRequest\(request, "staff\.operations\.manage", \{ freshMfaWithinMs: 15 \* 60 \* 1000 \}\)/);
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.match(page, /requirePlatformStaffAccess\(runtime\.DB, session, "staff\.operations\.manage", \{ now, freshMfaWithinMs: 15 \* 60 \* 1000 \}\)/);
  assert.match(page, /robots: \{ index: false, follow: false, nocache: true \}/);
  assert.match(client, /"x-juro-csrf": "1"/);
  assert.match(client, /data\.measurement\.pricingCoverageBps/);
  assert.match(client, /data\.priceVerification\.historicalMispricedRequestCount/);
  assert.match(client, /pricing_mismatch/);
  assert.match(client, /data\.operational\.cacheHitRateBps/);
  assert.match(client, /data\.operational\.cacheCreationInputTokens/);
  assert.match(client, /data\.operational\.deepEscalationRateBps/);
  assert.match(client, /data\.byPlan\.map/);
  assert.match(client, /data\.byUser\.map/);
  assert.match(client, /planSnapshot/);
  assert.match(client, /protectionMissingDetail/);
  assert.doesNotMatch(client, /dangerouslySetInnerHTML|transition:\s*all/);
  assert.match(migration, /ai_provider_usage_events_no_update/);
  assert.match(migration, /ai_provider_usage_events_no_delete/);
});

test("0081 price sources are provider-bound and dashboard reports unpriced calls", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    await assert.rejects(
      () => createAiModelPriceVersion({
        db: d1,
        actorUserId: "cost-user",
        now: new Date(now),
        value: {
          provider: "openai",
          model: "text-embedding-3-large",
          operation: "embeddings",
          inputMicrousdPerMillionTokens: 1,
          effectiveFrom: now,
          sourceUrl: "https://example.com/pricing",
        },
      }),
      (error: unknown) => error instanceof ProviderUsageError && error.code === "PROVIDER_USAGE_INVALID",
    );
    const anthropicPrice = await createAiModelPriceVersion({
      db: d1,
      actorUserId: "cost-user",
      now: new Date(now),
      value: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        operation: "messages",
        inputMicrousdPerMillionTokens: 3_000_000,
        outputMicrousdPerMillionTokens: 15_000_000,
        cachedInputMicrousdPerMillionTokens: 300_000,
        effectiveFrom: now,
        sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
      },
    });
    assert.ok(anthropicPrice.id);
    await recordProviderUsage({
      db: d1,
      environment: "staging",
      workspaceId: "cost-workspace",
      userId: "cost-user",
      feature: "document_indexing",
      operation: "embeddings",
      provider: "openai",
      model: "text-embedding-3-large",
      inputTokens: 25,
      itemCount: 2,
      dimensions: 1_536,
      status: "succeeded",
      startedAt: now,
      completedAt: now,
      eventId: "usage-unpriced",
    });
    const dashboard = await readAiCostDashboard({ db: d1, environment: "staging", now: new Date(now) });
    assert.equal(dashboard.prices.length, 1);
    assert.equal(dashboard.daily.length, 1);
    assert.equal(dashboard.unpricedEvents, 1);
    assert.deepEqual(dashboard.measurement, {
      windowStart: now,
      windowEnd: now,
      firstEventAt: now,
      lastEventAt: now,
      successfulRequests: 1,
      failedRequests: 0,
      pricedSuccessfulRequests: 0,
      unpricedSuccessfulRequests: 1,
      pricingCoverageBps: 0,
      estimatedCostMicrousd: 0,
      costPerPricedSuccessMicrousd: null,
      minimumPricedSuccessfulRequests: 30,
      status: "incomplete_pricing",
    });
  } finally {
    sqlite.close();
  }
});

test("AI cost dashboard reports current-plan, user, cache and legal-chat escalation metrics without content", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    sqlite.prepare(
      `INSERT INTO subscriptions
       (id,workspace_id,provider,plan_code,status,created_at,updated_at)
       VALUES ('cost-subscription','cost-workspace','sandbox','professional','active',?,?)`,
    ).run(now, now);
    await createAiModelPriceVersion({
      db: d1,
      actorUserId: "cost-user",
      now: new Date(now),
      value: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        operation: "messages",
        inputMicrousdPerMillionTokens: 3_000_000,
        outputMicrousdPerMillionTokens: 15_000_000,
        cachedInputMicrousdPerMillionTokens: 300_000,
        effectiveFrom: now,
        sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
      },
    });
    await recordProviderUsage({
      db: d1,
      environment: "production",
      workspaceId: "cost-workspace",
      userId: "cost-user",
      feature: "legal_chat",
      operation: "messages",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      inputTokens: 1_000,
      outputTokens: 200,
      cachedInputTokens: 500,
      status: "succeeded",
      startedAt: now,
      completedAt: now,
      eventId: "usage-observability-cached",
    });
    await recordProviderUsage({
      db: d1,
      environment: "production",
      workspaceId: "cost-workspace",
      userId: "cost-user",
      feature: "legal_chat",
      operation: "messages",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      inputTokens: 1_000,
      outputTokens: 100,
      status: "succeeded",
      startedAt: now,
      completedAt: now,
      eventId: "usage-observability-uncached",
    });
    await recordProviderUsage({
      db: d1,
      environment: "production",
      workspaceId: "cost-workspace",
      userId: "cost-user",
      feature: "legal_chat",
      operation: "messages",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      inputTokens: 0,
      status: "failed",
      errorCode: "PROVIDER_HTTP_429",
      startedAt: now,
      completedAt: now,
      eventId: "usage-observability-failed",
    });
    const insertRun = sqlite.prepare(
      `INSERT INTO ai_runs
       (id,workspace_id,user_id,idempotency_key,correlation_id,provider,model,
        fallback_from_provider,answer_mode,reasoning_mode,status,legal_database_as_of,
        instruction_hash,source_version_hash,input_tokens,output_tokens,cached_input_tokens,
        attempt_count,latency_ms,started_at,completed_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,'completed',?,?,?,?,?,?,1,0,?,?,?,?)`,
    );
    insertRun.run(
      "cost-run-deep", "cost-workspace", "cost-user", "cost-run-deep", "cost-correlation-deep",
      "anthropic", "claude-sonnet-4-6", "openai", "detailed", "deep", now,
      "instruction-hash", "source-hash", 1_000, 200, 500, now, now, now, now,
    );
    insertRun.run(
      "cost-run-balanced", "cost-workspace", "cost-user", "cost-run-balanced", "cost-correlation-balanced",
      "anthropic", "claude-sonnet-4-6", null, "short", "balanced", now,
      "instruction-hash", "source-hash", 1_000, 100, 0, now, now, now, now,
    );

    const dashboard = await readAiCostDashboard({ db: d1, environment: "production", now: new Date(now) });
    assert.equal(dashboard.planSnapshotAt, now);
    assert.deepEqual(dashboard.byUser.map((row) => ({ ...row })), [{
      workspaceId: "cost-workspace",
      userId: "cost-user",
      currentPlanCode: "professional",
      requestCount: 3,
      failedRequestCount: 1,
      inputTokens: 2_000,
      outputTokens: 300,
      cachedInputTokens: 500,
      cacheCreationInputTokens: 0,
      estimatedCostMicrousd: 9_150,
      unpricedRequestCount: 0,
    }]);
    assert.deepEqual(dashboard.byPlan.map((row) => ({ ...row })), [{
      attribution: "subscription",
      planCode: "professional",
      userCount: 1,
      requestCount: 3,
      failedRequestCount: 1,
      estimatedCostMicrousd: 9_150,
      unpricedRequestCount: 0,
    }]);
    assert.deepEqual(dashboard.operational, {
      providerRequests: 3,
      providerFailures: 1,
      providerFailureRateBps: 3_333,
      averageProviderLatencyMs: 0,
      cacheEligibleRequests: 2,
      cacheHitRequests: 1,
      cacheHitRateBps: 5_000,
      inputTokens: 2_000,
      cachedInputTokens: 500,
      cacheCreationInputTokens: 0,
      cachedInputTokenShareBps: 2_500,
      completedLegalChatRuns: 2,
      deepEscalationCount: 1,
      deepEscalationRateBps: 5_000,
      providerFallbackCount: 1,
      providerFallbackRateBps: 5_000,
    });
  } finally {
    sqlite.close();
  }
});

test("0081 cost measurement becomes ready only after a complete priced sample", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    await createAiModelPriceVersion({
      db: d1,
      actorUserId: "cost-user",
      now: new Date(now),
      value: {
        provider: "openai",
        model: "text-embedding-3-large",
        operation: "embeddings",
        inputMicrousdPerMillionTokens: 130_000,
        effectiveFrom: now,
        sourceUrl: "https://openai.com/api/pricing/",
      },
    });
    for (let index = 0; index < 29; index += 1) {
      const completedAt = new Date(Date.parse(now) + index * 1_000).toISOString();
      await recordProviderUsage({
        db: d1,
        environment: "production",
        workspaceId: "cost-workspace",
        userId: "cost-user",
        feature: "document_search",
        operation: "embeddings",
        provider: "openai",
        model: "text-embedding-3-large",
        inputTokens: 1_000,
        itemCount: 1,
        dimensions: 1_536,
        status: "succeeded",
        startedAt: completedAt,
        completedAt,
        eventId: `usage-ready-${index}`,
      });
    }
    const insufficient = await readAiCostDashboard({
      db: d1,
      environment: "production",
      now: new Date(Date.parse(now) + 29_000),
    });
    assert.equal(insufficient.measurement.status, "insufficient_sample");
    assert.equal(insufficient.measurement.pricedSuccessfulRequests, 29);
    assert.equal(insufficient.measurement.pricingCoverageBps, 10_000);

    const completedAt = new Date(Date.parse(now) + 30_000).toISOString();
    await recordProviderUsage({
      db: d1,
      environment: "production",
      workspaceId: "cost-workspace",
      userId: "cost-user",
      feature: "document_search",
      operation: "embeddings",
      provider: "openai",
      model: "text-embedding-3-large",
      inputTokens: 1_000,
      itemCount: 1,
      dimensions: 1_536,
      status: "succeeded",
      startedAt: completedAt,
      completedAt,
      eventId: "usage-ready-29",
    });
    const ready = await readAiCostDashboard({
      db: d1,
      environment: "production",
      now: new Date(Date.parse(now) + 31_000),
    });
    assert.equal(ready.measurement.status, "ready");
    assert.equal(ready.measurement.pricedSuccessfulRequests, 30);
    assert.equal(ready.measurement.unpricedSuccessfulRequests, 0);
    assert.equal(ready.measurement.estimatedCostMicrousd, 3_900);
    assert.equal(ready.measurement.costPerPricedSuccessMicrousd, 130);
  } finally {
    sqlite.close();
  }
});

test("cost measurement rejects a historically used price that conflicts with the verified effective rate", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    await createAiModelPriceVersion({
      db: d1,
      actorUserId: "cost-user",
      now: new Date("2026-08-25T07:44:49.444Z"),
      value: {
        provider: "openai",
        model: "gpt-5.6-terra",
        operation: "responses",
        inputMicrousdPerMillionTokens: 2_500_000,
        outputMicrousdPerMillionTokens: 15_000_000,
        cachedInputMicrousdPerMillionTokens: 250_000,
        effectiveFrom: "2026-08-25T07:44:49.444Z",
        sourceUrl: "https://platform.openai.com/pricing",
      },
    });
    await recordProviderUsage({
      db: d1,
      environment: "production",
      workspaceId: "cost-workspace",
      userId: "cost-user",
      feature: "legal_chat",
      operation: "responses",
      provider: "openai",
      model: "gpt-5.6-terra",
      inputTokens: 1_000,
      outputTokens: 100,
      status: "succeeded",
      startedAt: "2026-08-25T08:00:00.000Z",
      completedAt: "2026-08-25T08:00:01.000Z",
      eventId: "usage-stale-terra-price",
    });
    const dashboard = await readAiCostDashboard({
      db: d1,
      environment: "production",
      now: new Date("2026-08-29T12:00:00.000Z"),
    });
    assert.equal(dashboard.measurement.status, "pricing_mismatch");
    assert.equal(dashboard.priceVerification.status, "needs_review");
    assert.equal(dashboard.priceVerification.historicalMispricedRequestCount, 1);
    assert.equal(
      dashboard.priceVerification.checks.find((check) => check.model === "gpt-5.6-terra")?.status,
      "rate_mismatch",
    );
  } finally {
    sqlite.close();
  }
});
