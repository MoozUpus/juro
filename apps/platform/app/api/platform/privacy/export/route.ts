import { requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { userIdentityById } from "../../../../../lib/auth/identity-protection";
import { runtimeIdentityProtection } from "../../../../../lib/auth/identity-runtime";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const identity = await userIdentityById(
    db,
    runtimeIdentityProtection(),
    user.id,
  );
  const [profile, workspaceRow, memberships, cases, documents, consents, acceptances, consultations, audit] = await db.batch([
    db.prepare("SELECT id,full_name,locale,account_type,company_name,organization_role,primary_goal,timezone,created_at,updated_at FROM user_profiles WHERE id=?").bind(user.id),
    db.prepare("SELECT id,type,name,locale,created_at,updated_at FROM workspaces WHERE id=?").bind(workspace.id),
    db.prepare("SELECT user_id,role,status,joined_at,created_at,updated_at FROM workspace_members WHERE workspace_id=? AND user_id=?").bind(workspace.id, user.id),
    db.prepare("SELECT id,title,description,legal_area,status,next_deadline_at,created_at,updated_at FROM cases WHERE workspace_id=?").bind(workspace.id),
    db.prepare("SELECT id,title,category,status,language,archived_at,created_at,updated_at FROM documents WHERE workspace_id=? AND owner_user_id=?").bind(workspace.id, user.id),
    db.prepare("SELECT type,version,scope_json,granted_at,revoked_at FROM consents WHERE user_id=?").bind(user.id),
    db.prepare(
      `SELECT
         document_key,document_version,locale,content_sha256,
         acceptance_method,auth_source,accepted_at
       FROM user_acceptances
       WHERE user_id=?
       ORDER BY accepted_at`,
    ).bind(user.id),
    db.prepare("SELECT id,status,case_id,plan_step_id,created_at,updated_at FROM consultation_bookings WHERE workspace_id=? AND requester_user_id=?").bind(workspace.id, user.id),
    db.prepare("SELECT entity_type,entity_id,action,metadata_json,created_at FROM workspace_audit_events WHERE workspace_id=? AND actor_user_id=? ORDER BY created_at").bind(workspace.id, user.id),
  ]);
  const body = JSON.stringify({
    exportedAt: new Date().toISOString(),
    scope: "user-owned metadata and workspace activity visible to the requester",
    profile: profile.results[0] && identity
      ? { ...profile.results[0], email: identity.email, phone: identity.phone }
      : null,
    workspace: workspaceRow.results[0] ?? null,
    memberships: memberships.results,
    cases: cases.results,
    documents: documents.results,
    consents: consents.results,
    policyAcceptances: acceptances.results,
    consultations: consultations.results,
    auditEvents: audit.results,
    note: "File bodies and third-party confidential content are excluded from this portable metadata export.",
  }, null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="juro-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "private, no-store",
    },
  });
});
