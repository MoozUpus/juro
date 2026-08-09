import { parseJsonRequest } from "../../../../../lib/auth/input";
import { z } from "zod";
import { assertSafeWrite } from "../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../lib/auth/staff-http";
import {
  aiModelPriceMutationSchema,
  createAiModelPriceVersion,
  ProviderUsageError,
  readAiCostDashboard,
} from "../../../../../lib/ai/provider-usage";
import {
  costGuardPolicyMutationSchema,
  createCostGuardPolicyVersion,
  ProviderCostControlError,
  providerCircuitMutationSchema,
  setProviderCircuitState,
} from "../../../../../lib/ai/provider-cost-control";
import { requireD1, runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";

const privateHeaders = { "cache-control": "private, no-store", pragma: "no-cache" };
const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("price"), value: aiModelPriceMutationSchema }).strict(),
  z.object({ action: z.literal("policy"), value: costGuardPolicyMutationSchema }).strict(),
  z.object({ action: z.literal("circuit"), value: providerCircuitMutationSchema }).strict(),
]);

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}

function environment(): "development" | "staging" | "production" {
  const value = runtimeEnv().APP_ENV;
  if (value === "development" || value === "staging" || value === "production") return value;
  throw new Error("APP_ENV_INVALID");
}

async function getCosts(request: Request): Promise<Response> {
  await requirePlatformStaffRequest(request, "staff.operations.manage", { freshMfaWithinMs: 15 * 60 * 1000 });
  return json(await readAiCostDashboard({ db: requireD1(), environment: environment() }));
}

async function postCosts(request: Request): Promise<Response> {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "staff.operations.manage", { freshMfaWithinMs: 15 * 60 * 1000 });
  const parsed = await parseJsonRequest(request, mutationSchema, 16 * 1024);
  if (!parsed.ok) {
    return json({ code: parsed.error === "payload_too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT" }, parsed.error === "payload_too_large" ? 413 : 400);
  }
  try {
    if (parsed.data.action === "price") {
      const created = await createAiModelPriceVersion({
        db: requireD1(),
        actorUserId: staff.userId,
        value: parsed.data.value,
      });
      return json(created, 201);
    }
    if (parsed.data.action === "policy") {
      const created = await createCostGuardPolicyVersion({
        db: requireD1(),
        environment: environment(),
        actorUserId: staff.userId,
        value: parsed.data.value,
      });
      return json(created, 201);
    }
    const changed = await setProviderCircuitState({
      db: requireD1(),
      environment: environment(),
      provider: parsed.data.value.provider,
      state: parsed.data.value.state,
      actorUserId: staff.userId,
    });
    return json(changed);
  } catch (error) {
    if (error instanceof ProviderUsageError) {
      return json({ code: error.code }, error.code === "PROVIDER_USAGE_INVALID" ? 400 : 409);
    }
    if (error instanceof ProviderCostControlError) {
      return json(
        { code: error.code },
        error.code === "PROVIDER_COST_CONTROL_INVALID" ? 400 : 409,
      );
    }
    throw error;
  }
}

export const GET = withPlatformStaffErrors(getCosts);
export const POST = withPlatformStaffErrors(postCosts);
