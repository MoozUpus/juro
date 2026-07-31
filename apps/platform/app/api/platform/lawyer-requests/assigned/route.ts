import { requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const db = requireD1();
  const requests = await db.prepare(
    `SELECT r.id,r.status,r.anonymized_summary AS anonymizedSummary,r.created_at AS createdAt,
      c.status AS conflictStatus,g.id AS accessGrantId,g.created_at AS accessGrantedAt,
      CASE WHEN g.id IS NOT NULL THEN cs.id END AS caseId,
      CASE WHEN g.id IS NOT NULL THEN cs.title END AS caseTitle,
      CASE WHEN g.id IS NOT NULL THEN cs.description END AS caseDescription,
      CASE WHEN g.id IS NOT NULL THEN cs.legal_area END AS legalArea,
      CASE WHEN g.id IS NOT NULL THEN cs.status END AS caseStatus
     FROM lawyer_requests r
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id AND p.user_id=? AND p.status='public_approved'
     JOIN conflict_checks c ON c.lawyer_request_id=r.id AND c.lawyer_profile_id=p.id
     LEFT JOIN lawyer_access_grants g ON g.lawyer_request_id=r.id AND g.lawyer_user_id=? AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?)
     LEFT JOIN cases cs ON cs.id=g.case_id
     ORDER BY r.updated_at DESC LIMIT 100`,
  ).bind(user.id, user.id, new Date().toISOString()).all();
  return response({ requests: requests.results });
});
