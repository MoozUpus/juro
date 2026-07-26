import {
  authOtpCodeMatches,
  authOtpEmailMatches,
} from "./challenge-evidence";
import type { IdentityProtectionContext } from "./identity-protection";

type OtpChallengeRow = {
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
  accountType: string;
};

export type OtpChallengeResult =
  | { status: "verified"; accountType: "individual" | "business" }
  | { status: "incorrect"; attemptCount: number; maxAttempts: number }
  | { status: "invalid" }
  | { status: "used" }
  | { status: "replaced" }
  | { status: "expired" }
  | { status: "attempts_exceeded" };

async function loadChallenge(
  db: D1Database,
  input: {
    challengeId: string;
    purpose: "login" | "register";
  },
): Promise<OtpChallengeRow | null> {
  return db.prepare(`
    SELECT
      id,
      email_hash AS emailHash,
      email_lookup_hash AS emailLookupHash,
      email_lookup_key_version AS emailLookupKeyVersion,
      code_salt AS codeSalt,
      code_hash AS codeHash,
      code_hmac AS codeHmac,
      code_key_version AS codeKeyVersion,
      attempt_count AS attemptCount,
      max_attempts AS maxAttempts,
      expires_at AS expiresAt,
      consumed_at AS consumedAt,
      invalidated_at AS invalidatedAt,
      account_type AS accountType
    FROM auth_otp_challenges
    WHERE id = ? AND purpose = ?
    LIMIT 1
  `).bind(
    input.challengeId,
    input.purpose,
  ).first<OtpChallengeRow>();
}

function unavailableState(
  challenge: OtpChallengeRow | null,
  now: string,
): OtpChallengeResult | null {
  if (!challenge) return { status: "invalid" };
  if (challenge.consumedAt) return { status: "used" };
  if (challenge.invalidatedAt) return { status: "replaced" };
  if (challenge.expiresAt <= now) return { status: "expired" };
  if (challenge.attemptCount >= challenge.maxAttempts) {
    return { status: "attempts_exceeded" };
  }
  return null;
}

async function validatedChallenge(
  db: D1Database,
  input: {
    identityContext: IdentityProtectionContext;
    challengeId: string;
    email: string;
    purpose: "login" | "register";
  },
): Promise<OtpChallengeRow | null> {
  const challenge = await loadChallenge(db, input);
  if (!challenge) return null;
  const matches = await authOtpEmailMatches(input.identityContext, {
    email: input.email,
    evidence: {
      legacyHash: challenge.emailHash,
      lookupHash: challenge.emailLookupHash,
      lookupKeyVersion: challenge.emailLookupKeyVersion,
    },
  });
  return matches ? challenge : null;
}

/**
 * Atomically spends a valid OTP before any session/account side effect.
 * Concurrent correct requests can therefore produce at most one `verified`
 * result. Incorrect attempts are also incremented with a guarded update so
 * concurrent requests cannot exceed the stored attempt budget unnoticed.
 */
export async function consumeOtpChallenge(
  db: D1Database,
  input: {
    identityContext: IdentityProtectionContext;
    challengeId: string;
    email: string;
    purpose: "login" | "register";
    code: string;
    now: string;
  },
): Promise<OtpChallengeResult> {
  const challenge = await validatedChallenge(db, input);
  const unavailable = unavailableState(challenge, input.now);
  if (unavailable) return unavailable;

  const codeMatches = await authOtpCodeMatches(input.identityContext, {
    challengeId: input.challengeId,
    purpose: input.purpose,
    codeSalt: challenge!.codeSalt,
    code: input.code,
    evidence: {
      legacyHash: challenge!.codeHash,
      lookupHash: challenge!.codeHmac,
      lookupKeyVersion: challenge!.codeKeyVersion,
    },
  });
  if (!codeMatches) {
    const result = await db.prepare(`
      UPDATE auth_otp_challenges
      SET attempt_count = attempt_count + 1
      WHERE id = ?
        AND email_hash = ?
        AND email_lookup_hash IS ?
        AND email_lookup_key_version IS ?
        AND purpose = ?
        AND code_hash = ?
        AND code_hmac IS ?
        AND code_key_version IS ?
        AND consumed_at IS NULL
        AND invalidated_at IS NULL
        AND expires_at > ?
        AND attempt_count < max_attempts
      RETURNING
        attempt_count AS attemptCount,
        max_attempts AS maxAttempts
    `).bind(
      input.challengeId,
      challenge!.emailHash,
      challenge!.emailLookupHash,
      challenge!.emailLookupKeyVersion,
      input.purpose,
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
      unavailableState(await validatedChallenge(db, input), input.now) ??
      { status: "invalid" }
    );
  }

  const result = await db.prepare(`
    UPDATE auth_otp_challenges
    SET attempt_count = attempt_count + 1,
        consumed_at = ?
    WHERE id = ?
      AND email_hash = ?
      AND email_lookup_hash IS ?
      AND email_lookup_key_version IS ?
      AND purpose = ?
      AND code_hash = ?
      AND code_hmac IS ?
      AND code_key_version IS ?
      AND consumed_at IS NULL
      AND invalidated_at IS NULL
      AND expires_at > ?
      AND attempt_count < max_attempts
    RETURNING account_type AS accountType
  `).bind(
    input.now,
    input.challengeId,
    challenge!.emailHash,
    challenge!.emailLookupHash,
    challenge!.emailLookupKeyVersion,
    input.purpose,
    challenge!.codeHash,
    challenge!.codeHmac,
    challenge!.codeKeyVersion,
    input.now,
  ).run<{ accountType: string }>();
  const claimed = result.results[0];
  if (claimed) {
    return {
      status: "verified",
      accountType: claimed.accountType === "business"
        ? "business"
        : "individual",
    };
  }
  return (
    unavailableState(await validatedChallenge(db, input), input.now) ??
    { status: "invalid" }
  );
}
