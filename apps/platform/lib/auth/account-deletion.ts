import {
  accountDeletionCodeMatches,
  accountDeletionEmailMatches,
  prepareAccountDeletionEvidence,
} from "./challenge-evidence";
import type { IdentityProtectionContext } from "./identity-protection";
import { batchWithSecurityEvent } from "./security-events";

const MAX_HOURLY_CHALLENGES = 5;

export type ExistingDeletionRequest = {
  id: string;
  status: string;
  requestedAt: string;
};

export type DeletionChallengeReservation =
  | { status: "reserved" }
  | {
    status: "blocked";
    latestActiveCreatedAt: string | null;
    hourlyCount: number;
  }
  | {
    status: "existing_request";
    request: ExistingDeletionRequest;
  };

type DeletionChallengeRow = {
  id: string;
  emailHash: string;
  emailLookupHash: string | null;
  emailLookupKeyVersion: string | null;
  codeSalt: string;
  codeHash: string;
  codeHmac: string | null;
  codeKeyVersion: string | null;
  attemptCount: number;
  maxAttempts: number;
  expiresAt: string;
  consumedAt: string | null;
  invalidatedAt: string | null;
};

export type DeletionConfirmationResult =
  | {
    status: "confirmed";
    requestId: string;
    revokedSessions: number;
  }
  | { status: "incorrect"; attemptCount: number; maxAttempts: number }
  | { status: "invalid" }
  | { status: "used" }
  | { status: "replaced" }
  | { status: "expired" }
  | { status: "attempts_exceeded" }
  | {
    status: "existing_request";
    request: ExistingDeletionRequest;
  };

