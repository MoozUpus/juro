import { z } from "zod";
import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../../lib/auth/safe-write";
import {
  requirePlatformStaffRequest,
  withPlatformStaffErrors,
} from "../../../../../../lib/auth/staff-http";
import { runtimeEnv } from "../../../../../../lib/document-builder/storage/runtime";
import { startScheduledCorpusSync } from "../../../../../../lib/legal/scheduled-corpus-sync";

const requestSchema = z.object({ requestId: z.uuid() }).strict();
const headers = { "cache-control": "private, no-store", pragma: "no-cache" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers });
}

async function runLexCorpus(request: Request): Promise<Response> {
  assertSafeWrite(request);
  await requirePlatformStaffRequest(request, "staff.operations.manage", {
    freshMfaWithinMs: 15 * 60 * 1_000,
  });
  const parsed = await parseJsonRequest(request, requestSchema, 4_096);
  if (!parsed.ok) {
    return json({ code: "LEGAL_MONITORING_INVALID_REQUEST" }, parsed.error === "payload_too_large" ? 413 : 400);
  }
  const env = runtimeEnv();
  if (env.LEGAL_LEX_INGESTION_ENABLED !== "true") {
    return json({ code: "LEGAL_MONITORING_DISABLED" }, 409);
  }
  if (!env.APP_ENV || !env.DB || !env.BUCKET) {
    return json({ code: "LEGAL_MONITORING_DEPENDENCY_UNAVAILABLE" }, 503);
  }
  const runId = `lscorpus_lex_manual_${parsed.data.requestId.replaceAll("-", "")}`;
  const summary = await startScheduledCorpusSync({
    APP_ENV: env.APP_ENV,
    DB: env.DB,
    BUCKET: env.BUCKET,
    // Advice ingestion stays off for scheduled monitoring. The field remains
    // explicit because this queue contract also protects legacy workers.
    LEGAL_ADVICE_INGESTION_ENABLED: "false",
    LEGAL_LEX_INGESTION_ENABLED: env.LEGAL_LEX_INGESTION_ENABLED,
    LEGAL_LEX_RSS_DISCOVERY_ENABLED: env.LEGAL_LEX_RSS_DISCOVERY_ENABLED,
  }, {
    runType: "manual_corpus",
    runId,
    // Lex robots.txt may require a bounded crawl window. This request only
    // creates idempotent source jobs; it never publishes legal text itself.
    discoveryWait: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  });
  return json({ ok: true, runId, summary }, summary.busy > 0 ? 200 : 202);
}

export const POST = withPlatformStaffErrors(runLexCorpus);
