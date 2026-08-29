export const aiReasoningModes = ["fast", "balanced", "deep"] as const;

export type AiReasoningMode = (typeof aiReasoningModes)[number];

export const DEFAULT_AI_REASONING_MODE: AiReasoningMode = "balanced";

export type AiReasoningProfile = {
  modelTier: "chat" | "deep";
  openAiReasoningEffort: "low" | "medium" | "high";
  providerTimeoutMs: number;
  firstContentTimeoutMs: number;
  fallbackTimeoutMs: number;
  fallbackMinimumAttemptMs: number;
  fallbackReserveMs: number;
  maxOutputTokens: {
    short: number;
    detailed: number;
  };
};

export type AiReasoningRuntimeModels = Readonly<{
  openaiChatModel: string;
  openaiDeepModel: string;
  anthropicChatFallbackModel: string;
}>;

export type AiReasoningRuntimeRoute = Readonly<{
  mode: AiReasoningMode;
  isDefault: boolean;
  primaryProvider: "openai";
  primaryModel: string;
  fallbackProvider: "anthropic";
  fallbackModel: string;
  profile: AiReasoningProfile;
}>;

const profiles: Record<AiReasoningMode, AiReasoningProfile> = {
  fast: {
    modelTier: "chat",
    openAiReasoningEffort: "low",
    providerTimeoutMs: 25_500,
    firstContentTimeoutMs: 4_500,
    fallbackTimeoutMs: 8_000,
    fallbackMinimumAttemptMs: 4_000,
    fallbackReserveMs: 2_000,
    maxOutputTokens: { short: 1_000, detailed: 1_400 },
  },
  balanced: {
    modelTier: "chat",
    openAiReasoningEffort: "medium",
    providerTimeoutMs: 45_000,
    firstContentTimeoutMs: 8_000,
    fallbackTimeoutMs: 20_000,
    fallbackMinimumAttemptMs: 8_000,
    fallbackReserveMs: 4_000,
    maxOutputTokens: { short: 1_800, detailed: 2_800 },
  },
  deep: {
    modelTier: "deep",
    openAiReasoningEffort: "high",
    providerTimeoutMs: 120_000,
    firstContentTimeoutMs: 30_000,
    fallbackTimeoutMs: 60_000,
    fallbackMinimumAttemptMs: 12_000,
    fallbackReserveMs: 5_000,
    maxOutputTokens: { short: 2_400, detailed: 4_200 },
  },
};

export function parseAiReasoningMode(value: unknown): AiReasoningMode {
  return value === "fast" || value === "balanced" || value === "deep"
    ? value
    : DEFAULT_AI_REASONING_MODE;
}

export function aiReasoningProfile(mode: AiReasoningMode): AiReasoningProfile {
  return profiles[mode];
}

/**
 * One source of truth for the user-facing mode to runtime-model mapping.
 * Provider execution, run reservation, and the protected Admin console use
 * this same function so the displayed route cannot drift from the real call.
 */
export function aiReasoningRuntimeRoute(
  settings: AiReasoningRuntimeModels,
  mode: AiReasoningMode,
): AiReasoningRuntimeRoute {
  const profile = aiReasoningProfile(mode);
  return {
    mode,
    isDefault: mode === DEFAULT_AI_REASONING_MODE,
    primaryProvider: "openai",
    primaryModel: profile.modelTier === "deep"
      ? settings.openaiDeepModel
      : settings.openaiChatModel,
    fallbackProvider: "anthropic",
    fallbackModel: settings.anthropicChatFallbackModel,
    profile,
  };
}