export async function reserveAccountDeletionChallenge(
  db: D1Database,
  input: {
    identityContext: IdentityProtectionContext;
    id: string;
    userId: string;
    sessionId: string;
    email: string;
    locale: "ru" | "uz";
    codeSalt: string;
    code: string;
    expiresAt: string;
    now: string;
    recentSince: string;
    cooldownSince: string;
    hourlySince: string;
  },
): Promise<DeletionChallengeReservation> {
  const evidence = await prepareAccountDeletionEvidence(
    input.identityContext,
    {
      challengeId: input.id,
      userId: input.userId,
      sessionId: input.sessionId,
      email: input.email,
      codeSalt: input.codeSalt,
      code: input.code,
    },
  );
  const eligible = `
    NOT EXISTS (
      SELECT 1 FROM account_deletion_requests
      WHERE user_id=?
        AND status IN ('requested','reviewing')
    )
    AND NOT EXISTS (
      SELECT 1 FROM account_deletion_challenges
      WHERE user_id=?
        AND invalidated_at IS NULL
        AND created_at>?
    )
    AND (
      SELECT count(*) FROM account_deletion_challenges
      WHERE user_id=? AND created_at>?
    ) < ${MAX_HOURLY_CHALLENGES}
    AND EXISTS (
      SELECT 1 FROM auth_sessions
      WHERE id=? AND user_id=? AND revoked_at IS NULL
        AND expires_at>?
        AND coalesce(idle_expires_at,expires_at)>?
        AND authenticated_at IS NOT NULL
        AND authenticated_at>=?
    )
  `;
  const eligibilityBindings = [
    input.userId,
    input.userId,
    input.cooldownSince,
    input.userId,
    input.hourlySince,
    input.sessionId,
    input.userId,
    input.now,
    input.now,
    input.recentSince,
  ];
  const results = await db.batch([
    db.prepare(
      `UPDATE account_deletion_challenges
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
      `INSERT INTO account_deletion_challenges (
         id,user_id,session_id,email_hash,
         email_lookup_hash,email_lookup_key_version,
         locale,code_salt,code_hash,code_hmac,code_key_version,
         attempt_count,max_attempts,expires_at,consumed_at,
         consumed_by_operation_id,invalidated_at,created_at
       )
       SELECT ?,?,?,?,?,?,?,?,?,?,?,0,5,?,NULL,NULL,NULL,?
       WHERE ${eligible}
         AND NOT EXISTS (
           SELECT 1 FROM account_deletion_challenges
           WHERE user_id=?
             AND consumed_at IS NULL
             AND invalidated_at IS NULL
         )`,
    ).bind(
      input.id,
      input.userId,
      input.sessionId,
      evidence.emailEvidence.legacyHash,
      evidence.emailEvidence.lookupHash,
      evidence.emailEvidence.lookupKeyVersion,
      input.locale,
      input.codeSalt,
      evidence.codeEvidence.legacyHash,
      evidence.codeEvidence.lookupHash,
      evidence.codeEvidence.lookupKeyVersion,
      input.expiresAt,
      input.now,
      ...eligibilityBindings,
      input.userId,
    ),
    db.prepare(
      `SELECT
         EXISTS(
           SELECT 1 FROM account_deletion_challenges WHERE id=?
         ) AS inserted,
         (
           SELECT id FROM account_deletion_requests
           WHERE user_id=?
             AND status IN ('requested','reviewing')
           ORDER BY requested_at DESC
           LIMIT 1
         ) AS requestId,
         (
           SELECT status FROM account_deletion_requests
           WHERE user_id=?
             AND status IN ('requested','reviewing')
           ORDER BY requested_at DESC
           LIMIT 1
         ) AS requestStatus,
         (
           SELECT requested_at FROM account_deletion_requests
           WHERE user_id=?
             AND status IN ('requested','reviewing')
           ORDER BY requested_at DESC
           LIMIT 1
         ) AS requestedAt,
         (
           SELECT max(created_at)
           FROM account_deletion_challenges
           WHERE user_id=?
             AND consumed_at IS NULL
             AND invalidated_at IS NULL
         ) AS latestActiveCreatedAt,
         (
           SELECT count(*)
           FROM account_deletion_challenges
           WHERE user_id=? AND created_at>?
         ) AS hourlyCount`,
    ).bind(
      input.id,
      input.userId,
      input.userId,
      input.userId,
      input.userId,
      input.userId,
      input.hourlySince,
    ),
  ]);
  const snapshot = results[2]?.results[0] as {
    inserted?: number | boolean;
    requestId?: string | null;
    requestStatus?: string | null;
    requestedAt?: string | null;
    latestActiveCreatedAt?: string | null;
    hourlyCount?: number;
  } | undefined;
  if (snapshot?.inserted) return { status: "reserved" };
  if (
    snapshot?.requestId
    && snapshot.requestStatus
    && snapshot.requestedAt
  ) {
    return {
      status: "existing_request",
      request: {
        id: snapshot.requestId,
        status: snapshot.requestStatus,
        requestedAt: snapshot.requestedAt,
      },
    };
  }
  return {
    status: "blocked",
    latestActiveCreatedAt: snapshot?.latestActiveCreatedAt ?? null,
    hourlyCount: Number(snapshot?.hourlyCount ?? 0),
  };
}

export async function invalidateAccountDeletionChallenge(
  db: D1Database,
  input: {
    id: string;
    userId: string;
    sessionId: string;
    invalidatedAt: string;
  },
): Promise<void> {
  await db.prepare(
    `UPDATE account_deletion_challenges
     SET invalidated_at=?
     WHERE id=? AND user_id=? AND session_id=?
       AND consumed_at IS NULL AND invalidated_at IS NULL`,
  ).bind(
    input.invalidatedAt,
    input.id,
    input.userId,
    input.sessionId,
  ).run();
}

async function loadChallenge(
  db: D1Database,
  input: {
    challengeId: string;
    userId: string;
    sessionId: string;
  },
): Promise<DeletionChallengeRow | null> {
  return db.prepare(
    `SELECT
       id,email_hash AS emailHash,
       email_lookup_hash AS emailLookupHash,
       email_lookup_key_version AS emailLookupKeyVersion,
       code_salt AS codeSalt,code_hash AS codeHash,
       code_hmac AS codeHmac,code_key_version AS codeKeyVersion,
       attempt_count AS attemptCount,max_attempts AS maxAttempts,
       expires_at AS expiresAt,consumed_at AS consumedAt,
       invalidated_at AS invalidatedAt
     FROM account_deletion_challenges
     WHERE id=? AND user_id=? AND session_id=?
     LIMIT 1`,
  ).bind(
    input.challengeId,
    input.userId,
    input.sessionId,
  ).first<DeletionChallengeRow>();
}

async function validatedChallenge(
  db: D1Database,
  input: {
    identityContext: IdentityProtectionContext;
    challengeId: string;
    userId: string;
    sessionId: string;
    email: string;
  },
): Promise<DeletionChallengeRow | null> {
  const challenge = await loadChallenge(db, input);
  if (!challenge) return null;
  const matches = await accountDeletionEmailMatches(
    input.identityContext,
    {
      email: input.email,
      evidence: {
        legacyHash: challenge.emailHash,
        lookupHash: challenge.emailLookupHash,
        lookupKeyVersion: challenge.emailLookupKeyVersion,
      },
    },
  );
  return matches ? challenge : null;
}

function unavailableState(
  challenge: DeletionChallengeRow | null,
  now: string,
): DeletionConfirmationResult | null {
  if (!challenge) return { status: "invalid" };
  if (challenge.consumedAt) return { status: "used" };
  if (challenge.invalidatedAt) return { status: "replaced" };
  if (challenge.expiresAt <= now) return { status: "expired" };
  if (challenge.attemptCount >= challenge.maxAttempts) {
    return { status: "attempts_exceeded" };
  }
  return null;
}

async function activeDeletionRequest(
  db: D1Database,
  userId: string,
): Promise<ExistingDeletionRequest | null> {
  return db.prepare(
    `SELECT id,status,requested_at AS requestedAt
     FROM account_deletion_requests
     WHERE user_id=? AND status IN ('requested','reviewing')
     ORDER BY requested_at DESC
     LIMIT 1`,
  ).bind(userId).first<ExistingDeletionRequest>();
}

function isActiveRequestConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("account_deletion_requests_active_user_uidx")
    || message.includes(
      "UNIQUE constraint failed: account_deletion_requests.user_id",
    );
}

export async function confirmAccountDeletion(
  db: D1Database,
  input: {
    identityContext: IdentityProtectionContext;
    challengeId: string;
    userId: string;
    sessionId: string;
    email: string;
    workspaceId: string;
    code: string;
    reason: string | null;
    assuranceLevel: "primary" | "mfa";
    now: string;
    recentSince: string;
  },
): Promise<DeletionConfirmationResult> {
  const existing = await activeDeletionRequest(db, input.userId);
  if (existing) return { status: "existing_request", request: existing };
  const challenge = await validatedChallenge(db, input);
  const unavailable = unavailableState(challenge, input.now);
  if (unavailable) return unavailable;

  const codeMatches = await accountDeletionCodeMatches(
    input.identityContext,
    {
      challengeId: input.challengeId,
      userId: input.userId,
      sessionId: input.sessionId,
      codeSalt: challenge!.codeSalt,
      code: input.code,
      evidence: {
        legacyHash: challenge!.codeHash,
        lookupHash: challenge!.codeHmac,
        lookupKeyVersion: challenge!.codeKeyVersion,
      },
    },
  );
  if (!codeMatches) {
    const result = await db.prepare(
      `UPDATE account_deletion_challenges
       SET attempt_count=attempt_count+1
       WHERE id=? AND user_id=? AND session_id=?
         AND email_hash=?
         AND email_lookup_hash IS ?
         AND email_lookup_key_version IS ?
         AND code_hash=?
         AND code_hmac IS ?
         AND code_key_version IS ?
         AND consumed_at IS NULL
         AND invalidated_at IS NULL
         AND expires_at>?
         AND attempt_count<max_attempts
       RETURNING
         attempt_count AS attemptCount,
         max_attempts AS maxAttempts`,
    ).bind(
      input.challengeId,
      input.userId,
      input.sessionId,
      challenge!.emailHash,
      challenge!.emailLookupHash,
      challenge!.emailLookupKeyVersion,
      challenge!.codeHash,
      challenge!.codeHmac,
      challenge!.codeKeyVersion,
      input.now,
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
      unavailableState(await validatedChallenge(db, input), input.now)
      ?? { status: "invalid" }
    );
  }

  const operationId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const sessionGuard = `SELECT 1 FROM auth_sessions
    WHERE id=? AND user_id=? AND revoked_at IS NULL
      AND expires_at>?
      AND coalesce(idle_expires_at,expires_at)>?
      AND authenticated_at IS NOT NULL
      AND authenticated_at>=?`;
  const sessionGuardBindings = [
    input.sessionId,
    input.userId,
    input.now,
    input.now,
    input.recentSince,
  ];
  let results: D1Result[];
  try {
    results = await batchWithSecurityEvent(
      db,
      {
        userId: input.userId,
        sessionId: input.sessionId,
        eventType: "account.deletion_requested",
        severity: "critical",
        authSource: "local_session",
        assuranceLevel: input.assuranceLevel,
        metadata: {
          requestId,
          verificationMethod: "email_otp",
        },
        createdAt: input.now,
      },
      () => [
        db.prepare(
          `UPDATE account_deletion_challenges
           SET attempt_count=attempt_count+1,
               consumed_at=?,
               consumed_by_operation_id=?
           WHERE id=? AND user_id=? AND session_id=?
             AND code_hash=?
             AND code_hmac IS ?
             AND code_key_version IS ?
             AND email_hash=?
             AND email_lookup_hash IS ?
             AND email_lookup_key_version IS ?
             AND consumed_at IS NULL
             AND invalidated_at IS NULL
             AND expires_at>?
             AND attempt_count<max_attempts
             AND EXISTS (${sessionGuard})`,
        ).bind(
          input.now,
          operationId,
          input.challengeId,
          input.userId,
          input.sessionId,
          challenge!.codeHash,
          challenge!.codeHmac,
          challenge!.codeKeyVersion,
          challenge!.emailHash,
          challenge!.emailLookupHash,
          challenge!.emailLookupKeyVersion,
          input.now,
          ...sessionGuardBindings,
        ),
        db.prepare(
          `INSERT INTO account_deletion_requests (
             id,user_id,verification_challenge_id,requested_session_id,
             status,reason,verification_method,verified_at,requested_at,
             completed_at
           )
           SELECT ?,user_id,id,?,'requested',?,'email_otp',?,?,NULL
           FROM account_deletion_challenges
           WHERE id=? AND user_id=? AND session_id=?
             AND consumed_by_operation_id=? AND consumed_at=?`,
        ).bind(
          requestId,
          input.sessionId,
          input.reason,
          input.now,
          input.now,
          input.challengeId,
          input.userId,
          input.sessionId,
          operationId,
          input.now,
        ),
        db.prepare(
          `INSERT INTO workspace_audit_events (
             id,workspace_id,actor_user_id,entity_type,entity_id,action,
             metadata_json,created_at
           )
           SELECT ?,?,?, 'user',?,'account_deletion_requested',?,?
           FROM account_deletion_requests
           WHERE id=? AND user_id=?`,
        ).bind(
          crypto.randomUUID(),
          input.workspaceId,
          input.userId,
          input.userId,
          JSON.stringify({
            requestId,
            verificationMethod: "email_otp",
          }),
          input.now,
          requestId,
          input.userId,
        ),
        db.prepare(
          `UPDATE auth_sessions
           SET revoked_at=?
           WHERE user_id=? AND revoked_at IS NULL
             AND EXISTS (
               SELECT 1 FROM account_deletion_requests
               WHERE id=? AND user_id=?
             )`,
        ).bind(
          input.now,
          input.userId,
          requestId,
          input.userId,
        ),
        db.prepare(
          `UPDATE auth_devices
           SET revoked_at=?
           WHERE user_id=? AND revoked_at IS NULL
             AND EXISTS (
               SELECT 1 FROM account_deletion_requests
               WHERE id=? AND user_id=?
             )`,
        ).bind(
          input.now,
          input.userId,
          requestId,
          input.userId,
        ),
      ],
      {
        selectSql: `SELECT 1 FROM account_deletion_requests
          WHERE id=? AND user_id=?`,
        bindings: [requestId, input.userId],
      },
    );
  } catch (error) {
    if (!isActiveRequestConflict(error)) throw error;
    const concurrent = await activeDeletionRequest(db, input.userId);
    return concurrent
      ? { status: "existing_request", request: concurrent }
      : { status: "invalid" };
  }

  if (Number(results[1]?.meta?.changes ?? 0) === 1) {
    return {
      status: "confirmed",
      requestId,
      revokedSessions: Number(results[3]?.meta?.changes ?? 0),
    };
  }
  return (
    unavailableState(await validatedChallenge(db, input), input.now)
    ?? { status: "invalid" }
  );
}
