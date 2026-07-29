import {
  emailChangeCodeMatches,
  emailChangeCurrentEmailMatches,
  prepareEmailChangeEvidence,
  resolveEmailChangeNewEmail,
} from "./challenge-evidence";
import { normalizeEmail, sha256 } from "./crypto";
import {
  identityEvidenceLookupPairs,
  type KeyedIdentityEvidencePair,
} from "./identity-evidence";
import {
  prepareUserIdentityWrite,
  resolveUserIdentity,
  userEmailLookupPairs,
  userIdByEmail,
  userIdentitySelect,
  type IdentityProtectionContext,
  type UserIdentityLookupPair,
  type UserIdentityRow,
} from "./identity-protection";
import { batchWithSecurityEvent } from "./security-events";
import { prepareSessionTokenRotation } from "./session-rotation";

const MAX_HOURLY_CHALLENGES = 5;

type EmailChangeChallengeRow = {
  id: string;
  sessionId: string | null;
  currentEmailHash: string;
  currentEmailLookupHash: string | null;
  currentEmailLookupKeyVersion: string | null;
  newEmail: string;
  newEmailCiphertext: string | null;
  newEmailIv: string | null;
  newEmailKeyVersion: string | null;
  newEmailLookupHash: string | null;
  newEmailLookupKeyVersion: string | null;
  currentCodeSalt: string;
  currentCodeHash: string;
  currentCodeHmac: string | null;
  currentCodeKeyVersion: string | null;
  newCodeSalt: string;
  newCodeHash: string;
  newCodeHmac: string | null;
  newCodeKeyVersion: string | null;
  attemptCount: number;
  maxAttempts: number;
  expiresAt: string;
  codesQueuedAt: string | null;
  consumedAt: string | null;
  consumedByOperationId: string | null;
  invalidatedAt: string | null;
  createdAt: string;
};

type LookupPair = {
  hash: string;
  keyVersion: string;
};

export type EmailChangeReservation =
  | { status: "reserved" }
  | {
    status: "blocked";
    reason:
      | "same_address"
      | "target_unavailable"
      | "cooldown"
      | "rate_limit"
      | "state_changed";
    latestActiveCreatedAt: string | null;
    hourlyCount: number;
  };

export type EmailChangeStatus = {
  challengeId: string;
  currentEmail: string;
  newEmail: string;
  expiresAt: string;
  createdAt: string;
  codesQueuedAt: string;
};

export type EmailChangeConfirmation =
  | {
    status: "confirmed";
    newEmail: string;
    revokedSessions: number;
    session: { token: string; expiresAt: string };
  }
  | {
    status: "incorrect";
    attemptCount: number;
    maxAttempts: number;
  }
  | { status: "invalid" }
  | { status: "not_queued" }
  | { status: "used" }
  | { status: "replaced" }
  | { status: "expired" }
  | { status: "attempts_exceeded" }
  | { status: "target_unavailable" }
  | { status: "state_conflict" };

function lookupPredicate(
  rawColumn: string,
  lookupVersionColumn: string,
  lookupHashColumn: string,
  email: string,
  pairs: LookupPair[],
): { sql: string; bindings: string[] } {
  const keyed = pairs.map(
    () => `(${lookupVersionColumn}=? AND ${lookupHashColumn}=?)`,
  );
  return {
    sql: [
      `lower(${rawColumn})=?`,
      ...keyed,
    ].join(" OR "),
    bindings: [
      normalizeEmail(email),
      ...pairs.flatMap(pair => [pair.keyVersion, pair.hash]),
    ],
  };
}

function profileEmailPredicate(
  alias: "current_profile" | "candidate_profile",
  email: string,
  pairs: UserIdentityLookupPair[],
) {
  return lookupPredicate(
    `${alias}.email`,
    `${alias}.email_lookup_key_version`,
    `${alias}.email_lookup_hash`,
    email,
    pairs,
  );
}

function otpEmailPredicate(
  email: string,
  pairs: KeyedIdentityEvidencePair[],
) {
  return lookupPredicate(
    "auth_otp_challenges.email",
    "auth_otp_challenges.email_lookup_key_version",
    "auth_otp_challenges.email_lookup_hash",
    email,
    pairs.map(pair => ({
      hash: pair.lookupHash,
      keyVersion: pair.lookupKeyVersion,
    })),
  );
}

