const CHAT_FEATURE = "legal_chat";
const FREE_MONTHLY_CYCLES = 20;

export type AiRunReservation = {
  kind: "reserved";
  runId: string;
  ledgerId: string;
  correlationId: string;
  periodStart: string;
  periodEnd: string;
};

export type AiRunReplay = {
  kind: "completed";
  runId: string;
  conversationId: string;
  responseMessageId: string;
  response: unknown;
};

export type AiRunPending = { kind: "processing"; runId: string };

export class AiRunConflictError extends Error {
  readonly code: "IDEMPOTENCY_CONFLICT" | "PLAN_LIMIT";

  constructor(code: "IDEMPOTENCY_CONFLICT" | "PLAN_LIMIT", message: string) {
    super(message);
    this.name = "AiRunConflictError";
    this.code = code;
  }
}

type ReserveInput = {
  db: D1Database;
  workspaceId: string;
  userId: string;
  idempotencyKey: string;
  requestHash: string;
  conversationId: string | null;
  provider: string;
  model: string;
  answerMode: "short" | "detailed";
  reasoningMode: "fast" | "deep";
  legalDatabaseAsOf: string;
  instructionHash: string;
  sourceVersionHash: string;
  monthlyLimit?: number;
};

export async function reserveAiRun(input: ReserveInput): Promise<AiRunReservation | AiRunReplay | AiRunPending> {
  const registryKey = `legal-chat:${input.workspaceId}:${input.userId}:${input.idempotencyKey}`;
  const scope = `legal-chat:${input.workspaceId}:${input.userId}`;
  const now = isoNow();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const insert = await input.db.prepare(
    `INSERT OR IGNORE INTO idempotency_keys
      (key,scope,request_hash,status,result_ref,expires_at,completed_at,created_at,updated_at)
     VALUES (?,?,?,'started',NULL,?,NULL,?,?)`,
  ).bind(registryKey, scope, input.requestHash, expiresAt, now, now).run();

  if ((insert.meta.changes ?? 0) === 0) {
    return resolveExistingReservation(input.db, registryKey, input.requestHash);
  }

  const runId = crypto.randomUUID();
  const ledgerId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  const { periodStart, periodEnd } = monthlyPeriod(new Date());
  const limit = input.monthlyLimit ?? FREE_MONTHLY_CYCLES;
  const [runResult, ledgerResult] = await input.db.batch([
    input.db.prepare(
      `INSERT INTO ai_runs
        (id,workspace_id,user_id,conversation_id,request_message_id,response_message_id,idempotency_key,
         correlation_id,provider,model,provider_response_id,fallback_from_provider,answer_mode,reasoning_mode,
         status,legal_database_as_of,instruction_hash,source_version_hash,input_tokens,output_tokens,
         cached_input_tokens,estimated_cost_microusd,attempt_count,latency_ms,error_code,started_at,
         completed_at,created_at,updated_at)
       VALUES (?,?,?,?,NULL,NULL,?,?,?, ?,NULL,NULL,?,?,'reserved',?,?,?,0,0,0,NULL,0,NULL,NULL,?,NULL,?,?)`,
    ).bind(
      runId, input.workspaceId, input.userId, input.conversationId, input.idempotencyKey,
      correlationId, input.provider, input.model, input.answerMode, input.reasoningMode,
      input.legalDatabaseAsOf, input.instructionHash, input.sourceVersionHash, now, now, now,
    ),
    input.db.prepare(
      `INSERT INTO ai_usage_ledger
        (id,workspace_id,user_id,ai_run_id,idempotency_key,feature,period_start,period_end,units,status,
         provider,model,input_tokens,output_tokens,cached_input_tokens,estimated_cost_microusd,
         released_at,consumed_at,created_at,updated_at)
       SELECT ?,?,?,?,?,?,?,?,1,'reserved',?,?,0,0,0,NULL,NULL,NULL,?,?
       WHERE (SELECT COALESCE(SUM(units),0) FROM ai_usage_ledger
              WHERE workspace_id=? AND user_id=? AND feature=? AND period_start=?
                AND status IN ('reserved','consumed')) < ?`,
    ).bind(
      ledgerId, input.workspaceId, input.userId, runId, input.idempotencyKey, CHAT_FEATURE,
      periodStart, periodEnd, input.provider, input.model, now, now,
      input.workspaceId, input.userId, CHAT_FEATURE, periodStart, limit,
    ),
  ]);
  if (!runResult.success) throw new Error("AI_RUN_RESERVATION_FAILED");
  if (!ledgerResult.success || (ledgerResult.meta.changes ?? 0) === 0) {
    await input.db.batch([
      input.db.prepare("UPDATE ai_runs SET status='rejected',error_code='PLAN_LIMIT',completed_at=?,updated_at=? WHERE id=?").bind(now, now, runId),
      input.db.prepare("UPDATE idempotency_keys SET status='failed',result_ref=?,updated_at=? WHERE key=?").bind(runId, now, registryKey),
    ]);
    throw new AiRunConflictError("PLAN_LIMIT", "Monthly AI answer limit reached.");
  }
  await input.db.prepare("UPDATE idempotency_keys SET result_ref=?,updated_at=? WHERE key=? AND status='started'")
    .bind(runId, now, registryKey).run();
  return { kind: "reserved", runId, ledgerId, correlationId, periodStart, periodEnd };
}

