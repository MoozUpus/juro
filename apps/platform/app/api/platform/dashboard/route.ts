import { requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../lib/platform/workspace";

function response(body: unknown) {
  return Response.json(body, { headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const db = requireD1();
  const workspace = await workspaceForUser(user);
  const [counts, cases, documents, deadlines, consultations, notifications, analyses, comparisons] = await db.batch([
    db.prepare(
      `SELECT
        (SELECT count(*) FROM cases WHERE workspace_id = ? AND archived_at IS NULL) AS activeCases,
        (SELECT count(*) FROM documents WHERE workspace_id = ? AND archived_at IS NULL) AS documents,
        (SELECT count(*) FROM consultation_bookings WHERE workspace_id = ? AND status NOT IN ('completed','cancelled')) AS consultations,
        (SELECT count(*) FROM notifications WHERE user_id = ? AND workspace_id = ? AND read_at IS NULL) AS unreadNotifications`,
    ).bind(workspace.id, workspace.id, workspace.id, user.id, workspace.id),
    db.prepare(
      `SELECT c.id,c.title,c.status,c.updated_at AS updatedAt,p.progress_percent AS progressPercent
       FROM cases c LEFT JOIN action_plans p ON p.case_id=c.id
       WHERE c.workspace_id=? AND c.archived_at IS NULL ORDER BY c.updated_at DESC LIMIT 4`,
    ).bind(workspace.id),
    db.prepare(
      `SELECT id,title,status,category,updated_at AS updatedAt
       FROM documents WHERE workspace_id=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 4`,
    ).bind(workspace.id),
    db.prepare(
      `SELECT s.id,s.title,s.due_at AS dueAt,c.id AS caseId,c.title AS caseTitle
       FROM action_plan_steps s
       JOIN action_plans p ON p.id=s.plan_id JOIN cases c ON c.id=p.case_id
       WHERE c.workspace_id=? AND c.archived_at IS NULL AND s.due_at IS NOT NULL
         AND s.status NOT IN ('completed','cancelled')
       ORDER BY s.due_at LIMIT 5`,
    ).bind(workspace.id),
    db.prepare(
      `SELECT b.id,b.status,s.starts_at AS startsAt,s.specialist_type AS specialistType
       FROM consultation_bookings b JOIN consultation_slots s ON s.id=b.slot_id
       WHERE b.workspace_id=? ORDER BY s.starts_at DESC LIMIT 3`,
    ).bind(workspace.id),
    db.prepare(
      `SELECT id,title,body,created_at AS createdAt FROM notifications
       WHERE user_id=? AND workspace_id=? ORDER BY created_at DESC LIMIT 4`,
    ).bind(user.id, workspace.id),
    db.prepare(
      `SELECT a.id,a.status,a.error_code AS errorCode,a.updated_at AS updatedAt,f.file_name AS fileName
       FROM document_analyses a JOIN document_files f ON f.id=a.uploaded_file_id
       WHERE a.workspace_id=? AND a.owner_user_id=? AND a.status!='completed'
       ORDER BY a.updated_at DESC LIMIT 4`,
    ).bind(workspace.id, user.id),
    db.prepare(
      `SELECT c.id,c.status,c.stage,c.error_code AS errorCode,c.updated_at AS updatedAt,
        one.file_name AS versionOneName,two.file_name AS versionTwoName
       FROM document_comparisons c
       JOIN document_files one ON one.id=c.version_one_file_id
       JOIN document_files two ON two.id=c.version_two_file_id
       WHERE c.workspace_id=? AND c.owner_user_id=? AND c.deleted_at IS NULL
         AND c.status NOT IN ('completed','completed_partial')
       ORDER BY c.updated_at DESC LIMIT 4`,
    ).bind(workspace.id, user.id),
  ]);
  return response({
    serverNow: new Date().toISOString(),
    counts: counts.results[0] ?? { activeCases: 0, documents: 0, consultations: 0, unreadNotifications: 0 },
    cases: cases.results,
    documents: documents.results,
    deadlines: deadlines.results,
    consultations: consultations.results,
    notifications: notifications.results,
    analyses: analyses.results,
    comparisons: comparisons.results,
  });
});
