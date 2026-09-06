import { getChatGPTUser } from "../../../chatgpt-auth";
import { isAccountType, isLocale, type PlatformLocale } from "../../../../lib/platform/routing";

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
 * Compatibility entry point for documented external links.
 *
 * This is deliberately a route handler, rather than a server page: the
 * deployed RSC runtime does not expose searchParams to page components before
 * authentication. Reading request.url here keeps a supported analysis link
 * intact through the OTP/TOTP return path.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; accountType: string }> },
) {
  const { locale, accountType } = await params;
  if (!isLocale(locale) || !isAccountType(accountType)) {
    return new Response("Not Found", { status: 404 });
  }

  const target = documentReviewTarget(
    request,
    `/${locale}/${accountType}/document-review`,
  );
  if (!await getChatGPTUser()) {
    return Response.redirect(loginTarget(request, locale, target), 307);
  }

  return Response.redirect(target, 307);
}
