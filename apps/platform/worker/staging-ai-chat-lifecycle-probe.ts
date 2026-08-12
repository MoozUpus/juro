import {
  enforceLegalChatSourceBoundary,
  parseLegalChatResponse,
} from "../lib/ai/legal-chat-schema";
import { aiProviderStatus, legalAiProvider } from "../lib/ai/provider";
import {
  beginAiRunFinalization,
  completeAiRunStatements,
  failAiRun,
  reserveAiRun,
  sha256Json,
} from "../lib/ai/run-store";
import {
  createAiExecutionBudget,
  type AiExecutionBudget,
} from "../lib/ai/execution-budget";
import { isoNow } from "../lib/document-builder/storage/db";
import type { PlatformJobEnv } from "./platform-jobs";

const PROBE_VERSION = "v27";
export const STAGING_AI_CHAT_PROBE_EXECUTION_BUDGET_MS = 30_000;
const STAGING_AI_CHAT_PROBE_PROVIDER_TIMEOUT_MS = 25_500;
const STAGING_AI_CHAT_PROBE_POST_PROVIDER_RESERVE_MS = 2_000;

export type ProbeLocale = "ru" | "uz";

type SyntheticIds = {
  userId: string;
  workspaceId: string;
  membershipId: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  branchId: string;
  messageVersionId: string;
  auditId: string;
  idempotencyKey: string;
  registryKey: string;
};

type ScenarioEvidence = {
  model: string;
  providerResponseId: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  latencyMs: number;
  attempts: number;
  providerTtftMs: number | null;
  firstUsefulLatencyMs: number;
  validationLatencyMs: number;
  persistenceLatencyMs: number;
};

export type StagingAiChatLifecycleProbeOptions = {
  /** Opaque UUID shared with the rolling provider-probe execution. */
  executionId?: string;
  /** Deterministically selects RU or UZ from the opaque execution ID when omitted. */
  locale?: ProbeLocale;
  /** One absolute deadline shared with the sibling Anthropic probe. */
  budget?: AiExecutionBudget;
  /** Content-free callbacks used only for SLO telemetry. */
  onProviderPrepared?: (input: { model: string }) => void | Promise<void>;
};

export class StagingAiChatLifecycleProbeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "StagingAiChatLifecycleProbeError";
    this.code = code;
  }
}

export function stagingAiChatLifecycleProbeEnabled(
  env: Pick<PlatformJobEnv, "APP_ENV" | "STAGING_SYNTHETIC_PROBES_ENABLED">,
): boolean {
  return env.APP_ENV === "staging"
    && (env as Record<string, unknown>).STAGING_SYNTHETIC_PROBES_ENABLED === "true";
}

function normalizedExecutionId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new StagingAiChatLifecycleProbeError("STAGING_AI_CHAT_EXECUTION_ID_INVALID");
  }
  return value.toLowerCase();
}

/** Deterministically rotates locale coverage without persisting a user-like counter. */
export function stagingAiChatProbeLocaleForExecution(executionId: string): ProbeLocale {
  const normalized = normalizedExecutionId(executionId).replaceAll("-", "");
  const lastNibble = Number.parseInt(normalized.at(-1) ?? "0", 16);
  return lastNibble % 2 === 0 ? "ru" : "uz";
}

export function stagingAiChatSyntheticIds(
  locale: ProbeLocale,
  executionId = "legacy",
): SyntheticIds {
  const prefix = `staging-ai-chat-${PROBE_VERSION}-${locale}-${executionId}`;
  const userId = `${prefix}-user`;
  const workspaceId = `${prefix}-workspace`;
  const idempotencyKey = `${prefix}-request`;
  return {
    userId,
    workspaceId,
    membershipId: `${prefix}-membership`,
    conversationId: `${prefix}-conversation`,
    userMessageId: `${prefix}-user-message`,
    assistantMessageId: `${prefix}-assistant-message`,
    branchId: `${prefix}-branch`,
    messageVersionId: `${prefix}-message-version`,
    auditId: `${prefix}-audit`,
    idempotencyKey,
    registryKey: `legal-chat:${workspaceId}:${userId}:${idempotencyKey}`,
  };
}

