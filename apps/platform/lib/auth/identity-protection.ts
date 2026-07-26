import { normalizeEmail } from "./crypto";
import {
  identityLookupHmac,
  IdentityKeyringError,
  parseIdentityKeyring,
  protectIdentityValue,
  revealIdentityValue,
  type IdentityKeyring,
  type ProtectedIdentityValue,
} from "./keyring";

export type IdentityProtectionMode = "legacy" | "dual_write";

export type IdentityProtectionContext = {
  mode: IdentityProtectionMode;
  keyring: IdentityKeyring | null;
};

export type UserIdentityRow = {
  id: string;
  email: string | null;
  emailCiphertext: string | null;
  emailIv: string | null;
  emailKeyVersion: string | null;
  emailLookupHash: string | null;
  emailLookupKeyVersion: string | null;
  phone: string | null;
  phoneCiphertext: string | null;
  phoneIv: string | null;
  phoneKeyVersion: string | null;
  phoneLookupHash: string | null;
  phoneLookupKeyVersion: string | null;
};

export type UserIdentityWrite = Omit<UserIdentityRow, "id" | "email"> & {
  email: string;
};

export type ResolvedUserIdentity = {
  email: string;
  phone: string | null;
  source: "legacy" | "protected";
  needsBackfill: boolean;
  needsRotation: boolean;
};

export class IdentityProtectionError extends Error {
  constructor(
    public readonly code:
      | "IDENTITY_MODE_INVALID"
      | "IDENTITY_KEYRING_REQUIRED"
      | "IDENTITY_ROW_CORRUPT"
      | "IDENTITY_VALUE_DIVERGED"
      | "IDENTITY_LOOKUP_AMBIGUOUS"
      | "IDENTITY_BACKFILL_CONFLICT",
  ) {
    super(code);
    this.name = "IdentityProtectionError";
  }
}

const EMAIL_PURPOSE = "user-profile-email";
const EMAIL_LOOKUP_PURPOSE = "user-profile-email-lookup";
const PHONE_PURPOSE = "user-profile-phone";
const PHONE_LOOKUP_PURPOSE = "user-profile-phone-lookup";

export const USER_IDENTITY_SELECT = [
  "email",
  "email_ciphertext AS emailCiphertext",
  "email_iv AS emailIv",
  "email_key_version AS emailKeyVersion",
  "email_lookup_hash AS emailLookupHash",
  "email_lookup_key_version AS emailLookupKeyVersion",
  "phone",
  "phone_ciphertext AS phoneCiphertext",
  "phone_iv AS phoneIv",
  "phone_key_version AS phoneKeyVersion",
  "phone_lookup_hash AS phoneLookupHash",
  "phone_lookup_key_version AS phoneLookupKeyVersion",
].join(",");

export function userIdentitySelect(alias: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) {
    throw new IdentityProtectionError("IDENTITY_ROW_CORRUPT");
  }
  return [
    `${alias}.email`,
    `${alias}.email_ciphertext AS emailCiphertext`,
    `${alias}.email_iv AS emailIv`,
    `${alias}.email_key_version AS emailKeyVersion`,
    `${alias}.email_lookup_hash AS emailLookupHash`,
    `${alias}.email_lookup_key_version AS emailLookupKeyVersion`,
    `${alias}.phone`,
    `${alias}.phone_ciphertext AS phoneCiphertext`,
    `${alias}.phone_iv AS phoneIv`,
    `${alias}.phone_key_version AS phoneKeyVersion`,
    `${alias}.phone_lookup_hash AS phoneLookupHash`,
    `${alias}.phone_lookup_key_version AS phoneLookupKeyVersion`,
  ].join(",");
}