function liveSessionGuard(): string {
  return `SELECT 1 FROM auth_sessions session
    WHERE session.id=? AND session.user_id=?
      AND session.revoked_at IS NULL
      AND session.expires_at>?
      AND coalesce(session.idle_expires_at,session.expires_at)>?
      AND session.authenticated_at IS NOT NULL
      AND session.authenticated_at>=?
      AND (
        session.assurance_level='mfa'
        OR NOT EXISTS (
          SELECT 1 FROM auth_totp_credentials
          WHERE user_id=session.user_id AND status='active'
        )
      )`;
}

function liveSessionBindings(input: {
  sessionId: string;
  userId: string;
  now: string;
  recentSince: string;
}): string[] {
  return [
    input.sessionId,
    input.userId,
    input.now,
    input.now,
    input.recentSince,
  ];
}

function isActiveChallengeConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("email_change_challenges_active_user_uidx")
    || message.includes(
      "UNIQUE constraint failed: email_change_challenges.user_id",
    );
}

async function blockedReservation(
  db: D1Database,
  input: {
    userId: string;
    newEmail: string;
    identityContext: IdentityProtectionContext;
    cooldownSince: string;
    hourlySince: string;
  },
): Promise<EmailChangeReservation> {
  const snapshot = await db.prepare(
    `SELECT
       (
         SELECT max(created_at) FROM email_change_challenges
         WHERE user_id=? AND consumed_at IS NULL AND invalidated_at IS NULL
       ) AS latestActiveCreatedAt,
       (
         SELECT count(*) FROM email_change_challenges
         WHERE user_id=? AND created_at>?
       ) AS hourlyCount`,
  ).bind(
    input.userId,
    input.userId,
    input.hourlySince,
  ).first<{
    latestActiveCreatedAt: string | null;
    hourlyCount: number;
  }>();
  const latestActiveCreatedAt = snapshot?.latestActiveCreatedAt ?? null;
  const hourlyCount = Number(snapshot?.hourlyCount ?? 0);
  if (
    latestActiveCreatedAt
    && latestActiveCreatedAt > input.cooldownSince
  ) {
    return {
      status: "blocked",
      reason: "cooldown",
      latestActiveCreatedAt,
      hourlyCount,
    };
  }
  if (hourlyCount >= MAX_HOURLY_CHALLENGES) {
    return {
      status: "blocked",
      reason: "rate_limit",
      latestActiveCreatedAt,
      hourlyCount,
    };
  }
  if (await userIdByEmail(
    db,
    input.identityContext,
    input.newEmail,
  )) {
    return {
      status: "blocked",
      reason: "target_unavailable",
      latestActiveCreatedAt,
      hourlyCount,
    };
  }
  return {
    status: "blocked",
    reason: "state_changed",
    latestActiveCreatedAt,
    hourlyCount,
  };
}

