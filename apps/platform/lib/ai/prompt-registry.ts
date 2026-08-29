export const AI_PROMPT_VERSIONS = {
  legalChat: "juro-legal-chat-v3-compact-context",
  guestLegalChat: "juro-guest-legal-chat-v1",
  documentAnalysis: "juro-document-analysis-v1",
} as const;

export type AiPromptRegistryKey = keyof typeof AI_PROMPT_VERSIONS;

export type AiPromptRegistryEntry = Readonly<{
  key: AiPromptRegistryKey;
  version: (typeof AI_PROMPT_VERSIONS)[AiPromptRegistryKey];
  releaseGate: "code_review_and_evaluation";
}>;

export type AiPromptReleaseEntry = Readonly<{
  key: AiPromptRegistryKey;
  version: string;
  status: "current" | "superseded";
  introducedAt: string;
  sourceCommit: string;
  releaseGate: "code_review_and_evaluation";
  supersededBy?: string;
}>;

/**
 * Code-owned prompt identities used in persisted run hashes and shown in the
 * protected Admin console. The console never receives prompt text or secrets.
 */
export const aiPromptRegistry: readonly AiPromptRegistryEntry[] = [
  {
    key: "legalChat",
    version: AI_PROMPT_VERSIONS.legalChat,
    releaseGate: "code_review_and_evaluation",
  },
  {
    key: "guestLegalChat",
    version: AI_PROMPT_VERSIONS.guestLegalChat,
    releaseGate: "code_review_and_evaluation",
  },
  {
    key: "documentAnalysis",
    version: AI_PROMPT_VERSIONS.documentAnalysis,
    releaseGate: "code_review_and_evaluation",
  },
] as const;

/**
 * Newest-first release evidence reconstructed from the commits that introduced
 * each persisted prompt identity. Add a record when a version changes; never
 * include prompt text, provider secrets, or user content here.
 */
export const aiPromptReleaseHistory = [
  {
    key: "legalChat",
    version: AI_PROMPT_VERSIONS.legalChat,
    status: "current",
    introducedAt: "2026-08-29T12:46:28+05:00",
    sourceCommit: "c7c6d35eb88baaec157f8709ee214b936c07b64a",
    releaseGate: "code_review_and_evaluation",
  },
  {
    key: "legalChat",
    version: "juro-legal-chat-v2-conversation",
    status: "superseded",
    introducedAt: "2026-08-10T04:36:29+02:00",
    sourceCommit: "7e7bac1485f35ccbee6e03784cd314c668d878d2",
    releaseGate: "code_review_and_evaluation",
    supersededBy: AI_PROMPT_VERSIONS.legalChat,
  },
  {
    key: "guestLegalChat",
    version: AI_PROMPT_VERSIONS.guestLegalChat,
    status: "current",
    introducedAt: "2026-08-04T00:08:01+05:00",
    sourceCommit: "2c4754d30d24289d0da5fd2fd5e732d1a4c7a805",
    releaseGate: "code_review_and_evaluation",
  },
  {
    key: "documentAnalysis",
    version: AI_PROMPT_VERSIONS.documentAnalysis,
    status: "current",
    introducedAt: "2026-07-31T02:07:03+05:00",
    sourceCommit: "2456742373ef045328e4d9df09ac6c6ef95bc03a",
    releaseGate: "code_review_and_evaluation",
  },
  {
    key: "legalChat",
    version: "juro-legal-chat-v1",
    status: "superseded",
    introducedAt: "2026-07-30T23:37:04+05:00",
    sourceCommit: "fc21def3d62afd37f2852e7a98e24d5473c6d2c3",
    releaseGate: "code_review_and_evaluation",
    supersededBy: "juro-legal-chat-v2-conversation",
  },
] as const satisfies readonly AiPromptReleaseEntry[];
