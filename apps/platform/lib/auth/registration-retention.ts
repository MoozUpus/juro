export const PENDING_REGISTRATION_TTL_MS = 24 * 60 * 60 * 1_000;

const PENDING_REGISTRATION_PURGE_BATCH_SIZE = 100;
const REGISTRATION_OTP_PURGE_BATCH_SIZE = 100;

type PendingRegistrationCandidate = {
  userId: string;
  email: string;
  markerExpiresAt: string;
  markerUpdatedAt: string;
};

type RegistrationOtpCandidate = {
  id: string;
};

type StaleMarkerCandidate = {
  userId: string;
  markerExpiresAt: string;
  markerUpdatedAt: string;
};

function normalizedClock(value: Date | string, code: string): {
  iso: string;
  milliseconds: number;
} {
  const milliseconds = value instanceof Date
    ? value.getTime()
    : Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new TypeError(code);
  return { iso: new Date(milliseconds).toISOString(), milliseconds };
}

function boundedLimit(value: number | undefined, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return maximum;
  return Math.min(maximum, Math.max(1, Math.trunc(value)));
}

/**
 * Adds or refreshes the 24-hour cleanup marker only while the corresponding
 * profile remains unverified. Call this in the same D1 batch as the provisional
 * profile and password credential writes.
 */
export function pendingRegistrationUpsertStatement(
  db: D1Database,
  input: { userId: string; now: Date | string },
): D1PreparedStatement {
  const now = normalizedClock(
    input.now,
    "PENDING_REGISTRATION_RETENTION_CLOCK_INVALID",
  );
  const expiresAt = new Date(
    now.milliseconds + PENDING_REGISTRATION_TTL_MS,
  ).toISOString();
  return db.prepare(`
    INSERT INTO auth_pending_registrations (
      user_id,expires_at,created_at,updated_at
    )
    SELECT ?,?,?,?
    WHERE EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id=? AND email_verified_at IS NULL
    )
    ON CONFLICT(user_id) DO UPDATE SET
      expires_at=excluded.expires_at,
      updated_at=excluded.updated_at
    WHERE EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id=? AND email_verified_at IS NULL
    )
  `).bind(
    input.userId,
    expiresAt,
    now.iso,
    now.iso,
    input.userId,
    input.userId,
  );
}

/**
 * Makes profile verification and marker removal one D1 transaction. If either
 * statement fails, D1 rolls the whole batch back.
 */
export async function finalizePendingRegistration(
  db: D1Database,
  input: {
    userId: string;
    verifiedAt: Date | string;
    acceptanceWrite?: {
      statements: D1PreparedStatement[];
      mandatoryPolicyIds: string[];
      locale: "ru" | "uz" | "en";
    };
  },
): Promise<boolean> {
  const verifiedAt = normalizedClock(
    input.verifiedAt,
    "PENDING_REGISTRATION_VERIFICATION_CLOCK_INVALID",
  ).iso;
  const pending = await db.prepare(`
    SELECT 1 AS present
    FROM auth_pending_registrations pending
    JOIN user_profiles profile ON profile.id=pending.user_id
    WHERE pending.user_id=? AND profile.email_verified_at IS NULL
    LIMIT 1
  `).bind(input.userId).first<{ present: number }>();
  if (!pending) return false;

  const acceptanceWrite = input.acceptanceWrite;
  if (acceptanceWrite && acceptanceWrite.mandatoryPolicyIds.length === 0) {
    throw new Error("REGISTRATION_ACCEPTANCE_POLICY_SET_EMPTY");
  }
  const acceptanceGuard = acceptanceWrite
    ? `AND (
        SELECT count(*)
        FROM user_acceptances acceptance
        JOIN policy_documents policy
          ON policy.id=acceptance.policy_document_id
        WHERE acceptance.user_id=user_profiles.id
          AND acceptance.policy_document_id IN (${
            acceptanceWrite.mandatoryPolicyIds.map(() => "?").join(",")
          })
          AND acceptance.acceptance_method='registration_checkbox'
          AND acceptance.auth_source='email_otp'
          AND acceptance.locale=?
          AND acceptance.content_sha256=policy.content_sha256
          AND acceptance.document_key=policy.document_key
          AND acceptance.document_version=policy.document_version
      )=?`
    : "";
  const prerequisiteStatements = acceptanceWrite?.statements ?? [];
  const verificationResultIndex = prerequisiteStatements.length;
  const results = await db.batch([
    ...prerequisiteStatements,
    db.prepare(`
      UPDATE user_profiles
      SET email_verified_at=?,updated_at=?
      WHERE id=? AND email_verified_at IS NULL
        ${acceptanceGuard}
    `).bind(
      verifiedAt,
      verifiedAt,
      input.userId,
      ...(acceptanceWrite
        ? [
            ...acceptanceWrite.mandatoryPolicyIds,
            acceptanceWrite.locale,
            acceptanceWrite.mandatoryPolicyIds.length,
          ]
        : []),
    ),
    // If an unverified marker survived but the guarded verification did not,
    // deliberately violate the marker constraint. D1 then rolls the entire
    // acceptance/profile/marker batch back instead of committing a permanent
    // acceptance-protected orphan.
    db.prepare(`
      UPDATE auth_pending_registrations
      SET expires_at=CASE
        WHEN EXISTS (
          SELECT 1 FROM user_profiles
          WHERE id=? AND email_verified_at=?
        ) THEN expires_at
        ELSE updated_at
      END
      WHERE user_id=?
    `).bind(input.userId, verifiedAt, input.userId),
    db.prepare(`
      DELETE FROM auth_pending_registrations
      WHERE user_id=?
        AND EXISTS (
          SELECT 1 FROM user_profiles
          WHERE id=? AND email_verified_at=?
        )
    `).bind(input.userId, input.userId, verifiedAt),
  ]);
  const verified = results[verificationResultIndex];
  if (!verified) {
    throw new Error("PENDING_REGISTRATION_VERIFICATION_RESULT_MISSING");
  }
  return Number(verified.meta.changes ?? 0) === 1;
}