export async function reserveEmailChangeChallenge(
  db: D1Database,
  input: {
    identityContext: IdentityProtectionContext;
    id: string;
    userId: string;
    sessionId: string;
    currentEmail: string;
    newEmail: string;
    currentCodeSalt: string;
    currentCode: string;
    newCodeSalt: string;
    newCode: string;
    locale: "ru" | "uz";
    expiresAt: string;
    now: string;
    recentSince: string;
    cooldownSince: string;
    hourlySince: string;
  },
): Promise<EmailChangeReservation> {
  const currentEmail = normalizeEmail(input.currentEmail);
  const newEmail = normalizeEmail(input.newEmail);
  if (currentEmail === newEmail) {
    return {
      status: "blocked",
      reason: "same_address",
      latestActiveCreatedAt: null,
      hourlyCount: 0,
    };
  }
  const existingTarget = await userIdByEmail(
    db,
    input.identityContext,
    newEmail,
  );
  if (existingTarget) {
    return {
      status: "blocked",
      reason: "target_unavailable",
      latestActiveCreatedAt: null,
      hourlyCount: 0,
    };
  }
  const [
    evidence,
    currentProfilePairs,
    targetProfilePairs,
  ] = await Promise.all([
    prepareEmailChangeEvidence(input.identityContext, {
      challengeId: input.id,
      userId: input.userId,
      sessionId: input.sessionId,
      currentEmail,
      newEmail,
      currentCodeSalt: input.currentCodeSalt,
      currentCode: input.currentCode,
      newCodeSalt: input.newCodeSalt,
      newCode: input.newCode,
    }),
    userEmailLookupPairs(input.identityContext, currentEmail),
    userEmailLookupPairs(input.identityContext, newEmail),
  ]);
  const currentProfile = profileEmailPredicate(
    "current_profile",
    currentEmail,
    currentProfilePairs,
  );
  const targetProfile = profileEmailPredicate(
    "candidate_profile",
    newEmail,
    targetProfilePairs,
  );
  const eligible = `
    NOT EXISTS (
      SELECT 1 FROM account_deletion_requests
      WHERE user_id=? AND status IN ('requested','reviewing')
    )
    AND NOT EXISTS (
      SELECT 1 FROM email_change_challenges
      WHERE user_id=? AND invalidated_at IS NULL AND created_at>?
    )
    AND (
      SELECT count(*) FROM email_change_challenges
      WHERE user_id=? AND created_at>?
    ) < ${MAX_HOURLY_CHALLENGES}
    AND EXISTS (${liveSessionGuard()})
    AND EXISTS (
      SELECT 1 FROM user_profiles current_profile
      WHERE current_profile.id=? AND (${currentProfile.sql})
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_profiles candidate_profile
      WHERE candidate_profile.id<>? AND (${targetProfile.sql})
    )
  `;
  const eligibilityBindings = [
    input.userId,
    input.userId,
    input.cooldownSince,
    input.userId,
    input.hourlySince,
    ...liveSessionBindings(input),
    input.userId,
    ...currentProfile.bindings,
    input.userId,
    ...targetProfile.bindings,
  ];
  let results: D1Result[];
  try {
    results = await db.batch([
      db.prepare(
        `UPDATE email_change_challenges
         SET invalidated_at=?
         WHERE user_id=?
           AND consumed_at IS NULL
           AND invalidated_at IS NULL
           AND ${eligible}`,
      ).bind(
        input.now,
        input.userId,
        ...eligibilityBindings,
      ),
      db.prepare(
        `INSERT INTO email_change_challenges (
           id,user_id,session_id,
           current_email_hash,current_email_lookup_hash,
           current_email_lookup_key_version,
           new_email,new_email_ciphertext,new_email_iv,
           new_email_key_version,new_email_lookup_hash,
           new_email_lookup_key_version,
           current_code_salt,current_code_hash,current_code_hmac,
           current_code_key_version,
           new_code_salt,new_code_hash,new_code_hmac,new_code_key_version,
           locale,attempt_count,max_attempts,expires_at,codes_queued_at,
           consumed_at,consumed_by_operation_id,invalidated_at,created_at
         )
         SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,5,?,
                NULL,NULL,NULL,NULL,?
         WHERE ${eligible}
           AND NOT EXISTS (
             SELECT 1 FROM email_change_challenges
             WHERE user_id=?
               AND consumed_at IS NULL
               AND invalidated_at IS NULL
           )`,
      ).bind(
        input.id,
        input.userId,
        input.sessionId,
        evidence.currentEmailEvidence.legacyHash,
        evidence.currentEmailEvidence.lookupHash,
        evidence.currentEmailEvidence.lookupKeyVersion,
        evidence.newEmail,
        evidence.newEmailEvidence.ciphertext,
        evidence.newEmailEvidence.iv,
        evidence.newEmailEvidence.keyVersion,
        evidence.newEmailEvidence.lookupHash,
        evidence.newEmailEvidence.lookupKeyVersion,
        input.currentCodeSalt,
        evidence.currentCodeEvidence.legacyHash,
        evidence.currentCodeEvidence.lookupHash,
        evidence.currentCodeEvidence.lookupKeyVersion,
        input.newCodeSalt,
        evidence.newCodeEvidence.legacyHash,
        evidence.newCodeEvidence.lookupHash,
        evidence.newCodeEvidence.lookupKeyVersion,
        input.locale,
        input.expiresAt,
        input.now,
        ...eligibilityBindings,
        input.userId,
      ),
    ]);
  } catch (error) {
    if (!isActiveChallengeConflict(error)) throw error;
    return blockedReservation(db, {
      userId: input.userId,
      newEmail,
      identityContext: input.identityContext,
      cooldownSince: input.cooldownSince,
      hourlySince: input.hourlySince,
    });
  }
  if (Number(results[1]?.meta?.changes ?? 0) === 1) {
    return { status: "reserved" };
  }
  return blockedReservation(db, {
    userId: input.userId,
    newEmail,
    identityContext: input.identityContext,
    cooldownSince: input.cooldownSince,
    hourlySince: input.hourlySince,
  });
}

