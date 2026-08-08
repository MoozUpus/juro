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
import { isoNow } from "../lib/document-builder/storage/db";
import type { PlatformJobEnv } from "./platform-jobs";

const PROBE_VERSION = "v26";
const LOCALES = ["ru", "uz"] as const;

type ProbeLocale = (typeof LOCALES)[number];

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

export function stagingAiChatSyntheticIds(locale: ProbeLocale): SyntheticIds {
  const prefix = `staging-ai-chat-${PROBE_VERSION}-${locale}`;
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
      (SELECT count(*) FROM ai_runs WHERE workspace_id=? AND user_id=?) +
      (SELECT count(*) FROM ai_usage_ledger WHERE workspace_id=? AND user_id=?) +
      (SELECT count(*) FROM idempotency_keys WHERE key=?) AS remaining
  `).bind(
    ids.userId,
    ids.workspaceId,
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

async function runScenario(env: PlatformJobEnv, locale: ProbeLocale): Promise<ScenarioEvidence> {
  const ids = stagingAiChatSyntheticIds(locale);
  const now = isoNow();
  let scenarioError: unknown;
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
    const result = enforceLegalChatSourceBoundary(parseLegalChatResponse(aiResult.data), new Set());
    if (
      result.responseKind !== "clarification_required"
      || result.language !== locale
      || result.sources.length !== 0
      || result.confirmedFindings.length !== 0
    ) {
      throw new StagingAiChatLifecycleProbeError("STAGING_AI_CHAT_RESPONSE_BOUNDARY_FAILED");
    }
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
 * Runs two fixed no-source legal-chat lifecycles against real staging
 * providers and D1, then removes every synthetic tenant/content row. The only
 * persistent evidence is the bounded technical row managed by the provider
 * probe table. This function has no HTTP entry point and is impossible outside
 * explicitly enabled staging.
 */
export async function runStagingAiChatLifecycleProbe(env: PlatformJobEnv) {
  if (!stagingAiChatLifecycleProbeEnabled(env)) {
    throw new StagingAiChatLifecycleProbeError("STAGING_AI_CHAT_PROBE_DISABLED");
  }
  const scenarios: ScenarioEvidence[] = [];
  for (const locale of LOCALES) scenarios.push(await runScenario(env, locale));
  const model = scenarios[0]?.model;
  if (!model || scenarios.some((scenario) => scenario.model !== model)) {
    throw new StagingAiChatLifecycleProbeError("STAGING_AI_CHAT_MODEL_MISMATCH");
  }
  return {
    data: { locales: [...LOCALES], lifecycle: "verified" as const },
    provider: "openai" as const,
    model,
    providerResponseId: null,
    attempts: scenarios.reduce((total, scenario) => total + scenario.attempts, 0),
    latencyMs: scenarios.reduce((total, scenario) => total + scenario.latencyMs, 0),
    usage: {
      inputTokens: scenarios.reduce((total, scenario) => total + scenario.inputTokens, 0),
      outputTokens: scenarios.reduce((total, scenario) => total + scenario.outputTokens, 0),
      cachedInputTokens: scenarios.reduce((total, scenario) => total + scenario.cachedInputTokens, 0),
    },
    fallbackFromProvider: null,
  };
}
