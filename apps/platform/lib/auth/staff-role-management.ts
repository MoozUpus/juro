import type { LocalSession } from "./session-management";
import {
  isPlatformStaffRole,
  PlatformStaffAccessError,
  requirePlatformStaffAccess,
  type PlatformStaffRole,
} from "./staff-access";
import {
  batchWithPlatformStaffRoleEvent,
  type PlatformStaffRoleEventType,
} from "./staff-role-events";

export const STAFF_ROLE_FRESH_MFA_MS = 5 * 60 * 1_000;
export const MAX_STAFF_ROLE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

export type PlatformStaffRoleManagementErrorCode =
  | "PLATFORM_STAFF_ROLE_INPUT_INVALID"
  | "PLATFORM_STAFF_ROLE_SELF_GRANT_FORBIDDEN"
  | "PLATFORM_STAFF_ROLE_SUBJECT_MFA_REQUIRED"
  | "PLATFORM_STAFF_ROLE_ALREADY_ACTIVE"
  | "PLATFORM_STAFF_ROLE_NOT_ACTIVE"
  | "PLATFORM_STAFF_ROLE_STATE_CONFLICT";

export class PlatformStaffRoleManagementError extends Error {
  constructor(
    readonly code: PlatformStaffRoleManagementErrorCode,
  ) {
    super(code);
    this.name = "PlatformStaffRoleManagementError";
  }
}

type StaffManagementSession = Pick<
  LocalSession,
  "sessionId" | "userId" | "assuranceLevel" | "mfaVerifiedAt"
>;

type AssignmentRow = {
  id: string;
  userId: string;
  role: string;
  revokedAt: string | null;
};

function fail(
  code: PlatformStaffRoleManagementErrorCode,
): never {
  throw new PlatformStaffRoleManagementError(code);
}

function instant(value: Date): number {
  const timestamp = value.getTime();
  if (!Number.isFinite(timestamp)) {
    return fail("PLATFORM_STAFF_ROLE_INPUT_INVALID");
  }
  return timestamp;
}

function opaqueId(value: string): string {
  if (
    value.length < 1
    || value.length > 200
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return fail("PLATFORM_STAFF_ROLE_INPUT_INVALID");
  }
  return value;
}

function auditReason(value: string): string {
  const reason = value.trim();
  if (
    reason.length < 1
    || reason.length > 500
    || /[\u0000-\u001f\u007f]/.test(reason)
  ) {
    return fail("PLATFORM_STAFF_ROLE_INPUT_INVALID");
  }
  return reason;
}

function isActiveRoleConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("platform_staff_assignments_active_uidx")
    || message.includes(
      "UNIQUE constraint failed: platform_staff_assignments.user_id, platform_staff_assignments.role",
    );
}

function isStateConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("platform staff role event evidence mismatch")
    || message.includes(
      "platform staff role event chain predecessor mismatch",
    )
    || message.includes(
      "platform_staff_role_events_assignment_type_uidx",
    )
    || message.includes(
      "platform_staff_role_events_chain_uidx",
    );
}

async function managementAccess(
  db: D1Database,
  session: StaffManagementSession,
  now: Date,
) {
  const access = await requirePlatformStaffAccess(
    db,
    session,
    "staff.roles.manage",
    {
      now,
      freshMfaWithinMs: STAFF_ROLE_FRESH_MFA_MS,
    },
  );
  if (
    access.assignmentIds.length !== 1
    || access.roles.length !== 1
    || access.roles[0] !== "administrator"
  ) {
    throw new PlatformStaffAccessError();
  }
  return {
    actorAssignmentId: access.assignmentIds[0],
    actorMfaVerifiedAt: access.mfaVerifiedAt,
  };
}

async function subjectHasActiveMfa(
  db: D1Database,
  userId: string,
  nowIso: string,
): Promise<boolean> {
  return Boolean(await db.prepare(
    `SELECT 1
     FROM user_profiles u
     WHERE u.id=?
       AND EXISTS (
         SELECT 1
         FROM auth_totp_credentials t
         WHERE t.user_id=u.id
           AND t.status='active'
           AND t.verified_at IS NOT NULL
           AND t.verified_at<=?
           AND t.disabled_at IS NULL
       )
     LIMIT 1`,
  ).bind(userId, nowIso).first());
}

