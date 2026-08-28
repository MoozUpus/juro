import {
  createIdentityProtectionContext,
  userIdentityById,
} from "../auth/identity-protection";

const JOB_PREFIX = "monitoring-email:";
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const IDENTIFIER_PATTERN = /^[A-Za-z0-9:_-]+$/;

export type MonitoringEmailErrorCode =
  | "EMAIL_CONFIGURATION_UNAVAILABLE"
  | "EMAIL_JOB_INVALID"
  | "EMAIL_PROVIDER_REJECTED"
  | "EMAIL_PROVIDER_UNAVAILABLE";

export class MonitoringEmailError extends Error {
  constructor(
    readonly code: MonitoringEmailErrorCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "MonitoringEmailError";
  }
}

export type MonitoringEmailRuntimeEnv = {
  DB: D1Database;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  IDENTITY_KEYRING?: string;
  IDENTITY_PROTECTION_MODE?: string;
};

type MonitoringEmailJobRow = {
  id: string;
  preferenceId: string;
  notificationId: string;
  workspaceId: string;
  userId: string;
  frequency: "immediate" | "daily" | "weekly";
  locale: "ru" | "uz";
  cursorThrough: string;
  eventCount: number;
  officialUrl: string;
  status: string;
  providerMessageId: string | null;
  notificationType: string;
  notificationTitle: string;
  notificationBody: string;
  channelsJson: string;
  lastDeliveredAt: string | null;
  memberStatus: string | null;
};

export function monitoringEmailJobId(notificationId: string): string {
  if (!IDENTIFIER_PATTERN.test(notificationId) || notificationId.length > 150) {
    throw new MonitoringEmailError("EMAIL_JOB_INVALID", false);
  }
  const id = `${JOB_PREFIX}${notificationId}`;
  if (id.length > 180) {
    throw new MonitoringEmailError("EMAIL_JOB_INVALID", false);
  }
  return id;
}

export function isMonitoringEmailJobId(value: string): boolean {
  return value.startsWith(JOB_PREFIX) && value.length <= 180;
}

