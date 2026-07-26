import assert from "node:assert/strict";
import test from "node:test";
import {
  identityLookupHmac,
  IdentityKeyringError,
  parseIdentityKeyring,
  protectIdentityValue,
  revealIdentityValue,
} from "../lib/auth/keyring";

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

test("identity keyring fails closed for missing or malformed material", () => {
  assert.throws(
    () => parseIdentityKeyring(undefined),
    (error: unknown) => error instanceof IdentityKeyringError
      && error.code === "KEYRING_MISSING",
  );
  for (const raw of [
    "{",
    "{}",
    JSON.stringify({ active: "v1", versions: {} }),
    JSON.stringify({
      active: "v1",
      versions: { v1: { aead: "short", hmac: "short" } },
    }),
  ]) {
    assert.throws(
      () => parseIdentityKeyring(raw),
      (error: unknown) => error instanceof IdentityKeyringError
        && error.code === "KEYRING_INVALID",
    );
  }
  const tooManyVersions = Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [
      `v${index + 1}`,
      {
        aead: encodedKey(index + 1),
        hmac: encodedKey(index + 33),
      },
    ]),
  );
  assert.throws(
    () => parseIdentityKeyring(JSON.stringify({
      active: "v1",
      versions: tooManyVersions,
    })),
    (error: unknown) => error instanceof IdentityKeyringError
      && error.code === "KEYRING_INVALID",
  );
});

test("AES-GCM protects identity values with record-bound AAD", async () => {
  const keyring = parseIdentityKeyring(serializedKeyring());
  const context = {
    purpose: "totp-secret",
    subjectId: "user-1",
    recordId: "factor-1",
  };
  const protectedValue = await protectIdentityValue(
    keyring,
    "JBSWY3DPEHPK3PXP",
    context,
  );
  assert.equal(protectedValue.keyVersion, "v2");
  assert.notEqual(protectedValue.ciphertext, "JBSWY3DPEHPK3PXP");
  assert.match(protectedValue.ciphertext, /^[A-Za-z0-9_-]+$/);
  assert.match(protectedValue.iv, /^[A-Za-z0-9_-]{16}$/);
  assert.equal(
    await revealIdentityValue(keyring, protectedValue, context),
    "JBSWY3DPEHPK3PXP",
  );
  await assert.rejects(
    revealIdentityValue(keyring, protectedValue, {
      ...context,
      recordId: "factor-2",
    }),
    (error: unknown) => error instanceof IdentityKeyringError
      && error.code === "DECRYPTION_FAILED",
  );
});

test("rotation reads old ciphertext while all new writes use the active key", async () => {
  const context = {
    purpose: "totp-secret",
    subjectId: "user-1",
    recordId: "factor-1",
  };
  const oldOnlyActive = parseIdentityKeyring(serializedKeyring("v1"));
  const oldValue = await protectIdentityValue(
    oldOnlyActive,
    "old-secret",
    context,
  );
  assert.equal(oldValue.keyVersion, "v1");

  const rotated = parseIdentityKeyring(serializedKeyring("v2"));
  assert.equal(
    await revealIdentityValue(rotated, oldValue, context),
    "old-secret",
  );
  const newValue = await protectIdentityValue(
    rotated,
    "new-secret",
    context,
  );
  assert.equal(newValue.keyVersion, "v2");
});

test("lookup HMAC is versioned and domain separated", async () => {
  const keyring = parseIdentityKeyring(serializedKeyring());
  const email = await identityLookupHmac(
    keyring,
    "user@example.test",
    "email-lookup",
  );
  const invitation = await identityLookupHmac(
    keyring,
    "user@example.test",
    "invitation-email",
  );
  const oldEmail = await identityLookupHmac(
    keyring,
    "user@example.test",
    "email-lookup",
    "v1",
  );
  assert.equal(email.keyVersion, "v2");
  assert.match(email.digest, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(email.digest, invitation.digest);
  assert.notEqual(email.digest, oldEmail.digest);
  assert.equal(
    email.digest,
    (
      await identityLookupHmac(
        keyring,
        "user@example.test",
        "email-lookup",
      )
    ).digest,
  );
});
