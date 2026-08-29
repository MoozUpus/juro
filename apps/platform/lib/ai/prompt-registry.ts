export const AI_PROMPT_VERSIONS = {
  legalChat: "juro-legal-chat-v2-conversation",
  guestLegalChat: "juro-guest-legal-chat-v1",
  documentAnalysis: "juro-document-analysis-v1",
} as const;

export type AiPromptRegistryKey = keyof typeof AI_PROMPT_VERSIONS;

export type AiPromptRegistryEntry = Readonly<{
  key: AiPromptRegistryKey;
  version: (typeof AI_PROMPT_VERSIONS)[AiPromptRegistryKey];
  releaseGate: "code_review_and_evaluation";
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
