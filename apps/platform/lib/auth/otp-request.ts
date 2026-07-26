import {
  prepareAuthOtpChallengeEvidence,
  type PreparedChallengeLookupEvidence,
} from "./challenge-evidence";
import type { IdentityProtectionContext } from "./identity-protection";

export type OtpReservationResult =
  | { status: "reserved" }
  | {
    status: "blocked";
    latestActiveCreatedAt: string | null;
    hourlyCount: number;
  };

type LookupColumns = {
  legacy: string;
  hash: string;
  keyVersion: string;
};

function lookupPredicate(
  columns: LookupColumns,
  evidence: PreparedChallengeLookupEvidence,
): { sql: string; bindings: string[] } {
  if (evidence.lookupPairs.length === 0) {
    return {
      sql: `${columns.legacy} = ?`,
      bindings: [evidence.legacyHash],
    };
  }
  const keyed = evidence.lookupPairs.map(
    () => `(${columns.hash} = ? AND ${columns.keyVersion} = ?)`,
  );
  return {
    sql: `(
      (
        ${columns.hash} IS NULL
        AND ${columns.keyVersion} IS NULL
        AND ${columns.legacy} = ?
      )
      OR ${keyed.join("\n      OR ")}
    )`,
    bindings: [
      evidence.legacyHash,
      ...evidence.lookupPairs.flatMap(pair => [
        pair.lookupHash,
        pair.lookupKeyVersion,
      ]),
    ],
  };
}

export async function reserveOtpChallenge(
  db: D1Database,
  input: {
    identityContext: IdentityProtectionContext;
    id: string;
    email: string;
    requestIp: string | null;
    purpose: "login" | "register";
    locale: "ru" | "uz";
    accountType: "individual" | "business";
    codeSalt: string;
    code: string;
    expiresAt: string;
    now: string;
    cooldownSince: string;
    hourlySince: string;
  },
): Promise<OtpReservationResult> {
  const evidence = await prepareAuthOtpChallengeEvidence(
    input.identityContext,
    {
      challengeId: input.id,
      email: input.email,
      requestIp: input.requestIp,
      purpose: input.purpose,
      codeSalt: input.codeSalt,
      code: input.code,
    },
  );
  const emailPredicate = lookupPredicate(
    {
      legacy: "email_hash",
      hash: "email_lookup_hash",
      keyVersion: "email_lookup_key_version",
    },
    evidence.emailEvidence,
  );
  const ipPredicate = evidence.requestIpEvidence
    ? lookupPredicate(
        {
          legacy: "request_ip_hash",
          hash: "request_ip_lookup_hash",
          keyVersion: "request_ip_lookup_key_version",
        },
        evidence.requestIpEvidence,
      )
    : null;
  const requesterPredicate = ipPredicate
    ? `(${emailPredicate.sql} OR ${ipPredicate.sql})`
    : emailPredicate.sql;
  const requesterBindings = [
    ...emailPredicate.bindings,
    ...(ipPredicate?.bindings ?? []),
  ];
  const results = await db.batch([
    db.prepare(`
      INSERT INTO auth_otp_challenges (
        id,
        email,
        email_hash,
        email_lookup_hash,
        email_lookup_key_version,
        purpose,
        locale,
        account_type,
        code_salt,
        code_hash,
        code_hmac,
        code_key_version,
        attempt_count,
        max_attempts,
        expires_at,
        request_ip_hash,
        request_ip_lookup_hash,
        request_ip_lookup_key_version,
        created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 5, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1
        FROM auth_otp_challenges
        WHERE invalidated_at IS NULL
          AND created_at > ?
          AND ${requesterPredicate}
      )
      AND (
        SELECT count(*)
        FROM auth_otp_challenges
        WHERE created_at > ?
          AND ${requesterPredicate}
      ) < 8
    `).bind(
      input.id,
      evidence.email,
      evidence.emailEvidence.legacyHash,
      evidence.emailEvidence.lookupHash,
      evidence.emailEvidence.lookupKeyVersion,
      input.purpose,
      input.locale,
      input.accountType,
      input.codeSalt,
      evidence.codeEvidence.legacyHash,
      evidence.codeEvidence.lookupHash,
      evidence.codeEvidence.lookupKeyVersion,
      input.expiresAt,
      evidence.requestIpEvidence?.legacyHash ?? null,
      evidence.requestIpEvidence?.lookupHash ?? null,
      evidence.requestIpEvidence?.lookupKeyVersion ?? null,
      input.now,
      input.cooldownSince,
      ...requesterBindings,
      input.hourlySince,
      ...requesterBindings,
    ),
    db.prepare(`
      UPDATE auth_otp_challenges
      SET invalidated_at = ?
      WHERE ${emailPredicate.sql}
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
      ...emailPredicate.bindings,
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
            AND ${requesterPredicate}
        ) AS latestActiveCreatedAt,
        (
          SELECT count(*)
          FROM auth_otp_challenges
          WHERE created_at > ?
            AND ${requesterPredicate}
        ) AS hourlyCount
    `).bind(
      input.id,
      input.cooldownSince,
      ...requesterBindings,
      input.hourlySince,
      ...requesterBindings,
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
