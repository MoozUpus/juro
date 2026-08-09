import { getChatGPTUser } from "../../../../chatgpt-auth";
import { isLocale, isWorkspaceId } from "../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

const FORWARDED_QUERY_KEYS = ["analysis", "analysisId", "caseId", "mode"] as const;

function documentReviewTarget(
  request: Request,
  pathname: string,
): URL {
  const source = new URL(request.url);
  const target = new URL(pathname, request.url);
  for (const key of FORWARDED_QUERY_KEYS) {
    const value = source.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }
  return target;
}

function loginTarget(
  request: Request,
  locale: "ru" | "uz",
  returnTo: URL,
): URL {
  const login = new URL(`/${locale}/auth/login`, request.url);
  login.searchParams.set("returnTo", `${returnTo.pathname}${returnTo.search}`);
  return login;
}

/** Preserve legacy document-analysis links while retaining the workspace. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; workspaceId: string }> },
) {
  const { locale, workspaceId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) {
    return new Response("Not Found", { status: 404 });
  }

  const target = documentReviewTarget(
    request,
    `/${locale}/business/${encodeURIComponent(workspaceId)}/document-review`,
  );
  if (!await getChatGPTUser()) {
    return Response.redirect(loginTarget(request, locale, target), 307);
  }

  return Response.redirect(target, 307);
}
