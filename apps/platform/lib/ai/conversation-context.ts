import { legalChatResponseSchema } from "./legal-chat-schema";
import { redactLegalQuerySensitiveData } from "./legal-query-planner";

export type ConversationContextSourceTurn = {
  question: string;
  answer: string;
  structuredJson?: string | null;
};

export type ConversationContextSummaryTurn = {
  user: string;
  assistant: string;
  openQuestions: string[];
};

export type ConversationContextSummary = {
  includedTurns: number;
  omittedTurns: number;
  turns: ConversationContextSummaryTurn[];
};

export type ConversationContextMetrics = {
  sourceTurns: number;
  recentTurns: number;
  summarizedTurns: number;
  omittedTurns: number;
  legacyProviderCharacters: number;
  providerCharacters: number;
  providerCharacterReductionBps: number;
};

export type BoundedConversationContext = {
  conversationHistory: Array<{ user: string; assistant: string }>;
  conversationSummary: ConversationContextSummary | null;
  metrics: ConversationContextMetrics;
};

const SOURCE_TURN_LIMIT = 12;
const RECENT_TURN_LIMIT = 3;
const RECENT_FIELD_CHARACTER_LIMIT = 2_000;
const SUMMARY_TURN_LIMIT = 5;
const SUMMARY_USER_CHARACTER_LIMIT = 320;
const SUMMARY_ASSISTANT_CHARACTER_LIMIT = 360;
const SUMMARY_QUESTION_CHARACTER_LIMIT = 220;
const LEGACY_CHARACTER_LIMIT = 24_000;
const LEGACY_FIELD_CHARACTER_LIMIT = 8_000;

function bounded(value: string, limit: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, limit);
}

function boundedRecent(value: string): string {
  return value.trim().slice(0, RECENT_FIELD_CHARACTER_LIMIT);
}

function legacyConversationHistory(
  turns: readonly ConversationContextSourceTurn[],
): Array<{ user: string; assistant: string }> {
  const selected: Array<{ user: string; assistant: string }> = [];
  let characters = 0;
  for (const turn of turns.slice(-SOURCE_TURN_LIMIT).reverse()) {
    const user = turn.question.trim().slice(0, LEGACY_FIELD_CHARACTER_LIMIT);
    const assistant = turn.answer.trim().slice(0, LEGACY_FIELD_CHARACTER_LIMIT);
    const size = user.length + assistant.length;
    if (selected.length > 0 && characters + size > LEGACY_CHARACTER_LIMIT) break;
    selected.push({ user, assistant });
    characters += size;
  }
  return selected.reverse();
}

function parseStoredSummary(turn: ConversationContextSourceTurn): {
  assistant: string;
  openQuestions: string[];
} {
  if (turn.structuredJson) {
    try {
      const parsed = legalChatResponseSchema.safeParse(JSON.parse(turn.structuredJson));
      if (parsed.success) {
        return {
          assistant: bounded(
            redactLegalQuerySensitiveData(parsed.data.summary),
            SUMMARY_ASSISTANT_CHARACTER_LIMIT,
          ),
          openQuestions: parsed.data.clarificationQuestions.slice(0, 2).map((question) => bounded(
            redactLegalQuerySensitiveData(question),
            SUMMARY_QUESTION_CHARACTER_LIMIT,
          )).filter(Boolean),
        };
      }
    } catch {
      // Older or malformed structured payloads fall back to bounded visible
      // text. They must not make an otherwise usable conversation unreadable.
    }
  }
  return {
    assistant: bounded(
      redactLegalQuerySensitiveData(turn.answer),
      SUMMARY_ASSISTANT_CHARACTER_LIMIT,
    ),
    openQuestions: [],
  };
}

function compactTurn(turn: ConversationContextSourceTurn): ConversationContextSummaryTurn {
  const parsed = parseStoredSummary(turn);
  return {
    user: bounded(
      redactLegalQuerySensitiveData(turn.question),
      SUMMARY_USER_CHARACTER_LIMIT,
    ),
    assistant: parsed.assistant,
    openQuestions: parsed.openQuestions,
  };
}

function serializedProviderCharacters(input: {
  conversationHistory: Array<{ user: string; assistant: string }>;
  conversationSummary: ConversationContextSummary | null;
}): number {
  return JSON.stringify({
    conversationHistory: input.conversationHistory,
    ...(input.conversationSummary ? { conversationSummary: input.conversationSummary } : {}),
  }).length;
}

/**
 * Keeps the latest branch-local turns verbatim within strict field bounds and
 * converts older turns into deterministic, redacted records. No model call or
 * cross-request mutable state is used on the Worker request path.
 */
export function buildConversationContext(
  turns: readonly ConversationContextSourceTurn[],
): BoundedConversationContext {
  const source = turns.slice(-SOURCE_TURN_LIMIT);
  const recentSource = source.slice(-RECENT_TURN_LIMIT);
  const conversationHistory = recentSource.map((turn) => ({
    user: boundedRecent(turn.question),
    assistant: boundedRecent(turn.answer),
  }));
  const olderSource = source.slice(0, Math.max(0, source.length - recentSource.length));
  let compacted = olderSource.slice(-SUMMARY_TURN_LIMIT).map(compactTurn);
  const baselineHistory = legacyConversationHistory(source);
  const legacyProviderCharacters = serializedProviderCharacters({
    conversationHistory: baselineHistory,
    conversationSummary: null,
  });

  let conversationSummary: ConversationContextSummary | null = compacted.length > 0
    ? {
      includedTurns: compacted.length,
      omittedTurns: olderSource.length - compacted.length,
      turns: compacted,
    }
    : null;
  let providerCharacters = serializedProviderCharacters({ conversationHistory, conversationSummary });

  // Compact records are useful only when they are smaller than the exact
  // bounded payload they replace. Drop the oldest compact record first until
  // the provider payload is no larger than the previous contract.
  while (conversationSummary && providerCharacters > legacyProviderCharacters) {
    compacted = compacted.slice(1);
    conversationSummary = compacted.length > 0
      ? {
        includedTurns: compacted.length,
        omittedTurns: olderSource.length - compacted.length,
        turns: compacted,
      }
      : null;
    providerCharacters = serializedProviderCharacters({ conversationHistory, conversationSummary });
  }

  const summarizedTurns = conversationSummary?.includedTurns ?? 0;
  const omittedTurns = Math.max(0, source.length - conversationHistory.length - summarizedTurns);
  const providerCharacterReductionBps = legacyProviderCharacters > 0
    ? Math.max(0, Math.floor(
      (legacyProviderCharacters - providerCharacters) * 10_000 / legacyProviderCharacters,
    ))
    : 0;

  return {
    conversationHistory,
    conversationSummary: conversationSummary
      ? { ...conversationSummary, omittedTurns }
      : null,
    metrics: {
      sourceTurns: source.length,
      recentTurns: conversationHistory.length,
      summarizedTurns,
      omittedTurns,
      legacyProviderCharacters,
      providerCharacters,
      providerCharacterReductionBps,
    },
  };
}
