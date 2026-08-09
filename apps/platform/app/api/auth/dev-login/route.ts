import { normalizeEmail } from "../../../../lib/auth/crypto";
import { localDevelopmentAuthEnabled } from "../../../../lib/auth/development-auth";
import { sessionCookie } from "../../../../lib/auth/session";
import { createLocalDevelopmentSession } from "../../../../lib/auth/session-management";
import { getOrCreateUserProfile } from "../../../../lib/document-builder/storage/db";
import {
  requireD1,
  runtimeEnv,
} from "../../../../lib/document-builder/storage/runtime";

const DEFAULT_EMAIL = "developer@local.juro.uz";
const DEFAULT_FULL_NAME = "JURO Local Developer";

function isLoopbackDevelopmentHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost"
    || host.endsWith(".localhost")
    || host === "127.0.0.1"
    || host === "::1"
    || host === "terminal.local";
}

function safeReturnPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const target = new URL(value, "http://localhost");
    if (target.origin !== "http://localhost") return "/";
    if (/^\/(?:signin-with-chatgpt|signout-with-chatgpt|callback|api\/auth\/dev-login)\/?$/u.test(target.pathname)) {
      return "/";
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

function configuredEmail(value: string | undefined): string {
  const email = normalizeEmail(value || DEFAULT_EMAIL).slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
    ? email
    : DEFAULT_EMAIL;
}

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "cache-control": "private, no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  if (
    !localDevelopmentAuthEnabled()
    || !isLoopbackDevelopmentHost(requestUrl.hostname)
  ) {
    return notFound();
  }

  const env = runtimeEnv();
  const email = configuredEmail(env.LOCAL_AUTH_EMAIL);
  const fullName = env.LOCAL_AUTH_FULL_NAME?.trim().slice(0, 160)
    || DEFAULT_FULL_NAME;
  const profile = await getOrCreateUserProfile({
    email,
    fullName,
    displayName: fullName,
  });
  const session = await createLocalDevelopmentSession(requireD1(), {
    userId: profile.id,
    userAgent: request.headers.get("user-agent"),
  });
  const headers = new Headers({
    location: safeReturnPath(requestUrl.searchParams.get("returnTo")),
    "cache-control": "private, no-store",
    pragma: "no-cache",
  });
  headers.append("set-cookie", sessionCookie(session.token));
  return new Response(null, { status: 303, headers });
}
