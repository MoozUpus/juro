import { randomToken, sha256 } from "./crypto";
import {
  identityLookupHmac,
  type IdentityKeyring,
} from "./keyring";
import type { AuthRequestSecurityEvidence } from "./request-security-evidence";

export type PreparedDeviceContinuity = {
  id: string;
  userId: string;
  token: string;
  tokenHmac: string;
  keyVersion: string;
  recognized: boolean;
  countryCode: string | null;
  regionCode: string | null;
  timestamp: string;
};

export type DeviceContinuityGuard = {
  selectSql: string;
  bindings: Array<string | number | null>;
};

const TOKEN_PURPOSE = "auth-device-continuity";

async function tokenEvidence(
  keyring: IdentityKeyring,
  userId: string,
  token: string,
) {
  const versions = [
    keyring.activeVersion,
    ...[...keyring.versions.keys()].filter(
      version => version !== keyring.activeVersion,
    ),
  ];
  return Promise.all(versions.map(version =>
    identityLookupHmac(
      keyring,
      `${userId}\n${token}`,
      TOKEN_PURPOSE,
      version,
    )
  ));
}

async function continuityId(userId: string, tokenHmac: string) {
  const digest = await sha256([
    "juro-device-continuity-id-v1",
    userId,
    tokenHmac,
  ].join("\n"));
  return `device_${digest.slice(0, 32)}`;
}

async function matchingContinuity(
  db: D1Database,
  userId: string,
  evidence: Awaited<ReturnType<typeof tokenEvidence>>,
) {
  const predicates = evidence.map(
    () => "(key_version=? AND token_hmac=?)",
  );
  return db.prepare(
    `SELECT id,revoked_at AS revokedAt
     FROM auth_device_continuities
     WHERE user_id=? AND (${predicates.join(" OR ")})
     ORDER BY CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END,last_seen_at DESC
     LIMIT 1`,
  ).bind(
    userId,
    ...evidence.flatMap(item => [item.keyVersion, item.digest]),
  ).first<{ id: string; revokedAt: string | null }>();
}

export async function prepareDeviceContinuity(
  db: D1Database,
  keyring: IdentityKeyring | null,
  input: {
    userId: string;
    deviceToken: string | null;
    securityEvidence?: AuthRequestSecurityEvidence | null;
    now?: Date;
  },
): Promise<PreparedDeviceContinuity | null> {
  if (!keyring) return null;
  let token = input.deviceToken ?? randomToken(32);
  let evidence = await tokenEvidence(keyring, input.userId, token);
  let existing = input.deviceToken
    ? await matchingContinuity(db, input.userId, evidence)
    : null;
  if (existing?.revokedAt) {
    token = randomToken(32);
    evidence = await tokenEvidence(keyring, input.userId, token);
    existing = null;
  }
  const active = evidence.find(
    item => item.keyVersion === keyring.activeVersion,
  );
  if (!active) throw new Error("DEVICE_CONTINUITY_KEY_MISSING");
  return {
    id: existing?.id ?? await continuityId(input.userId, active.digest),
    userId: input.userId,
    token,
    tokenHmac: active.digest,
    keyVersion: active.keyVersion,
    recognized: Boolean(existing),
    countryCode: input.securityEvidence?.countryCode ?? null,
    regionCode: input.securityEvidence?.regionCode ?? null,
    timestamp: (input.now ?? new Date()).toISOString(),
  };
}

function assertGuard(guard: DeviceContinuityGuard) {
  if (!/^\s*SELECT\b/i.test(guard.selectSql) || guard.selectSql.includes(";")) {
    throw new Error("INVALID_DEVICE_CONTINUITY_GUARD");
  }
}

export function deviceContinuityStatements(
  db: D1Database,
  prepared: PreparedDeviceContinuity,
  guard: DeviceContinuityGuard = { selectSql: "SELECT 1", bindings: [] },
): D1PreparedStatement[] {
  assertGuard(guard);
  return [
    db.prepare(
      `INSERT OR IGNORE INTO auth_device_continuities (
         id,user_id,token_hmac,key_version,
         first_country_code,first_region_code,last_country_code,last_region_code,
         first_seen_at,last_seen_at
       )
       SELECT ?,?,?,?,?,?,?,?,?,?
       WHERE EXISTS (${guard.selectSql})`,
    ).bind(
      prepared.id,
      prepared.userId,
      prepared.tokenHmac,
      prepared.keyVersion,
      prepared.countryCode,
      prepared.regionCode,
      prepared.countryCode,
      prepared.regionCode,
      prepared.timestamp,
      prepared.timestamp,
      ...guard.bindings,
    ),
    db.prepare(
      `UPDATE auth_device_continuities
       SET token_hmac=?,key_version=?,
           last_country_code=coalesce(?,last_country_code),
           last_region_code=coalesce(?,last_region_code),last_seen_at=?
       WHERE id=? AND user_id=? AND revoked_at IS NULL
         AND EXISTS (${guard.selectSql})`,
    ).bind(
      prepared.tokenHmac,
      prepared.keyVersion,
      prepared.countryCode,
      prepared.regionCode,
      prepared.timestamp,
      prepared.id,
      prepared.userId,
      ...guard.bindings,
    ),
  ];
}

export function deviceContinuityEventMetadata(
  prepared: PreparedDeviceContinuity | null | undefined,
) {
  return prepared
    ? {
        deviceContinuity: {
          recognition: prepared.recognized ? "recognized" : "new",
        },
      }
    : {};
}
