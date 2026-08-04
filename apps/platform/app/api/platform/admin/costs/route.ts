import { parseJsonRequest } from "../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest } from "../../../../../lib/auth/staff-http";
import {
  aiModelPriceMutationSchema,
  createAiModelPriceVersion,
  ProviderUsageError,
  readAiCostDashboard,
} from "../../../../../lib/ai/provider-usage";
import { requireD1, runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";

const privateHeaders = { "cache-control": "private, no-store", pragma: "no-cache" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}

function environment(): "development" | "staging" | "production" {
  const value = runtimeEnv().APP_ENV;
  if (value === "development" || value === "staging" || value === "production") return value;
  throw new Error("APP_ENV_INVALID");
}

export async function GET(request: Request): Promise<Response> {
  await requirePlatformStaffRequest(request, "staff.operations.manage", { freshMfaWithinMs: 15 * 60 * 1000 });
  return json(await readAiCostDashboard({ db: requireD1(), environment: environment() }));
}

export async function POST(request: Request): Promise<Response> {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "staff.operations.manage", { freshMfaWithinMs: 15 * 60 * 1000 });
  const parsed = await parseJsonRequest(request, aiModelPriceMutationSchema, 16 * 1024);
  if (!parsed.ok) {
    return json({ code: parsed.error === "payload_too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT" }, parsed.error === "payload_too_large" ? 413 : 400);
  }
  try {
    const created = await createAiModelPriceVersion({ db: requireD1(), actorUserId: staff.userId, value: parsed.data });
    return json(created, 201);
  } catch (error) {
    if (error instanceof ProviderUsageError) {
      return json({ code: error.code }, error.code === "PROVIDER_USAGE_INVALID" ? 400 : 409);
    }
    throw error;
  }
}