async function resolveExistingReservation(db: D1Database, registryKey: string, requestHash: string): Promise<AiRunReplay | AiRunPending> {
  const row = await db.prepare(
    "SELECT request_hash AS requestHash,status,result_ref AS resultRef FROM idempotency_keys WHERE key=?",
  ).bind(registryKey).first<{ requestHash: string; status: string; resultRef: string | null }>();
  if (!row || row.requestHash !== requestHash) {
    throw new AiRunConflictError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different request.");
  }
  if (row.status === "completed" && row.resultRef) {
    const completed = await db.prepare(
      `SELECT r.id,r.conversation_id AS conversationId,r.response_message_id AS responseMessageId,
        m.structured_json AS structuredJson
       FROM ai_runs r LEFT JOIN conversation_messages m ON m.id=r.response_message_id
       WHERE r.id=? AND r.status='completed'`,
    ).bind(row.resultRef).first<{ id: string; conversationId: string | null; responseMessageId: string | null; structuredJson: string | null }>();
    if (completed?.structuredJson && completed.conversationId && completed.responseMessageId) {
      return {
        kind: "completed", runId: completed.id, conversationId: completed.conversationId,
        responseMessageId: completed.responseMessageId, response: parseJson(completed.structuredJson, null),
      };
    }
  }
  return { kind: "processing", runId: row.resultRef || "" };
}

export type CompleteAiRunInput = {
  db: D1Database;
  runId: string;
  ledgerId: string;
  workspaceId: string;
  userId: string;
  idempotencyKey: string;
  conversationId: string;
  requestMessageId: string;
  responseMessageId: string;
  providerResponseId: string | null;
  provider: "openai" | "anthropic";
  fallbackFromProvider: "openai" | "anthropic" | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  attempts: number;
  latencyMs: number;
  chargeable: boolean;
};

export function completeAiRunStatements(input: CompleteAiRunInput): D1PreparedStatement[] {
  const now = isoNow();
  const registryKey = `legal-chat:${input.workspaceId}:${input.userId}:${input.idempotencyKey}`;
  return [
    input.db.prepare(
      `UPDATE ai_runs SET conversation_id=?,request_message_id=?,response_message_id=?,provider_response_id=?,provider=?,fallback_from_provider=?,model=?,status='completed',
       input_tokens=?,output_tokens=?,cached_input_tokens=?,attempt_count=?,latency_ms=?,completed_at=?,updated_at=?
       WHERE id=? AND workspace_id=? AND user_id=? AND status='reserved'`,
    ).bind(
      input.conversationId, input.requestMessageId, input.responseMessageId, input.providerResponseId,
      input.provider, input.fallbackFromProvider, input.model,
      input.inputTokens, input.outputTokens, input.cachedInputTokens, input.attempts, input.latencyMs,
      now, now, input.runId, input.workspaceId, input.userId,
    ),
    input.db.prepare(
      `UPDATE ai_usage_ledger SET status=?,provider=?,model=?,input_tokens=?,output_tokens=?,cached_input_tokens=?,
       released_at=?,consumed_at=?,updated_at=? WHERE id=? AND ai_run_id=? AND status='reserved'`,
    ).bind(
      input.chargeable ? "consumed" : "released", input.provider, input.model, input.inputTokens, input.outputTokens,
      input.cachedInputTokens, input.chargeable ? null : now, input.chargeable ? now : null,
      now, input.ledgerId, input.runId,
    ),
    input.db.prepare(
      "UPDATE idempotency_keys SET status='completed',result_ref=?,completed_at=?,updated_at=? WHERE key=? AND request_hash IS NOT NULL",
    ).bind(input.runId, now, now, registryKey),
  ];
}

export async function completeAiRun(input: CompleteAiRunInput): Promise<void> {
  await input.db.batch(completeAiRunStatements(input));
}

export async function failAiRun(input: {
  db: D1Database;
  runId: string;
  ledgerId: string;
  workspaceId: string;
  userId: string;
  idempotencyKey: string;
  errorCode: string;
}): Promise<void> {
  const now = isoNow();
  const registryKey = `legal-chat:${input.workspaceId}:${input.userId}:${input.idempotencyKey}`;
  await input.db.batch([
    input.db.prepare("UPDATE ai_runs SET status='failed',error_code=?,completed_at=?,updated_at=? WHERE id=? AND workspace_id=? AND user_id=? AND status='reserved'")
      .bind(input.errorCode, now, now, input.runId, input.workspaceId, input.userId),
    input.db.prepare("UPDATE ai_usage_ledger SET status='released',released_at=?,updated_at=? WHERE id=? AND ai_run_id=? AND status='reserved'")
      .bind(now, now, input.ledgerId, input.runId),
    input.db.prepare("UPDATE idempotency_keys SET status='failed',result_ref=?,updated_at=? WHERE key=?")
      .bind(input.runId, now, registryKey),
  ]);
}

export async function sha256Json(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function monthlyPeriod(date: Date): { periodStart: string; periodEnd: string } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    periodStart: new Date(Date.UTC(year, month, 1)).toISOString(),
    periodEnd: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  };
}

function isoNow(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
