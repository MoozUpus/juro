import { parseJsonRequest } from "../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  platformAuditRequestSchema,
  platformAuditRowsCsv,
  PlatformAuditError,
  queryPlatformAuditLog,
} from "../../../../../lib/operations/platform-audit-log";

const privateHeaders = { "cache-control": "private, no-store", pragma: "no-cache" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}

async function postAuditLog(request: Request): Promise<Response> {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "staff.security.audit", {
    freshMfaWithinMs: 15 * 60 * 1_000,
  });
  const parsed = await parseJsonRequest(request, platformAuditRequestSchema, 8_192);
  if (!parsed.ok) {
    return json({
      code: parsed.error === "payload_too_large" ? "PAYLOAD_TOO_LARGE" : "PLATFORM_AUDIT_INVALID",
    }, parsed.error === "payload_too_large" ? 413 : 400);
  }
  try {
    const result = await queryPlatformAuditLog({
      db: requireD1(),
      staff,
      value: parsed.data,
    });
    if (parsed.data.action === "export") {
      return new Response(platformAuditRowsCsv(result.rows), {
        headers: {
          ...privateHeaders,
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="juro-audit-log.csv"',
          "x-content-type-options": "nosniff",
          "x-juro-audit-event": result.accessEventId,
        },
      });
    }
    return json(result);
  } catch (error) {
    if (!(error instanceof PlatformAuditError)) throw error;
    if (error.code === "PLATFORM_AUDIT_INVALID") return json({ code: error.code }, 400);
    return json({ code: error.code }, 409);
  }
}

export const POST = withPlatformStaffErrors(postAuditLog);