export async function markEmailChangeCodesQueued(
  db: D1Database,
  input: {
    challengeId: string;
    userId: string;
    sessionId: string;
    queuedAt: string;
  },
): Promise<boolean> {
  const result = await db.prepare(
    `UPDATE email_change_challenges
     SET codes_queued_at=?
     WHERE id=? AND user_id=? AND session_id=?
       AND codes_queued_at IS NULL
       AND consumed_at IS NULL
       AND invalidated_at IS NULL
       AND expires_at>?`,
  ).bind(
    input.queuedAt,
    input.challengeId,
    input.userId,
    input.sessionId,
    input.queuedAt,
  ).run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function invalidateEmailChangeChallenge(
  db: D1Database,
  input: {
    challengeId: string;
    userId: string;
    sessionId: string;
    invalidatedAt: string;
  },
): Promise<boolean> {
  const result = await db.prepare(
    `UPDATE email_change_challenges
     SET invalidated_at=?
     WHERE id=? AND user_id=? AND session_id=?
       AND consumed_at IS NULL AND invalidated_at IS NULL`,
  ).bind(
    input.invalidatedAt,
    input.challengeId,
    input.userId,
    input.sessionId,
  ).run();
  return Number(result.meta.changes ?? 0) === 1;
}

async function loadChallenge(
  db: D1Database,
  input: {
    challengeId: string;
    userId: string;
    sessionId: string;
  },
): Promise<EmailChangeChallengeRow | null> {
  return db.prepare(
    `SELECT
       id,session_id AS sessionId,
       current_email_hash AS currentEmailHash,
       current_email_lookup_hash AS currentEmailLookupHash,
       current_email_lookup_key_version AS currentEmailLookupKeyVersion,
       new_email AS newEmail,
       new_email_ciphertext AS newEmailCiphertext,
       new_email_iv AS newEmailIv,
       new_email_key_version AS newEmailKeyVersion,
       new_email_lookup_hash AS newEmailLookupHash,
       new_email_lookup_key_version AS newEmailLookupKeyVersion,
       current_code_salt AS currentCodeSalt,
       current_code_hash AS currentCodeHash,
       current_code_hmac AS currentCodeHmac,
       current_code_key_version AS currentCodeKeyVersion,
       new_code_salt AS newCodeSalt,new_code_hash AS newCodeHash,
       new_code_hmac AS newCodeHmac,
       new_code_key_version AS newCodeKeyVersion,
       attempt_count AS attemptCount,max_attempts AS maxAttempts,
       expires_at AS expiresAt,codes_queued_at AS codesQueuedAt,
       consumed_at AS consumedAt,
       consumed_by_operation_id AS consumedByOperationId,
       invalidated_at AS invalidatedAt,created_at AS createdAt
     FROM email_change_challenges
     WHERE id=? AND user_id=? AND session_id=?
     LIMIT 1`,
  ).bind(
    input.challengeId,
    input.userId,
    input.sessionId,
  ).first<EmailChangeChallengeRow>();
}

async function validatedChallenge(
  db: D1Database,
  context: IdentityProtectionContext,
  input: {
    challengeId: string;
    userId: string;
    sessionId: string;
    currentEmail: string;
  },
): Promise<{
  challenge: EmailChangeChallengeRow;
  newEmail: string;
} | null> {
  const challenge = await loadChallenge(db, input);
  if (!challenge) return null;
  const currentMatches = await emailChangeCurrentEmailMatches(context, {
    email: input.currentEmail,
    evidence: {
      legacyHash: challenge.currentEmailHash,
      lookupHash: challenge.currentEmailLookupHash,
      lookupKeyVersion: challenge.currentEmailLookupKeyVersion,
    },
  });
  if (!currentMatches) return null;
  const resolved = await resolveEmailChangeNewEmail(context, {
    challengeId: challenge.id,
    userId: input.userId,
    rawValue: challenge.newEmail,
    ciphertext: challenge.newEmailCiphertext,
    iv: challenge.newEmailIv,
    keyVersion: challenge.newEmailKeyVersion,
    lookupHash: challenge.newEmailLookupHash,
    lookupKeyVersion: challenge.newEmailLookupKeyVersion,
  });
  return { challenge, newEmail: resolved.value };
}

function unavailableState(
  challenge: EmailChangeChallengeRow | null,
  now: string,
): EmailChangeConfirmation | null {
  if (!challenge) return { status: "invalid" };
  if (challenge.consumedAt) return { status: "used" };
  if (challenge.invalidatedAt) return { status: "replaced" };
  if (challenge.expiresAt <= now) return { status: "expired" };
  if (challenge.attemptCount >= challenge.maxAttempts) {
    return { status: "attempts_exceeded" };
  }
  if (!challenge.codesQueuedAt) return { status: "not_queued" };
  return null;
}

function challengeFence(
  challenge: EmailChangeChallengeRow,
): { sql: string; bindings: Array<string | null> } {
  return {
    sql: `
      current_email_hash=?
      AND current_email_lookup_hash IS ?
      AND current_email_lookup_key_version IS ?
      AND new_email=?
      AND new_email_ciphertext IS ?
      AND new_email_iv IS ?
      AND new_email_key_version IS ?
      AND new_email_lookup_hash IS ?
      AND new_email_lookup_key_version IS ?
      AND current_code_salt=?
      AND current_code_hash=?
      AND current_code_hmac IS ?
      AND current_code_key_version IS ?
      AND new_code_salt=?
      AND new_code_hash=?
      AND new_code_hmac IS ?
      AND new_code_key_version IS ?
      AND codes_queued_at IS ?`,
    bindings: [
      challenge.currentEmailHash,
      challenge.currentEmailLookupHash,
      challenge.currentEmailLookupKeyVersion,
      challenge.newEmail,
      challenge.newEmailCiphertext,
      challenge.newEmailIv,
      challenge.newEmailKeyVersion,
      challenge.newEmailLookupHash,
      challenge.newEmailLookupKeyVersion,
      challenge.currentCodeSalt,
      challenge.currentCodeHash,
      challenge.currentCodeHmac,
      challenge.currentCodeKeyVersion,
      challenge.newCodeSalt,
      challenge.newCodeHash,
      challenge.newCodeHmac,
      challenge.newCodeKeyVersion,
      challenge.codesQueuedAt,
    ],
  };
}

function profileIdentityFence(
  alias: string,
  profile: UserIdentityRow,
): { sql: string; bindings: Array<string | null> } {
  return {
    sql: `
      ${alias}.id=?
      AND ${alias}.email IS ?
      AND ${alias}.email_ciphertext IS ?
      AND ${alias}.email_iv IS ?
      AND ${alias}.email_key_version IS ?
      AND ${alias}.email_lookup_hash IS ?
      AND ${alias}.email_lookup_key_version IS ?`,
    bindings: [
      profile.id,
      profile.email,
      profile.emailCiphertext,
      profile.emailIv,
      profile.emailKeyVersion,
      profile.emailLookupHash,
      profile.emailLookupKeyVersion,
    ],
  };
}

async function currentProfile(
  db: D1Database,
  userId: string,
): Promise<UserIdentityRow | null> {
  return db.prepare(
    `SELECT id,${userIdentitySelect("user_profiles")}
     FROM user_profiles WHERE id=? LIMIT 1`,
  ).bind(userId).first<UserIdentityRow>();
}

export async function activeEmailChangeStatus(
  db: D1Database,
  input: {
    identityContext: IdentityProtectionContext;
    userId: string;
    sessionId: string;
    currentEmail: string;
    now: string;
  },
): Promise<EmailChangeStatus | null> {
  const row = await db.prepare(
    `SELECT id FROM email_change_challenges
     WHERE user_id=? AND session_id=?
       AND consumed_at IS NULL AND invalidated_at IS NULL
       AND codes_queued_at IS NOT NULL AND expires_at>?
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(
    input.userId,
    input.sessionId,
    input.now,
  ).first<{ id: string }>();
  if (!row) return null;
  const validated = await validatedChallenge(
    db,
    input.identityContext,
    {
      challengeId: row.id,
      userId: input.userId,
      sessionId: input.sessionId,
      currentEmail: input.currentEmail,
    },
  );
  if (!validated?.challenge.codesQueuedAt) return null;
  return {
    challengeId: validated.challenge.id,
    currentEmail: normalizeEmail(input.currentEmail),
    newEmail: validated.newEmail,
    expiresAt: validated.challenge.expiresAt,
    createdAt: validated.challenge.createdAt,
    codesQueuedAt: validated.challenge.codesQueuedAt,
  };
}

export async function confirmEmailChange(
  db: D1Database,
  input: {
    identityContext: IdentityProtectionContext;
    challengeId: string;
    userId: string;
    sessionId: string;
    currentToken: string;
    currentEmail: string;
    workspaceId: string;
    currentCode: string;
    newCode: string;
    assuranceLevel: "primary" | "mfa";
    now: string;
    recentSince: string;
  },
): Promise<EmailChangeConfirmation> {
  const validated = await validatedChallenge(
    db,
    input.identityContext,
    input,
  );
  const unavailable = unavailableState(
    validated?.challenge ?? null,
    input.now,
  );
  if (unavailable) return unavailable;
  const challenge = validated!.challenge;
  const newEmail = validated!.newEmail;
  const currentTokenHash = await sha256(input.currentToken);
  const liveTokenGuard = `${liveSessionGuard()}
    AND session.token_hash=?`;
  const liveTokenBindings = [
    ...liveSessionBindings(input),
    currentTokenHash,
  ];
  const [
    currentCodeMatches,
    newCodeMatches,
  ] = await Promise.all([
    emailChangeCodeMatches(input.identityContext, {
      challengeId: challenge.id,
      userId: input.userId,
      sessionId: input.sessionId,
      destination: "current",
      codeSalt: challenge.currentCodeSalt,
      code: input.currentCode,
      evidence: {
        legacyHash: challenge.currentCodeHash,
        lookupHash: challenge.currentCodeHmac,
        lookupKeyVersion: challenge.currentCodeKeyVersion,
      },
    }),
    emailChangeCodeMatches(input.identityContext, {
      challengeId: challenge.id,
      userId: input.userId,
      sessionId: input.sessionId,
      destination: "new",
      codeSalt: challenge.newCodeSalt,
      code: input.newCode,
      evidence: {
        legacyHash: challenge.newCodeHash,
        lookupHash: challenge.newCodeHmac,
        lookupKeyVersion: challenge.newCodeKeyVersion,
      },
    }),
  ]);
  const fence = challengeFence(challenge);
  if (!currentCodeMatches || !newCodeMatches) {
    const result = await db.prepare(
      `UPDATE email_change_challenges
       SET attempt_count=attempt_count+1
       WHERE id=? AND user_id=? AND session_id=?
         AND ${fence.sql}
         AND consumed_at IS NULL
         AND invalidated_at IS NULL
         AND expires_at>?
         AND attempt_count<max_attempts
         AND EXISTS (${liveTokenGuard})
       RETURNING attempt_count AS attemptCount,max_attempts AS maxAttempts`,
    ).bind(
      challenge.id,
      input.userId,
      input.sessionId,
      ...fence.bindings,
      input.now,
      ...liveTokenBindings,
    ).run<{ attemptCount: number; maxAttempts: number }>();
    const updated = result.results[0];
    if (updated) {
      return updated.attemptCount >= updated.maxAttempts
        ? { status: "attempts_exceeded" }
        : {
          status: "incorrect",
          attemptCount: updated.attemptCount,
          maxAttempts: updated.maxAttempts,
        };
    }
    return (
      unavailableState(
        (await validatedChallenge(
          db,
          input.identityContext,
          input,
        ))?.challenge ?? null,
        input.now,
      ) ?? { status: "state_conflict" }
    );
  }

  const profile = await currentProfile(db, input.userId);
  if (!profile) return { status: "state_conflict" };
  const resolvedCurrent = await resolveUserIdentity(
    input.identityContext,
    profile,
  );
  if (
    normalizeEmail(resolvedCurrent.email)
      !== normalizeEmail(input.currentEmail)
    || newEmail === normalizeEmail(input.currentEmail)
  ) {
    return { status: "state_conflict" };
  }
  const existingTarget = await userIdByEmail(
    db,
    input.identityContext,
    newEmail,
  );
  if (existingTarget && existingTarget !== input.userId) {
    await invalidateEmailChangeChallenge(db, {
      challengeId: challenge.id,
      userId: input.userId,
      sessionId: input.sessionId,
      invalidatedAt: input.now,
    });
    return { status: "target_unavailable" };
  }
  const [
    nextIdentity,
    targetProfilePairs,
    oldOtpPairs,
    newOtpPairs,
  ] = await Promise.all([
    prepareUserIdentityWrite(input.identityContext, {
      userId: input.userId,
      email: newEmail,
      phone: resolvedCurrent.phone,
    }),
    userEmailLookupPairs(input.identityContext, newEmail),
    identityEvidenceLookupPairs(input.identityContext, {
      normalizedValue: normalizeEmail(input.currentEmail),
      purpose: "auth-otp-email",
    }),
    identityEvidenceLookupPairs(input.identityContext, {
      normalizedValue: newEmail,
      purpose: "auth-otp-email",
    }),
  ]);
  const currentFence = profileIdentityFence("current_profile", profile);
  const targetProfile = profileEmailPredicate(
    "candidate_profile",
    newEmail,
    targetProfilePairs,
  );
  const targetAvailableSql = `NOT EXISTS (
    SELECT 1 FROM user_profiles candidate_profile
    WHERE candidate_profile.id<>? AND (${targetProfile.sql})
  )`;
  const targetAvailableBindings = [
    input.userId,
    ...targetProfile.bindings,
  ];
  const operationId = crypto.randomUUID();
  const emailChangedGuard = {
    selectSql: `SELECT 1
      FROM user_profiles changed_profile
      JOIN email_change_challenges changed_challenge
        ON changed_challenge.user_id=changed_profile.id
      WHERE changed_profile.id=?
        AND changed_profile.email=?
        AND changed_profile.email_ciphertext IS ?
        AND changed_profile.email_iv IS ?
        AND changed_profile.email_key_version IS ?
        AND changed_profile.email_lookup_hash IS ?
        AND changed_profile.email_lookup_key_version IS ?
        AND changed_challenge.id=?
        AND changed_challenge.consumed_by_operation_id=?
        AND changed_challenge.consumed_at=?`,
    bindings: [
      input.userId,
      nextIdentity.email,
      nextIdentity.emailCiphertext,
      nextIdentity.emailIv,
      nextIdentity.emailKeyVersion,
      nextIdentity.emailLookupHash,
      nextIdentity.emailLookupKeyVersion,
      challenge.id,
      operationId,
      input.now,
    ],
  };
  const rotation = await prepareSessionTokenRotation(db, {
    userId: input.userId,
    sessionId: input.sessionId,
    currentToken: input.currentToken,
    reason: "email_change",
    requiredGuard: emailChangedGuard,
    now: new Date(input.now),
  });
  if (!rotation || rotation.assuranceLevel !== input.assuranceLevel) {
    return { status: "state_conflict" };
  }
  const completedGuard = {
    selectSql: `SELECT 1 FROM auth_sessions rotated_session
      WHERE rotated_session.id=? AND rotated_session.user_id=?
        AND rotated_session.token_hash=?
        AND rotated_session.revoked_at IS NULL
        AND EXISTS (${emailChangedGuard.selectSql})`,
    bindings: [
      input.sessionId,
      input.userId,
      rotation.tokenHash,
      ...emailChangedGuard.bindings,
    ],
  };
  const oldOtp = otpEmailPredicate(
    input.currentEmail,
    oldOtpPairs,
  );
  const newOtp = otpEmailPredicate(newEmail, newOtpPairs);
  let results: D1Result[];
  try {
    results = await batchWithSecurityEvent(
      db,
      {
        userId: input.userId,
        sessionId: input.sessionId,
        deviceId: rotation.deviceId,
        eventType: "account.email_changed",
        severity: "critical",
        authSource: "local_session",
        assuranceLevel: input.assuranceLevel,
        metadata: {
          challengeId: challenge.id,
          verificationMethod: "dual_email_otp",
          sessionTokenRotated: true,
          tokenHistoryId: rotation.historyId,
        },
        createdAt: input.now,
      },
      () => [
        db.prepare(
          `UPDATE email_change_challenges
           SET consumed_at=?,consumed_by_operation_id=?
           WHERE id=? AND user_id=? AND session_id=?
             AND ${fence.sql}
             AND consumed_at IS NULL
             AND invalidated_at IS NULL
             AND expires_at>?
             AND attempt_count<max_attempts
             AND EXISTS (${liveTokenGuard})
             AND EXISTS (
               SELECT 1 FROM user_profiles current_profile
               WHERE ${currentFence.sql}
             )
             AND ${targetAvailableSql}`,
        ).bind(
          input.now,
          operationId,
          challenge.id,
          input.userId,
          input.sessionId,
          ...fence.bindings,
          input.now,
          ...liveTokenBindings,
          ...currentFence.bindings,
          ...targetAvailableBindings,
        ),
        db.prepare(
          `UPDATE user_profiles
           SET email=?,email_ciphertext=?,email_iv=?,email_key_version=?,
               email_lookup_hash=?,email_lookup_key_version=?,updated_at=?
           WHERE id=?
             AND email IS ?
             AND email_ciphertext IS ?
             AND email_iv IS ?
             AND email_key_version IS ?
             AND email_lookup_hash IS ?
             AND email_lookup_key_version IS ?
             AND ${targetAvailableSql}
             AND EXISTS (
               SELECT 1 FROM email_change_challenges
               WHERE id=? AND user_id=? AND session_id=?
                 AND consumed_at=? AND consumed_by_operation_id=?
             )`,
        ).bind(
          nextIdentity.email,
          nextIdentity.emailCiphertext,
          nextIdentity.emailIv,
          nextIdentity.emailKeyVersion,
          nextIdentity.emailLookupHash,
          nextIdentity.emailLookupKeyVersion,
          input.now,
          profile.id,
          profile.email,
          profile.emailCiphertext,
          profile.emailIv,
          profile.emailKeyVersion,
          profile.emailLookupHash,
          profile.emailLookupKeyVersion,
          ...targetAvailableBindings,
          challenge.id,
          input.userId,
          input.sessionId,
          input.now,
          operationId,
        ),
        db.prepare(
          `UPDATE email_change_challenges
           SET invalidated_at=?
           WHERE user_id=? AND id<>?
             AND consumed_at IS NULL AND invalidated_at IS NULL
             AND EXISTS (${emailChangedGuard.selectSql})`,
        ).bind(
          input.now,
          input.userId,
          challenge.id,
          ...emailChangedGuard.bindings,
        ),
        db.prepare(
          `UPDATE auth_otp_challenges
           SET invalidated_at=?
           WHERE consumed_at IS NULL AND invalidated_at IS NULL
             AND ((${oldOtp.sql}) OR (${newOtp.sql}))
             AND EXISTS (${emailChangedGuard.selectSql})`,
        ).bind(
          input.now,
          ...oldOtp.bindings,
          ...newOtp.bindings,
          ...emailChangedGuard.bindings,
        ),
        db.prepare(
          `UPDATE account_deletion_challenges
           SET invalidated_at=?
           WHERE user_id=? AND consumed_at IS NULL AND invalidated_at IS NULL
             AND EXISTS (${emailChangedGuard.selectSql})`,
        ).bind(
          input.now,
          input.userId,
          ...emailChangedGuard.bindings,
        ),
        db.prepare(
          `UPDATE auth_mfa_challenges
           SET invalidated_at=?
           WHERE user_id=? AND consumed_at IS NULL AND invalidated_at IS NULL
             AND EXISTS (${emailChangedGuard.selectSql})`,
        ).bind(
          input.now,
          input.userId,
          ...emailChangedGuard.bindings,
        ),
        db.prepare(
          `UPDATE auth_sessions
           SET revoked_at=?
           WHERE user_id=? AND id<>? AND revoked_at IS NULL
             AND EXISTS (${emailChangedGuard.selectSql})`,
        ).bind(
          input.now,
          input.userId,
          input.sessionId,
          ...emailChangedGuard.bindings,
        ),
        db.prepare(
          `UPDATE auth_devices
           SET revoked_at=?
           WHERE user_id=?
             AND id IN (
               SELECT device_id FROM auth_sessions
               WHERE user_id=? AND id<>? AND revoked_at=?
             )
             AND id<>coalesce(
               (
                 SELECT device_id FROM auth_sessions
                 WHERE id=? AND user_id=?
               ),
               ''
             )
             AND revoked_at IS NULL
             AND EXISTS (${emailChangedGuard.selectSql})`,
        ).bind(
          input.now,
          input.userId,
          input.userId,
          input.sessionId,
          input.now,
          input.sessionId,
          input.userId,
          ...emailChangedGuard.bindings,
        ),
        rotation.historyStatement,
        rotation.rotationStatement,
        db.prepare(
          `INSERT INTO workspace_audit_events (
             id,workspace_id,actor_user_id,entity_type,entity_id,action,
             metadata_json,created_at
           )
           SELECT ?,?,?, 'user',?,'account_email_changed',?,?
           WHERE EXISTS (${completedGuard.selectSql})`,
        ).bind(
          crypto.randomUUID(),
          input.workspaceId,
          input.userId,
          input.userId,
          JSON.stringify({
            challengeId: challenge.id,
            verificationMethod: "dual_email_otp",
          }),
          input.now,
          ...completedGuard.bindings,
        ),
      ],
      completedGuard,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("user_profiles_email_uidx")
      || message.includes("user_profiles_email_lookup_uidx")
      || message.includes("UNIQUE constraint failed: user_profiles.email")
    ) {
      await invalidateEmailChangeChallenge(db, {
        challengeId: challenge.id,
        userId: input.userId,
        sessionId: input.sessionId,
        invalidatedAt: input.now,
      });
      return { status: "target_unavailable" };
    }
    throw error;
  }
  if (
    Number(results[0]?.meta?.changes ?? 0) === 1
    && Number(results[1]?.meta?.changes ?? 0) === 1
    && Number(results[8]?.meta?.changes ?? 0) === 1
    && Number(results[9]?.meta?.changes ?? 0) === 1
    && Number(results[10]?.meta?.changes ?? 0) === 1
    && Number(results[11]?.meta?.changes ?? 0) === 1
  ) {
    return {
      status: "confirmed",
      newEmail,
      revokedSessions: Number(results[6]?.meta?.changes ?? 0),
      session: { token: rotation.token, expiresAt: rotation.expiresAt },
    };
  }
  const after = await validatedChallenge(
    db,
    input.identityContext,
    input,
  );
  return (
    unavailableState(after?.challenge ?? null, input.now)
    ?? { status: "state_conflict" }
  );
}
