import { normalizeEmail } from "./crypto";
import {
  parseIdentityKeyring,
  protectIdentityValue,
  revealIdentityValue,
  type IdentityKeyring,
} from "./keyring";
import type { SecurityEventGuard } from "./security-events";

const RECIPIENT_PURPOSE = "security-email-recipient";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SecurityEmailErrorCode =
  | "EMAIL_CONFIGURATION_UNAVAILABLE"
  | "EMAIL_JOB_INVALID"
  | "EMAIL_PROVIDER_REJECTED"
  | "EMAIL_PROVIDER_UNAVAILABLE";

export class SecurityEmailError extends Error {
  constructor(
    readonly code: SecurityEmailErrorCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "SecurityEmailError";
  }
}

export type SecurityEmailRuntimeEnv = {
  DB: D1Database;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  IDENTITY_KEYRING?: string;
};

export type PreparedSecurityEmailJob = {
  jobId: string;
  outboxId: string;
  statements: D1PreparedStatement[];
};

type SecurityEmailJobRow = {
  id: string;
  userId: string;
  eventType: string;
  locale: string;
  recipientCiphertext: string;
  recipientIv: string;
  recipientKeyVersion: string;
  status: string;
  providerMessageId: string | null;
};

function assertGuard(guard: SecurityEventGuard): void {
  if (!/^\s*SELECT\b/i.test(guard.selectSql) || guard.selectSql.includes(";")) {
    throw new Error("INVALID_SECURITY_EMAIL_GUARD");
  }
}

export async function prepareEmailChangedSecurityEmail(
  db: D1Database,
  input: {
    keyring: IdentityKeyring;
    userId: string;
    workspaceId: string;
    challengeId: string;
    previousEmail: string;
    locale: "ru" | "uz";
    requiredGuard: SecurityEventGuard;
    now: string;
  },
): Promise<PreparedSecurityEmailJob> {
  assertGuard(input.requiredGuard);
  const jobId = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  const recipient = await protectIdentityValue(
    input.keyring,
    normalizeEmail(input.previousEmail),
    {
      purpose: RECIPIENT_PURPOSE,
      subjectId: input.userId,
      recordId: jobId,
    },
  );
  const idempotencyKey = `security_email_${jobId}`;
  const correlationId = `email_change_${input.challengeId}`;
  const guardSql = input.requiredGuard.selectSql;
  const guardBindings = input.requiredGuard.bindings;

  return {
    jobId,
    outboxId,
    statements: [
      db.prepare(
        `INSERT INTO security_email_jobs (
           id,user_id,workspace_id,challenge_id,event_type,locale,
           recipient_ciphertext,recipient_iv,recipient_key_version,
           status,attempt_count,created_at,updated_at
         )
         SELECT ?,?,?,?,'email_changed_previous_address',?,?,?,?,
           'pending',0,?,?
         WHERE EXISTS (${guardSql})`,
      ).bind(
        jobId,
        input.userId,
        input.workspaceId,
        input.challengeId,
        input.locale,
        recipient.ciphertext,
        recipient.iv,
        recipient.keyVersion,
        input.now,
        input.now,
        ...guardBindings,
      ),
      db.prepare(
        `INSERT INTO job_outbox (
           id,queue_binding,job_type,schema_version,idempotency_key,
           subject_id,workspace_id,correlation_id,enqueued_at,available_at,
           status,dispatch_attempts,created_at,updated_at
         )
         SELECT ?,'EMAIL_NOTIFICATIONS_QUEUE','email.send',1,?,?,?,?,?,?,
           'pending',0,?,?
         WHERE EXISTS (
           SELECT 1 FROM security_email_jobs
           WHERE id=? AND status='pending'
         )
           AND EXISTS (${guardSql})`,
      ).bind(
        outboxId,
        idempotencyKey,
        jobId,
        input.workspaceId,
        correlationId,
        input.now,
        input.now,
        input.now,
        input.now,
        jobId,
        ...guardBindings,
      ),
    ],
  };
}

function emailCopy(locale: "ru" | "uz"): { subject: string; html: string } {
  if (locale === "uz") {
    return {
      subject: "JURO emailingiz o‘zgartirildi",
      html: `<div style="font-family:Arial,sans-serif;color:#111d36"><h2>JURO emailingiz o‘zgartirildi</h2><p>JURO hisobingizga kirish uchun email manzili muvaffaqiyatli o‘zgartirildi.</p><p>Agar bu amalni siz bajarmagan bo‘lsangiz, darhol <a href="mailto:support@juro.uz">support@juro.uz</a> bilan bog‘laning va faol sessiyalaringizni bekor qiling.</p></div>`,
    };
  }
  return {
    subject: "Email для входа в JURO изменён",
    html: `<div style="font-family:Arial,sans-serif;color:#111d36"><h2>Email для входа в JURO изменён</h2><p>Адрес для входа в ваш аккаунт JURO был успешно изменён.</p><p>Если это сделали не вы, немедленно напишите на <a href="mailto:support@juro.uz">support@juro.uz</a> и завершите активные сессии.</p></div>`,
  };
}

