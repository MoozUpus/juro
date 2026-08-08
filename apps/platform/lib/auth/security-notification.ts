import { normalizeEmail } from "./crypto";
import type { PreparedDeviceContinuity } from "./device-continuity";
import {
  protectIdentityValue,
  type IdentityKeyring,
} from "./keyring";
import type { SecurityEventGuard } from "./security-events";

const RECIPIENT_PURPOSE = "security-notification-recipient";

export type LoginSecurityNotificationEvent =
  | "login_new_device"
  | "login_new_region";

export type LoginSecurityNotificationConfig = {
  keyring: IdentityKeyring;
  recipientEmail: string;
  locale: "ru" | "uz";
  workspaceId: string | null;
};

export type PreparedSecurityNotificationJob = {
  jobId: string;
  outboxId: string;
  eventType: LoginSecurityNotificationEvent;
  statements: (guard: SecurityEventGuard) => D1PreparedStatement[];
};

function comparableRegionChanged(
  continuity: PreparedDeviceContinuity,
): boolean {
  const previousCountry = continuity.previousCountryCode;
  const currentCountry = continuity.countryCode;
  if (previousCountry && currentCountry && previousCountry !== currentCountry) {
    return true;
  }
  return Boolean(
    previousCountry
      && currentCountry
      && previousCountry === currentCountry
      && continuity.previousRegionCode
      && continuity.regionCode
      && continuity.previousRegionCode !== continuity.regionCode,
  );
}

export function loginSecurityNotificationEvent(
  continuity: PreparedDeviceContinuity | null | undefined,
): LoginSecurityNotificationEvent | null {
  if (!continuity) return null;
  if (!continuity.recognized) return "login_new_device";
  return comparableRegionChanged(continuity) ? "login_new_region" : null;
}

function assertGuard(guard: SecurityEventGuard): void {
  if (!/^\s*SELECT\b/i.test(guard.selectSql) || guard.selectSql.includes(";")) {
    throw new Error("INVALID_SECURITY_NOTIFICATION_GUARD");
  }
}

function boundedDeviceName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 80) || "Unknown device";
}

export async function prepareLoginSecurityNotification(
  db: D1Database,
  input: {
    config: LoginSecurityNotificationConfig;
    userId: string;
    sessionId: string;
    deviceName: string;
    continuity: PreparedDeviceContinuity | null | undefined;
    occurredAt: string;
  },
): Promise<PreparedSecurityNotificationJob | null> {
  const continuity = input.continuity;
  const eventType = loginSecurityNotificationEvent(continuity);
  if (!eventType || !continuity) return null;

  const jobId = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  const recipient = await protectIdentityValue(
    input.config.keyring,
    normalizeEmail(input.config.recipientEmail),
    {
      purpose: RECIPIENT_PURPOSE,
      subjectId: input.userId,
      recordId: jobId,
    },
  );
  const deviceName = boundedDeviceName(input.deviceName);
  const idempotencyKey = `security_notification_${jobId}`;
  const correlationId = `login_security_${input.sessionId}`;

  return {
    jobId,
    outboxId,
    eventType,
    statements(guard) {
      assertGuard(guard);
      const guardSql = guard.selectSql;
      const guardBindings = guard.bindings;
      return [
        db.prepare(
          `INSERT INTO security_notification_jobs (
             id,user_id,workspace_id,session_id,event_type,delivery_channel,
             locale,recipient_ciphertext,recipient_iv,recipient_key_version,
             device_name,country_code,region_code,status,attempt_count,
             occurred_at,created_at,updated_at
           )
           SELECT ?,?,?,?,?,'email',?,?,?,?,?,?,?,'pending',0,?,?,?
           WHERE EXISTS (${guardSql})`,
        ).bind(
          jobId,
          input.userId,
          input.config.workspaceId,
          input.sessionId,
          eventType,
          input.config.locale,
          recipient.ciphertext,
          recipient.iv,
          recipient.keyVersion,
          deviceName,
          continuity.countryCode,
          continuity.regionCode,
          input.occurredAt,
          input.occurredAt,
          input.occurredAt,
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
             SELECT 1 FROM security_notification_jobs
             WHERE id=? AND status='pending'
           )
             AND EXISTS (${guardSql})`,
        ).bind(
          outboxId,
          idempotencyKey,
          jobId,
          input.config.workspaceId,
          correlationId,
          input.occurredAt,
          input.occurredAt,
          input.occurredAt,
          input.occurredAt,
          jobId,
          ...guardBindings,
        ),
      ];
    },
  };
}

export const SECURITY_NOTIFICATION_RECIPIENT_PURPOSE = RECIPIENT_PURPOSE;
