const FAILURE_LIMIT = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1_000;
const LOCK_DURATION_MS = 15 * 60 * 1_000;

type VerificationGuardRow = {
  failedAttemptCount: number;
  lockedUntil: string | null;
};

export type SignedShareVerificationGuard = VerificationGuardRow & {
  retryAfterSeconds: number;
};

function addMilliseconds(iso: string, milliseconds: number): string {
  return new Date(new Date(iso).getTime() + milliseconds).toISOString();
}

export function signedShareRetryAfterSeconds(lockedUntil: string, now: string): number {
  return Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - new Date(now).getTime()) / 1_000));
}

export async function activeSignedShareVerificationGuard(
  db: D1Database,
  shareId: string,
  now: string,
): Promise<SignedShareVerificationGuard | null> {
  const guard = await db.prepare(
    `SELECT failed_attempt_count AS failedAttemptCount, locked_until AS lockedUntil
     FROM signed_share_verification_guards
     WHERE share_id = ? AND locked_until > ?
     LIMIT 1`,
  ).bind(shareId, now).first<VerificationGuardRow>();
  if (!guard?.lockedUntil) return null;
  return {
    ...guard,
    retryAfterSeconds: signedShareRetryAfterSeconds(guard.lockedUntil, now),
  };
}

export async function recordSignedShareVerificationFailure(
  db: D1Database,
  shareId: string,
  now: string,
): Promise<SignedShareVerificationGuard> {
  const windowCutoff = addMilliseconds(now, -FAILURE_WINDOW_MS);
  const lockedUntil = addMilliseconds(now, LOCK_DURATION_MS);
  const results = await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO signed_share_verification_guards
       (share_id, failed_attempt_count, window_started_at, locked_until, updated_at)
       VALUES (?, 0, ?, NULL, ?)`,
    ).bind(shareId, now, now),
    db.prepare(
      `UPDATE signed_share_verification_guards
       SET failed_attempt_count = CASE
             WHEN locked_until > ? THEN failed_attempt_count
             WHEN window_started_at <= ? THEN 1
             ELSE MIN(failed_attempt_count + 1, ?)
           END,
           window_started_at = CASE
             WHEN locked_until > ? THEN window_started_at
             WHEN window_started_at <= ? THEN ?
             ELSE window_started_at
           END,
           locked_until = CASE
             WHEN locked_until > ? THEN locked_until
             WHEN window_started_at <= ? THEN NULL
             WHEN failed_attempt_count >= ? - 1 THEN ?
             ELSE NULL
           END,
           updated_at = ?
       WHERE share_id = ?`,
    ).bind(
      now,
      windowCutoff,
      FAILURE_LIMIT,
      now,
      windowCutoff,
      now,
      now,
      windowCutoff,
      FAILURE_LIMIT,
      lockedUntil,
      now,
      shareId,
    ),
    db.prepare(
      `SELECT failed_attempt_count AS failedAttemptCount, locked_until AS lockedUntil
       FROM signed_share_verification_guards
       WHERE share_id = ?
       LIMIT 1`,
    ).bind(shareId),
  ]);
  const guard = results[2]?.results?.[0] as VerificationGuardRow | undefined;
  if (!guard) throw new Error("Signed share verification guard was not persisted.");
  return {
    ...guard,
    retryAfterSeconds: guard.lockedUntil
      ? signedShareRetryAfterSeconds(guard.lockedUntil, now)
      : 0,
  };
}

export function clearSignedShareVerificationGuardStatement(
  db: D1Database,
  shareId: string,
  now: string,
): D1PreparedStatement {
  return db.prepare(
    `UPDATE signed_share_verification_guards
     SET failed_attempt_count = 0, window_started_at = ?, locked_until = NULL, updated_at = ?
     WHERE share_id = ?`,
  ).bind(now, now, shareId);
}
