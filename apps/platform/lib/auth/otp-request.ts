export type OtpReservationResult =
  | { status: "reserved" }
  | {
    status: "blocked";
    latestActiveCreatedAt: string | null;
    hourlyCount: number;
  };

export async function reserveOtpChallenge(
  db: D1Database,
  input: {
    id: string;
    email: string;
    emailHash: string;
    purpose: "login" | "register";
    locale: "ru" | "uz";
    accountType: "individual" | "business";
    codeSalt: string;
    codeHash: string;
    expiresAt: string;
    ipHash: string | null;
    now: string;
    cooldownSince: string;
    hourlySince: string;
  },
): Promise<OtpReservationResult> {
  const results = await db.batch([
    db.prepare(`
      INSERT INTO auth_otp_challenges (
        id,
        email,
        email_hash,
        purpose,
        locale,
        account_type,
        code_salt,
        code_hash,
        attempt_count,
        max_attempts,
        expires_at,
        request_ip_hash,
        created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, 5, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1
        FROM auth_otp_challenges
        WHERE invalidated_at IS NULL
          AND created_at > ?
          AND (
            email_hash = ?
            OR (? IS NOT NULL AND request_ip_hash = ?)
          )
      )
      AND (
        SELECT count(*)
        FROM auth_otp_challenges
        WHERE created_at > ?
          AND (
            email_hash = ?
            OR (? IS NOT NULL AND request_ip_hash = ?)
          )
      ) < 8
    `).bind(
      input.id,
      input.email,
      input.emailHash,
      input.purpose,
      input.locale,
      input.accountType,
      input.codeSalt,
      input.codeHash,
      input.expiresAt,
      input.ipHash,
      input.now,
      input.cooldownSince,
      input.emailHash,
      input.ipHash,
      input.ipHash,
      input.hourlySince,
      input.emailHash,
      input.ipHash,
      input.ipHash,
    ),
    db.prepare(`
      UPDATE auth_otp_challenges
      SET invalidated_at = ?
      WHERE email_hash = ?
        AND purpose = ?
        AND id <> ?
        AND consumed_at IS NULL
        AND invalidated_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM auth_otp_challenges
          WHERE id = ?
        )
    `).bind(
      input.now,
      input.emailHash,
      input.purpose,
      input.id,
      input.id,
    ),
    db.prepare(`
      SELECT
        EXISTS(
          SELECT 1
          FROM auth_otp_challenges
          WHERE id = ?
        ) AS inserted,
        (
          SELECT max(created_at)
          FROM auth_otp_challenges
          WHERE invalidated_at IS NULL
            AND created_at > ?
            AND (
              email_hash = ?
              OR (? IS NOT NULL AND request_ip_hash = ?)
            )
        ) AS latestActiveCreatedAt,
        (
          SELECT count(*)
          FROM auth_otp_challenges
          WHERE created_at > ?
            AND (
              email_hash = ?
              OR (? IS NOT NULL AND request_ip_hash = ?)
            )
        ) AS hourlyCount
    `).bind(
      input.id,
      input.cooldownSince,
      input.emailHash,
      input.ipHash,
      input.ipHash,
      input.hourlySince,
      input.emailHash,
      input.ipHash,
      input.ipHash,
    ),
  ]);
  const snapshot = results[2]?.results[0] as {
    inserted?: number | boolean;
    latestActiveCreatedAt?: string | null;
    hourlyCount?: number;
  } | undefined;
  if (snapshot?.inserted) return { status: "reserved" };
  return {
    status: "blocked",
    latestActiveCreatedAt: snapshot?.latestActiveCreatedAt ?? null,
    hourlyCount: Number(snapshot?.hourlyCount ?? 0),
  };
}
