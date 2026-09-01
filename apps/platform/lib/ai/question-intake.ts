import { z } from "zod";

import { randomToken, sha256 } from "../auth/crypto";
import {
  parseIdentityKeyring,
  protectIdentityValue,
  revealIdentityValue,
  type IdentityKeyring,
} from "../auth/keyring";

export const AI_QUESTION_INTAKE_TTL_MS = 15 * 60 * 1_000;
export const AI_QUESTION_INTAKE_MAX_ACTIVE = 5;
const AI_QUESTION_INTAKE_PURGE_BATCH_SIZE = 100;

export const questionIntakeCreateSchema = z.object({
  question: z.string().trim().min(1).max(4_000),
  workspaceId: z.string().regex(/^[A-Za-z0-9_-]{3,128}$/),
}).strict();

export const questionIntakeConsumeSchema = z.object({
  handle: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  workspaceId: z.string().regex(/^[A-Za-z0-9_-]{3,128}$/),
}).strict();

type QuestionIntakeRow = {
  id: string;
  workspaceId: string;
  userId: string;
  ciphertext: string;
  iv: string;
  keyVersion: string;
};

export class QuestionIntakeError extends Error {
  constructor(
    public readonly code:
      | "AI_QUESTION_INTAKE_INVALID"
      | "AI_QUESTION_INTAKE_UNAVAILABLE"
      | "AI_QUESTION_INTAKE_CAPACITY_EXCEEDED"
      | "AI_QUESTION_INTAKE_ENCRYPTION_UNAVAILABLE",
  ) {
    super(code);
    this.name = "QuestionIntakeError";
  }
}

export function questionIntakeKeyring(raw: string | null | undefined): IdentityKeyring {
  try {
    return parseIdentityKeyring(raw);
  } catch {
    throw new QuestionIntakeError("AI_QUESTION_INTAKE_ENCRYPTION_UNAVAILABLE");
  }
}

export async function issueQuestionIntake(input: {
  db: D1Database;
  keyring: IdentityKeyring;
  workspaceId: string;
  userId: string;
  question: unknown;
  now?: Date;
}): Promise<{ handle: string; expiresAt: string }> {
  const parsed = questionIntakeCreateSchema.safeParse({
    question: input.question,
    workspaceId: input.workspaceId,
  });
  if (!parsed.success) throw new QuestionIntakeError("AI_QUESTION_INTAKE_INVALID");

  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new QuestionIntakeError("AI_QUESTION_INTAKE_INVALID");
  }
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + AI_QUESTION_INTAKE_TTL_MS).toISOString();
  const id = crypto.randomUUID();
  const handle = randomToken(32);
  const tokenHash = await sha256(handle);
  let protectedQuestion;
  try {
    protectedQuestion = await protectIdentityValue(
      input.keyring,
      parsed.data.question,
      questionContext(input.workspaceId, input.userId, id),
    );
  } catch {
    throw new QuestionIntakeError("AI_QUESTION_INTAKE_ENCRYPTION_UNAVAILABLE");
  }

  try {
    await input.db.prepare(`
      INSERT INTO ai_question_intakes (
        id,workspace_id,user_id,token_hash,question_ciphertext,question_iv,
        question_key_version,expires_at,consumed_at,created_at
      ) VALUES (?,?,?,?,?,?,?,?,NULL,?)
    `).bind(
      id,
      input.workspaceId,
      input.userId,
      tokenHash,
      protectedQuestion.ciphertext,
      protectedQuestion.iv,
      protectedQuestion.keyVersion,
      expiresAt,
      createdAt,
    ).run();
  } catch (error) {
    if (String(error).includes("AI_QUESTION_INTAKE_CAPACITY_EXCEEDED")) {
      throw new QuestionIntakeError("AI_QUESTION_INTAKE_CAPACITY_EXCEEDED");
    }
    if (String(error).includes("AI_QUESTION_INTAKE_ACCESS_DENIED")) {
      throw new QuestionIntakeError("AI_QUESTION_INTAKE_UNAVAILABLE");
    }
    throw error;
  }
  return { handle, expiresAt };
}

