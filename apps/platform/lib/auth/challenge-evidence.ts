import { normalizeEmail, sha256 } from "./crypto";
import {
  identityEvidenceLookupPairs,
  identityEvidenceMatches,
  prepareEncryptedIdentityEvidence,
  prepareKeyedIdentityEvidence,
  resolveEncryptedIdentityEvidence,
  type EncryptedIdentityEvidence,
  type KeyedIdentityEvidencePair,
  type ResolvedIdentityEvidence,
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

export type PreparedEmailChangeEvidence = {
  currentEmail: string;
  currentEmailEvidence: PreparedChallengeLookupEvidence;
  newEmail: string;
  newEmailEvidence: EncryptedIdentityEvidence & {
    lookupPairs: KeyedIdentityEvidencePair[];
  };
  currentCodeEvidence: PreparedChallengeCodeEvidence;
  newCodeEvidence: PreparedChallengeCodeEvidence;
};

type StoredEvidence = {
  legacyHash: string | null;
  lookupHash: string | null;
  lookupKeyVersion: string | null;
};

function authOtpCodeValue(input: {
  challengeId: string;
  purpose: "login" | "register" | "password_reset";
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

function emailChangeCodeValue(input: {
  challengeId: string;
  userId: string;
  sessionId: string;
  destination: "current" | "new";
  codeSalt: string;
  code: string;
}): string {
  return JSON.stringify([
    "email-change-code-v1",
    input.challengeId,
    input.userId,
    input.sessionId,
    input.destination,
    input.codeSalt,
    input.code,
  ]);
}

async function prepareLookupEvidence(
  context: IdentityProtectionContext,
  normalizedValue: string,
  purpose: "auth-otp-email" | "auth-otp-request-ip"
    | "account-deletion-email" | "email-change-current-email",
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

export async function prepareAuthOtpEmailLookupEvidence(
  context: IdentityProtectionContext,
  email: string,
): Promise<PreparedChallengeLookupEvidence> {
  return prepareLookupEvidence(
    context,
    normalizeEmail(email),
    "auth-otp-email",
  );
}

async function prepareCodeEvidence(
  context: IdentityProtectionContext,
  input: {
    normalizedValue: string;
    legacyNormalizedValue: string;
    purpose: "auth-otp-code" | "account-deletion-code"
      | "email-change-current-code" | "email-change-new-code";
  },
): Promise<PreparedChallengeCodeEvidence> {
  const keyed = await prepareKeyedIdentityEvidence(context, {
    normalizedValue: input.normalizedValue,
    purpose: input.purpose,
  });
  // In keyed modes the compatibility column remains NOT NULL for rolling
  // migrations, but it must not retain an offline-testable digest of a
  // six-digit code. Hashing the server-keyed digest preserves the column
  // contract without exposing a verifier that can be brute-forced from D1.
  const legacyHash = keyed.lookupHash
    ? await sha256(`keyed-only:${keyed.lookupHash}`)
    : await sha256(input.legacyNormalizedValue);
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
    purpose: "login" | "register" | "password_reset";
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
    purpose: "login" | "register" | "password_reset";
    codeSalt: string;
    code: string;
    evidence: StoredEvidence;
  },
): Promise<boolean> {
  const legacyNormalizedValue = `${input.codeSalt}:${input.code}`;
  const hasKeyedEvidence = Boolean(
    input.evidence.lookupHash && input.evidence.lookupKeyVersion,
  );
  return identityEvidenceMatches(context, {
    normalizedValue: authOtpCodeValue(input),
    ...(hasKeyedEvidence ? {} : { legacyNormalizedValue }),
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
  const hasKeyedEvidence = Boolean(
    input.evidence.lookupHash && input.evidence.lookupKeyVersion,
  );
  return identityEvidenceMatches(context, {
    normalizedValue: accountDeletionCodeValue(input),
    ...(hasKeyedEvidence ? {} : { legacyNormalizedValue }),
    purpose: "account-deletion-code",
    legacyHash: input.evidence.legacyHash,
    lookupHash: input.evidence.lookupHash,
    lookupKeyVersion: input.evidence.lookupKeyVersion,
  });
}

export async function prepareEmailChangeEvidence(
  context: IdentityProtectionContext,
  input: {
    challengeId: string;
    userId: string;
    sessionId: string;
    currentEmail: string;
    newEmail: string;
    currentCodeSalt: string;
    currentCode: string;
    newCodeSalt: string;
    newCode: string;
  },
): Promise<PreparedEmailChangeEvidence> {
  const currentEmail = normalizeEmail(input.currentEmail);
  const newEmail = normalizeEmail(input.newEmail);
  const [
    currentEmailEvidence,
    encryptedNewEmail,
    newEmailLookupPairs,
    currentCodeEvidence,
    newCodeEvidence,
  ] = await Promise.all([
    prepareLookupEvidence(
      context,
      currentEmail,
      "email-change-current-email",
    ),
    prepareEncryptedIdentityEvidence(context, {
      plaintext: newEmail,
      normalizedValue: newEmail,
      purpose: "email-change-new-email",
      subjectId: input.userId,
      recordId: input.challengeId,
    }),
    identityEvidenceLookupPairs(context, {
      normalizedValue: newEmail,
      purpose: "email-change-new-email",
    }),
    prepareCodeEvidence(context, {
      normalizedValue: emailChangeCodeValue({
        challengeId: input.challengeId,
        userId: input.userId,
        sessionId: input.sessionId,
        destination: "current",
        codeSalt: input.currentCodeSalt,
        code: input.currentCode,
      }),
      legacyNormalizedValue: `${input.currentCodeSalt}:${input.currentCode}`,
      purpose: "email-change-current-code",
    }),
    prepareCodeEvidence(context, {
      normalizedValue: emailChangeCodeValue({
        challengeId: input.challengeId,
        userId: input.userId,
        sessionId: input.sessionId,
        destination: "new",
        codeSalt: input.newCodeSalt,
        code: input.newCode,
      }),
      legacyNormalizedValue: `${input.newCodeSalt}:${input.newCode}`,
      purpose: "email-change-new-code",
    }),
  ]);
  return {
    currentEmail,
    currentEmailEvidence,
    newEmail,
    newEmailEvidence: {
      ...encryptedNewEmail,
      lookupPairs: newEmailLookupPairs,
    },
    currentCodeEvidence,
    newCodeEvidence,
  };
}

export async function emailChangeCurrentEmailMatches(
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
    purpose: "email-change-current-email",
    legacyHash: input.evidence.legacyHash,
    lookupHash: input.evidence.lookupHash,
    lookupKeyVersion: input.evidence.lookupKeyVersion,
  });
}

export async function resolveEmailChangeNewEmail(
  context: IdentityProtectionContext,
  input: {
    challengeId: string;
    userId: string;
    rawValue: string | null;
    ciphertext: string | null;
    iv: string | null;
    keyVersion: string | null;
    lookupHash: string | null;
    lookupKeyVersion: string | null;
  },
): Promise<ResolvedIdentityEvidence> {
  return resolveEncryptedIdentityEvidence(context, {
    rawValue: input.rawValue,
    ciphertext: input.ciphertext,
    iv: input.iv,
    keyVersion: input.keyVersion,
    lookupHash: input.lookupHash,
    lookupKeyVersion: input.lookupKeyVersion,
    purpose: "email-change-new-email",
    subjectId: input.userId,
    recordId: input.challengeId,
    normalize: normalizeEmail,
  });
}

export async function emailChangeCodeMatches(
  context: IdentityProtectionContext,
  input: {
    challengeId: string;
    userId: string;
    sessionId: string;
    destination: "current" | "new";
    codeSalt: string;
    code: string;
    evidence: StoredEvidence;
  },
): Promise<boolean> {
  const legacyNormalizedValue = `${input.codeSalt}:${input.code}`;
  const hasKeyedEvidence = Boolean(
    input.evidence.lookupHash && input.evidence.lookupKeyVersion,
  );
  return identityEvidenceMatches(context, {
    normalizedValue: emailChangeCodeValue(input),
    ...(hasKeyedEvidence ? {} : { legacyNormalizedValue }),
    purpose: input.destination === "current"
      ? "email-change-current-code"
      : "email-change-new-code",
    legacyHash: input.evidence.legacyHash,
    lookupHash: input.evidence.lookupHash,
    lookupKeyVersion: input.evidence.lookupKeyVersion,
  });
}
