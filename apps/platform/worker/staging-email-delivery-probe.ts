import { z } from "zod";
import { recordDependencyHealthEvidence } from "./dependency-health-evidence";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const PROBE_KEY_PREFIX = "staging-resend-acceptance-v2";
const MAX_PROVIDER_RESPONSE_BYTES = 4_096;

const rowSchema = z.object({
  probeKey: z.string().regex(/^staging-resend-acceptance-v2-\d{8}$/u),
  status: z.enum(["pending", "sending", "retrying", "sent", "failed"]),
  attemptCount: z.number().int().nonnegative(),
  providerMessageId: z.string().nullable(),
  errorCode: z.string().nullable(),
}).strict();

const resendResponseSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,180}$/u),
}).passthrough();

export type StagingEmailDeliveryProbeEnv = {
  DB: D1Database;
  APP_ENV: string;
  STAGING_SYNTHETIC_PROBES_ENABLED?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  OPERATIONS_ALERT_EMAIL?: string;
};

export type StagingEmailDeliveryProbeSummary = {
  attempted: number;
  accepted: number;
  failed: number;
  skipped: number;
  alreadyAccepted: number;
  providerMessageId: string | null;
};

export type StagingEmailDeliveryProbeOptions = {
  /** Only used by deterministic tests; scheduled production code omits it. */
  now?: Date;
};

/**
 * A scheduled invocation happens every five minutes, but this probe sends at
 * most one content-free message in each UTC day. The immutable key makes
 * provider idempotency and D1 concurrency agree without retaining recipient
 * data or a message body.
 */
export function stagingEmailDeliveryProbeKey(now = new Date()): string {
  return `${PROBE_KEY_PREFIX}-${now.toISOString().slice(0, 10).replaceAll("-", "")}`;
}

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function errorCode(error: unknown): string {
  if (error instanceof Error && error.message === "STAGING_EMAIL_RESPONSE_TOO_LARGE") {
    return "STAGING_EMAIL_RESPONSE_TOO_LARGE";
  }
  if (error instanceof Error && error.name === "SyntaxError") {
    return "STAGING_EMAIL_RESPONSE_INVALID";
  }
  return "STAGING_EMAIL_PROVIDER_UNAVAILABLE";
}

function responseErrorCode(status: number): string {
  return status === 408 || status === 425 || status === 429 || status >= 500
    ? "STAGING_EMAIL_PROVIDER_UNAVAILABLE"
    : "STAGING_EMAIL_PROVIDER_REJECTED";
}

function safeRecipient(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)
    ? normalized
    : null;
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("STAGING_EMAIL_RESPONSE_INVALID");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("STAGING_EMAIL_RESPONSE_TOO_LARGE");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

async function current(
  env: Pick<StagingEmailDeliveryProbeEnv, "DB">,
  probeKey: string,
) {
  const row = await env.DB.prepare(
    `SELECT probe_key AS probeKey,status,attempt_count AS attemptCount,
       provider_message_id AS providerMessageId,error_code AS errorCode
     FROM staging_email_delivery_probes WHERE probe_key=? LIMIT 1`,
  ).bind(probeKey).first<unknown>();
  return row ? rowSchema.parse(row) : null;
}

async function recordFailure(
  env: Pick<StagingEmailDeliveryProbeEnv, "DB">,
  probeKey: string,
  code: string,
): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `UPDATE staging_email_delivery_probes
     SET status='failed',error_code=?,updated_at=?
     WHERE probe_key=? AND status='sending'`,
  ).bind(code, now, probeKey).run();
}

export function stagingEmailDeliveryProbeEnabled(
  env: Pick<StagingEmailDeliveryProbeEnv, "APP_ENV" | "STAGING_SYNTHETIC_PROBES_ENABLED">,
): boolean {
  return env.APP_ENV === "staging"
    && (env as Record<string, unknown>).STAGING_SYNTHETIC_PROBES_ENABLED === "true";
}

/**
 * Sends at most one explicitly-authorized, content-free email per UTC day to
 * the protected operations recipient. A Resend acceptance receipt is
 * persisted, but is never represented as proof that a mailbox received or
 * displayed the email.
 */