export async function openQuestionIntake(input: {
  db: D1Database;
  keyring: IdentityKeyring;
  workspaceId: string;
  userId: string;
  handle: unknown;
  now?: Date;
}): Promise<string> {
  const parsed = questionIntakeConsumeSchema.safeParse({
    handle: input.handle,
    workspaceId: input.workspaceId,
  });
  if (!parsed.success) throw new QuestionIntakeError("AI_QUESTION_INTAKE_UNAVAILABLE");
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new QuestionIntakeError("AI_QUESTION_INTAKE_UNAVAILABLE");
  }
  const nowIso = now.toISOString();
  const tokenHash = await sha256(parsed.data.handle);
  const row = await input.db.prepare(`
    SELECT id,workspace_id AS workspaceId,user_id AS userId,
      question_ciphertext AS ciphertext,question_iv AS iv,
      question_key_version AS keyVersion
    FROM ai_question_intakes
    WHERE token_hash=? AND workspace_id=? AND user_id=?
      AND consumed_at IS NULL AND expires_at>?
    LIMIT 1
  `).bind(tokenHash, input.workspaceId, input.userId, nowIso).first<QuestionIntakeRow>();
  if (!row) throw new QuestionIntakeError("AI_QUESTION_INTAKE_UNAVAILABLE");

  let question: string;
  try {
    question = await revealIdentityValue(input.keyring, {
      ciphertext: row.ciphertext,
      iv: row.iv,
      keyVersion: row.keyVersion,
    }, questionContext(row.workspaceId, row.userId, row.id));
  } catch {
    throw new QuestionIntakeError("AI_QUESTION_INTAKE_ENCRYPTION_UNAVAILABLE");
  }
  const validatedQuestion = questionIntakeCreateSchema.safeParse({
    question,
    workspaceId: input.workspaceId,
  });
  if (!validatedQuestion.success) {
    throw new QuestionIntakeError("AI_QUESTION_INTAKE_ENCRYPTION_UNAVAILABLE");
  }

  return validatedQuestion.data.question;
}

export async function finalizeQuestionIntake(input: {
  db: D1Database;
  workspaceId: string;
  userId: string;
  handle: unknown;
  now?: Date;
}): Promise<void> {
  const parsed = questionIntakeConsumeSchema.safeParse({
    handle: input.handle,
    workspaceId: input.workspaceId,
  });
  if (!parsed.success) throw new QuestionIntakeError("AI_QUESTION_INTAKE_UNAVAILABLE");
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new QuestionIntakeError("AI_QUESTION_INTAKE_UNAVAILABLE");
  }
  const nowIso = now.toISOString();
  const tokenHash = await sha256(parsed.data.handle);
  const claim = await input.db.prepare(`
    UPDATE ai_question_intakes
    SET consumed_at=?,question_ciphertext=NULL,question_iv=NULL,question_key_version=NULL
    WHERE token_hash=? AND workspace_id=? AND user_id=?
      AND consumed_at IS NULL AND expires_at>?
  `).bind(
    nowIso,
    tokenHash,
    input.workspaceId,
    input.userId,
    nowIso,
  ).run();
  if (Number(claim.meta.changes ?? 0) === 1) return;
  const finalized = await input.db.prepare(`
    SELECT id FROM ai_question_intakes
    WHERE token_hash=? AND workspace_id=? AND user_id=? AND consumed_at IS NOT NULL
    LIMIT 1
  `).bind(tokenHash, input.workspaceId, input.userId).first<{ id: string }>();
  if (!finalized) throw new QuestionIntakeError("AI_QUESTION_INTAKE_UNAVAILABLE");
}

export async function purgeExpiredQuestionIntakes(input: {
  db: D1Database;
  now?: string;
  limit?: number;
}): Promise<{ eligible: number; purged: number }> {
  if (!await questionIntakeSchemaAvailable(input.db)) return { eligible: 0, purged: 0 };
  const now = input.now ?? new Date().toISOString();
  const limit = Math.min(Math.max(input.limit ?? AI_QUESTION_INTAKE_PURGE_BATCH_SIZE, 1), 500);
  const rows = await input.db.prepare(
    "SELECT id FROM ai_question_intakes WHERE expires_at<=? ORDER BY expires_at,id LIMIT ?",
  ).bind(now, limit).all<{ id: string }>();
  if (!rows.results.length) return { eligible: 0, purged: 0 };
  const results = await input.db.batch(rows.results.map((row) =>
    input.db.prepare("DELETE FROM ai_question_intakes WHERE id=? AND expires_at<=?").bind(row.id, now)
  ));
  return {
    eligible: rows.results.length,
    purged: results.reduce((total, result) => total + Number(result.meta.changes ?? 0), 0),
  };
}

function questionContext(workspaceId: string, userId: string, id: string) {
  return {
    purpose: "ai-question-intake-v1",
    subjectId: `${workspaceId}:${userId}`,
    recordId: id,
  };
}

async function questionIntakeSchemaAvailable(db: D1Database): Promise<boolean> {
  const row = await db.prepare(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='ai_question_intakes'",
  ).first<{ count: number }>();
  return Number(row?.count ?? 0) === 1;
}
