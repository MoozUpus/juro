import { requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { parseJson } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

export const GET = withApiErrors(async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const user = await requireApiUser();
  const { caseId } = await params;
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const owned = await db.prepare(
    "SELECT id FROM cases WHERE id=? AND workspace_id=? AND archived_at IS NULL LIMIT 1",
  ).bind(caseId, workspace.id).first<{ id: string }>();
  if (!owned) return response({ error: "Дело недоступно.", code: "CASE_UNAVAILABLE" }, 404);

  const [documents, events, conversations, analyses, comparisons, sources, participants, lawyerRequests] = await db.batch([
    db.prepare(
      "SELECT id,title,status,language,plan_step_id AS planStepId,updated_at AS updatedAt FROM documents WHERE workspace_id=? AND case_id=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 20",
    ).bind(workspace.id, caseId),
    db.prepare(
      "SELECT event_type AS eventType,metadata_json AS metadataJson,created_at AS createdAt FROM case_events WHERE case_id=? ORDER BY created_at DESC LIMIT 50",
    ).bind(caseId),
    db.prepare(
      `SELECT id,title,status,locale,updated_at AS updatedAt
       FROM conversations
       WHERE workspace_id=? AND owner_user_id=? AND case_id=?
       ORDER BY updated_at DESC LIMIT 40`,
    ).bind(workspace.id, user.id, caseId),
    db.prepare(
      `SELECT a.id,a.status,a.error_code AS errorCode,a.updated_at AS updatedAt,
        f.file_name AS fileName,f.mime_type AS mimeType
       FROM document_analyses a
       JOIN document_files f ON f.id=a.uploaded_file_id
       WHERE a.workspace_id=? AND a.owner_user_id=? AND a.case_id=?
         AND f.workspace_id=? AND f.owner_user_id=? AND f.archived_at IS NULL
       ORDER BY a.updated_at DESC LIMIT 40`,
    ).bind(workspace.id, user.id, caseId, workspace.id, user.id),
    db.prepare(
      `SELECT id,status,stage,overall_risk AS overallRisk,error_code AS errorCode,updated_at AS updatedAt
       FROM document_comparisons
       WHERE workspace_id=? AND owner_user_id=? AND case_id=? AND deleted_at IS NULL
       ORDER BY updated_at DESC LIMIT 40`,
    ).bind(workspace.id, user.id, caseId),
    db.prepare(
      `SELECT DISTINCT s.id,s.act_title AS actTitle,s.act_identifier AS actIdentifier,
        s.official_url AS officialUrl,s.status,s.locale,s.last_checked_at AS lastCheckedAt
       FROM conversation_sources cs
       JOIN conversations c ON c.id=cs.conversation_id
       JOIN legal_sources s ON s.id=cs.source_id
       WHERE c.workspace_id=? AND c.owner_user_id=? AND c.case_id=?
       ORDER BY s.act_title,s.id LIMIT 100`,
    ).bind(workspace.id, user.id, caseId),
    db.prepare(
      `SELECT m.user_id AS userId,m.role,m.status,m.joined_at AS joinedAt,
        COALESCE(NULLIF(TRIM(p.full_name),''), CASE WHEN m.user_id=? THEN 'You' ELSE 'Workspace member' END) AS displayName
       FROM workspace_members m
       JOIN user_profiles p ON p.id=m.user_id
       WHERE m.workspace_id=? AND m.status='active'
       ORDER BY CASE WHEN m.role='owner' THEN 0 ELSE 1 END,m.joined_at,m.user_id`,
    ).bind(user.id, workspace.id),
    db.prepare(
      `SELECT r.id,r.status,r.updated_at AS updatedAt,p.display_name AS lawyerName,
        g.id AS activeGrantId,g.created_at AS grantedAt,g.expires_at AS expiresAt
       FROM lawyer_requests r
       LEFT JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id
       LEFT JOIN lawyer_access_grants g ON g.lawyer_request_id=r.id AND g.revoked_at IS NULL
       WHERE r.workspace_id=? AND r.requester_user_id=? AND r.case_id=?
       ORDER BY r.updated_at DESC LIMIT 40`,
    ).bind(workspace.id, user.id, caseId),
  ]);
  return response({
    documents: documents.results,
    activity: events.results.map((event) => ({
      eventType: String((event as { eventType?: unknown }).eventType || "case_updated"),
      createdAt: String((event as { createdAt?: unknown }).createdAt || ""),
      metadata: parseJson(String((event as { metadataJson?: unknown }).metadataJson || "{}"), {}),
    })),
    conversations: conversations.results,
    comparisons: comparisons.results,
    analyses: analyses.results,
    sources: sources.results,
    participants: participants.results.map((participant) => {
      const row = participant as Record<string, unknown>;
      return { ...row, currentUser: row.userId === user.id };
    }),
    lawyerRequests: lawyerRequests.results,
  });
});
