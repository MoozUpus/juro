import { sha256 } from "./crypto";
import {
  IdentityProtectionError,
  type IdentityProtectionContext,
} from "./identity-protection";
import {
  identityLookupHmac,
  IdentityKeyringError,
  protectIdentityValue,
  revealIdentityValue,
  type IdentityKeyring,
} from "./keyring";

export type IdentityEvidencePurpose =
  | "workspace-invitation-email"
  | "document-invitation-email"
  | "document-invitation-phone"
  | "auth-otp-email"
  | "auth-otp-request-ip"
  | "auth-otp-code"
  | "account-deletion-email"
  | "account-deletion-code"
  | "email-change-current-email"
  | "email-change-new-email"
  | "email-change-current-code"
  | "email-change-new-code";

export type KeyedIdentityEvidence = {
  lookupHash: string | null;
  lookupKeyVersion: string | null;
};

export type KeyedIdentityEvidencePair = {
  lookupHash: string;
  lookupKeyVersion: string;
};

export type EncryptedIdentityEvidence = KeyedIdentityEvidence & {
  ciphertext: string | null;
  iv: string | null;
  keyVersion: string | null;
};

export type ResolvedIdentityEvidence = {
  value: string;
  source: "legacy" | "protected";
  needsBackfill: boolean;
  needsRotation: boolean;
};

function lookupPurpose(purpose: IdentityEvidencePurpose): string {
  return `${purpose}-lookup`;
}

function requireKeyring(
  context: IdentityProtectionContext,
): IdentityKeyring {
  if (!context.keyring) {
    throw new IdentityProtectionError("IDENTITY_KEYRING_REQUIRED");
  }
  return context.keyring;
}

function completeGroup(values: Array<string | null>): boolean {
  const populated = values.filter(value => value !== null).length;
  if (populated === 0) return false;
  if (populated !== values.length || values.some(value => !value)) {
    throw new IdentityProtectionError("IDENTITY_ROW_CORRUPT");
  }
  return true;
}

function secureEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0)
      ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function asProtectionError(error: unknown): never {
  if (error instanceof IdentityKeyringError) {
    throw new IdentityProtectionError("IDENTITY_ROW_CORRUPT");
  }
  throw error;
}

export async function prepareKeyedIdentityEvidence(
  context: IdentityProtectionContext,
  input: {
    normalizedValue: string;
    purpose: IdentityEvidencePurpose;
  },
): Promise<KeyedIdentityEvidence> {
  if (context.mode === "legacy") {
    return { lookupHash: null, lookupKeyVersion: null };
  }
  try {
    const lookup = await identityLookupHmac(
      requireKeyring(context),
      input.normalizedValue,
      lookupPurpose(input.purpose),
    );
    return {
      lookupHash: lookup.digest,
      lookupKeyVersion: lookup.keyVersion,
    };
  } catch (error) {
    return asProtectionError(error);
  }
}

export async function identityEvidenceLookupPairs(
  context: IdentityProtectionContext,
  input: {
    normalizedValue: string;
    purpose: IdentityEvidencePurpose;
  },
): Promise<KeyedIdentityEvidencePair[]> {
  if (context.mode === "legacy") return [];
  try {
    const keyring = requireKeyring(context);
    const versions = [
      keyring.activeVersion,
      ...[...keyring.versions.keys()]
        .filter(version => version !== keyring.activeVersion)
        .sort(),
    ];
    return Promise.all(
      versions.map(async (version) => {
        const lookup = await identityLookupHmac(
          keyring,
          input.normalizedValue,
          lookupPurpose(input.purpose),
          version,
        );
        return {
          lookupHash: lookup.digest,
          lookupKeyVersion: lookup.keyVersion,
        };
      }),
    );
  } catch (error) {
    return asProtectionError(error);
  }
}

export async function prepareEncryptedIdentityEvidence(
  context: IdentityProtectionContext,
  input: {
    plaintext: string;
    normalizedValue: string;
    purpose: IdentityEvidencePurpose;
    subjectId: string;
    recordId: string;
  },
): Promise<EncryptedIdentityEvidence> {
  if (context.mode === "legacy") {
    return {
      ciphertext: null,
      iv: null,
      keyVersion: null,
      lookupHash: null,
      lookupKeyVersion: null,
    };
  }
  try {
    const keyring = requireKeyring(context);
    const [protectedValue, lookup] = await Promise.all([
      protectIdentityValue(keyring, input.plaintext, {
        purpose: input.purpose,
        subjectId: input.subjectId,
        recordId: input.recordId,
      }),
      identityLookupHmac(
        keyring,
        input.normalizedValue,
        lookupPurpose(input.purpose),
      ),
    ]);
    return {
      ciphertext: protectedValue.ciphertext,
      iv: protectedValue.iv,
      keyVersion: protectedValue.keyVersion,
      lookupHash: lookup.digest,
      lookupKeyVersion: lookup.keyVersion,
    };
  } catch (error) {
    return asProtectionError(error);
  }
}

