import { z } from "zod";

import { parseJsonRequest } from "../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../lib/auth/staff-http";
import { requireD1, runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";
import {
  AiRuntimeSettingsError,
  aiRuntimeConfigInputSchema,
  createAiRuntimeSettingsVersion,
  listAiRuntimeSettingsHistory,
} from "../../../../../lib/ai/runtime-settings";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("query") }).strict(),
  aiRuntimeConfigInputSchema.extend({ action: z.literal("update") }).strict(),
]);
const privateHeaders = { "cache-control": "private, no-store", pragma: "no-cache" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}

async function postAiSettings(request: Request): Promise<Response> {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "ai.settings.manage", {
    freshMfaWithinMs: 15 * 60 * 1_000,
  });
  const parsed = await parseJsonRequest(request, requestSchema, 16 * 1024);
  if (!parsed.ok) return json({ code: parsed.error === "payload_too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT" }, parsed.error === "payload_too_large" ? 413 : 400);
  const db = requireD1();
  try {
    if (parsed.data.action === "query") {
      return json(await listAiRuntimeSettingsHistory({ db, env: runtimeEnv() }));
    }
    const current = await createAiRuntimeSettingsVersion({
      db,
      env: runtimeEnv(),
      staff,
      settings: parsed.data,
    });
    return json({ current }, 201);
  } catch (error) {
    if (error instanceof AiRuntimeSettingsError) return json({ code: error.code }, error.status);
    throw error;
  }
}

export const POST = withPlatformStaffErrors(postAiSettings);