export async function executeMonitoringEmail(
  env: MonitoringEmailRuntimeEnv,
  jobId: string,
): Promise<{
  providerMessageId: string | null;
  alreadySent: boolean;
  cancelled: boolean;
}> {
  const row = await monitoringEmailJob(env.DB, jobId);
  if (!row || !isMonitoringEmailJobId(jobId)) {
    throw new MonitoringEmailError("EMAIL_JOB_INVALID", false);
  }
  if (row.status === "sent") {
    return {
      providerMessageId: row.providerMessageId,
      alreadySent: true,
      cancelled: false,
    };
  }
  if (["failed", "cancelled"].includes(row.status)) {
    throw new MonitoringEmailError("EMAIL_JOB_INVALID", false);
  }

  const now = new Date().toISOString();
  if (!sourceIsActive(row)) {
    await cancelJob(env.DB, row.id, now);
    return { providerMessageId: null, alreadySent: false, cancelled: true };
  }

  const staleSendingBefore = new Date(Date.parse(now) - 2 * 60_000).toISOString();
  const claimed = await env.DB.prepare(
    `UPDATE monitoring_email_jobs
        SET status='sending',attempt_count=attempt_count+1,error_code=NULL,
            updated_at=?
      WHERE id=?
        AND (
          status IN ('pending','retrying')
          OR (status='sending' AND updated_at<=?)
        )`,
  ).bind(now, row.id, staleSendingBefore).run();
  if (Number(claimed.meta.changes ?? 0) !== 1) {
    const current = await monitoringEmailJob(env.DB, jobId);
    if (current?.status === "sent") {
      return {
        providerMessageId: current.providerMessageId,
        alreadySent: true,
        cancelled: false,
      };
    }
    throw new MonitoringEmailError("EMAIL_PROVIDER_UNAVAILABLE", true);
  }

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    const error = new MonitoringEmailError(
      "EMAIL_CONFIGURATION_UNAVAILABLE",
      false,
    );
    await failJob(env.DB, row.id, error, now);
    throw error;
  }

  let recipient: string;
  try {
    const identity = await userIdentityById(
      env.DB,
      createIdentityProtectionContext(
        env.IDENTITY_PROTECTION_MODE,
        env.IDENTITY_KEYRING,
      ),
      row.userId,
    );
    if (!identity) throw new Error("IDENTITY_NOT_FOUND");
    recipient = identity.email;
  } catch {
    const error = new MonitoringEmailError("EMAIL_JOB_INVALID", false);
    await failJob(env.DB, row.id, error, new Date().toISOString());
    throw error;
  }

  const copy = emailCopy(row);
  let providerResponse: Response | null = null;
  try {
    providerResponse = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": `juro_monitoring_${row.id}`,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [recipient],
        subject: copy.subject,
        html: copy.html,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!providerResponse.ok) {
      const error = providerFailure(providerResponse.status);
      await providerResponse.body?.cancel();
      await failJob(env.DB, row.id, error, new Date().toISOString());
      throw error;
    }
    const payload = await providerResponse.json().catch(() => null) as {
      id?: unknown;
    } | null;
    if (
      typeof payload?.id !== "string"
      || !/^[A-Za-z0-9_-]{1,180}$/.test(payload.id)
    ) {
      const error = new MonitoringEmailError(
        "EMAIL_PROVIDER_UNAVAILABLE",
        true,
      );
      await failJob(env.DB, row.id, error, new Date().toISOString());
      throw error;
    }
    const sentAt = new Date().toISOString();
    const sent = await env.DB.prepare(
      `UPDATE monitoring_email_jobs
          SET status='sent',provider_message_id=?,error_code=NULL,
              sent_at=?,updated_at=?
        WHERE id=? AND status='sending'`,
    ).bind(payload.id, sentAt, sentAt, row.id).run();
    if (Number(sent.meta.changes ?? 0) !== 1) {
      throw new MonitoringEmailError("EMAIL_PROVIDER_UNAVAILABLE", true);
    }
    return {
      providerMessageId: payload.id,
      alreadySent: false,
      cancelled: false,
    };
  } catch (error) {
    if (error instanceof MonitoringEmailError) throw error;
    try {
      await providerResponse?.body?.cancel();
    } catch {
      // There is no safe provider response body left to consume.
    }
    const safe = new MonitoringEmailError("EMAIL_PROVIDER_UNAVAILABLE", true);
    await failJob(env.DB, row.id, safe, new Date().toISOString()).catch(
      () => undefined,
    );
    throw safe;
  }
}

async function monitoringEmailJob(
  db: D1Database,
  jobId: string,
): Promise<MonitoringEmailJobRow | null> {
  return db.prepare(
    `SELECT job.id,job.preference_id AS preferenceId,
            job.notification_id AS notificationId,
            job.workspace_id AS workspaceId,job.user_id AS userId,
            job.frequency,job.locale,job.cursor_through AS cursorThrough,
            job.event_count AS eventCount,job.official_url AS officialUrl,
            job.status,job.provider_message_id AS providerMessageId,
            notification.type AS notificationType,
            notification.title AS notificationTitle,
            notification.body AS notificationBody,
            preference.channels_json AS channelsJson,
            preference.last_delivered_at AS lastDeliveredAt,
            member.status AS memberStatus
       FROM monitoring_email_jobs job
       JOIN monitoring_preferences preference
         ON preference.id=job.preference_id
        AND preference.workspace_id=job.workspace_id
        AND preference.user_id=job.user_id
       JOIN notifications notification
         ON notification.id=job.notification_id
        AND notification.workspace_id=job.workspace_id
        AND notification.user_id=job.user_id
       LEFT JOIN workspace_members member
         ON member.workspace_id=job.workspace_id
        AND member.user_id=job.user_id
      WHERE job.id=? LIMIT 1`,
  ).bind(jobId).first<MonitoringEmailJobRow>();
}