async function updateFailure(
  db: D1Database,
  input: {
    jobId: string;
    error: SecurityEmailError;
    now: string;
  },
): Promise<void> {
  await db.prepare(
    `UPDATE security_email_jobs
     SET status=?,error_code=?,updated_at=?
     WHERE id=? AND status<>'sent'`,
  ).bind(
    input.error.retryable ? "retrying" : "failed",
    input.error.code,
    input.now,
    input.jobId,
  ).run();
}

function providerFailure(status: number): SecurityEmailError {
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return new SecurityEmailError("EMAIL_PROVIDER_UNAVAILABLE", true);
  }
  return new SecurityEmailError("EMAIL_PROVIDER_REJECTED", false);
}

export async function executeSecurityEmailJob(
  env: SecurityEmailRuntimeEnv,
  jobId: string,
): Promise<{ providerMessageId: string | null; alreadySent: boolean }> {
  const row = await env.DB.prepare(
    `SELECT id,user_id AS userId,event_type AS eventType,locale,
       recipient_ciphertext AS recipientCiphertext,
       recipient_iv AS recipientIv,
       recipient_key_version AS recipientKeyVersion,status,
       provider_message_id AS providerMessageId
     FROM security_email_jobs WHERE id=? LIMIT 1`,
  ).bind(jobId).first<SecurityEmailJobRow>();
  if (!row || row.eventType !== "email_changed_previous_address") {
    throw new SecurityEmailError("EMAIL_JOB_INVALID", false);
  }
  if (row.status === "sent") {
    return { providerMessageId: row.providerMessageId, alreadySent: true };
  }
  if (row.status === "failed") {
    throw new SecurityEmailError("EMAIL_JOB_INVALID", false);
  }

  const now = new Date().toISOString();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.IDENTITY_KEYRING) {
    const error = new SecurityEmailError(
      "EMAIL_CONFIGURATION_UNAVAILABLE",
      false,
    );
    await updateFailure(env.DB, { jobId, error, now });
    throw error;
  }

  let recipient: string;
  try {
    const keyring = parseIdentityKeyring(env.IDENTITY_KEYRING);
    recipient = normalizeEmail(await revealIdentityValue(
      keyring,
      {
        ciphertext: row.recipientCiphertext,
        iv: row.recipientIv,
        keyVersion: row.recipientKeyVersion,
      },
      {
        purpose: RECIPIENT_PURPOSE,
        subjectId: row.userId,
        recordId: row.id,
      },
    ));
  } catch {
    const error = new SecurityEmailError("EMAIL_JOB_INVALID", false);
    await updateFailure(env.DB, { jobId, error, now });
    throw error;
  }

  const staleSendingBefore = new Date(
    Date.parse(now) - 2 * 60 * 1_000,
  ).toISOString();
  const claimed = await env.DB.prepare(
    `UPDATE security_email_jobs
     SET status='sending',attempt_count=attempt_count+1,error_code=NULL,
         updated_at=?
     WHERE id=?
       AND (
         status IN ('pending','retrying')
         OR (status='sending' AND updated_at<=?)
       )`,
  ).bind(now, jobId, staleSendingBefore).run();
  if (Number(claimed.meta.changes ?? 0) !== 1) {
    const current = await env.DB.prepare(
      `SELECT status,provider_message_id AS providerMessageId
       FROM security_email_jobs WHERE id=? LIMIT 1`,
    ).bind(jobId).first<{
      status: string;
      providerMessageId: string | null;
    }>();
    if (current?.status === "sent") {
      return {
        providerMessageId: current.providerMessageId,
        alreadySent: true,
      };
    }
    throw new SecurityEmailError("EMAIL_PROVIDER_UNAVAILABLE", true);
  }

  const copy = emailCopy(row.locale === "uz" ? "uz" : "ru");
  let response: Response | null = null;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": `juro_security_email_${jobId}`,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [recipient],
        subject: copy.subject,
        html: copy.html,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      const error = providerFailure(response.status);
      await response.body?.cancel();
      await updateFailure(env.DB, {
        jobId,
        error,
        now: new Date().toISOString(),
      });
      throw error;
    }
    const payload = await response.json().catch(() => null) as { id?: unknown } | null;
    if (typeof payload?.id !== "string" || !/^[A-Za-z0-9_-]{1,180}$/.test(payload.id)) {
      const error = new SecurityEmailError("EMAIL_PROVIDER_UNAVAILABLE", true);
      await updateFailure(env.DB, {
        jobId,
        error,
        now: new Date().toISOString(),
      });
      throw error;
    }
    const sentAt = new Date().toISOString();
    const sent = await env.DB.prepare(
      `UPDATE security_email_jobs
       SET status='sent',provider_message_id=?,sent_at=?,error_code=NULL,
           updated_at=?
       WHERE id=? AND status='sending'`,
    ).bind(payload.id, sentAt, sentAt, jobId).run();
    if (Number(sent.meta.changes ?? 0) !== 1) {
      throw new SecurityEmailError("EMAIL_PROVIDER_UNAVAILABLE", true);
    }
    return { providerMessageId: payload.id, alreadySent: false };
  } catch (error) {
    if (error instanceof SecurityEmailError) throw error;
    const safe = new SecurityEmailError("EMAIL_PROVIDER_UNAVAILABLE", true);
    try {
      await response?.body?.cancel();
    } catch {
      // The failed provider response has no usable body.
    }
    await updateFailure(env.DB, {
      jobId,
      error: safe,
      now: new Date().toISOString(),
    });
    throw safe;
  }
}
