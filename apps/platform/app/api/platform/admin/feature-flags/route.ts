import { parseJsonRequest } from "../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest } from "../../../../../lib/auth/staff-http";
import { requireD1, runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";
import {
  operationalEnvironment,
  OperationalFeatureError,
  readOperationalFeatureDashboard,
  setOperationalFeature,
  setOperationalFeatureSchema,
} from "../../../../../lib/operations/operational-feature-flags";

const privateHeaders = { "cache-control": "private, no-store", pragma: "no-cache" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}

export async function GET(request: Request): Promise<Response> {
  await requirePlatformStaffRequest(request, "staff.operations.manage", { freshMfaWithinMs: 15 * 60 * 1_000 });
  return json(await readOperationalFeatureDashboard({
    db: requireD1(),
    environment: operationalEnvironment(runtimeEnv().APP_ENV),
  }));
}

export async function POST(request: Request): Promise<Response> {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "staff.operations.manage", { freshMfaWithinMs: 15 * 60 * 1_000 });
  const parsed = await parseJsonRequest(request, setOperationalFeatureSchema, 4_096);
  if (!parsed.ok) {
    return json({ code: parsed.error === "payload_too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT" }, parsed.error === "payload_too_large" ? 413 : 400);
  }
  try {
    return json(await setOperationalFeature({
      db: requireD1(),
      environment: operationalEnvironment(runtimeEnv().APP_ENV),
      actorUserId: staff.userId,
      value: parsed.data,
    }), 201);
  } catch (error) {
    if (!(error instanceof OperationalFeatureError)) throw error;
    if (error.code === "OPERATIONAL_FEATURE_INVALID") return json({ code: error.code }, 400);
    return json({ code: error.code }, 409);
  }
}