export function createIdentityProtectionContext(
  rawMode: string | null | undefined,
  rawKeyring: string | null | undefined,
): IdentityProtectionContext {
  const mode = rawMode?.trim() || "legacy";
  if (mode === "legacy") return { mode, keyring: null };
  if (mode !== "dual_write") {
    throw new IdentityProtectionError("IDENTITY_MODE_INVALID");
  }
  try {
    return {
      mode,
      keyring: parseIdentityKeyring(rawKeyring),
    };
  } catch (error) {
    if (error instanceof IdentityKeyringError) {
      throw new IdentityProtectionError("IDENTITY_KEYRING_REQUIRED");
    }
    throw error;
  }
}

export function normalizePhoneForLookup(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/[\s().-]+/g, "")
    .toLocaleLowerCase("en-US");
}

function protectedValue(
  row: UserIdentityRow,
  field: "email" | "phone",
): ProtectedIdentityValue | null {
  const ciphertext = field === "email"
    ? row.emailCiphertext
    : row.phoneCiphertext;
  const iv = field === "email" ? row.emailIv : row.phoneIv;
  const keyVersion = field === "email"
    ? row.emailKeyVersion
    : row.phoneKeyVersion;
  const populated = [ciphertext, iv, keyVersion].filter(
    value => value !== null,
  ).length;
  if (populated === 0) return null;
  if (populated !== 3 || !ciphertext || !iv || !keyVersion) {
    throw new IdentityProtectionError("IDENTITY_ROW_CORRUPT");
  }
  return { ciphertext, iv, keyVersion };
}

function lookupComplete(
  hash: string | null,
  keyVersion: string | null,
): boolean {
  if (hash === null && keyVersion === null) return false;
  if (!hash || !keyVersion) {
    throw new IdentityProtectionError("IDENTITY_ROW_CORRUPT");
  }
  return true;
}

function requireKeyring(
  context: IdentityProtectionContext,
): IdentityKeyring {
  if (!context.keyring) {
    throw new IdentityProtectionError("IDENTITY_KEYRING_REQUIRED");
  }
  return context.keyring;
}

async function protectField(
  keyring: IdentityKeyring,
  plaintext: string,
  input: {
    purpose: string;
    lookupPurpose: string;
    userId: string;
  },
): Promise<{
  ciphertext: string;
  iv: string;
  keyVersion: string;
  lookupHash: string;
  lookupKeyVersion: string;
}> {
  const value = await protectIdentityValue(keyring, plaintext, {
    purpose: input.purpose,
    subjectId: input.userId,
    recordId: input.userId,
  });
  const lookup = await identityLookupHmac(
    keyring,
    input.purpose === EMAIL_PURPOSE
      ? normalizeEmail(plaintext)
      : normalizePhoneForLookup(plaintext),
    input.lookupPurpose,
  );
  return {
    ciphertext: value.ciphertext,
    iv: value.iv,
    keyVersion: value.keyVersion,
    lookupHash: lookup.digest,
    lookupKeyVersion: lookup.keyVersion,
  };
}

export async function prepareUserIdentityWrite(
  context: IdentityProtectionContext,
  input: {
    userId: string;
    email: string;
    phone: string | null;
  },
): Promise<UserIdentityWrite> {
  const email = normalizeEmail(input.email);
  const phone = input.phone?.trim() || null;
  if (context.mode === "legacy") {
    return {
      email,
      emailCiphertext: null,
      emailIv: null,
      emailKeyVersion: null,
      emailLookupHash: null,
      emailLookupKeyVersion: null,
      phone,
      phoneCiphertext: null,
      phoneIv: null,
      phoneKeyVersion: null,
      phoneLookupHash: null,
      phoneLookupKeyVersion: null,
    };
  }
  const keyring = requireKeyring(context);
  const protectedEmail = await protectField(keyring, email, {
    purpose: EMAIL_PURPOSE,
    lookupPurpose: EMAIL_LOOKUP_PURPOSE,
    userId: input.userId,
  });
  const protectedPhone = phone
    ? await protectField(keyring, phone, {
        purpose: PHONE_PURPOSE,
        lookupPurpose: PHONE_LOOKUP_PURPOSE,
        userId: input.userId,
      })
    : null;
  return {
    email,
    emailCiphertext: protectedEmail.ciphertext,
    emailIv: protectedEmail.iv,
    emailKeyVersion: protectedEmail.keyVersion,
    emailLookupHash: protectedEmail.lookupHash,
    emailLookupKeyVersion: protectedEmail.lookupKeyVersion,
    phone,
    phoneCiphertext: protectedPhone?.ciphertext ?? null,
    phoneIv: protectedPhone?.iv ?? null,
    phoneKeyVersion: protectedPhone?.keyVersion ?? null,
    phoneLookupHash: protectedPhone?.lookupHash ?? null,
    phoneLookupKeyVersion: protectedPhone?.lookupKeyVersion ?? null,
  };
}

