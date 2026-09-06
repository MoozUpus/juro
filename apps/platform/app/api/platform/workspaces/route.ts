import { z } from "zod";
import { parseJsonRequest } from "../../../../lib/auth/input";
import { authLocaleFromRequest } from "../../../../lib/auth/request-locale";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import {
  createBusinessWorkspaceInDatabase,
  createBusinessWorkspaceInputSchema,
  WorkspaceCreationConflictError,
} from "../../../../lib/platform/workspace-creation";
import { workspaceForUser, workspaceForUserById, workspacesForUser } from "../../../../lib/platform/workspace";
import { isPersonalAccountType, isWorkspaceId, platformPath } from "../../../../lib/platform/routing";
const switchWorkspaceInputSchema = z.object({
  action: z.literal("switch").optional(),
  workspaceId: z.string().refine(isWorkspaceId),
  locale: z.enum(["ru", "uz", "en"]).default("ru"),
}).strict();

const workspaceMutationInputSchema = z.union([
  createBusinessWorkspaceInputSchema,
  switchWorkspaceInputSchema,
]);

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
  const requestLocale = authLocaleFromRequest(request);
  const user = await requireApiUser(request);
  const parsed = await parseJsonRequest(request, workspaceMutationInputSchema, 2_048);
  if (!parsed.ok) {
    return response({
      code: "INVALID_WORKSPACE_INPUT",
      error: {
        ru: "Проверьте данные пространства.",
        uz: "Makon ma’lumotlarini tekshiring.",
        en: "Check the workspace details.",
      }[requestLocale],
    }, parsed.error === "payload_too_large" ? 413 : 400);
  }
  const body = parsed.data;
  const locale = body.locale;

  if (body.action === "create") {
    try {
      const workspace = await createBusinessWorkspaceInDatabase(
        requireD1(),
        user.id,
        body,
      );
      return response({
        ok: true,
        created: workspace.created,
        activeWorkspaceId: workspace.id,
        workspace,
        redirectTo: platformPath(locale, "business", "dashboard", workspace.id),
      }, workspace.created ? 201 : 200, "business");
    } catch (error) {
      if (error instanceof WorkspaceCreationConflictError) {
        return response({
          code: "WORKSPACE_CREATION_CONFLICT",
          error: locale === "ru"
            ? "Запрос создания уже использован. Обновите страницу и повторите."
            : locale === "uz"
              ? "Yaratish so‘rovi allaqachon ishlatilgan. Sahifani yangilab, qayta urinib ko‘ring."
              : "This creation request has already been used. Refresh the page and try again.",
        }, 409);
      }
      throw error;
    }
  }
  const target = await workspaceForUserById(user.id, body.workspaceId, {
    activate: true,
    source: "workspace_switcher",
  });
  if (!target) {
    return response({
      error: locale === "ru"
        ? "У вас нет доступа к выбранному пространству."
        : locale === "uz"
          ? "Tanlangan makonga kirish huquqingiz yo‘q."
          : "You do not have access to the selected workspace.",
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
