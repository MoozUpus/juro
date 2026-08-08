import { sha256 } from "./crypto";
import type { PlatformStaffRole } from "./staff-access";

const GENESIS_HASH = "0".repeat(64);
const MAX_CHAIN_RETRIES = 3;
const EVENT_DOMAIN = "juro-platform-staff-role-event-v1";

export type PlatformStaffRoleEventType =
  | "staff.role.granted"
  | "staff.role.revoked";

export type PlatformStaffRoleEventInput = {
  id?: string;
  actorUserId: string;
  actorSessionId: string;
  actorAssignmentId: string;
  subjectUserId: string;
  subjectAssignmentId: string;
  eventType: PlatformStaffRoleEventType;
  role: PlatformStaffRole;
  reason: string;
  actorMfaVerifiedAt: string;
  createdAt: string;
};

export type PlatformStaffRoleEventRecord = {
  id: string;
  previousHash: string;
  eventHash: string;
};

async function chainHead(
  db: D1Database,
  actorUserId: string,
): Promise<string> {
  const row = await db.prepare(
    `SELECT event.event_hash AS eventHash
     FROM platform_staff_role_events event
     WHERE event.actor_user_id=?
       AND NOT EXISTS (
         SELECT 1
         FROM platform_staff_role_events child
         WHERE child.actor_user_id=event.actor_user_id
           AND child.previous_hash=event.event_hash
       )
     LIMIT 1`,
  ).bind(actorUserId).first<{ eventHash: string }>();
  return row?.eventHash ?? GENESIS_HASH;
}

async function eventHash(
  input: PlatformStaffRoleEventInput,
  id: string,
  previousHash: string,
): Promise<string> {
  return sha256([
    EVENT_DOMAIN,
    previousHash,
    id,
    input.actorUserId,
    input.actorSessionId,
    input.actorAssignmentId,
    input.subjectUserId,
    input.subjectAssignmentId,
    input.eventType,
    "staff.roles.manage",
    input.role,
    input.reason,
    input.actorMfaVerifiedAt,
    input.createdAt,
  ].join("\n"));
}

export async function createPlatformStaffRoleEventRecord(
  db: D1Database,
  input: PlatformStaffRoleEventInput,
): Promise<PlatformStaffRoleEventRecord> {
  const id = input.id ?? crypto.randomUUID();
  const previousHash = await chainHead(db, input.actorUserId);
  return {
    id,
    previousHash,
    eventHash: await eventHash(input, id, previousHash),
  };
}

function eventStatement(
  db: D1Database,
  input: PlatformStaffRoleEventInput,
  record: PlatformStaffRoleEventRecord,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO platform_staff_role_events (
       id,actor_user_id,actor_session_id,actor_assignment_id,
       subject_user_id,subject_assignment_id,event_type,capability,role,
       reason,actor_mfa_verified_at,previous_hash,event_hash,created_at
     ) VALUES (?,?,?,?,?,?,?,'staff.roles.manage',?,?,?,?,?,?)`,
  ).bind(
    record.id,
    input.actorUserId,
    input.actorSessionId,
    input.actorAssignmentId,
    input.subjectUserId,
    input.subjectAssignmentId,
    input.eventType,
    input.role,
    input.reason,
    input.actorMfaVerifiedAt,
    record.previousHash,
    record.eventHash,
    input.createdAt,
  );
}

function isChainConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(
    "platform staff role event chain predecessor mismatch",
  )
    || message.includes("platform_staff_role_events_chain_uidx")
    || message.includes(
      "UNIQUE constraint failed: platform_staff_role_events.actor_user_id, platform_staff_role_events.previous_hash",
    );
}

export async function batchWithPlatformStaffRoleEvent(
  db: D1Database,
  input: PlatformStaffRoleEventInput,
  statements: (
    record: PlatformStaffRoleEventRecord,
  ) => D1PreparedStatement[],
): Promise<D1Result[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_CHAIN_RETRIES; attempt += 1) {
    const record = await createPlatformStaffRoleEventRecord(db, input);
    try {
      return await db.batch([
        ...statements(record),
        eventStatement(db, input, record),
      ]);
    } catch (error) {
      lastError = error;
      if (!isChainConflict(error)) throw error;
    }
  }
  throw lastError;
}

export async function verifyPlatformStaffRoleEventChain(
  events: Array<
    PlatformStaffRoleEventInput & PlatformStaffRoleEventRecord
  >,
): Promise<boolean> {
  let expectedPrevious = GENESIS_HASH;
  for (const event of events) {
    if (event.previousHash !== expectedPrevious) return false;
    const expectedHash = await eventHash(
      event,
      event.id,
      event.previousHash,
    );
    if (event.eventHash !== expectedHash) return false;
    expectedPrevious = event.eventHash;
  }
  return true;
}