function pendingRegistrationDeleteStatement(
  db: D1Database,
  candidate: PendingRegistrationCandidate,
  now: string,
): D1PreparedStatement {
  // Every eligibility predicate is deliberately repeated here. The initial
  // SELECT is only a bounded candidate scan; this DELETE is the race-safe gate.
  return db.prepare(`
    DELETE FROM user_profiles
    WHERE id=?
      AND email=?
      AND email_verified_at IS NULL
      AND lifecycle_status='active'
      AND default_workspace_id IS NULL
      AND onboarding_completed_at IS NULL
      AND EXISTS (
        SELECT 1 FROM auth_pending_registrations pending
        WHERE pending.user_id=user_profiles.id
          AND pending.expires_at=?
          AND pending.updated_at=?
          AND pending.expires_at<=?
      )
      AND EXISTS (
        SELECT 1 FROM user_password_credentials credential
        WHERE credential.user_id=user_profiles.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM auth_sessions session
        WHERE session.user_id=user_profiles.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM workspace_members member
        WHERE member.user_id=user_profiles.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM workspaces workspace
        WHERE workspace.created_by_user_id=user_profiles.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_acceptances acceptance
        WHERE acceptance.user_id=user_profiles.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM consents consent
        WHERE consent.user_id=user_profiles.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM security_email_jobs email_job
        WHERE email_job.user_id=user_profiles.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM lawyer_profiles lawyer
        WHERE lawyer.user_id=user_profiles.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM auth_otp_challenges otp
        WHERE otp.purpose='register'
          AND lower(otp.email)=lower(user_profiles.email)
          AND otp.consumed_at IS NULL
          AND otp.invalidated_at IS NULL
          AND otp.expires_at>?
      )
  `).bind(
    candidate.userId,
    candidate.email,
    candidate.markerExpiresAt,
    candidate.markerUpdatedAt,
    now,
    now,
  );
}

function registrationOtpDeleteStatement(
  db: D1Database,
  id: string,
  now: string,
  createdCutoff: string,
): D1PreparedStatement {
  return db.prepare(`
    DELETE FROM auth_otp_challenges
    WHERE id=?
      AND purpose='register'
      AND expires_at<=?
      AND created_at<=?
      AND NOT EXISTS (
        SELECT 1 FROM security_email_jobs email_job
        WHERE email_job.auth_otp_challenge_id=auth_otp_challenges.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM auth_mfa_challenges mfa
        WHERE mfa.email_otp_challenge_id=auth_otp_challenges.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_acceptances acceptance
        WHERE acceptance.evidence_json IS NOT NULL
          AND json_valid(acceptance.evidence_json)=1
          AND json_extract(
            acceptance.evidence_json,
            '$.otpChallengeId'
          )=auth_otp_challenges.id
      )
  `).bind(id, now, createdCutoff);
}

/**
 * Bounded, fail-closed cleanup for abandoned registrations and expired
 * registration-only OTPs. It remains inert until migration 0153 is present.
 */