export async function resolveEncryptedIdentityEvidence(
  context: IdentityProtectionContext,
  input: {
    rawValue: string | null;
    ciphertext: string | null;
    iv: string | null;
    keyVersion: string | null;
    lookupHash: string | null;
    lookupKeyVersion: string | null;
    purpose: IdentityEvidencePurpose;
    subjectId: string;
    recordId: string;
    normalize: (value: string) => string;
  },
): Promise<ResolvedIdentityEvidence> {
  if (context.mode === "legacy") {
    if (!input.rawValue) {
      throw new IdentityProtectionError("IDENTITY_ROW_CORRUPT");
    }
    return {
      value: input.normalize(input.rawValue),
      source: "legacy",
      needsBackfill: false,
      needsRotation: false,
    };
  }
  const protectedComplete = completeGroup([
    input.ciphertext,
    input.iv,
    input.keyVersion,
  ]);
  const lookupComplete = completeGroup([
    input.lookupHash,
    input.lookupKeyVersion,
  ]);
  if (protectedComplete !== lookupComplete) {
    throw new IdentityProtectionError("IDENTITY_ROW_CORRUPT");
  }
  if (!protectedComplete) {
    if (!input.rawValue) {
      throw new IdentityProtectionError("IDENTITY_ROW_CORRUPT");
    }
    return {
      value: input.normalize(input.rawValue),
      source: "legacy",
      needsBackfill: true,
      needsRotation: false,
    };
  }
  try {
    const keyring = requireKeyring(context);
    const plaintext = await revealIdentityValue(
      keyring,
      {
        ciphertext: input.ciphertext!,
        iv: input.iv!,
        keyVersion: input.keyVersion!,
      },
      {
        purpose: input.purpose,
        subjectId: input.subjectId,
        recordId: input.recordId,
      },
    );
    const normalized = input.normalize(plaintext);
    if (
      input.rawValue !== null
      && input.normalize(input.rawValue) !== normalized
    ) {
      throw new IdentityProtectionError("IDENTITY_VALUE_DIVERGED");
    }
    const expectedLookup = await identityLookupHmac(
      keyring,
      normalized,
      lookupPurpose(input.purpose),
      input.lookupKeyVersion!,
    );
    if (!secureEqual(expectedLookup.digest, input.lookupHash!)) {
      throw new IdentityProtectionError("IDENTITY_VALUE_DIVERGED");
    }
    return {
      value: normalized,
      source: "protected",
      needsBackfill: false,
      needsRotation:
        input.keyVersion !== keyring.activeVersion
        || input.lookupKeyVersion !== keyring.activeVersion,
    };
  } catch (error) {
    if (error instanceof IdentityProtectionError) throw error;
    return asProtectionError(error);
  }
}

export async function identityEvidenceMatches(
  context: IdentityProtectionContext,
  input: {
    normalizedValue: string;
    legacyNormalizedValue?: string;
    purpose: IdentityEvidencePurpose;
    legacyHash: string | null;
    lookupHash: string | null;
    lookupKeyVersion: string | null;
  },
): Promise<boolean> {
  const legacyNormalizedValue = input.legacyNormalizedValue
    ?? input.normalizedValue;
  if (context.mode === "legacy") {
    return input.legacyHash !== null
      && secureEqual(await sha256(legacyNormalizedValue), input.legacyHash);
  }
  const keyedComplete = completeGroup([
    input.lookupHash,
    input.lookupKeyVersion,
  ]);
  if (!keyedComplete) {
    return input.legacyHash !== null
      && secureEqual(await sha256(legacyNormalizedValue), input.legacyHash);
  }
  try {
    const expected = await identityLookupHmac(
      requireKeyring(context),
      input.normalizedValue,
      lookupPurpose(input.purpose),
      input.lookupKeyVersion!,
    );
    if (!secureEqual(expected.digest, input.lookupHash!)) return false;
    if (
      input.legacyHash !== null
      && input.legacyNormalizedValue !== undefined
      && !secureEqual(
        await sha256(legacyNormalizedValue),
        input.legacyHash,
      )
    ) {
      throw new IdentityProtectionError("IDENTITY_VALUE_DIVERGED");
    }
    return true;
  } catch (error) {
    if (error instanceof IdentityProtectionError) throw error;
    return asProtectionError(error);
  }
}
