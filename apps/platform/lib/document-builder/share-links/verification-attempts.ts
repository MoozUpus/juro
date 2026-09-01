export const SIGNED_SHARE_ATTEMPT_LIMIT = 5;
export const SIGNED_SHARE_ATTEMPT_WINDOW_MS = 15 * 60_000;
export const SIGNED_SHARE_LOCK_MS = 15 * 60_000;

export type SignedShareAttemptReservation = Readonly<{
  attemptCount: number;
  lockedUntil: string | null;
}>;

export async function reserveSignedShareAttempt(
  db: D1Database,
  shareId: string,
  now = new Date(),
): Promise<SignedShareAttemptReservation | null> {
  const nowIso = now.toISOString();
  const windowCutoff = new Date(now.getTime() - SIGNED_SHARE_ATTEMPT_WINDOW_MS).toISOString();
  const lockedUntil = new Date(now.getTime() + SIGNED_SHARE_LOCK_MS).toISOString();
  return db.prepare(
    `UPDATE standalone_signed_pdf_shares
     SET verification_attempt_count=CASE
           WHEN verification_window_started_at IS NULL OR verification_window_started_at<=? THEN 1
           ELSE verification_attempt_count+1
         END,
         verification_window_started_at=CASE
           WHEN verification_window_started_at IS NULL OR verification_window_started_at<=? THEN ?
           ELSE verification_window_started_at
         END,
         verification_locked_until=CASE
           WHEN verification_window_started_at IS NULL OR verification_window_started_at<=? THEN NULL
           WHEN verification_attempt_count+1>=? THEN ?
           ELSE NULL
         END
     WHERE id=?
       AND expires_at>?
       AND deactivated_at IS NULL
       AND deleted_at IS NULL
       AND (verification_locked_until IS NULL OR verification_locked_until<=?)
     RETURNING verification_attempt_count AS attemptCount,
       verification_locked_until AS lockedUntil`,
  ).bind(
    windowCutoff,
    windowCutoff,
    nowIso,
    windowCutoff,
    SIGNED_SHARE_ATTEMPT_LIMIT,
    lockedUntil,
    shareId,
    nowIso,
    nowIso,
  ).first<SignedShareAttemptReservation>();
}

export function signedShareRetryAfterSeconds(now: Date, lockedUntil: string | null): number {
  if (!lockedUntil) return Math.ceil(SIGNED_SHARE_LOCK_MS / 1_000);
  return Math.max(1, Math.ceil((Date.parse(lockedUntil) - now.getTime()) / 1_000));
}