export async function purgeExpiredPendingRegistrations(input: {
  db: D1Database;
  now?: Date | string;
  limit?: number;
  otpLimit?: number;
}): Promise<{
  eligible: number;
  purged: number;
  staleMarkersPurged: number;
  remainingDue: number;
  registrationOtpEligible: number;
  registrationOtpPurged: number;
}> {
  const schema = await input.db.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='auth_pending_registrations'",
  ).first<{ present: number }>();
  if (!schema) {
    return {
      eligible: 0,
      purged: 0,
      staleMarkersPurged: 0,
      remainingDue: 0,
      registrationOtpEligible: 0,
      registrationOtpPurged: 0,
    };
  }

  const clock = normalizedClock(
    input.now ?? new Date(),
    "PENDING_REGISTRATION_RETENTION_CLOCK_INVALID",
  );
  const now = clock.iso;
  // Registration codes stop authenticating after ten minutes, but retained
  // challenge rows also enforce the one-hour request ceiling. A full 24-hour
  // cutoff preserves that security evidence before any unreferenced row can
  // become eligible for deletion.
  const registrationOtpCreatedCutoff = new Date(
    clock.milliseconds - PENDING_REGISTRATION_TTL_MS,
  ).toISOString();
  const limit = boundedLimit(
    input.limit,
    PENDING_REGISTRATION_PURGE_BATCH_SIZE,
  );
  const otpLimit = boundedLimit(
    input.otpLimit,
    REGISTRATION_OTP_PURGE_BATCH_SIZE,
  );

  const staleMarkers = await input.db.prepare(`
    SELECT
      pending.user_id AS userId,
      pending.expires_at AS markerExpiresAt,
      pending.updated_at AS markerUpdatedAt
    FROM auth_pending_registrations pending
    JOIN user_profiles profile ON profile.id=pending.user_id
    WHERE profile.email_verified_at IS NOT NULL
    ORDER BY pending.updated_at ASC,pending.user_id ASC
    LIMIT ?
  `).bind(limit).all<StaleMarkerCandidate>();
  const staleMarkerResults = staleMarkers.results.length === 0
    ? []
    : await input.db.batch(staleMarkers.results.map((marker) =>
      input.db.prepare(`
        DELETE FROM auth_pending_registrations
        WHERE user_id=? AND expires_at=? AND updated_at=?
          AND EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id=? AND email_verified_at IS NOT NULL
          )
      `).bind(
        marker.userId,
        marker.markerExpiresAt,
        marker.markerUpdatedAt,
        marker.userId,
      )
    ));

  const candidates = await input.db.prepare(`
    SELECT
      profile.id AS userId,
      profile.email AS email,
      pending.expires_at AS markerExpiresAt,
      pending.updated_at AS markerUpdatedAt
    FROM auth_pending_registrations pending
    JOIN user_profiles profile ON profile.id=pending.user_id
    JOIN user_password_credentials credential ON credential.user_id=profile.id
    WHERE pending.expires_at<=?
      AND profile.email_verified_at IS NULL
      AND profile.lifecycle_status='active'
      AND profile.default_workspace_id IS NULL
      AND profile.onboarding_completed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth_sessions session
        WHERE session.user_id=profile.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM workspace_members member
        WHERE member.user_id=profile.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM workspaces workspace
        WHERE workspace.created_by_user_id=profile.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_acceptances acceptance
        WHERE acceptance.user_id=profile.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM consents consent
        WHERE consent.user_id=profile.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM security_email_jobs email_job
        WHERE email_job.user_id=profile.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM lawyer_profiles lawyer
        WHERE lawyer.user_id=profile.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM auth_otp_challenges otp
        WHERE otp.purpose='register'
          AND lower(otp.email)=lower(profile.email)
          AND otp.consumed_at IS NULL
          AND otp.invalidated_at IS NULL
          AND otp.expires_at>?
      )
    ORDER BY pending.expires_at ASC,pending.user_id ASC
    LIMIT ?
  `).bind(now, now, limit).all<PendingRegistrationCandidate>();

  const profileResults = candidates.results.length === 0
    ? []
    : await input.db.batch(candidates.results.map((candidate) =>
      pendingRegistrationDeleteStatement(input.db, candidate, now)
    ));

  const otpCandidates = await input.db.prepare(`
    SELECT otp.id AS id
    FROM auth_otp_challenges otp
    WHERE otp.purpose='register'
      AND otp.expires_at<=?
      AND otp.created_at<=?
      AND NOT EXISTS (
        SELECT 1 FROM security_email_jobs email_job
        WHERE email_job.auth_otp_challenge_id=otp.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM auth_mfa_challenges mfa
        WHERE mfa.email_otp_challenge_id=otp.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_acceptances acceptance
        WHERE acceptance.evidence_json IS NOT NULL
          AND json_valid(acceptance.evidence_json)=1
          AND json_extract(
            acceptance.evidence_json,
            '$.otpChallengeId'
          )=otp.id
      )
    ORDER BY otp.expires_at ASC,otp.id ASC
    LIMIT ?
  `).bind(
    now,
    registrationOtpCreatedCutoff,
    otpLimit,
  ).all<RegistrationOtpCandidate>();
  const otpResults = otpCandidates.results.length === 0
    ? []
    : await input.db.batch(otpCandidates.results.map(({ id }) =>
      registrationOtpDeleteStatement(
        input.db,
        id,
        now,
        registrationOtpCreatedCutoff,
      )
    ));
  const remainingDue = await input.db.prepare(`
    SELECT count(*) AS total FROM (
      SELECT 1 FROM auth_pending_registrations
      WHERE expires_at<=?
      ORDER BY expires_at,user_id
      LIMIT 1001
    )
  `).bind(now).first<{ total: number }>();

  return {
    eligible: candidates.results.length,
    purged: profileResults.reduce(
      (total, result) => total + Number(result.meta.changes ?? 0),
      0,
    ),
    staleMarkersPurged: staleMarkerResults.reduce(
      (total, result) => total + Number(result.meta.changes ?? 0),
      0,
    ),
    remainingDue: Number(remainingDue?.total ?? 0),
    registrationOtpEligible: otpCandidates.results.length,
    registrationOtpPurged: otpResults.reduce(
      (total, result) => total + Number(result.meta.changes ?? 0),
      0,
    ),
  };
}
