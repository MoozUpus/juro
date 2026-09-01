export type AiCompletionQualityEvent = "retrieval_fallback" | "source_not_found";

export function completedAiQualityEvents(input: {
  queryUnderstandingFallback: boolean;
  secondaryRetrievalFallbackUsed: boolean;
  rerankingOutcome: string | null;
  responseKind: "answer" | "clarification_required";
  sourceCount: number;
}): AiCompletionQualityEvent[] {
  const events: AiCompletionQualityEvent[] = [];
  if (
    input.queryUnderstandingFallback
    || input.secondaryRetrievalFallbackUsed
    || input.rerankingOutcome === "deterministic_fallback"
  ) {
    events.push("retrieval_fallback");
  }
  if (input.responseKind === "clarification_required" && input.sourceCount === 0) {
    events.push("source_not_found");
  }
  return events;
}
