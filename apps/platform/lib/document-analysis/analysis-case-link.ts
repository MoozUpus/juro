import { z } from "zod";

export const analysisCaseLinkInputSchema = z.object({
  caseId: z.string().uuid().nullable(),
}).strict();

export class AnalysisCaseLinkError extends Error {
  constructor(
    public readonly code:
      | "INVALID_IDEMPOTENCY_KEY"
      | "ANALYSIS_UNAVAILABLE"
      | "CASE_UNAVAILABLE"
      | "IDEMPOTENCY_CONFLICT"
      | "CASE_LINK_CONFLICT",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AnalysisCaseLinkError";
  }
}

type AnalysisProjection = {
  caseId: string | null;
  caseLinkRevision: number;
};

type LinkEvent = {
  toCaseId: string | null;
  mutationVersion: number;
  requestHash: string;
};

export type AnalysisCaseLinkResult = {
  analysisId: string;
  caseId: string | null;
  revision: number;
  replay: boolean;
  changed: boolean;
};

export async function changeAnalysisCaseLink(input: {
  db: D1Database;
  workspaceId: string;
  userId: string;
  analysisId: string;
  caseId: string | null;
  idempotencyKey: string;
}): Promise<AnalysisCaseLinkResult> {
  const idempotencyKey = parseAnalysisCaseLinkIdempotencyKey(input.idempotencyKey);
  const requestHash = await analysisCaseLinkRequestHash(input.analysisId, input.caseId);
  const existing = await findEvent(input.db, input.workspaceId, input.userId, idempotencyKey);
  if (existing) return replayEvent(existing, requestHash, input.analysisId);

  const current = await projection(input.db, input.analysisId, input.workspaceId, input.userId);
  if (!current) {
    throw new AnalysisCaseLinkError("ANALYSIS_UNAVAILABLE", "Анализ недоступен.", 404);
  }
  if (current.caseId === input.caseId) {
    return {
      analysisId: input.analysisId,
      caseId: current.caseId,
      revision: current.caseLinkRevision,
      replay: true,
      changed: false,
    };
  }
  if (input.caseId) {
    const target = await input.db.prepare(
      "SELECT id FROM cases WHERE id=? AND workspace_id=? AND archived_at IS NULL LIMIT 1",
    ).bind(input.caseId, input.workspaceId).first<{ id: string }>();
    if (!target) {
      throw new AnalysisCaseLinkError("CASE_UNAVAILABLE", "Дело недоступно.", 404);
    }
  }

  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await input.db.prepare(
      `INSERT INTO analysis_case_link_events
       (id,analysis_id,workspace_id,owner_user_id,actor_user_id,from_case_id,to_case_id,mutation_version,idempotency_key,request_hash,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      eventId,
      input.analysisId,
      input.workspaceId,
      input.userId,
      input.userId,
      current.caseId,
      input.caseId,
      current.caseLinkRevision + 1,
      idempotencyKey,
      requestHash,
      now,
    ).run();
  } catch (error) {
    const replay = await findEvent(input.db, input.workspaceId, input.userId, idempotencyKey);
    if (replay) return replayEvent(replay, requestHash, input.analysisId);
    const latest = await projection(input.db, input.analysisId, input.workspaceId, input.userId);
    if (latest && latest.caseLinkRevision !== current.caseLinkRevision) {
      throw new AnalysisCaseLinkError(
        "CASE_LINK_CONFLICT",
        "Привязка анализа уже изменилась. Обновите данные и повторите действие.",
        409,
      );
    }
    throw error;
  }

  const updated = await projection(input.db, input.analysisId, input.workspaceId, input.userId);
  if (!updated || updated.caseId !== input.caseId || updated.caseLinkRevision !== current.caseLinkRevision + 1) {
    throw new AnalysisCaseLinkError("CASE_LINK_CONFLICT", "Привязка анализа не сохранилась.", 409);
  }
  return {
    analysisId: input.analysisId,
    caseId: updated.caseId,
    revision: updated.caseLinkRevision,
    replay: false,
    changed: true,
  };
}

export function parseAnalysisCaseLinkIdempotencyKey(value: string | null): string {
  const key = value?.trim() ?? "";
  if (!/^[A-Za-z0-9._:-]{16,180}$/.test(key)) {
    throw new AnalysisCaseLinkError(
      "INVALID_IDEMPOTENCY_KEY",
      "Для изменения дела требуется корректный Idempotency-Key.",
      400,
    );
  }
  return key;
}

export async function analysisCaseLinkRequestHash(analysisId: string, caseId: string | null): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ analysisId, caseId }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function projection(
  db: D1Database,
  analysisId: string,
  workspaceId: string,
  userId: string,
): Promise<AnalysisProjection | null> {
  return db.prepare(
    `SELECT case_id AS caseId,case_link_revision AS caseLinkRevision
     FROM document_analyses
     WHERE id=? AND workspace_id=? AND owner_user_id=? LIMIT 1`,
  ).bind(analysisId, workspaceId, userId).first<AnalysisProjection>();
}

async function findEvent(
  db: D1Database,
  workspaceId: string,
  userId: string,
  idempotencyKey: string,
): Promise<LinkEvent | null> {
  return db.prepare(
    `SELECT to_case_id AS toCaseId,mutation_version AS mutationVersion,request_hash AS requestHash
     FROM analysis_case_link_events
     WHERE workspace_id=? AND owner_user_id=? AND idempotency_key=? LIMIT 1`,
  ).bind(workspaceId, userId, idempotencyKey).first<LinkEvent>();
}

function replayEvent(event: LinkEvent, requestHash: string, analysisId: string): AnalysisCaseLinkResult {
  if (event.requestHash !== requestHash) {
    throw new AnalysisCaseLinkError(
      "IDEMPOTENCY_CONFLICT",
      "Этот Idempotency-Key уже использован для другой привязки.",
      409,
    );
  }
  return {
    analysisId,
    caseId: event.toCaseId,
    revision: event.mutationVersion,
    replay: true,
    changed: true,
  };
}
