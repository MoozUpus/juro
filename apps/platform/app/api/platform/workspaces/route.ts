import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { workspaceForUser, workspacesForUser } from "../../../../lib/platform/workspace";
import { isPersonalAccountType } from "../../../../lib/platform/routing";

function response(body: unknown, status = 200, accountType?: string) {
  const headers = new Headers({
    "cache-control": "private, no-store",
    pragma: "no-cache",
  });
  if (accountType) {
    headers.append(
      "set-cookie",
      `juro_account_type=${accountType}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    );
  }
  return Response.json(body, { status, headers });
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const active = await workspaceForUser(user);
  const workspaces = await workspacesForUser(user.id);
  return response({ activeWorkspaceId: active.id, workspaces });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const body = await request.json().catch(() => null) as { workspaceId?: string; locale?: string } | null;
  const locale = body?.locale === "uz" ? "uz" : "ru";
  if (!body?.workspaceId || body.workspaceId.length > 128) {
    return response({ error: locale === "ru" ? "Пространство не выбрано." : "Makon tanlanmagan." }, 400);
  }
  const db = requireD1();
  const target = await db.prepare(
    `SELECT w.id,w.type,w.name,m.role,p.account_type AS accountPersona
     FROM workspace_members m
     JOIN workspaces w ON w.id=m.workspace_id
     JOIN user_profiles p ON p.user_id=m.user_id
     WHERE w.id=? AND m.user_id=? AND m.status='active' LIMIT 1`,
  ).bind(body.workspaceId, user.id).first<{ id: string; type: string; name: string; role: string; accountPersona: string }>();
  if (!target) {
    return response({
      error: locale === "ru"
        ? "У вас нет доступа к выбранному пространству."
        : "Tanlangan makonga kirish huquqingiz yo‘q.",
    }, 403);
  }
  const previous = await workspaceForUser(user);
  const accountType = target.type === "business"
    ? "business"
    : isPersonalAccountType(target.accountPersona)
      ? target.accountPersona
      : "individual";
  const now = isoNow();
  await db.batch([
    db.prepare(
      "UPDATE user_profiles SET default_workspace_id=?,updated_at=? WHERE id=?",
    ).bind(target.id, now, user.id),
    db.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'workspace',?,'workspace_selected',?,?)`,
    ).bind(crypto.randomUUID(), target.id, user.id, target.id, JSON.stringify({
      previousWorkspaceId: previous.id,
      targetWorkspaceType: target.type,
      routeAccountType: accountType,
      role: target.role,
    }), now),
  ]);
  return response({
    ok: true,
    activeWorkspaceId: target.id,
    redirectTo: `/${locale}/${accountType}/main`,
  }, 200, accountType);
});