async function cleanupSyntheticScenario(db: D1Database, ids: SyntheticIds): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM confirmed_facts WHERE conversation_id=?").bind(ids.conversationId),
    db.prepare("DELETE FROM ai_usage_ledger WHERE workspace_id=? AND user_id=?").bind(ids.workspaceId, ids.userId),
    db.prepare("DELETE FROM ai_runs WHERE workspace_id=? AND user_id=?").bind(ids.workspaceId, ids.userId),
    db.prepare("DELETE FROM idempotency_keys WHERE key=? AND scope=?").bind(
      ids.registryKey,
      `legal-chat:${ids.workspaceId}:${ids.userId}`,
    ),
    db.prepare("DELETE FROM conversations WHERE id=? AND workspace_id=? AND owner_user_id=?").bind(
      ids.conversationId,
      ids.workspaceId,
      ids.userId,
    ),
    db.prepare("DELETE FROM workspace_audit_events WHERE workspace_id=? AND actor_user_id=?").bind(
      ids.workspaceId,
      ids.userId,
    ),
    db.prepare("DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?").bind(ids.workspaceId, ids.userId),
    db.prepare("UPDATE user_profiles SET default_workspace_id=NULL WHERE id=? AND default_workspace_id=?").bind(
      ids.userId,
      ids.workspaceId,
    ),
    db.prepare("DELETE FROM workspaces WHERE id=?").bind(ids.workspaceId),
    db.prepare("DELETE FROM user_profiles WHERE id=?").bind(ids.userId),
  ]);
}

async function assertSyntheticScenarioRemoved(db: D1Database, ids: SyntheticIds): Promise<void> {
  const row = await db.prepare(`
    SELECT
      (SELECT count(*) FROM user_profiles WHERE id=?) +
      (SELECT count(*) FROM workspaces WHERE id=?) +
      (SELECT count(*) FROM conversations WHERE id=?) +
      (SELECT count(*) FROM confirmed_facts WHERE conversation_id=?) +
      (SELECT count(*) FROM ai_runs WHERE workspace_id=? AND user_id=?) +
      (SELECT count(*) FROM ai_usage_ledger WHERE workspace_id=? AND user_id=?) +
      (SELECT count(*) FROM idempotency_keys WHERE key=?) AS remaining
  `).bind(
    ids.userId,
    ids.workspaceId,
    ids.conversationId,
    ids.conversationId,
    ids.workspaceId,
    ids.userId,
    ids.workspaceId,
    ids.userId,
    ids.registryKey,
  ).first<{ remaining: number }>();
  if (Number(row?.remaining ?? -1) !== 0) {
    throw new StagingAiChatLifecycleProbeError("STAGING_AI_CHAT_CLEANUP_FAILED");
  }
}

async function prepareSyntheticScenario(
  db: D1Database,
  ids: SyntheticIds,
  locale: ProbeLocale,
  now: string,
): Promise<void> {
  await cleanupSyntheticScenario(db, ids);
  await assertSyntheticScenarioRemoved(db, ids);
  await db.batch([
    db.prepare(`
      INSERT INTO user_profiles (
        id,email,full_name,locale,lifecycle_status,created_at,updated_at
      ) VALUES (?,?,?,?,'active',?,?)
    `).bind(
      ids.userId,
      `${ids.userId}@example.test`,
      "JURO synthetic AI chat probe",
      locale,
      now,
      now,
    ),
    db.prepare(`
      INSERT INTO workspaces (
        id,type,name,locale,created_at,updated_at
      ) VALUES (?,'individual','JURO synthetic AI chat probe',?,?,?)
    `).bind(ids.workspaceId, locale, now, now),
    db.prepare(`
      INSERT INTO workspace_members (
        id,workspace_id,user_id,role,status,joined_at,created_at,updated_at
      ) VALUES (?,?,?,'owner','active',?,?,?)
    `).bind(ids.membershipId, ids.workspaceId, ids.userId, now, now, now),
    db.prepare("UPDATE user_profiles SET default_workspace_id=? WHERE id=?").bind(ids.workspaceId, ids.userId),
  ]);
}