export function userIdentityWriteBindings(
  value: UserIdentityWrite,
): Array<string | null> {
  return [
    value.email,
    value.emailCiphertext,
    value.emailIv,
    value.emailKeyVersion,
    value.emailLookupHash,
    value.emailLookupKeyVersion,
    value.phone,
    value.phoneCiphertext,
    value.phoneIv,
    value.phoneKeyVersion,
    value.phoneLookupHash,
    value.phoneLookupKeyVersion,
  ];
}

export async function resolveUserIdentity(
  context: IdentityProtectionContext,
  row: UserIdentityRow,
): Promise<ResolvedUserIdentity> {
  if (context.mode === "legacy") {
    if (!row.email) {
      throw new IdentityProtectionError("IDENTITY_ROW_CORRUPT");
    }
    return {
      email: normalizeEmail(row.email),
      phone: row.phone,
      source: "legacy",
      needsBackfill: false,
      needsRotation: false,
    };
  }
  const keyring = requireKeyring(context);
  const emailValue = protectedValue(row, "email");
  const phoneValue = protectedValue(row, "phone");
  const emailLookup = lookupComplete(
    row.emailLookupHash,
    row.emailLookupKeyVersion,
  );
  const phoneLookup = lookupComplete(
    row.phoneLookupHash,
    row.phoneLookupKeyVersion,
  );
  if (!emailValue && emailLookup) {
    throw new IdentityProtectionError("IDENTITY_ROW_CORRUPT");
  }
  if (!phoneValue && phoneLookup) {
    throw new IdentityProtectionError("IDENTITY_ROW_CORRUPT");
  }
  if (!emailValue) {
    if (!row.email) {
      throw new IdentityProtectionError("IDENTITY_ROW_CORRUPT");
    }
    return {
      email: normalizeEmail(row.email),
      phone: row.phone,
      source: "legacy",
      needsBackfill: true,
      needsRotation: false,
    };
  }
  if (!emailLookup || (phoneValue && !phoneLookup)) {
    throw new IdentityProtectionError("IDENTITY_ROW_CORRUPT");
  }
  let email: string;
  let phone: string | null;
  try {
    email = await revealIdentityValue(keyring, emailValue, {
      purpose: EMAIL_PURPOSE,
      subjectId: row.id,
      recordId: row.id,
    });
    phone = phoneValue
      ? await revealIdentityValue(keyring, phoneValue, {
          purpose: PHONE_PURPOSE,
          subjectId: row.id,
          recordId: row.id,
        })
      : null;
  } catch (error) {
    if (error instanceof IdentityKeyringError) {
      throw new IdentityProtectionError("IDENTITY_ROW_CORRUPT");
    }
    throw error;
  }
  if (
    row.email
    && normalizeEmail(row.email) !== normalizeEmail(email)
  ) {
    throw new IdentityProtectionError("IDENTITY_VALUE_DIVERGED");
  }
  if (
    row.phone !== null
    && normalizePhoneForLookup(row.phone)
      !== normalizePhoneForLookup(phone ?? "")
  ) {
    throw new IdentityProtectionError("IDENTITY_VALUE_DIVERGED");
  }
  return {
    email: normalizeEmail(email),
    phone,
    source: "protected",
    needsBackfill: false,
    needsRotation:
      emailValue.keyVersion !== keyring.activeVersion
      || row.emailLookupKeyVersion !== keyring.activeVersion
      || Boolean(
        phoneValue
        && (
          phoneValue.keyVersion !== keyring.activeVersion
          || row.phoneLookupKeyVersion !== keyring.activeVersion
        ),
      ),
  };
}

