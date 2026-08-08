import { localSessionForRequest } from "../../../../../lib/auth/mfa-http";
import { requirePlatformStaffAccess } from "../../../../../lib/auth/staff-access";
import { assertSafeWrite } from "../../../../../lib/auth/safe-write";
import { runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";
import {
  readDirectLegalSourceHealth,
  runDirectLegalSourceHealthCheck,
} from "../../../../../lib/legal/direct-source-health";
import { operationalEnvironment } from "../../../../../lib/operations/operational-feature-flags";

const headers = { "cache-control": "private, no-store", pragma: "no-cache" };

async function staff(request: Request, capability: "staff.console.view" | "staff.operations.manage") {
  const runtime = runtimeEnv();
  if (runtime.LEGAL_DIRECT_RETRIEVAL_ENABLED !== "true" || !runtime.DB) return null;
  const now = new Date();
  const session = await localSessionForRequest(request, { now });
  await requirePlatformStaffAccess(runtime.DB, session, capability, {
    now,
    freshMfaWithinMs: 15 * 60 * 1_000,
  });
  return { runtime, now };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const access = await staff(request, "staff.console.view");
    if (!access) return Response.json({ code: "NOT_AVAILABLE" }, { status: 404, headers });
    return Response.json({ ok: true, ...(await readDirectLegalSourceHealth(
      access.runtime.DB!,
      operationalEnvironment(access.runtime.APP_ENV),
      access.now,
    )) }, { headers });
  } catch {
    return Response.json({ code: "ACCESS_DENIED" }, { status: 403, headers });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSafeWrite(request);
    const access = await staff(request, "staff.operations.manage");
    if (!access) return Response.json({ code: "NOT_AVAILABLE" }, { status: 404, headers });
    return Response.json({ ok: true, ...(await runDirectLegalSourceHealthCheck({
      db: access.runtime.DB!,
      environment: operationalEnvironment(access.runtime.APP_ENV),
    })) }, { headers });
  } catch {
    return Response.json({ code: "ACCESS_DENIED" }, { status: 403, headers });
  }
}
