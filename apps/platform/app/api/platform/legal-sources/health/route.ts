import { localSessionForRequest } from "../../../../../lib/auth/mfa-http";
import { requirePlatformStaffAccess } from "../../../../../lib/auth/staff-access";
import { runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";
import { legalSourceHealth } from "../../../../../lib/legal/source-health";

export async function GET(request: Request): Promise<Response> {
  const headers = { "cache-control": "private, no-store", pragma: "no-cache" };
  const runtime = runtimeEnv();
  if (runtime.LEGAL_SOURCE_STAFF_API_ENABLED !== "true" || !runtime.DB) {
    return Response.json({ code: "NOT_AVAILABLE" }, { status: 404, headers });
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if ((fetchSite !== null && fetchSite !== "same-origin") || request.headers.get("x-juro-csrf") !== "1") {
    return Response.json({ code: "REQUEST_REJECTED" }, { status: 403, headers });
  }
  try {
    const now = new Date();
    const session = await localSessionForRequest(request, { now });
    await requirePlatformStaffAccess(runtime.DB, session, "legal.sources.review", {
      now,
      freshMfaWithinMs: 15 * 60 * 1_000,
    });
    return Response.json({ ok: true, ...(await legalSourceHealth(runtime.DB, now)) }, { headers });
  } catch {
    return Response.json({ code: "ACCESS_DENIED" }, { status: 403, headers });
  }
}
