import assert from "node:assert/strict";
import test from "node:test";
import {
  generateBackupCodes,
  hashBackupCode,
  normalizeBackupCode,
  verifyBackupCode,
} from "../lib/auth/backup-codes";
import { parseIdentityKeyring } from "../lib/auth/keyring";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotpCode,
  totpCode,
  verifyTotpCode,
} from "../lib/auth/totp";

function encodedKey(seed: number): string {
  const bytes = Uint8Array.from(
    { length: 32 },
    (_, index) => (seed + index) % 256,
  );
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function keyring() {
  return parseIdentityKeyring(JSON.stringify({
    active: "v2",
    versions: {
      v1: { aead: encodedKey(1), hmac: encodedKey(33) },
      v2: { aead: encodedKey(65), hmac: encodedKey(97) },
    },
  }));
}

test("base32 matches RFC 4648 vectors and accepts canonical padding", () => {
  const vectors = [
    ["", ""],
    ["f", "MY"],
    ["fo", "MZXQ"],
    ["foo", "MZXW6"],
    ["foob", "MZXW6YQ"],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI"],
  ] as const;
  for (const [plain, encoded] of vectors) {
    const bytes = new TextEncoder().encode(plain);
    assert.equal(base32Encode(bytes), encoded);
    if (encoded) {
      assert.equal(new TextDecoder().decode(base32Decode(encoded)), plain);
    }
  }
  assert.equal(
    new TextDecoder().decode(base32Decode("MZXW6===")),
    "foo",
  );
  assert.throws(() => base32Decode("MZXW7"));
});

test("HOTP SHA-1 matches every RFC 4226 six-digit vector", async () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const expected = [
    "755224",
    "287082",
    "359152",
    "969429",
    "338314",
    "254676",
    "287922",
    "162583",
    "399871",
    "520489",
  ];
  for (let counter = 0; counter < expected.length; counter += 1) {
    assert.equal(await hotpCode(secret, counter), expected[counter]);
  }
});

test("TOTP verification accepts only ±1 and returns the replay counter", async () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
  const now = new Date("2026-07-26T12:00:00.000Z");
  const current = await totpCode(secret, now);
  assert.deepEqual(await verifyTotpCode(secret, current.code, now), {
    matchedCounter: current.counter,
  });
  const previous = await totpCode(
    secret,
    new Date(now.getTime() - 30_000),
  );
  assert.deepEqual(await verifyTotpCode(secret, previous.code, now), {
    matchedCounter: previous.counter,
  });
  const tooOld = await totpCode(
    secret,
    new Date(now.getTime() - 60_000),
  );
  assert.equal(await verifyTotpCode(secret, tooOld.code, now), null);
  assert.equal(await verifyTotpCode(secret, "12345", now), null);
});

test("backup codes provide 80 bits, normalize strictly, and never store raw codes", async () => {
  const codes = generateBackupCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.ok(codes.every(code => /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/.test(code)));
  const code = codes[0];
  assert.equal(normalizeBackupCode(code), code.replaceAll("-", ""));
  assert.equal(normalizeBackupCode("not a backup code"), null);

  const stored = await hashBackupCode(keyring(), {
    userId: "user-a",
    batchId: "batch-a",
    code,
  });
  assert.match(stored.digest, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(stored.keyVersion, "v2");
  assert.equal(stored.digest.includes(code.replaceAll("-", "")), false);
  assert.equal(await verifyBackupCode(keyring(), {
    userId: "user-a",
    batchId: "batch-a",
    code,
    ...stored,
  }), true);
  assert.equal(await verifyBackupCode(keyring(), {
    userId: "user-b",
    batchId: "batch-a",
    code,
    ...stored,
  }), false);
  assert.equal(await verifyBackupCode(keyring(), {
    userId: "user-a",
    batchId: "batch-b",
    code,
    ...stored,
  }), false);
});