export async function grantPlatformStaffRole(
  db: D1Database,
  session: StaffManagementSession,
  input: {
    subjectUserId: string;
    role: PlatformStaffRole;
    reason: string;
    expiresAt: Date;
    now?: Date;
  },
): Promise<{
  assignmentId: string;
  eventId: string;
  expiresAt: string;
}> {
  const now = input.now ?? new Date();
  const nowMs = instant(now);
  const expiresAtMs = instant(input.expiresAt);
  const subjectUserId = opaqueId(input.subjectUserId);
  const reason = auditReason(input.reason);
  if (
    !isPlatformStaffRole(input.role)
    || expiresAtMs <= nowMs
    || expiresAtMs - nowMs > MAX_STAFF_ROLE_TTL_MS
  ) {
    return fail("PLATFORM_STAFF_ROLE_INPUT_INVALID");
  }
  if (subjectUserId === session.userId) {
    return fail("PLATFORM_STAFF_ROLE_SELF_GRANT_FORBIDDEN");
  }

  const access = await managementAccess(db, session, now);
  const createdAt = now.toISOString();
  if (!await subjectHasActiveMfa(db, subjectUserId, createdAt)) {
    return fail("PLATFORM_STAFF_ROLE_SUBJECT_MFA_REQUIRED");
  }

  const assignmentId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const expiresAt = input.expiresAt.toISOString();
  try {
    const results = await batchWithPlatformStaffRoleEvent(
      db,
      {
        id: eventId,
        actorUserId: session.userId,
        actorSessionId: session.sessionId,
        actorAssignmentId: access.actorAssignmentId,
        subjectUserId,
        subjectAssignmentId: assignmentId,
        eventType: "staff.role.granted",
        role: input.role,
        reason,
        actorMfaVerifiedAt: access.actorMfaVerifiedAt,
        createdAt,
      },
      () => [
        db.prepare(
          `INSERT INTO platform_staff_assignments (
             id,user_id,role,grant_source,granted_by_user_id,grant_reason,
             granted_at,expires_at,created_at,updated_at
           )
           SELECT ?,?,?,'administrator',?,?,?, ?,?,?
           WHERE EXISTS (
             SELECT 1
             FROM auth_totp_credentials
             WHERE user_id=? AND status='active'
               AND verified_at IS NOT NULL AND verified_at<=?
               AND disabled_at IS NULL
           )`,
        ).bind(
          assignmentId,
          subjectUserId,
          input.role,
          session.userId,
          reason,
          createdAt,
          expiresAt,
          createdAt,
          createdAt,
          subjectUserId,
          createdAt,
        ),
      ],
    );
    if (
      Number(results[0]?.meta?.changes ?? 0) !== 1
      || Number(results[1]?.meta?.changes ?? 0) !== 1
    ) {
      return fail("PLATFORM_STAFF_ROLE_STATE_CONFLICT");
    }
  } catch (error) {
    if (error instanceof PlatformStaffRoleManagementError) throw error;
    if (isActiveRoleConflict(error)) {
      return fail("PLATFORM_STAFF_ROLE_ALREADY_ACTIVE");
    }
    if (isStateConflict(error)) {
      return fail("PLATFORM_STAFF_ROLE_STATE_CONFLICT");
    }
    throw error;
  }
  return { assignmentId, eventId, expiresAt };
}

export async function revokePlatformStaffRole(
  db: D1Database,
  session: StaffManagementSession,
  input: {
    assignmentId: string;
    reason: string;
    now?: Date;
  },
): Promise<{
  assignmentId: string;
  eventId: string;
}> {
  const now = input.now ?? new Date();
  instant(now);
  const assignmentId = opaqueId(input.assignmentId);
  const reason = auditReason(input.reason);
  const access = await managementAccess(db, session, now);
  const createdAt = now.toISOString();
  const assignment = await db.prepare(
    `SELECT id,user_id AS userId,role,revoked_at AS revokedAt
     FROM platform_staff_assignments
     WHERE id=? AND granted_at<=? AND expires_at>? LIMIT 1`,
  ).bind(
    assignmentId,
    createdAt,
    createdAt,
  ).first<AssignmentRow>();
  if (
    !assignment
    || assignment.revokedAt !== null
    || !isPlatformStaffRole(assignment.role)
  ) {
    return fail("PLATFORM_STAFF_ROLE_NOT_ACTIVE");
  }

  const eventId = crypto.randomUUID();
  const eventType: PlatformStaffRoleEventType = "staff.role.revoked";
  try {
    const results = await batchWithPlatformStaffRoleEvent(
      db,
      {
        id: eventId,
        actorUserId: session.userId,
        actorSessionId: session.sessionId,
        actorAssignmentId: access.actorAssignmentId,
        subjectUserId: assignment.userId,
        subjectAssignmentId: assignment.id,
        eventType,
        role: assignment.role,
        reason,
        actorMfaVerifiedAt: access.actorMfaVerifiedAt,
        createdAt,
      },
      () => [
        db.prepare(
          `UPDATE platform_staff_assignments
           SET revoked_at=?,revocation_source='administrator',
               revoked_by_user_id=?,revocation_reason=?,updated_at=?
           WHERE id=? AND user_id=? AND role=? AND revoked_at IS NULL`,
        ).bind(
          createdAt,
          session.userId,
          reason,
          createdAt,
          assignment.id,
          assignment.userId,
          assignment.role,
        ),
      ],
    );
    if (
      Number(results[0]?.meta?.changes ?? 0) !== 1
      || Number(results[1]?.meta?.changes ?? 0) !== 1
    ) {
      return fail("PLATFORM_STAFF_ROLE_STATE_CONFLICT");
    }
  } catch (error) {
    if (error instanceof PlatformStaffRoleManagementError) throw error;
    if (isStateConflict(error)) {
      return fail("PLATFORM_STAFF_ROLE_STATE_CONFLICT");
    }
    throw error;
  }
  return { assignmentId: assignment.id, eventId };
}
