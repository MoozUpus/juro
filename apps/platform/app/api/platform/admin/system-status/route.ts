import { z } from "zod";
import { parseJsonRequest } from "../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  appendStatusIncidentUpdate,
  appendStatusUpdateSchema,
  createStatusIncident,
  createStatusIncidentSchema,
  readStatusIncidentAdminDashboard,
  SystemStatusError,
} from "../../../../../lib/operations/system-status";

const privateHeaders = { "cache-control": "private, no-store", pragma: "no-cache" };
const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), value: createStatusIncidentSchema }).strict(),
  z.object({ action: z.literal("update"), value: appendStatusUpdateSchema }).strict(),
]);

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}

async function getSystemStatus(request: Request): Promise<Response> {
  await requirePlatformStaffRequest(request, "staff.operations.manage", { freshMfaWithinMs: 15 * 60 * 1_000 });
  return json(await readStatusIncidentAdminDashboard(requireD1()));
}

async function postSystemStatus(request: Request): Promise<Response> {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "staff.operations.manage", { freshMfaWithinMs: 15 * 60 * 1_000 });
  const parsed = await parseJsonRequest(request, mutationSchema, 32 * 1024);
  if (!parsed.ok) {
    return json({ code: parsed.error === "payload_too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT" }, parsed.error === "payload_too_large" ? 413 : 400);
  }
  try {
    if (parsed.data.action === "create") {
      return json(await createStatusIncident({
        db: requireD1(),
        actorUserId: staff.userId,
        value: parsed.data.value,
      }), 201);
    }
    return json(await appendStatusIncidentUpdate({
      db: requireD1(),
      actorUserId: staff.userId,
      value: parsed.data.value,
    }));
  } catch (error) {
    if (!(error instanceof SystemStatusError)) throw error;
    if (error.code === "SYSTEM_STATUS_INCIDENT_NOT_FOUND") return json({ code: error.code }, 404);
    if (error.code === "SYSTEM_STATUS_INVALID") return json({ code: error.code }, 400);
    return json({ code: error.code }, 409);
  }
}

export const GET = withPlatformStaffErrors(getSystemStatus);
export const POST = withPlatformStaffErrors(postSystemStatus);
