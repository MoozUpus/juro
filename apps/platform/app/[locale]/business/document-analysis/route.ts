import { getChatGPTUser } from "../../../chatgpt-auth";
import { getOrCreateUserProfile } from "../../../../lib/document-builder/storage/db";
import { workspaceProfile } from "../../../../lib/platform/profile";
import {
  isLocale,
  isPersonalAccountType,
  platformBasePath,
  type PlatformLocale,
} from "../../../../lib/platform/routing";
import { workspaceForUser } from "../../../../lib/platform/workspace";

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
  locale: PlatformLocale,
  returnTo: URL,
): URL {
  const login = new URL(`/${locale}/auth/login`, request.url);
  login.searchParams.set("returnTo", `${returnTo.pathname}${returnTo.search}`);
  return login;
}

/**
 * Resolve pre-workspace business links after authentication without losing the
 * incoming document-review context.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isLocale(locale)) return new Response("Not Found", { status: 404 });

  const legacyTarget = documentReviewTarget(
    request,
    `/${locale}/business/document-analysis`,
  );
  const user = await getChatGPTUser();
  if (!user) {
    return Response.redirect(loginTarget(request, locale, legacyTarget), 307);
  }

  const userProfile = await getOrCreateUserProfile(user);
  const activeWorkspace = await workspaceForUser(userProfile);
  if (activeWorkspace.type === "business") {
    return Response.redirect(
      documentReviewTarget(
        request,
        `${platformBasePath(locale, "business", activeWorkspace.id)}/document-review`,
      ),
      307,
    );
  }

  const profile = await workspaceProfile(user.email);
  const accountType = profile && isPersonalAccountType(profile.accountType)
    ? profile.accountType
    : "individual";
  return Response.redirect(
    documentReviewTarget(
      request,
      `${platformBasePath(locale, accountType)}/document-review`,
    ),
    307,
  );
}