export async function runStagingEmailDeliveryProbe(
  env: StagingEmailDeliveryProbeEnv,
  options: StagingEmailDeliveryProbeOptions = {},
): Promise<StagingEmailDeliveryProbeSummary> {
  const skipped = { attempted: 0, accepted: 0, failed: 0, skipped: 1, alreadyAccepted: 0, providerMessageId: null };
  if (!stagingEmailDeliveryProbeEnabled(env)) return skipped;

  const probeKey = stagingEmailDeliveryProbeKey(options.now);
  const insertedAt = nowIso(options.now);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO staging_email_delivery_probes
     (probe_key,status,attempt_count,provider_message_id,error_code,sent_at,created_at,updated_at)
     VALUES (?,'pending',0,NULL,NULL,NULL,?,?)`,
  ).bind(probeKey, insertedAt, insertedAt).run();

  const existing = await current(env, probeKey);
  if (!existing) throw new Error("STAGING_EMAIL_PROBE_ROW_UNAVAILABLE");
  if (existing.status === "sent") {
    return { attempted: 0, accepted: 1, failed: 0, skipped: 0, alreadyAccepted: 1, providerMessageId: existing.providerMessageId };
  }
  if (existing.status === "failed") {
    return { attempted: 0, accepted: 0, failed: 1, skipped: 0, alreadyAccepted: 0, providerMessageId: null };
  }

  const recipient = env.OPERATIONS_ALERT_EMAIL ? safeRecipient(env.OPERATIONS_ALERT_EMAIL) : null;
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !recipient) {
    const claimed = await env.DB.prepare(
      `UPDATE staging_email_delivery_probes
       SET status='sending',attempt_count=attempt_count+1,error_code=NULL,updated_at=?
       WHERE probe_key=? AND status IN ('pending','retrying')`,
    ).bind(nowIso(), probeKey).run();
    if (Number(claimed.meta.changes ?? 0) === 1) {
      await recordFailure(env, probeKey, "STAGING_EMAIL_CONFIGURATION_UNAVAILABLE");
      await recordDependencyHealthEvidence(env, {
        key: "resend",
        state: "degraded",
        safeErrorCode: "PROBE_CONFIGURATION_ERROR",
        evidenceKind: "synthetic_probe",
        startedAt: Date.now(),
      });
    }
    return { attempted: 0, accepted: 0, failed: 1, skipped: 0, alreadyAccepted: 0, providerMessageId: null };
  }

  const claimed = await env.DB.prepare(
    `UPDATE staging_email_delivery_probes
     SET status='sending',attempt_count=attempt_count+1,error_code=NULL,updated_at=?
     WHERE probe_key=? AND status IN ('pending','retrying')`,
  ).bind(nowIso(), probeKey).run();
  if (Number(claimed.meta.changes ?? 0) !== 1) {
    const concurrent = await current(env, probeKey);
    if (concurrent?.status === "sent") {
      return { attempted: 0, accepted: 1, failed: 0, skipped: 0, alreadyAccepted: 1, providerMessageId: concurrent.providerMessageId };
    }
    return { attempted: 0, accepted: 0, failed: concurrent?.status === "failed" ? 1 : 0, skipped: 1, alreadyAccepted: 0, providerMessageId: null };
  }

  let response: Response | null = null;
  let providerStartedAt: number | null = null;
  try {
    providerStartedAt = Date.now();
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": `juro_${probeKey}`,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [recipient],
        subject: "[JURO staging] Проверка приёма Resend",
        html: "<p>Это контролируемая техническая проверка staging JURO. В письме нет пользовательских или юридических данных. Ответ Resend подтверждает только приём запроса, а не доставку или отображение в inbox.</p>",
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      const code = responseErrorCode(response.status);
      await response.body?.cancel();
      await recordFailure(env, probeKey, code);
      await recordDependencyHealthEvidence(env, {
        key: "resend",
        state: "degraded",
        safeErrorCode: "PROBE_HTTP_ERROR",
        evidenceKind: "synthetic_probe",
        startedAt: providerStartedAt,
      });
      return { attempted: 1, accepted: 0, failed: 1, skipped: 0, alreadyAccepted: 0, providerMessageId: null };
    }
    const parsed = resendResponseSchema.parse(await boundedJson(response));
    const sentAt = nowIso();
    const committed = await env.DB.prepare(
      `UPDATE staging_email_delivery_probes
       SET status='sent',provider_message_id=?,sent_at=?,error_code=NULL,updated_at=?
       WHERE probe_key=? AND status='sending'`,
    ).bind(parsed.id, sentAt, sentAt, probeKey).run();
    if (Number(committed.meta.changes ?? 0) !== 1) {
      throw new Error("STAGING_EMAIL_PROBE_RECEIPT_UNAVAILABLE");
    }
    await recordDependencyHealthEvidence(env, {
      key: "resend",
      state: "operational",
      evidenceKind: "synthetic_probe",
      startedAt: providerStartedAt,
      minimumOperationalIntervalMs: 30 * 60_000,
    });
    return { attempted: 1, accepted: 1, failed: 0, skipped: 0, alreadyAccepted: 0, providerMessageId: parsed.id };
  } catch (error) {
    try {
      await response?.body?.cancel();
    } catch {
      // The bounded provider response is no longer usable.
    }
    await recordFailure(env, probeKey, errorCode(error));
    if (providerStartedAt !== null) {
      await recordDependencyHealthEvidence(env, {
        key: "resend",
        state: "degraded",
        safeErrorCode: "PROBE_NETWORK_ERROR",
        evidenceKind: "synthetic_probe",
        startedAt: providerStartedAt,
      });
    }
    return { attempted: 1, accepted: 0, failed: 1, skipped: 0, alreadyAccepted: 0, providerMessageId: null };
  }
}
