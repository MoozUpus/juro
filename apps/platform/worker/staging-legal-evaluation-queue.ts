import { z } from "zod";

import {
  reviewStagingLegalEvaluation,
  runStagingLegalEvaluationScenario,
  stagingLegalEvaluationEnabled,
  stagingLegalEvaluationReviewInputSchema,
  stagingLegalEvaluationRunInputSchema,
} from "../lib/ai/staging-legal-evaluation";
import type { BuilderRuntimeEnv } from "../lib/document-builder/storage/runtime";

export const STAGING_LEGAL_EVALUATION_QUEUE_NAME = "staging-legal-evaluation";

const stagingLegalEvaluationQueueMessageSchema = z.discriminatedUnion("action", [
  stagingLegalEvaluationRunInputSchema,
  stagingLegalEvaluationReviewInputSchema,
]);

type StagingLegalEvaluationQueueEnv = Pick<
  BuilderRuntimeEnv,
  "APP_ENV" | "STAGING_LEGAL_EVALUATION_ENABLED"
>;

export function isStagingLegalEvaluationQueue(
  queueName: string,
  env: Pick<StagingLegalEvaluationQueueEnv, "APP_ENV">,
): boolean {
  return env.APP_ENV === "staging"
    && queueName === STAGING_LEGAL_EVALUATION_QUEUE_NAME;
}

/**
 * Dedicated staging-only consumer for the canonical legal corpus. Run
 * messages carry scenario identifiers, never caller-provided prompts. Reviews
 * are explicitly attributed to OpenAI Codex and cannot enter the human/MFA
 * review ledger.
 *
 * Each submitted attempt is terminal and acknowledged. A retry must use the
 * next explicit attempt number, which keeps evidence deterministic and avoids
 * an at-least-once delivery silently creating a second provider invocation.
 */
export async function handleStagingLegalEvaluationQueueBatch(
  batch: MessageBatch<unknown>,
  env: StagingLegalEvaluationQueueEnv,
): Promise<void> {
  if (!isStagingLegalEvaluationQueue(batch.queue, env)) {
    throw new TypeError("STAGING_LEGAL_EVALUATION_QUEUE_MISMATCH");
  }
  if (!stagingLegalEvaluationEnabled(env)) {
    for (const message of batch.messages) message.ack();
    return;
  }

  for (const message of batch.messages) {
    const parsed = stagingLegalEvaluationQueueMessageSchema.safeParse(message.body);
    if (!parsed.success) {
      console.error(JSON.stringify({
        event: "staging.legal_evaluation.invalid_queue_message",
        environment: env.APP_ENV,
        queue: batch.queue,
        messageId: message.id,
      }));
      message.ack();
      continue;
    }

    try {
      const result = parsed.data.action === "run"
        ? await runStagingLegalEvaluationScenario(parsed.data)
        : await reviewStagingLegalEvaluation(parsed.data);
      console.log(JSON.stringify({
        event: `staging.legal_evaluation.${parsed.data.action}_completed`,
        environment: env.APP_ENV,
        queue: batch.queue,
        messageId: message.id,
        evaluationRunId: parsed.data.evaluationRunId,
        scenarioId: parsed.data.scenarioId,
        status: "status" in result ? result.status : "reviewed",
        replay: result.replay,
      }));
    } catch (error) {
      console.error(JSON.stringify({
        event: `staging.legal_evaluation.${parsed.data.action}_failed`,
        environment: env.APP_ENV,
        queue: batch.queue,
        messageId: message.id,
        evaluationRunId: parsed.data.evaluationRunId,
        scenarioId: parsed.data.scenarioId,
        errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      }));
    }
    message.ack();
  }
}
