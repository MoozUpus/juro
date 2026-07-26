import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../lib/platform/workspace";

const goals = new Set(["personal_issue", "review_document", "create_document", "business_cases", "legal_automation"]);
const organizationRoles = new Set(["owner", "director", "lawyer", "employee", "other"]);

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const body = await request.json().catch(() => null) as {
    accountType?: string;
    displayName?: string;
    locale?: string;
    primaryGoal?: string;
    companyName?: string;
    organizationRole?: string;
    acceptPolicies?: boolean;
  } | null;
  const locale = body?.locale === "uz" ? "uz" : "ru";
  const accountType = body?.accountType === "business" ? "business" : "individual";
  const displayName = body?.displayName?.trim().slice(0, 160);
  const primaryGoal = body?.primaryGoal && goals.has(body.primaryGoal) ? body.primaryGoal : null;
  const companyName = body?.companyName?.trim().slice(0, 180) || null;
  const organizationRole = body?.organizationRole && organizationRoles.has(body.organizationRole) ? body.organizationRole : null;
  if (!displayName || !primaryGoal || !body?.acceptPolicies) {
    return response({ error: locale === "ru" ? "Заполните обязательные поля и подтвердите правила." : "Majburiy maydonlarni to‘ldiring va qoidalarni tasdiqlang." }, 400);
  }
  if (accountType === "business" && !companyName) {
    return response({ error: locale === "ru" ? "Укажите название организации." : "Tashkilot nomini kiriting." }, 400);
  }

  const workspace = await workspaceForUser(user);
  const now = new Date().toISOString();
  const workspaceName = accountType === "business" ? companyName! : displayName;
  const db = requireD1();
  await db.batch([
    db.prepare(
      `UPDATE user_profiles
       SET full_name = ?, locale = ?, account_type = ?, company_name = ?,
         organization_role = ?, primary_goal = ?, timezone = 'Asia/Tashkent',
         onboarding_completed_at = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(displayName, locale, accountType, companyName, organizationRole, primaryGoal, now, now, user.id),
    db.prepare("UPDATE workspaces SET type = ?, name = ?, locale = ?, updated_at = ? WHERE id = ?")
      .bind(accountType, workspaceName, locale, now, workspace.id),
    db.prepare(
      "INSERT INTO consents (id,user_id,workspace_id,type,version,scope_json,granted_at) VALUES (?,?,?,'onboarding_policies','2026-07-26',?,?)",
    ).bind(crypto.randomUUID(), user.id, workspace.id, JSON.stringify({ accepted: true }), now),
    db.prepare(
      "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'user',?,'onboarding_completed',?,?)",
    ).bind(crypto.randomUUID(), workspace.id, user.id, user.id, JSON.stringify({ accountType, primaryGoal }), now),
  ]);
  return response({ ok: true, redirectTo: `/${locale}/${accountType}/main` });
});
