import assert from "node:assert/strict";
import test from "node:test";
import {
  accountDeletionCodeMatches,
  accountDeletionEmailMatches,
  authOtpCodeMatches,
  authOtpEmailMatches,
  prepareAccountDeletionEvidence,
  prepareAuthOtpChallengeEvidence,
} from "../lib/auth/challenge-evidence";
import {
  createIdentityProtectionContext,
  IdentityProtectionError,
} from "../lib/auth/identity-protection";

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

const legacyContext = createIdentityProtectionContext("legacy", undefined);
const dualContext = createIdentityProtectionContext(
  "dual_write",
  JSON.stringify({
    active: "v2",
    versions: {
      v1: { aead: encodedKey(1), hmac: encodedKey(33) },
      v2: { aead: encodedKey(65), hmac: encodedKey(97) },
    },
  }),
);

test("legacy OTP evidence preserves the exact SHA rollback contract", async () => {
  const prepared = await prepareAuthOtpChallengeEvidence(legacyContext, {
    challengeId: "challenge-1",
    email: " User@Example.Test ",
    requestIp: " 203.0.113.8 ",
    purpose: "login",
    codeSalt: "salt",
    code: "123456",
  });
  assert.equal(prepared.email, "user@example.test");
  assert.equal(prepared.requestIp, "203.0.113.8");
  assert.equal(prepared.emailEvidence.lookupHash, null);
  assert.equal(prepared.requestIpEvidence?.lookupHash, null);
  assert.equal(prepared.codeEvidence.lookupHash, null);
  assert.equal(
    await authOtpEmailMatches(legacyContext, {
      email: "user@example.test",
      evidence: {
        legacyHash: prepared.emailEvidence.legacyHash,
        lookupHash: null,
        lookupKeyVersion: null,
      },
    }),
    true,
  );
  assert.equal(
    await authOtpCodeMatches(legacyContext, {
      challengeId: "a-different-id-is-ignored-in-legacy-mode",
      purpose: "register",
      codeSalt: "salt",
      code: "123456",
      evidence: {
        legacyHash: prepared.codeEvidence.legacyHash,
        lookupHash: null,
        lookupKeyVersion: null,
      },
    }),
    true,
  );
});

test("dual OTP evidence is key-versioned, record-bound, and authoritative", async () => {
  const prepared = await prepareAuthOtpChallengeEvidence(dualContext, {
    challengeId: "challenge-1",
    email: "User@Example.Test",
    requestIp: "203.0.113.8",
    purpose: "login",
    codeSalt: "salt",
    code: "123456",
  });
  assert.equal(prepared.emailEvidence.lookupKeyVersion, "v2");
  assert.deepEqual(
    prepared.emailEvidence.lookupPairs.map(
      ({ lookupKeyVersion }) => lookupKeyVersion,
    ),
    ["v2", "v1"],
  );
  assert.equal(prepared.codeEvidence.lookupKeyVersion, "v2");
  assert.equal(
    await authOtpCodeMatches(dualContext, {
      challengeId: "challenge-1",
      purpose: "login",
      codeSalt: "salt",
      code: "123456",
      evidence: {
        legacyHash: prepared.codeEvidence.legacyHash,
        lookupHash: prepared.codeEvidence.lookupHash,
        lookupKeyVersion: prepared.codeEvidence.lookupKeyVersion,
      },
    }),
    true,
  );
  assert.equal(
    await authOtpCodeMatches(dualContext, {
      challengeId: "challenge-2",
      purpose: "login",
      codeSalt: "salt",
      code: "123456",
      evidence: {
        legacyHash: prepared.codeEvidence.legacyHash,
        lookupHash: prepared.codeEvidence.lookupHash,
        lookupKeyVersion: prepared.codeEvidence.lookupKeyVersion,
      },
    }),
    false,
  );
  await assert.rejects(
    authOtpEmailMatches(dualContext, {
      email: prepared.email,
      evidence: {
        legacyHash: "divergent-retained-sha",
        lookupHash: prepared.emailEvidence.lookupHash,
        lookupKeyVersion: prepared.emailEvidence.lookupKeyVersion,
      },
    }),
    (error: unknown) => error instanceof IdentityProtectionError
      && error.code === "IDENTITY_VALUE_DIVERGED",
  );
});

test("account deletion codes are bound to user and session", async () => {
  const prepared = await prepareAccountDeletionEvidence(dualContext, {
    challengeId: "deletion-1",
    userId: "user-1",
    sessionId: "session-1",
    email: "user@example.test",
    codeSalt: "salt",
    code: "654321",
  });
  const evidence = {
    legacyHash: prepared.codeEvidence.legacyHash,
    lookupHash: prepared.codeEvidence.lookupHash,
    lookupKeyVersion: prepared.codeEvidence.lookupKeyVersion,
  };
  assert.equal(
    await accountDeletionEmailMatches(dualContext, {
      email: "USER@example.test",
      evidence: {
        legacyHash: prepared.emailEvidence.legacyHash,
        lookupHash: prepared.emailEvidence.lookupHash,
        lookupKeyVersion: prepared.emailEvidence.lookupKeyVersion,
      },
    }),
    true,
  );
  assert.equal(
    await accountDeletionCodeMatches(dualContext, {
      challengeId: "deletion-1",
      userId: "user-1",
      sessionId: "session-1",
      codeSalt: "salt",
      code: "654321",
      evidence,
    }),
    true,
  );
  assert.equal(
    await accountDeletionCodeMatches(dualContext, {
      challengeId: "deletion-1",
      userId: "user-1",
      sessionId: "session-2",
      codeSalt: "salt",
      code: "654321",
      evidence,
    }),
    false,
  );
});
