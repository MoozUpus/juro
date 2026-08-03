import {
  isLocale,
  isPersonalAccountType,
  isWorkspaceId,
  platformBasePath,
  type PlatformLocale,
} from "../lib/platform/routing";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function destination(
  request: Request,
  basePath: string,
  path: string[] | undefined,
): Response {
  const segments = path ?? [];
  const target = new URL(`${basePath}/ai-chat`, request.url);
  if (segments.length === 0 || (segments.length === 1 && segments[0] === "new")) {
    return Response.redirect(target, 308);
  }
  if (segments.length === 2 && segments[0] === "chat" && UUID_PATTERN.test(segments[1])) {
    target.searchParams.set("conversationId", segments[1]);
    return Response.redirect(target, 308);
  }
  return new Response("Not found", { status: 404 });
}

export async function personalAiLawyerCompatibilityRoute(
  request: Request,
  params: Promise<{ locale: string; accountType: string; path?: string[] }>,
): Promise<Response> {
  const { locale, accountType, path } = await params;
  if (!isLocale(locale) || !isPersonalAccountType(accountType)) {
    return new Response("Not found", { status: 404 });
  }
  return destination(request, platformBasePath(locale, accountType), path);
}

export async function businessAiLawyerCompatibilityRoute(
  request: Request,
  params: Promise<{ locale: string; workspaceId: string; path?: string[] }>,
): Promise<Response> {
  const { locale, workspaceId, path } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) {
    return new Response("Not found", { status: 404 });
  }
  return destination(
    request,
    platformBasePath(locale as PlatformLocale, "business", workspaceId),
    path,
  );
}