function question(locale: ProbeLocale): string {
  return locale === "ru"
    ? "Синтетическая staging-проверка: данных недостаточно, задайте один уточняющий вопрос о дате события."
    : "Sintetik staging tekshiruvi: ma’lumot yetarli emas, voqea sanasi haqida bitta aniqlashtiruvchi savol bering.";
}

type RunScenarioOptions = Required<Pick<StagingAiChatLifecycleProbeOptions, "executionId" | "budget">> & {
  signal: AbortSignal;
  onProviderPrepared?: StagingAiChatLifecycleProbeOptions["onProviderPrepared"];
};

function interactiveProviderTimeoutMs(budget: AiExecutionBudget): number {
  const remaining = budget.remainingMs - STAGING_AI_CHAT_PROBE_POST_PROVIDER_RESERVE_MS;
  if (budget.signal.aborted || remaining < 1) {
    throw new StagingAiChatLifecycleProbeError("STAGING_AI_CHAT_BUDGET_EXHAUSTED");
  }
  return Math.min(STAGING_AI_CHAT_PROBE_PROVIDER_TIMEOUT_MS, remaining);
}

async function runScenario(
  env: PlatformJobEnv,
  locale: ProbeLocale,
  options: RunScenarioOptions,
): Promise<ScenarioEvidence> {
  const ids = stagingAiChatSyntheticIds(locale, options.executionId);
  const scenarioStartedAt = Date.now();
  const now = isoNow();
  let scenarioError: unknown;
  let providerTtftMs: number | null = null;
  try {
    await prepareSyntheticScenario(env.DB, ids, locale, now);
    const providerStatus = aiProviderStatus();
    const provider = legalAiProvider();
    if (!provider || providerStatus.provider !== "openai" || !providerStatus.model) {
      throw new StagingAiChatLifecycleProbeError("STAGING_AI_CHAT_OPENAI_NOT_CONFIGURED");
    }

    const prompt = question(locale);
    const legalDatabaseAsOf = "unavailable";
    const requestHash = await sha256Json({
      prompt,
      locale,
      answerMode: "short",
      reasoningMode: "fast",
      conversationId: null,
      caseId: null,
      operation: "new",
      sourceMessageId: null,
    });
    const instructionHash = await sha256Json({ version: "juro-legal-chat-v1", jurisdiction: "UZ" });
    const sourceVersionHash = await sha256Json({ freshness: "unavailable", evidence: [], sources: [] });
    const reservationInput = {
      db: env.DB,
      workspaceId: ids.workspaceId,
      userId: ids.userId,
      idempotencyKey: ids.idempotencyKey,
      requestHash,
      conversationId: null,
      provider: provider.name,
      model: providerStatus.model,
      answerMode: "short" as const,
      reasoningMode: "fast" as const,
      legalDatabaseAsOf,
      instructionHash,
      sourceVersionHash,
      monthlyLimit: 20,
    };
    const reservation = await reserveAiRun(reservationInput);
    if (reservation.kind !== "reserved") {
      throw new StagingAiChatLifecycleProbeError("STAGING_AI_CHAT_RESERVATION_FAILED");
    }

    let aiResult;
    try {
      aiResult = await provider.runLegalChat({
        question: prompt,
        locale,
        answerMode: "short",
        reasoningMode: "fast",
        sources: [],
        legalDatabaseAsOf,
        requestId: reservation.correlationId,
        safetyIdentifier: await sha256Json({ scope: "staging-ai-chat-probe", userId: ids.userId }),
      }, {
        budget: options.budget,
        signal: options.signal,
        providerTimeoutMs: interactiveProviderTimeoutMs(options.budget),
        onProgress: () => undefined,
        onFirstProviderContent: ({ provider: progressProvider, elapsedMs }) => {
          // This observer fires only for OpenAI's first real stream delta. It
          // never includes the delta itself and is not a validated answer.
          if (progressProvider === "openai" && providerTtftMs === null) {
            providerTtftMs = elapsedMs;
          }
        },
        beforeProviderCall: async ({ provider: preparedProvider, model }) => {
          if (preparedProvider !== "openai") {
            throw new StagingAiChatLifecycleProbeError("STAGING_AI_CHAT_PRIMARY_PROVIDER_FAILED");
          }
          await options.onProviderPrepared?.({ model });
        },
      });
    } catch (error) {
      await failAiRun({
        db: env.DB,
        runId: reservation.runId,
        ledgerId: reservation.ledgerId,
        workspaceId: ids.workspaceId,
        userId: ids.userId,
        idempotencyKey: ids.idempotencyKey,
        errorCode: "PROVIDER_UNAVAILABLE",
      });
      throw error;
    }
    if (aiResult.provider !== "openai" || aiResult.fallbackFromProvider !== null) {
      throw new StagingAiChatLifecycleProbeError("STAGING_AI_CHAT_PRIMARY_PROVIDER_FAILED");
    }
    const validationStartedAt = Date.now();
    const result = enforceLegalChatSourceBoundary(parseLegalChatResponse(aiResult.data), new Set());
    if (
      result.responseKind !== "clarification_required"
      || result.language !== locale
      || result.sources.length !== 0
      || result.confirmedFindings.length !== 0
    ) {
      throw new StagingAiChatLifecycleProbeError("STAGING_AI_CHAT_RESPONSE_BOUNDARY_FAILED");
    }
    // A provider delta is deliberately not considered useful: only this
    // validated, source-boundary-checked result qualifies for the probe SLO.
    const validationLatencyMs = Math.max(0, Date.now() - validationStartedAt);
    const firstUsefulLatencyMs = Math.max(0, Date.now() - scenarioStartedAt);
    if (!await beginAiRunFinalization({
      db: env.DB,
      runId: reservation.runId,
      workspaceId: ids.workspaceId,
      userId: ids.userId,
    })) {
      throw new StagingAiChatLifecycleProbeError("STAGING_AI_CHAT_FINALIZATION_FAILED");
    }

    const contentSha256 = await sha256Json(prompt);
    const facts = result.assumptions.map((assumption, index) => ({
      id: `${ids.conversationId}-fact-${index}`,
      statement: assumption.statement,
    }));
    const persistenceStartedAt = Date.now();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO conversations (
          id,workspace_id,owner_user_id,case_id,title,locale,status,created_at,updated_at
        ) VALUES (?,?,?,NULL,?,?,'active',?,?)
      `).bind(ids.conversationId, ids.workspaceId, ids.userId, prompt.slice(0, 120), locale, now, now),
      env.DB.prepare(`
        INSERT INTO conversation_messages (id,conversation_id,author_type,content,created_at)
        VALUES (?,?,'user',?,?)
      `).bind(ids.userMessageId, ids.conversationId, prompt, now),
      env.DB.prepare(`
        INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at)
        VALUES (?,?,'assistant',?,?,?)
      `).bind(ids.assistantMessageId, ids.conversationId, result.answer, JSON.stringify(result), now),
      env.DB.prepare(`
        INSERT INTO message_branches (
          id,conversation_id,workspace_id,owner_user_id,parent_branch_id,forked_from_message_id,
          request_message_id,response_message_id,operation,created_at
        ) VALUES (?,?,?,?,NULL,NULL,?,?,'new',?)
      `).bind(
        ids.branchId,
        ids.conversationId,
        ids.workspaceId,
        ids.userId,
        ids.userMessageId,
        ids.assistantMessageId,
        now,
      ),
      env.DB.prepare(`
        INSERT INTO message_versions (
          id,conversation_id,branch_id,message_id,source_message_id,created_by_user_id,
          operation,version_number,content_sha256,created_at
        ) VALUES (?,?,?,?,NULL,?,'new',1,?,?)
      `).bind(
        ids.messageVersionId,
        ids.conversationId,
        ids.branchId,
        ids.userMessageId,
        ids.userId,
        contentSha256,
        now,
      ),
      ...facts.map((fact) => env.DB.prepare(`
        INSERT INTO confirmed_facts (
          id,conversation_id,case_id,statement,status,created_at,updated_at
        ) VALUES (?,?,NULL,?,'proposed',?,?)
      `).bind(fact.id, ids.conversationId, fact.statement, now, now)),
      env.DB.prepare(`
        INSERT INTO workspace_audit_events (
          id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at
        ) VALUES (?,?,?,'conversation',?,'ai_chat_completed',?,?)
      `).bind(ids.auditId, ids.workspaceId, ids.userId, ids.conversationId, JSON.stringify({
        purpose: "synthetic_staging_probe",
        provider: aiResult.provider,
        model: aiResult.model,
        locale,
        responseKind: result.responseKind,
        sourceCount: 0,
      }), now),
      ...completeAiRunStatements({
        db: env.DB,
        runId: reservation.runId,
        ledgerId: reservation.ledgerId,
        workspaceId: ids.workspaceId,
        userId: ids.userId,
        idempotencyKey: ids.idempotencyKey,
        conversationId: ids.conversationId,
        requestMessageId: ids.userMessageId,
        responseMessageId: ids.assistantMessageId,
        providerResponseId: aiResult.providerResponseId,
        provider: aiResult.provider,
        fallbackFromProvider: aiResult.fallbackFromProvider,
        model: aiResult.model,
        inputTokens: aiResult.usage.inputTokens,
        outputTokens: aiResult.usage.outputTokens,
        cachedInputTokens: aiResult.usage.cachedInputTokens,
        attempts: aiResult.attempts,
        latencyMs: aiResult.latencyMs,
        chargeable: false,
      }),
    ]);
    const persistenceLatencyMs = Math.max(0, Date.now() - persistenceStartedAt);

    const evidence = await env.DB.prepare(`
      SELECT r.status AS runStatus,r.provider,r.model,r.error_code AS errorCode,
        ledger.status AS ledgerStatus,ledger.units,
        json_extract(message.structured_json,'$.responseKind') AS responseKind,
        json_extract(message.structured_json,'$.language') AS responseLanguage,
        (SELECT count(*) FROM conversation_messages WHERE conversation_id=?) AS messageCount,
        (SELECT count(*) FROM message_branches WHERE conversation_id=?) AS branchCount,
        (SELECT count(*) FROM message_versions WHERE conversation_id=?) AS versionCount,
        (SELECT count(*) FROM workspace_audit_events WHERE id=? AND action='ai_chat_completed') AS auditCount
      FROM ai_runs r
      INNER JOIN ai_usage_ledger ledger ON ledger.ai_run_id=r.id
      INNER JOIN conversation_messages message ON message.id=r.response_message_id
      WHERE r.id=? AND r.workspace_id=? AND r.user_id=?
    `).bind(
      ids.conversationId,
      ids.conversationId,
      ids.conversationId,
      ids.auditId,
      reservation.runId,
      ids.workspaceId,
      ids.userId,
    ).first<Record<string, unknown>>();
    if (
      evidence?.runStatus !== "completed"
      || evidence.provider !== "openai"
      || evidence.errorCode !== null
      || evidence.ledgerStatus !== "released"
      || Number(evidence.units) !== 1
      || evidence.responseKind !== "clarification_required"
      || evidence.responseLanguage !== locale
      || Number(evidence.messageCount) !== 2
      || Number(evidence.branchCount) !== 1
      || Number(evidence.versionCount) !== 1
      || Number(evidence.auditCount) !== 1
    ) {
      throw new StagingAiChatLifecycleProbeError("STAGING_AI_CHAT_PERSISTENCE_FAILED");
    }
    const replay = await reserveAiRun(reservationInput);
    if (replay.kind !== "completed" || replay.conversationId !== ids.conversationId) {
      throw new StagingAiChatLifecycleProbeError("STAGING_AI_CHAT_REPLAY_FAILED");
    }
    return {
      model: aiResult.model,
      providerResponseId: aiResult.providerResponseId,
      inputTokens: aiResult.usage.inputTokens,
      outputTokens: aiResult.usage.outputTokens,
      cachedInputTokens: aiResult.usage.cachedInputTokens,
      latencyMs: aiResult.latencyMs,
      attempts: aiResult.attempts,
      providerTtftMs,
      firstUsefulLatencyMs,
      validationLatencyMs,
      persistenceLatencyMs,
    };
  } catch (error) {
    scenarioError = error;
    throw error;
  } finally {
    try {
      await cleanupSyntheticScenario(env.DB, ids);
      await assertSyntheticScenarioRemoved(env.DB, ids);
    } catch (cleanupError) {
      if (!scenarioError) throw cleanupError;
      console.error({
        event: "staging.ai_chat_probe_cleanup_failed",
        locale,
        safeCode: cleanupError instanceof StagingAiChatLifecycleProbeError
          ? cleanupError.code
          : "STAGING_AI_CHAT_CLEANUP_FAILED",
      });
    }
  }
}

/**
 * Runs one no-source legal-chat lifecycle against the real staging OpenAI
 * provider and D1, then removes every synthetic tenant/content row. Locale is
 * rotated deterministically from the opaque execution ID, so repeated probes
 * cover RU and UZ without retaining a user-like counter. This function has no
 * HTTP entry point and is impossible outside explicitly enabled staging.
 */
export async function runStagingAiChatLifecycleProbe(
  env: PlatformJobEnv,
  options: StagingAiChatLifecycleProbeOptions = {},
) {
  if (!stagingAiChatLifecycleProbeEnabled(env)) {
    throw new StagingAiChatLifecycleProbeError("STAGING_AI_CHAT_PROBE_DISABLED");
  }
  const ownsBudget = !options.budget;
  const budget = options.budget ?? createAiExecutionBudget({
    totalBudgetMs: STAGING_AI_CHAT_PROBE_EXECUTION_BUDGET_MS,
  });
  const executionId = normalizedExecutionId(options.executionId ?? crypto.randomUUID());
  const locale = options.locale ?? stagingAiChatProbeLocaleForExecution(executionId);
  const stage = budget.beginStage("probe.openai.lifecycle", {
    // Reserve a final sliver of the shared 30 second execution for durable
    // probe/SLO bookkeeping after provider output is validated.
    timeoutMs: Math.max(1, Math.min(27_000, budget.remainingMs)),
  });
  try {
    const scenario = await runScenario(env, locale, {
      executionId,
      budget,
      signal: stage.signal,
      onProviderPrepared: options.onProviderPrepared,
    });
    stage.complete();
    return {
      data: { locales: [locale], lifecycle: "verified" as const },
      provider: "openai" as const,
      model: scenario.model,
      // Provider response IDs are not needed for rolling health/SLO evidence.
      providerResponseId: null,
      attempts: scenario.attempts,
      latencyMs: scenario.latencyMs,
      usage: {
        inputTokens: scenario.inputTokens,
        outputTokens: scenario.outputTokens,
        cachedInputTokens: scenario.cachedInputTokens,
      },
      timing: {
        providerTtftMs: scenario.providerTtftMs,
        firstUsefulLatencyMs: scenario.firstUsefulLatencyMs,
        validationLatencyMs: scenario.validationLatencyMs,
        persistenceLatencyMs: scenario.persistenceLatencyMs,
      },
      fallbackFromProvider: null,
    };
  } catch (error) {
    stage.fail();
    throw error;
  } finally {
    if (ownsBudget) budget.dispose();
  }
}
