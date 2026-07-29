import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { workspaceForUser, workspaceForUserById, workspacesForUser } from "../../../../lib/platform/workspace";
import { isPersonalAccountType, isWorkspaceId, platformPath } from "../../../../lib/platform/routing";

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
  if (!body?.workspaceId || !isWorkspaceId(body.workspaceId)) {
    return response({ error: locale === "ru" ? "Пространство не выбрано." : "Makon tanlanmagan." }, 400);
  }
  const target = await workspaceForUserById(user.id, body.workspaceId, {
    activate: true,
    source: "workspace_switcher",
  });
  if (!target) {
    return response({
      error: locale === "ru"
        ? "У вас нет доступа к выбранному пространству."
        : "Tanlangan makonga kirish huquqingiz yo‘q.",
    }, 403);
  }
  const profile = await requireD1().prepare(
    "SELECT account_type AS accountPersona FROM user_profiles WHERE id=? LIMIT 1",
  ).bind(user.id).first<{ accountPersona: string }>();
  const accountType = target.type === "business"
    ? "business"
    : profile && isPersonalAccountType(profile.accountPersona)
      ? profile.accountPersona
      : "individual";
  return response({
    ok: true,
    activeWorkspaceId: target.id,
    redirectTo: platformPath(
      locale,
      accountType,
      "dashboard",
      target.type === "business" ? target.id : undefined,
    ),
  }, 200, accountType);
});
