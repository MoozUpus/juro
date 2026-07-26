import assert from "node:assert/strict";
import test from "node:test";
import { sha256 } from "../lib/auth/crypto";
import {
  identityEvidenceMatches,
  prepareEncryptedIdentityEvidence,
  prepareKeyedIdentityEvidence,
  resolveEncryptedIdentityEvidence,
} from "../lib/auth/identity-evidence";
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

function serializedKeyring(): string {
  return JSON.stringify({
    active: "v2",
    versions: {
      v1: { aead: encodedKey(1), hmac: encodedKey(33) },
      v2: { aead: encodedKey(65), hmac: encodedKey(97) },
    },
  });
}

const legacyContext = createIdentityProtectionContext("legacy", undefined);
const dualContext = createIdentityProtectionContext(
  "dual_write",
  serializedKeyring(),
);

test("legacy invitation evidence preserves SHA rollback behavior", async () => {
  assert.deepEqual(
    await prepareKeyedIdentityEvidence(legacyContext, {
      normalizedValue: "user@example.test",
      purpose: "workspace-invitation-email",
    }),
    { lookupHash: null, lookupKeyVersion: null },
  );
  const legacyHash = await sha256("user@example.test");
  assert.equal(
    await identityEvidenceMatches(legacyContext, {
      normalizedValue: "user@example.test",
      purpose: "workspace-invitation-email",
      legacyHash,
      lookupHash: "keyed-data-is-ignored-by-explicit-rollback",
      lookupKeyVersion: "retired",
    }),
    true,
  );
  assert.equal(
    await identityEvidenceMatches(legacyContext, {
      normalizedValue: "different@example.test",
      purpose: "workspace-invitation-email",
      legacyHash,
      lookupHash: null,
      lookupKeyVersion: null,
    }),
    false,
  );
});

test("workspace invitation email is encrypted and record-bound", async () => {
  const evidence = await prepareEncryptedIdentityEvidence(dualContext, {
    plaintext: "User@Example.Test",
    normalizedValue: "user@example.test",
    purpose: "workspace-invitation-email",
    subjectId: "workspace-1",
    recordId: "invitation-1",
  });
  assert.notEqual(evidence.ciphertext, "User@Example.Test");
  assert.equal(evidence.keyVersion, "v2");
  assert.equal(evidence.lookupKeyVersion, "v2");
  assert.match(evidence.lookupHash ?? "", /^[A-Za-z0-9_-]{43}$/);

  assert.deepEqual(
    await resolveEncryptedIdentityEvidence(dualContext, {
      rawValue: "user@example.test",
      ...evidence,
      purpose: "workspace-invitation-email",
      subjectId: "workspace-1",
      recordId: "invitation-1",
      normalize: value => value.toLocaleLowerCase("en-US"),
    }),
    {
      value: "user@example.test",
      source: "protected",
      needsBackfill: false,
      needsRotation: false,
    },
  );
  await assert.rejects(
    resolveEncryptedIdentityEvidence(dualContext, {
      rawValue: "user@example.test",
      ...evidence,
      purpose: "workspace-invitation-email",
      subjectId: "workspace-1",
      recordId: "invitation-2",
      normalize: value => value.toLocaleLowerCase("en-US"),
    }),
    (error: unknown) => error instanceof IdentityProtectionError
      && error.code === "IDENTITY_ROW_CORRUPT",
  );
  await assert.rejects(
    resolveEncryptedIdentityEvidence(dualContext, {
      rawValue: "other@example.test",
      ...evidence,
      purpose: "workspace-invitation-email",
      subjectId: "workspace-1",
      recordId: "invitation-1",
      normalize: value => value.toLocaleLowerCase("en-US"),
    }),
    (error: unknown) => error instanceof IdentityProtectionError
      && error.code === "IDENTITY_VALUE_DIVERGED",
  );
});

test("keyed invitation evidence is domain-separated and authoritative", async () => {
  const normalizedValue = "user@example.test";
  const workspace = await prepareKeyedIdentityEvidence(dualContext, {
    normalizedValue,
    purpose: "workspace-invitation-email",
  });
  const document = await prepareKeyedIdentityEvidence(dualContext, {
    normalizedValue,
    purpose: "document-invitation-email",
  });
  assert.notEqual(workspace.lookupHash, document.lookupHash);
  assert.equal(
    await identityEvidenceMatches(dualContext, {
      normalizedValue,
      purpose: "document-invitation-email",
      legacyHash: await sha256(normalizedValue),
      ...document,
    }),
    true,
  );
  assert.equal(
    await identityEvidenceMatches(dualContext, {
      normalizedValue: "other@example.test",
      purpose: "document-invitation-email",
      legacyHash: await sha256("other@example.test"),
      ...document,
    }),
    false,
    "a keyed mismatch must not fall back to a matching legacy hash",
  );
});

test("dual mode fails closed on partial or unknown keyed evidence", async () => {
  await assert.rejects(
    identityEvidenceMatches(dualContext, {
      normalizedValue: "user@example.test",
      purpose: "workspace-invitation-email",
      legacyHash: null,
      lookupHash: "a".repeat(43),
      lookupKeyVersion: null,
    }),
    (error: unknown) => error instanceof IdentityProtectionError
      && error.code === "IDENTITY_ROW_CORRUPT",
  );
  await assert.rejects(
    identityEvidenceMatches(dualContext, {
      normalizedValue: "user@example.test",
      purpose: "workspace-invitation-email",
      legacyHash: await sha256("user@example.test"),
      lookupHash: "a".repeat(43),
      lookupKeyVersion: "unknown",
    }),
    (error: unknown) => error instanceof IdentityProtectionError
      && error.code === "IDENTITY_ROW_CORRUPT",
  );
});