async function lookupPairs(
  keyring: IdentityKeyring,
  normalizedValue: string,
  purpose: string,
): Promise<Array<{ hash: string; keyVersion: string }>> {
  return Promise.all(
    [...keyring.versions.keys()].sort().map(async keyVersion => {
      const value = await identityLookupHmac(
        keyring,
        normalizedValue,
        purpose,
        keyVersion,
      );
      return { hash: value.digest, keyVersion: value.keyVersion };
    }),
  );
}

function lookupPredicate(
  columnPrefix: "email" | "phone",
  pairs: Array<{ hash: string; keyVersion: string }>,
): { sql: string; bindings: string[] } {
  return {
    sql: pairs.map(
      () => `(${columnPrefix}_lookup_key_version=?
        AND ${columnPrefix}_lookup_hash=?)`,
    ).join(" OR "),
    bindings: pairs.flatMap(pair => [pair.keyVersion, pair.hash]),
  };
}

export async function userIdByEmail(
  db: D1Database,
  context: IdentityProtectionContext,
  emailInput: string,
): Promise<string | null> {
  const email = normalizeEmail(emailInput);
  if (context.mode === "legacy") {
    return (await db.prepare(
      "SELECT id FROM user_profiles WHERE lower(email)=? LIMIT 1",
    ).bind(email).first<{ id: string }>())?.id ?? null;
  }
  const pairs = await lookupPairs(
    requireKeyring(context),
    email,
    EMAIL_LOOKUP_PURPOSE,
  );
  const predicate = lookupPredicate("email", pairs);
  const rows = await db.prepare(
    `SELECT id FROM user_profiles
     WHERE (${predicate.sql}) OR lower(email)=?
     LIMIT 2`,
  ).bind(...predicate.bindings, email).all<{ id: string }>();
  if (rows.results.length > 1) {
    throw new IdentityProtectionError("IDENTITY_LOOKUP_AMBIGUOUS");
  }
  return rows.results[0]?.id ?? null;
}

export async function userIdsByIdentifier(
  db: D1Database,
  context: IdentityProtectionContext,
  identifierInput: string,
  limit = 2,
): Promise<string[]> {
  const identifier = identifierInput.trim();
  if (context.mode === "legacy") {
    const rows = await db.prepare(
      `SELECT id FROM user_profiles
       WHERE lower(email)=lower(?) OR phone=?
       LIMIT ?`,
    ).bind(identifier, identifier, limit).all<{ id: string }>();
    return rows.results.map(row => row.id);
  }
  const keyring = requireKeyring(context);
  const emailPairs = await lookupPairs(
    keyring,
    normalizeEmail(identifier),
    EMAIL_LOOKUP_PURPOSE,
  );
  const phonePairs = await lookupPairs(
    keyring,
    normalizePhoneForLookup(identifier),
    PHONE_LOOKUP_PURPOSE,
  );
  const emailPredicate = lookupPredicate("email", emailPairs);
  const phonePredicate = lookupPredicate("phone", phonePairs);
  const rows = await db.prepare(
    `SELECT id FROM user_profiles
     WHERE (${emailPredicate.sql})
        OR (${phonePredicate.sql})
        OR lower(email)=lower(?)
        OR phone=?
     LIMIT ?`,
  ).bind(
    ...emailPredicate.bindings,
    ...phonePredicate.bindings,
    identifier,
    identifier,
    limit,
  ).all<{ id: string }>();
  return rows.results.map(row => row.id);
}

export async function userIdentityById(
  db: D1Database,
  context: IdentityProtectionContext,
  userId: string,
): Promise<ResolvedUserIdentity | null> {
  const row = await db.prepare(
    `SELECT id,${USER_IDENTITY_SELECT}
     FROM user_profiles WHERE id=? LIMIT 1`,
  ).bind(userId).first<UserIdentityRow>();
  return row ? resolveUserIdentity(context, row) : null;
}

