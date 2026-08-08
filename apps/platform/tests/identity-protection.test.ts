import assert from "node:assert/strict";
import test from "node:test";
import {
  backfillUserIdentityBatch,
  createIdentityProtectionContext,
  IdentityProtectionError,
  normalizePhoneForLookup,
  prepareUserIdentityWrite,
  resolveUserIdentity,
  userIdByEmail,
  userIdsByIdentifier,
  userIdentityWriteBindings,
  verifyUserIdentityProtection,
  type UserIdentityRow,
} from "../lib/auth/identity-protection";
import {
  createEmailOtpSession,
  localSessionFromCookie,
} from "../lib/auth/session-management";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

function encodedKey(seed: number): string {
  const bytes = Uint8Array.from(
    { length: 32 },
    (_, index) => (seed + index) % 256,
  );
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function serializedKeyring(active = "v2"): string {
  return JSON.stringify({
    active,
    versions: {
      v1: { aead: encodedKey(1), hmac: encodedKey(33) },
      v2: { aead: encodedKey(65), hmac: encodedKey(97) },
    },
  });
}

function dualContext(active = "v2") {
  return createIdentityProtectionContext(
    "dual_write",
    serializedKeyring(active),
  );
}

function insertLegacyProfile(
  db: D1Database,
  input: { id: string; email: string; phone?: string | null },
): Promise<D1Result> {
  const now = "2026-07-26T12:00:00.000Z";
  return db.prepare(
    `INSERT INTO user_profiles (
       id,email,phone,created_at,updated_at
     ) VALUES (?,?,?,?,?)`,
  ).bind(
    input.id,
    input.email,
    input.phone ?? null,
    now,
    now,
  ).run();
}

test("identity protection mode is explicit and keyring-gated", () => {
  assert.deepEqual(
    createIdentityProtectionContext(undefined, undefined),
    { mode: "legacy", keyring: null },
  );
  assert.throws(
    () => createIdentityProtectionContext("dual_write", undefined),
    (error: unknown) => error instanceof IdentityProtectionError
      && error.code === "IDENTITY_KEYRING_REQUIRED",
  );
  assert.throws(
    () => createIdentityProtectionContext("enforced", serializedKeyring()),
    (error: unknown) => error instanceof IdentityProtectionError
      && error.code === "IDENTITY_MODE_INVALID",
  );
  assert.equal(dualContext().keyring?.activeVersion, "v2");
});

test("profile email and phone use record-bound encryption and lookup HMACs", async () => {
  const context = dualContext();
  const protectedIdentity = await prepareUserIdentityWrite(context, {
    userId: "user-1",
    email: " User@Example.Test ",
    phone: "+998 (90) 123-45-67",
  });
  assert.equal(protectedIdentity.email, "user@example.test");
  assert.equal(protectedIdentity.phone, "+998 (90) 123-45-67");
  assert.notEqual(
    protectedIdentity.emailCiphertext,
    protectedIdentity.email,
  );
  assert.notEqual(
    protectedIdentity.phoneCiphertext,
    protectedIdentity.phone,
  );
  assert.equal(protectedIdentity.emailKeyVersion, "v2");
  assert.equal(protectedIdentity.emailLookupKeyVersion, "v2");
  assert.equal(protectedIdentity.phoneKeyVersion, "v2");
  assert.equal(protectedIdentity.phoneLookupKeyVersion, "v2");
  assert.match(protectedIdentity.emailLookupHash ?? "", /^[\w-]{43}$/);
  assert.match(protectedIdentity.phoneLookupHash ?? "", /^[\w-]{43}$/);
  assert.equal(
    normalizePhoneForLookup("+998 (90) 123-45-67"),
    "+998901234567",
  );

  const row = {
    id: "user-1",
    ...protectedIdentity,
  } satisfies UserIdentityRow;
  assert.deepEqual(await resolveUserIdentity(context, row), {
    email: "user@example.test",
    phone: "+998 (90) 123-45-67",
    source: "protected",
    needsBackfill: false,
    needsRotation: false,
  });
  await assert.rejects(
    resolveUserIdentity(context, { ...row, id: "user-2" }),
    (error: unknown) => error instanceof IdentityProtectionError
      && error.code === "IDENTITY_ROW_CORRUPT",
  );
  await assert.rejects(
    resolveUserIdentity(context, {
      ...row,
      email: "different@example.test",
    }),
    (error: unknown) => error instanceof IdentityProtectionError
      && error.code === "IDENTITY_VALUE_DIVERGED",
  );
});

test("legacy rows dual-read, backfill idempotently, and rotate to active key", async () => {
  const { d1 } = sqliteD1Fixture();
  await insertLegacyProfile(d1, {
    id: "legacy-user",
    email: "legacy@example.test",
    phone: "+998 90 111 22 33",
  });
  await insertLegacyProfile(d1, {
    id: "second-user",
    email: "second@example.test",
  });

  const v1 = dualContext("v1");
  assert.equal(
    await userIdByEmail(d1, v1, "LEGACY@example.test"),
    "legacy-user",
  );
  assert.deepEqual(
    await userIdsByIdentifier(d1, v1, "+998 90 111 22 33"),
    ["legacy-user"],
  );
  assert.deepEqual(await verifyUserIdentityProtection(d1, v1), {
    total: 2,
    protected: 0,
    legacy: 2,
    rotationRequired: 0,
  });

  const first = await backfillUserIdentityBatch(d1, v1, { limit: 1 });
  assert.deepEqual(first, {
    processed: 1,
    updated: 1,
    nextAfterId: "legacy-user",
  });
  const second = await backfillUserIdentityBatch(d1, v1, {
    afterId: first.nextAfterId ?? undefined,
    limit: 10,
  });
  assert.deepEqual(second, {
    processed: 1,
    updated: 1,
    nextAfterId: "second-user",
  });
  assert.deepEqual(await verifyUserIdentityProtection(d1, v1), {
    total: 2,
    protected: 2,
    legacy: 0,
    rotationRequired: 0,
  });

  const protectedRow = await d1.prepare(
    `SELECT
       email,email_ciphertext AS emailCiphertext,email_iv AS emailIv,
       email_key_version AS emailKeyVersion,
       email_lookup_hash AS emailLookupHash,
       email_lookup_key_version AS emailLookupKeyVersion,
       phone,phone_ciphertext AS phoneCiphertext,phone_iv AS phoneIv,
       phone_key_version AS phoneKeyVersion,
       phone_lookup_hash AS phoneLookupHash,
       phone_lookup_key_version AS phoneLookupKeyVersion
     FROM user_profiles WHERE id='legacy-user'`,
  ).first<Omit<UserIdentityRow, "id">>();
  assert.ok(protectedRow);
  assert.equal(protectedRow.email, "legacy@example.test");
  assert.notEqual(protectedRow.emailCiphertext, protectedRow.email);
  assert.equal(protectedRow.emailKeyVersion, "v1");

  const repeat = await backfillUserIdentityBatch(d1, v1, { limit: 10 });
  assert.equal(repeat.updated, 0);

  const v2 = dualContext("v2");
  assert.deepEqual(await verifyUserIdentityProtection(d1, v2), {
    total: 2,
    protected: 2,
    legacy: 0,
    rotationRequired: 2,
  });
  const rotated = await backfillUserIdentityBatch(d1, v2, { limit: 10 });
  assert.equal(rotated.updated, 2);
  assert.deepEqual(await verifyUserIdentityProtection(d1, v2), {
    total: 2,
    protected: 2,
    legacy: 0,
    rotationRequired: 0,
  });
  assert.equal(
    await userIdByEmail(d1, v2, "legacy@example.test"),
    "legacy-user",
  );
});

test("database guard rejects partial protected groups and duplicate keyed email", async () => {
  const { d1 } = sqliteD1Fixture();
  const context = dualContext();
  const first = await prepareUserIdentityWrite(context, {
    userId: "protected-user",
    email: "protected@example.test",
    phone: null,
  });
  const now = "2026-07-26T12:00:00.000Z";
  await d1.prepare(
    `INSERT INTO user_profiles (
       id,email,email_ciphertext,email_iv,email_key_version,
       email_lookup_hash,email_lookup_key_version,
       phone,phone_ciphertext,phone_iv,phone_key_version,
       phone_lookup_hash,phone_lookup_key_version,created_at,updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    "protected-user",
    ...userIdentityWriteBindings(first),
    now,
    now,
  ).run();
  await assert.rejects(
    d1.prepare(
      `UPDATE user_profiles
       SET email_iv=NULL
       WHERE id='protected-user'`,
    ).run(),
    /identity protection fields incomplete/,
  );

  const duplicate = await prepareUserIdentityWrite(context, {
    userId: "duplicate-user",
    email: "protected@example.test",
    phone: null,
  });
  await assert.rejects(
    d1.prepare(
      `INSERT INTO user_profiles (
         id,email,email_ciphertext,email_iv,email_key_version,
         email_lookup_hash,email_lookup_key_version,
         phone,phone_ciphertext,phone_iv,phone_key_version,
         phone_lookup_hash,phone_lookup_key_version,created_at,updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      "duplicate-user",
      ...userIdentityWriteBindings({
        ...duplicate,
        email: "different-legacy@example.test",
      }),
      now,
      now,
    ).run(),
    /UNIQUE constraint failed/,
  );
});

test("dual-read local sessions expose plaintext identity but no protected fields", async () => {
  const { d1 } = sqliteD1Fixture();
  const context = dualContext();
  const identity = await prepareUserIdentityWrite(context, {
    userId: "session-user",
    email: "session@example.test",
    phone: "+998 90 000 00 01",
  });
  const now = "2026-07-26T12:00:00.000Z";
  await d1.prepare(
    `INSERT INTO user_profiles (
       id,email,email_ciphertext,email_iv,email_key_version,
       email_lookup_hash,email_lookup_key_version,
       phone,phone_ciphertext,phone_iv,phone_key_version,
       phone_lookup_hash,phone_lookup_key_version,full_name,
       created_at,updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    "session-user",
    ...userIdentityWriteBindings(identity),
    "Session User",
    now,
    now,
  ).run();
  const created = await createEmailOtpSession(d1, {
    userId: "session-user",
    userAgent: "Browser/1.0",
    now: new Date(now),
  });
  const loaded = await localSessionFromCookie(
    d1,
    `juro_session=${created.token}`,
    { identity: context, touch: false, now: new Date(now) },
  );
  assert.ok(loaded);
  assert.equal(loaded.email, "session@example.test");
  assert.equal(loaded.fullName, "Session User");
  assert.deepEqual(
    Object.keys(loaded).sort(),
    [
      "assuranceLevel",
      "authMethod",
      "authenticatedAt",
      "createdAt",
      "deviceId",
      "deviceName",
      "email",
      "expiresAt",
      "fullName",
      "idleExpiresAt",
      "lastSeenAt",
      "mfaVerifiedAt",
      "sessionId",
      "userId",
    ],
  );
});
