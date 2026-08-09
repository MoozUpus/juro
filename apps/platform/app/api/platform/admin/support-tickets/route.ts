import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";

async function getSupportTickets(request: Request) {
  await requirePlatformStaffRequest(request, "support.tickets.manage", { freshMfaWithinMs: 15 * 60 * 1000 });
  const tickets = await requireD1().prepare(
    "SELECT t.id,t.workspace_id AS workspaceId,t.category,t.severity,t.status,t.subject,t.created_at AS createdAt,t.updated_at AS updatedAt,t.closed_at AS closedAt FROM support_tickets t ORDER BY CASE t.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,t.updated_at ASC LIMIT 100",
  ).all();
  return Response.json({ tickets: tickets.results }, { headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const GET = withPlatformStaffErrors(getSupportTickets);