export async function backfillUserIdentityBatch(
  db: D1Database,
  context: IdentityProtectionContext,
  options: { afterId?: string; limit?: number } = {},
): Promise<{
  processed: number;
  updated: number;
  nextAfterId: string | null;
}> {
  if (context.mode !== "dual_write") {
    throw new IdentityProtectionError("IDENTITY_KEYRING_REQUIRED");
  }
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const rows = await db.prepare(
    `SELECT id,${USER_IDENTITY_SELECT}
     FROM user_profiles
     WHERE id>?
     ORDER BY id
     LIMIT ?`,
  ).bind(options.afterId ?? "", limit).all<UserIdentityRow>();
  let updated = 0;
  for (const row of rows.results) {
    const resolved = await resolveUserIdentity(context, row);
    if (!resolved.needsBackfill && !resolved.needsRotation) continue;
    const next = await prepareUserIdentityWrite(context, {
      userId: row.id,
      email: resolved.email,
      phone: resolved.phone,
    });
    const result = await db.prepare(
      `UPDATE user_profiles SET
         email_ciphertext=?,email_iv=?,email_key_version=?,
         email_lookup_hash=?,email_lookup_key_version=?,
         phone_ciphertext=?,phone_iv=?,phone_key_version=?,
         phone_lookup_hash=?,phone_lookup_key_version=?
       WHERE id=?
         AND email IS ?
         AND phone IS ?
         AND email_ciphertext IS ?
         AND email_iv IS ?
         AND email_key_version IS ?
         AND email_lookup_hash IS ?
         AND email_lookup_key_version IS ?
         AND phone_ciphertext IS ?
         AND phone_iv IS ?
         AND phone_key_version IS ?
         AND phone_lookup_hash IS ?
         AND phone_lookup_key_version IS ?`,
    ).bind(
      next.emailCiphertext,
      next.emailIv,
      next.emailKeyVersion,
      next.emailLookupHash,
      next.emailLookupKeyVersion,
      next.phoneCiphertext,
      next.phoneIv,
      next.phoneKeyVersion,
      next.phoneLookupHash,
      next.phoneLookupKeyVersion,
      row.id,
      row.email,
      row.phone,
      row.emailCiphertext,
      row.emailIv,
      row.emailKeyVersion,
      row.emailLookupHash,
      row.emailLookupKeyVersion,
      row.phoneCiphertext,
      row.phoneIv,
      row.phoneKeyVersion,
      row.phoneLookupHash,
      row.phoneLookupKeyVersion,
    ).run();
    if (Number(result.meta.changes ?? 0) !== 1) {
      throw new IdentityProtectionError("IDENTITY_BACKFILL_CONFLICT");
    }
    updated += 1;
  }
  return {
    processed: rows.results.length,
    updated,
    nextAfterId: rows.results.at(-1)?.id ?? null,
  };
}

export async function verifyUserIdentityProtection(
  db: D1Database,
  context: IdentityProtectionContext,
): Promise<{
  total: number;
  protected: number;
  legacy: number;
  rotationRequired: number;
}> {
  if (context.mode !== "dual_write") {
    throw new IdentityProtectionError("IDENTITY_KEYRING_REQUIRED");
  }
  const rows = await db.prepare(
    `SELECT id,${USER_IDENTITY_SELECT}
     FROM user_profiles ORDER BY id`,
  ).all<UserIdentityRow>();
  let protectedRows = 0;
  let legacyRows = 0;
  let rotationRequired = 0;
  for (const row of rows.results) {
    const resolved = await resolveUserIdentity(context, row);
    if (resolved.source === "protected") protectedRows += 1;
    else legacyRows += 1;
    if (resolved.needsRotation) rotationRequired += 1;
  }
  return {
    total: rows.results.length,
    protected: protectedRows,
    legacy: legacyRows,
    rotationRequired,
  };
}