function sourceIsActive(row: MonitoringEmailJobRow): boolean {
  if (
    row.notificationType !== "legislation_monitor"
    || row.memberStatus !== "active"
    || !row.lastDeliveredAt
    || row.lastDeliveredAt < row.cursorThrough
  ) return false;
  try {
    const channels = JSON.parse(row.channelsJson) as unknown;
    if (!Array.isArray(channels) || !channels.includes("email")) return false;
    const official = new URL(row.officialUrl);
    return official.protocol === "https:"
      && (official.hostname === "lex.uz" || official.hostname === "www.lex.uz")
      && !official.search
      && !official.hash;
  } catch {
    return false;
  }
}

async function cancelJob(
  db: D1Database,
  jobId: string,
  now: string,
): Promise<void> {
  await db.prepare(
    `UPDATE monitoring_email_jobs
        SET status='cancelled',error_code='SOURCE_STALE',updated_at=?
      WHERE id=? AND status IN ('pending','sending','retrying')`,
  ).bind(now, jobId).run();
}

async function failJob(
  db: D1Database,
  jobId: string,
  error: MonitoringEmailError,
  now: string,
): Promise<void> {
  await db.prepare(
    `UPDATE monitoring_email_jobs
        SET status=?,error_code=?,updated_at=?
      WHERE id=? AND status='sending'`,
  ).bind(error.retryable ? "retrying" : "failed", error.code, now, jobId).run();
}

function providerFailure(status: number): MonitoringEmailError {
  return status === 408 || status === 425 || status === 429 || status >= 500
    ? new MonitoringEmailError("EMAIL_PROVIDER_UNAVAILABLE", true)
    : new MonitoringEmailError("EMAIL_PROVIDER_REJECTED", false);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function frequencyLabel(
  frequency: MonitoringEmailJobRow["frequency"],
  locale: MonitoringEmailJobRow["locale"],
): string {
  const labels = locale === "uz"
    ? { immediate: "darhol", daily: "har kuni", weekly: "har hafta" }
    : { immediate: "немедленно", daily: "ежедневно", weekly: "еженедельно" };
  return labels[frequency];
}

function emailCopy(row: MonitoringEmailJobRow): {
  subject: string;
  html: string;
} {
  const subject = escapeHtml(row.notificationTitle);
  const body = escapeHtml(row.notificationBody);
  const officialUrl = escapeHtml(row.officialUrl);
  const cadence = escapeHtml(frequencyLabel(row.frequency, row.locale));
  if (row.locale === "uz") {
    return {
      subject: row.notificationTitle,
      html: `<div style="font-family:Arial,sans-serif;color:#111d36"><h2>${subject}</h2><p>JURO Lex.uz rasmiy RSS metadata’larida yangilanish aniqladi. Siz tanlagan tezlik: <strong>${cadence}</strong>.</p><p>${body}</p><p><a href="${officialUrl}">Lex.uz’dagi rasmiy manbani ochish</a></p><p style="color:#526174">Bu metadata monitoring bildirishnomasi; u huquqiy xulosa yoki hujjat matnining rasmiy talqini emas.</p></div>`,
    };
  }
  return {
    subject: row.notificationTitle,
    html: `<div style="font-family:Arial,sans-serif;color:#111d36"><h2>${subject}</h2><p>JURO обнаружил обновление официальных RSS-метаданных Lex.uz. Выбранная частота: <strong>${cadence}</strong>.</p><p>${body}</p><p><a href="${officialUrl}">Открыть официальный источник на Lex.uz</a></p><p style="color:#526174">Это уведомление metadata-мониторинга, а не юридический вывод или официальное толкование текста документа.</p></div>`,
  };
}
