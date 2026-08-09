import { parseJsonRequest } from "../../../../lib/auth/input";
import {
  createDemoPaymentRun,
  listDemoPaymentRuns,
  transitionDemoPaymentRun,
} from "../../../../lib/billing/demo-payments";
import { paymentDemoStatus } from "../../../../lib/billing/foundation";
import { demoPaymentInputSchema } from "../../../../lib/billing/input";
import {
  assertSafeWrite,
  requireApiUser,
  withApiErrors,
} from "../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import type { UserProfile } from "../../../../lib/document-builder/types";
import { workspaceForUser, workspaceForUserById } from "../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

async function actorFor(user: UserProfile, workspaceId?: string) {
  const workspace = workspaceId
    ? await workspaceForUserById(user.id, workspaceId)
    : await workspaceForUser(user);
  return workspace ? { userId: user.id, workspaceId: workspace.id } : null;
}

export const GET = withApiErrors(async function GET(request: Request) {
  const user = await requireApiUser();
  const workspaceId = new URL(request.url).searchParams.get("workspaceId") ?? undefined;
  if (workspaceId && !/^[A-Za-z0-9_-]{3,128}$/.test(workspaceId)) {
    return response({ code: "INVALID_INPUT" }, 400);
  }
  const actor = await actorFor(user, workspaceId);
  if (!actor) return response({ code: "DEMO_PAYMENT_UNAVAILABLE" }, 404);
  const availability = paymentDemoStatus(runtimeEnv());
  return response({
    availability,
    runs: availability.enabled ? await listDemoPaymentRuns(requireD1(), actor) : [],
  });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const parsed = await parseJsonRequest(request, demoPaymentInputSchema, 2_048);
  if (!parsed.ok) return response({ code: "INVALID_INPUT", detail: parsed.error }, parsed.error === "payload_too_large" ? 413 : 400);
  const availability = paymentDemoStatus(runtimeEnv());
  if (!availability.enabled) return response({ code: "DEMO_PAYMENT_DISABLED" }, 503);
  const actor = await actorFor(user, parsed.data.workspaceId);
  if (!actor) return response({ code: "DEMO_PAYMENT_UNAVAILABLE" }, 404);
  try {
    const run = parsed.data.action === "create"
      ? await createDemoPaymentRun(requireD1(), actor, parsed.data)
      : await transitionDemoPaymentRun(requireD1(), actor, {
        requestId: parsed.data.requestId,
        runId: parsed.data.runId,
        action: parsed.data.outcome,
      });
    return response({ availability, run }, parsed.data.action === "create" ? 201 : 200);
  } catch (error) {
    const code = error instanceof Error ? error.message : "DEMO_PAYMENT_FAILED";
    if (code === "DEMO_PAYMENT_UNAVAILABLE") return response({ code }, 404);
    if (code === "DEMO_PAYMENT_STATE_CONFLICT") return response({ code }, 409);
    throw error;
  }
});
