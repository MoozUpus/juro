import { normalizeEmail, sha256 } from "./crypto";
import {
  identityEvidenceLookupPairs,
  identityEvidenceMatches,
  prepareKeyedIdentityEvidence,
  type KeyedIdentityEvidencePair,
} from "./identity-evidence";
import type { IdentityProtectionContext } from "./identity-protection";

export type PreparedChallengeLookupEvidence = {
  legacyHash: string;
  lookupHash: string | null;
  lookupKeyVersion: string | null;
  lookupPairs: KeyedIdentityEvidencePair[];
};

export type PreparedChallengeCodeEvidence = {
  legacyHash: string;
  lookupHash: string | null;
  lookupKeyVersion: string | null;
};

export type PreparedAuthOtpChallengeEvidence = {
  email: string;
  emailEvidence: PreparedChallengeLookupEvidence;
  requestIp: string | null;
  requestIpEvidence: PreparedChallengeLookupEvidence | null;
  codeEvidence: PreparedChallengeCodeEvidence;
};

export type PreparedAccountDeletionEvidence = {
  email: string;
  emailEvidence: PreparedChallengeLookupEvidence;
  codeEvidence: PreparedChallengeCodeEvidence;
};

type StoredEvidence = {
  legacyHash: string | null;
  lookupHash: string | null;
  lookupKeyVersion: string | null;
};

function authOtpCodeValue(input: {
  challengeId: string;
  purpose: "login" | "register";
  codeSalt: string;
  code: string;
}): string {
  return JSON.stringify([
    "auth-otp-code-v1",
    input.challengeId,
    input.purpose,
    input.codeSalt,
    input.code,
  ]);
}

function accountDeletionCodeValue(input: {
  challengeId: string;
  userId: string;
  sessionId: string;
  codeSalt: string;
  code: string;
}): string {
  return JSON.stringify([
    "account-deletion-code-v1",
    input.challengeId,
    input.userId,
    input.sessionId,
    input.codeSalt,
    input.code,
  ]);
}

async function prepareLookupEvidence(
  context: IdentityProtectionContext,
  normalizedValue: string,
  purpose: "auth-otp-email" | "auth-otp-request-ip"
    | "account-deletion-email",
): Promise<PreparedChallengeLookupEvidence> {
  const [legacyHash, lookupPairs] = await Promise.all([
    sha256(normalizedValue),
    identityEvidenceLookupPairs(context, {
      normalizedValue,
      purpose,
    }),
  ]);
  return {
    legacyHash,
    lookupHash: lookupPairs[0]?.lookupHash ?? null,
    lookupKeyVersion: lookupPairs[0]?.lookupKeyVersion ?? null,
    lookupPairs,
  };
}

async function prepareCodeEvidence(
  context: IdentityProtectionContext,
  input: {
    normalizedValue: string;
    legacyNormalizedValue: string;
    purpose: "auth-otp-code" | "account-deletion-code";
  },
): Promise<PreparedChallengeCodeEvidence> {
  const [legacyHash, keyed] = await Promise.all([
    sha256(input.legacyNormalizedValue),
    prepareKeyedIdentityEvidence(context, {
      normalizedValue: input.normalizedValue,
      purpose: input.purpose,
    }),
  ]);
  return {
    legacyHash,
    lookupHash: keyed.lookupHash,
    lookupKeyVersion: keyed.lookupKeyVersion,
  };
}

