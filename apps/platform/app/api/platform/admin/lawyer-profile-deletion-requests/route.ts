import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";

async function getDeletionRequests(request: Request) {
  await requirePlatformStaffRequest(request, "lawyer.profiles.moderate", { freshMfaWithinMs: 15 * 60 * 1_000 });
  const url = new URL(request.url);
  const status = url.searchParams.get("status") === "approved" || url.searchParams.get("status") === "rejected"
    ? url.searchParams.get("status")
    : "requested";
  const rows = await requireD1().prepare(
    `SELECT d.id,d.lawyer_profile_id AS lawyerProfileId,d.status,d.reason,
      d.decision_reason AS decisionReason,d.requested_at AS requestedAt,d.reviewed_at AS reviewedAt,
      p.display_name AS displayName,p.marketplace_status AS marketplaceStatus,u.email
     FROM lawyer_profile_deletion_requests d
     JOIN lawyer_profiles p ON p.id=d.lawyer_profile_id
     JOIN user_profiles u ON u.id=d.requested_by_user_id
     WHERE d.status=? ORDER BY d.requested_at ASC,d.id ASC LIMIT 100`,
  ).bind(status).all();
  return Response.json({ requests: rows.results }, { headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const GET = withPlatformStaffErrors(getDeletionRequests);
