import { z } from "zod";

import {
  acceptsPrivateServiceRequest,
  declaredRequestBodyWithinLimit,
  privateServiceJson,
} from "./private-service-boundary";
import {
  createRuntimeTargetActivationSetEvaluation,
  createRuntimeTargetCandidateEvaluationRetriever,
  type TargetRetrievalRuntimeEnv,
} from "./target-runtime";

export const TARGET_CANDIDATE_EVALUATION_PATH =
  "/internal/legal-corpus/target/evaluation/answer";
export const TARGET_ACTIVATION_SET_EVALUATION_PATH =
  "/internal/legal-corpus/target/evaluation/activation-set/answer";

const SERVICE_BINDING_MARKER = "target-candidate-evaluation-v1";
const ACTIVATION_SET_SERVICE_BINDING_MARKER = "target-activation-set-evaluation-v1";
const MAXIMUM_REQUEST_BYTES = 8_192;
const requestSchema = z.object({
  qualificationId: z.string().trim().min(1).max(200)
    .regex(/^[A-Za-z0-9._:-]+$/u),
  question: z.object({
    id: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/u),
    question: z.string().trim().min(1).max(4_000),
  }).strict(),
}).strict();
const activationSetRequestSchema = z.object({
  activationSetId: z.string().trim().min(1).max(300)
    .regex(/^[A-Za-z0-9._:-]+$/u),
  historyReconciliationRunId: z.string().trim().min(1).max(300)
    .regex(/^[A-Za-z0-9._:-]+$/u),
  historyReportSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  question: z.object({
    id: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/u),
    question: z.string().trim().min(1).max(4_000),
  }).strict(),
}).strict();

export type TargetCandidateEvaluationRequest = z.input<typeof requestSchema>;
export type TargetActivationSetEvaluationRequest = z.input<typeof activationSetRequestSchema>;

export async function handleTargetActivationSetEvaluationRequest(
  request: Request,
  env: TargetRetrievalRuntimeEnv,
): Promise<Response> {
  if (env.APP_ENV !== "staging" || env.LEGAL_CORPUS_SHADOW_MODE !== "true"
    || env.LEGAL_AI_SEARCH_PAUSED !== "true"
    || !acceptsPrivateServiceRequest(request, {
      environment: "staging",
      marker: ACTIVATION_SET_SERVICE_BINDING_MARKER,
      method: "POST",
      path: TARGET_ACTIVATION_SET_EVALUATION_PATH,
      requireJson: true,
    })) return privateServiceJson({ code: "TARGET_ACTIVATION_SET_EVALUATION_REJECTED" }, 404);
  try {
    if (!declaredRequestBodyWithinLimit(request, MAXIMUM_REQUEST_BYTES)) {
      throw new TypeError("TARGET_ACTIVATION_SET_EVALUATION_REQUEST_TOO_LARGE");
    }
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > MAXIMUM_REQUEST_BYTES) {
      throw new TypeError("TARGET_ACTIVATION_SET_EVALUATION_REQUEST_TOO_LARGE");
    }
    const input = activationSetRequestSchema.parse(JSON.parse(bodyText) as unknown);
    const evaluation = await createRuntimeTargetActivationSetEvaluation({ env,
      activationSetId: input.activationSetId,
      historyReconciliationRunId: input.historyReconciliationRunId,
      historyReportSha256: input.historyReportSha256 });
    return privateServiceJson(await evaluation.answer(input.question));
  } catch {
    return privateServiceJson({ code: "TARGET_ACTIVATION_SET_EVALUATION_UNAVAILABLE" }, 503);
  }
}

export async function handleTargetCandidateEvaluationRequest(
  request: Request,
  env: TargetRetrievalRuntimeEnv,
): Promise<Response> {
  if (env.APP_ENV !== "staging" || env.LEGAL_CORPUS_SHADOW_MODE !== "true"
    || env.LEGAL_AI_SEARCH_PAUSED !== "true"
    || !acceptsPrivateServiceRequest(request, {
      environment: "staging",
      marker: SERVICE_BINDING_MARKER,
      method: "POST",
      path: TARGET_CANDIDATE_EVALUATION_PATH,
      requireJson: true,
    })) return privateServiceJson({ code: "TARGET_CANDIDATE_EVALUATION_REJECTED" }, 404);
  try {
    if (!declaredRequestBodyWithinLimit(request, MAXIMUM_REQUEST_BYTES)) {
      throw new TypeError("TARGET_CANDIDATE_EVALUATION_REQUEST_TOO_LARGE");
    }
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > MAXIMUM_REQUEST_BYTES) {
      throw new TypeError("TARGET_CANDIDATE_EVALUATION_REQUEST_TOO_LARGE");
    }
    const input = requestSchema.parse(JSON.parse(bodyText) as unknown);
    const retriever = await createRuntimeTargetCandidateEvaluationRetriever(
      env,
      input.qualificationId,
    );
    return privateServiceJson({ result: await retriever.answer(input.question) });
  } catch {
    return privateServiceJson({ code: "TARGET_CANDIDATE_EVALUATION_UNAVAILABLE" }, 503);
  }
}

export function createTargetCandidateEvaluationClient(input: {
  service: Fetcher;
  environment: "staging";
}) {
  return {
    async answer(untrustedInput: TargetCandidateEvaluationRequest): Promise<unknown> {
      const body = requestSchema.parse(untrustedInput);
      const response = await input.service.fetch(
        `http://legal-corpus.internal${TARGET_CANDIDATE_EVALUATION_PATH}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-juro-service-binding": SERVICE_BINDING_MARKER,
            "x-juro-legal-environment": input.environment,
          },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new TypeError("TARGET_CANDIDATE_EVALUATION_UNAVAILABLE");
      return z.object({ result: z.unknown() }).strict().parse(await response.json()).result;
    },
  };
}

export function createTargetActivationSetEvaluationClient(input: {
  service: Fetcher;
  environment: "staging";
}) {
  return {
    async answer(untrustedInput: TargetActivationSetEvaluationRequest): Promise<unknown> {
      const body = activationSetRequestSchema.parse(untrustedInput);
      const response = await input.service.fetch(
        `http://legal-corpus.internal${TARGET_ACTIVATION_SET_EVALUATION_PATH}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-juro-service-binding": ACTIVATION_SET_SERVICE_BINDING_MARKER,
            "x-juro-legal-environment": input.environment,
          },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new TypeError("TARGET_ACTIVATION_SET_EVALUATION_UNAVAILABLE");
      return z.object({ result: z.unknown(), observation: z.unknown() }).strict()
        .parse(await response.json());
    },
  };
}
