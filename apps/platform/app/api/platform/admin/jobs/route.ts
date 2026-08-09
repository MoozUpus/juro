import { parseJsonRequest } from "../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../lib/auth/staff-http";
import { requireD1, runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";
import {
  operationalEnvironment,
} from "../../../../../lib/operations/operational-feature-flags";
import {
  OperationalJobError,
  operationalJobFiltersSchema,
  readOperationalJobsDashboard,
  requestJobRedriveSchema,
  requestOperationalJobRedrive,
} from "../../../../../lib/operations/job-operations";

const privateHeaders = { "cache-control": "private, no-store", pragma: "no-cache" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}

async function getJobs(request: Request): Promise<Response> {
  await requirePlatformStaffRequest(request, "staff.operations.manage", { freshMfaWithinMs: 15 * 60 * 1_000 });
  const url = new URL(request.url);
  const filters = operationalJobFiltersSchema.safeParse({
    status: url.searchParams.get("status") || undefined,
    kind: url.searchParams.get("kind") || undefined,
  });
  if (!filters.success) return json({ code: "OPERATIONAL_JOB_INVALID" }, 400);
  return json(await readOperationalJobsDashboard({
    db: requireD1(),
    environment: operationalEnvironment(runtimeEnv().APP_ENV),
    filters: filters.data,
  }));
}

async function postJobs(request: Request): Promise<Response> {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "staff.operations.manage", { freshMfaWithinMs: 15 * 60 * 1_000 });
  const parsed = await parseJsonRequest(request, requestJobRedriveSchema, 4_096);
  if (!parsed.ok) {
    return json({ code: parsed.error === "payload_too_large" ? "PAYLOAD_TOO_LARGE" : "OPERATIONAL_JOB_INVALID" }, parsed.error === "payload_too_large" ? 413 : 400);
  }
  try {
    return json(await requestOperationalJobRedrive({
      db: requireD1(),
      environment: operationalEnvironment(runtimeEnv().APP_ENV),
      actorUserId: staff.userId,
      value: parsed.data,
    }), 201);
  } catch (error) {
    if (!(error instanceof OperationalJobError)) throw error;
    if (error.code === "OPERATIONAL_JOB_INVALID") return json({ code: error.code }, 400);
    if (error.code === "OPERATIONAL_JOB_NOT_FOUND") return json({ code: error.code }, 404);
    return json({ code: error.code }, 409);
  }
}

export const GET = withPlatformStaffErrors(getJobs);
export const POST = withPlatformStaffErrors(postJobs);
