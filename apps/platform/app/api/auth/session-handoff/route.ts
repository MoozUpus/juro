import {
  clearSessionCookie,
  replacementSessionCookies,
} from "../../../../lib/auth/session";
import { consumeSessionHandoff } from "../../../../lib/auth/session-handoff";
import { readBoundedRequestBody } from "../../../../lib/auth/input";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { isLocale, type PlatformLocale } from "../../../../lib/platform/routing";

function requestLocale(request: Request): PlatformLocale {
  const url = new URL(request.url);
  const explicit = url.searchParams.get("locale") ?? url.searchParams.get("lang");
  if (explicit && isLocale(explicit)) return explicit;
  const referrer = request.headers.get("referer");
  if (referrer) {
    try {
      const referrerUrl = new URL(referrer);
      const candidate = referrerUrl.pathname.split("/").filter(Boolean)[0];
      if (referrerUrl.origin === url.origin && candidate && isLocale(candidate)) {
        return candidate;
      }
    } catch {
      // Invalid referrers never influence the destination.
    }
  }
  return "ru";
}

function redirect(location: string, hostname: string, cookies: string[] = []) {
  const headers = new Headers({
    location,
    "cache-control": "private, no-store",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
  });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  if (hostname.endsWith(".juro.uz")) {
    headers.append("set-cookie", clearSessionCookie(".juro.uz"));
  }
  return new Response(null, { status: 303, headers });
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const locale = requestLocale(request);
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const length = Number(request.headers.get("content-length") ?? "0");
  if (
    !contentType.startsWith("application/x-www-form-urlencoded")
    || (Number.isFinite(length) && length > 2_048)
  ) return redirect(`/${locale}/auth/login?handoff=invalid`, url.hostname);
  const body = await readBoundedRequestBody(request, 2_048);
  if (!body.ok) {
    return redirect(`/${locale}/auth/login?handoff=invalid`, url.hostname);
  }
  const ticket = new URLSearchParams(body.text).get("ticket") ?? "";
  try {
    const result = await consumeSessionHandoff(requireD1(), {
      ticket,
      destinationHost: url.hostname,
      origin: request.headers.get("origin"),
      userAgent: request.headers.get("user-agent"),
    });
    if (!result) {
      return redirect(`/${locale}/auth/login?handoff=expired`, url.hostname);
    }
    return redirect(
      result.redirectPath,
      url.hostname,
      replacementSessionCookies(
        result.token,
        result.rememberMe,
        url.hostname,
      ),
    );
  } catch {
    return redirect(`/${locale}/auth/login?handoff=unavailable`, url.hostname);
  }
}