export async function prepareAuthOtpChallengeEvidence(
  context: IdentityProtectionContext,
  input: {
    challengeId: string;
    email: string;
    requestIp: string | null;
    purpose: "login" | "register";
    codeSalt: string;
    code: string;
  },
): Promise<PreparedAuthOtpChallengeEvidence> {
  const email = normalizeEmail(input.email);
  const requestIp = input.requestIp?.trim() || null;
  const [emailEvidence, requestIpEvidence, codeEvidence] = await Promise.all([
    prepareLookupEvidence(context, email, "auth-otp-email"),
    requestIp
      ? prepareLookupEvidence(context, requestIp, "auth-otp-request-ip")
      : null,
    prepareCodeEvidence(context, {
      normalizedValue: authOtpCodeValue({
        challengeId: input.challengeId,
        purpose: input.purpose,
        codeSalt: input.codeSalt,
        code: input.code,
      }),
      legacyNormalizedValue: `${input.codeSalt}:${input.code}`,
      purpose: "auth-otp-code",
    }),
  ]);
  return {
    email,
    emailEvidence,
    requestIp,
    requestIpEvidence,
    codeEvidence,
  };
}

export async function authOtpEmailMatches(
  context: IdentityProtectionContext,
  input: {
    email: string;
    evidence: StoredEvidence;
  },
): Promise<boolean> {
  const email = normalizeEmail(input.email);
  return identityEvidenceMatches(context, {
    normalizedValue: email,
    legacyNormalizedValue: email,
    purpose: "auth-otp-email",
    legacyHash: input.evidence.legacyHash,
    lookupHash: input.evidence.lookupHash,
    lookupKeyVersion: input.evidence.lookupKeyVersion,
  });
}

export async function authOtpCodeMatches(
  context: IdentityProtectionContext,
  input: {
    challengeId: string;
    purpose: "login" | "register";
    codeSalt: string;
    code: string;
    evidence: StoredEvidence;
  },
): Promise<boolean> {
  const legacyNormalizedValue = `${input.codeSalt}:${input.code}`;
  return identityEvidenceMatches(context, {
    normalizedValue: authOtpCodeValue(input),
    legacyNormalizedValue,
    purpose: "auth-otp-code",
    legacyHash: input.evidence.legacyHash,
    lookupHash: input.evidence.lookupHash,
    lookupKeyVersion: input.evidence.lookupKeyVersion,
  });
}

export async function prepareAccountDeletionEvidence(
  context: IdentityProtectionContext,
  input: {
    challengeId: string;
    userId: string;
    sessionId: string;
    email: string;
    codeSalt: string;
    code: string;
  },
): Promise<PreparedAccountDeletionEvidence> {
  const email = normalizeEmail(input.email);
  const [emailEvidence, codeEvidence] = await Promise.all([
    prepareLookupEvidence(context, email, "account-deletion-email"),
    prepareCodeEvidence(context, {
      normalizedValue: accountDeletionCodeValue(input),
      legacyNormalizedValue: `${input.codeSalt}:${input.code}`,
      purpose: "account-deletion-code",
    }),
  ]);
  return { email, emailEvidence, codeEvidence };
}

export async function accountDeletionEmailMatches(
  context: IdentityProtectionContext,
  input: {
    email: string;
    evidence: StoredEvidence;
  },
): Promise<boolean> {
  const email = normalizeEmail(input.email);
  return identityEvidenceMatches(context, {
    normalizedValue: email,
    legacyNormalizedValue: email,
    purpose: "account-deletion-email",
    legacyHash: input.evidence.legacyHash,
    lookupHash: input.evidence.lookupHash,
    lookupKeyVersion: input.evidence.lookupKeyVersion,
  });
}

export async function accountDeletionCodeMatches(
  context: IdentityProtectionContext,
  input: {
    challengeId: string;
    userId: string;
    sessionId: string;
    codeSalt: string;
    code: string;
    evidence: StoredEvidence;
  },
): Promise<boolean> {
  const legacyNormalizedValue = `${input.codeSalt}:${input.code}`;
  return identityEvidenceMatches(context, {
    normalizedValue: accountDeletionCodeValue(input),
    legacyNormalizedValue,
    purpose: "account-deletion-code",
    legacyHash: input.evidence.legacyHash,
    lookupHash: input.evidence.lookupHash,
    lookupKeyVersion: input.evidence.lookupKeyVersion,
  });
}
