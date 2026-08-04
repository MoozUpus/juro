import type { LocalSession } from "./session-management";

export const platformStaffRoles = [
  "administrator",
  "support",
  "legal_reviewer",
] as const;

export type PlatformStaffRole = typeof platformStaffRoles[number];

export const platformStaffCapabilities = [
  "staff.console.view",
  "staff.roles.manage",
  "staff.security.audit",
  "staff.operations.manage",
  "support.tickets.manage",
  "legal.sources.review",
  "legal.sources.publish",
  "knowledge.base.manage",
  "lawyer.reviews.moderate",
  "lawyer.profiles.moderate",
  "ai.quality.review",
] as const;

export type PlatformStaffCapability =
  typeof platformStaffCapabilities[number];

const roleCapabilities: Readonly<
  Record<PlatformStaffRole, ReadonlySet<PlatformStaffCapability>>
> = {
  administrator: new Set([
    "staff.console.view",
    "staff.roles.manage",
    "staff.security.audit",
    "staff.operations.manage",
    "knowledge.base.manage",
  ]),
  support: new Set([
    "staff.console.view",
    "support.tickets.manage",
  ]),
  legal_reviewer: new Set([
    "staff.console.view",
    "legal.sources.review",
    "legal.sources.publish",
    "knowledge.base.manage",
    "lawyer.reviews.moderate",
    "lawyer.profiles.moderate",
    "ai.quality.review",
  ]),
};

type StaffAssignmentRow = {
  id: string;
  role: string;
  grantedAt: string;
  expiresAt: string;
  mfaVerifiedAt: string;
};

export type PlatformStaffAccess = {
  userId: string;
  sessionId: string;
  capability: PlatformStaffCapability;
  roles: PlatformStaffRole[];
  assignmentIds: string[];
  mfaVerifiedAt: string;
};

export class PlatformStaffAccessError extends Error {
  constructor() {
    super("PLATFORM_STAFF_ACCESS_DENIED");
    this.name = "PlatformStaffAccessError";
  }
}

export function isPlatformStaffRole(
  value: unknown,
): value is PlatformStaffRole {
  return typeof value === "string"
    && platformStaffRoles.includes(value as PlatformStaffRole);
}

export function isPlatformStaffCapability(
  value: unknown,
): value is PlatformStaffCapability {
  return typeof value === "string"
    && platformStaffCapabilities.includes(
      value as PlatformStaffCapability,
    );
}

export function platformStaffRoleAllows(
  role: PlatformStaffRole,
  capability: PlatformStaffCapability,
): boolean {
  return roleCapabilities[role].has(capability);
}

function denied(): never {
  throw new PlatformStaffAccessError();
}

function validTimestamp(value: string | null): value is string {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

export async function requirePlatformStaffAccess(
  db: D1Database,
  session: Pick<
    LocalSession,
    "sessionId" | "userId" | "assuranceLevel" | "mfaVerifiedAt"
  >,
  capability: PlatformStaffCapability,
  options: {
    now?: Date;
    freshMfaWithinMs?: number;
  } = {},
): Promise<PlatformStaffAccess> {
  if (
    !isPlatformStaffCapability(capability)
    || session.assuranceLevel !== "mfa"
    || !validTimestamp(session.mfaVerifiedAt)
  ) {
    return denied();
  }

  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return denied();
  const nowIso = now.toISOString();

  let freshSince: string | null = null;
  if (options.freshMfaWithinMs !== undefined) {
    if (
      !Number.isSafeInteger(options.freshMfaWithinMs)
      || options.freshMfaWithinMs <= 0
    ) {
      return denied();
    }
    freshSince = new Date(
      nowMs - options.freshMfaWithinMs,
    ).toISOString();
  }

  const rows = await db.prepare(
    `SELECT
       a.id,a.role,a.granted_at AS grantedAt,a.expires_at AS expiresAt,
       s.mfa_verified_at AS mfaVerifiedAt
     FROM platform_staff_assignments a
     JOIN auth_sessions s
       ON s.id=? AND s.user_id=a.user_id
     LEFT JOIN auth_devices d ON d.id=s.device_id
     WHERE a.user_id=?
       AND a.revoked_at IS NULL
       AND a.granted_at<=?
       AND a.expires_at>?
       AND s.revoked_at IS NULL
       AND s.assurance_level='mfa'
       AND s.mfa_verified_at IS NOT NULL
       AND s.mfa_verified_at<=?
       AND (? IS NULL OR s.mfa_verified_at>=?)
       AND s.expires_at>?
       AND coalesce(s.idle_expires_at,s.expires_at)>?
       AND (
         s.device_id IS NULL
         OR (d.id IS NOT NULL AND d.revoked_at IS NULL)
       )
       AND EXISTS (
         SELECT 1
         FROM auth_totp_credentials t
         WHERE t.user_id=a.user_id
           AND t.status='active'
           AND t.verified_at IS NOT NULL
           AND t.verified_at<=?
           AND t.disabled_at IS NULL
       )
     ORDER BY a.role,a.id`,
  ).bind(
    session.sessionId,
    session.userId,
    nowIso,
    nowIso,
    nowIso,
    freshSince,
    freshSince,
    nowIso,
    nowIso,
    nowIso,
  ).all<StaffAssignmentRow>();

  const allowed = rows.results.filter((row) => {
    if (
      !isPlatformStaffRole(row.role)
      || !validTimestamp(row.grantedAt)
      || !validTimestamp(row.expiresAt)
      || !validTimestamp(row.mfaVerifiedAt)
    ) {
      return false;
    }
    const grantedAt = Date.parse(row.grantedAt);
    const expiresAt = Date.parse(row.expiresAt);
    const mfaVerifiedAt = Date.parse(row.mfaVerifiedAt);
    if (
      grantedAt > nowMs
      || expiresAt <= nowMs
      || mfaVerifiedAt > nowMs
      || (
        freshSince !== null
        && mfaVerifiedAt < Date.parse(freshSince)
      )
    ) {
      return false;
    }
    return platformStaffRoleAllows(row.role, capability);
  });
  if (!allowed.length) return denied();

  const mfaVerifiedAt = allowed[0].mfaVerifiedAt;
  if (allowed.some((row) => row.mfaVerifiedAt !== mfaVerifiedAt)) {
    return denied();
  }

  return {
    userId: session.userId,
    sessionId: session.sessionId,
    capability,
    roles: allowed.map((row) => row.role as PlatformStaffRole),
    assignmentIds: allowed.map((row) => row.id),
    mfaVerifiedAt,
  };
}
