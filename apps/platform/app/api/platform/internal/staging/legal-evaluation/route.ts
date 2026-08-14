import {
  readStagingLegalEvaluation,
  reviewStagingLegalEvaluation,
  runStagingLegalEvaluationScenario,
  stagingLegalEvaluationEnabled,
  stagingLegalEvaluationRequestSchema,
  StagingLegalEvaluationError,
} from "../../../../../../lib/ai/staging-legal-evaluation";
import { runtimeEnv } from "../../../../../../lib/document-builder/storage/runtime";

function noStore(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      pragma: "no-cache",
      "referrer-policy": "no-referrer",
    },
  });
}

async function fixedTimeMatch(provided: string | null, expected: string | undefined): Promise<boolean> {
  if (!provided?.startsWith("Bearer ") || !expected) return false;
  const token = provided.slice("Bearer ".length);
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(token)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(leftDigest);
  const right = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

async function boundedJson(request: Request): Promise<unknown | null> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 16_384) return null;
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 16_384) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const env = runtimeEnv();
  if (!stagingLegalEvaluationEnabled(env)) return noStore({ code: "NOT_FOUND" }, 404);
  if (!env.STAGING_LEGAL_EVALUATION_TOKEN) {
    return noStore({ code: "LEGAL_EVALUATION_AUTH_UNAVAILABLE" }, 503);
  }
  if (!await fixedTimeMatch(request.headers.get("authorization"), env.STAGING_LEGAL_EVALUATION_TOKEN)) {
    return noStore({ code: "ACCESS_DENIED" }, 403);
  }
  const parsed = stagingLegalEvaluationRequestSchema.safeParse(await boundedJson(request));
  if (!parsed.success) return noStore({ code: "INVALID_INPUT" }, 400);
  try {
    if (parsed.data.action === "run") {
      return noStore(await runStagingLegalEvaluationScenario(parsed.data));
    }
    if (parsed.data.action === "review") {
      return noStore(await reviewStagingLegalEvaluation(parsed.data));
    }
    return noStore(await readStagingLegalEvaluation(parsed.data));
  } catch (error) {
    if (error instanceof StagingLegalEvaluationError) {
      return noStore({ code: error.code }, error.status);
    }
    console.error(JSON.stringify({
      event: "staging.legal_evaluation_request_failed",
      action: parsed.data.action,
      safeCode: "LEGAL_EVALUATION_INTERNAL_FAILED",
    }));
    return noStore({ code: "LEGAL_EVALUATION_INTERNAL_FAILED" }, 500);
  }
}
