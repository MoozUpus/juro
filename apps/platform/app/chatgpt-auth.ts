import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { userIdByEmail } from "../lib/auth/identity-protection";
import { runtimeIdentityProtection } from "../lib/auth/identity-runtime";
import { hasActiveMfa } from "../lib/auth/mfa-service";
import { getSessionUser } from "../lib/auth/session";
import {
  requireD1,
  runtimeEnv,
} from "../lib/document-builder/storage/runtime";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

export type AuthPrincipal = ChatGPTUser & {
  authSource: "local_session" | "platform_header";
  assuranceLevel: "primary" | "mfa" | "upstream";
  sessionId: string | null;
};

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

export async function getAuthPrincipal(): Promise<AuthPrincipal | null> {
  const sessionUser = await getSessionUser();
  if (sessionUser) return sessionUser;

  const allowPlatformHeaders = process.env.NODE_ENV !== "production"
    || runtimeEnv().ALLOW_PLATFORM_AUTH_HEADERS === "true";
  if (!allowPlatformHeaders) return null;

  const requestHeaders = await headers();
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!email) return null;

  try {
    const db = requireD1();
    const localUserId = await userIdByEmail(
      db,
      runtimeIdentityProtection(),
      email,
    );
    if (localUserId && await hasActiveMfa(db, localUserId)) return null;
  } catch {
    // Trusted-header authentication must fail closed when JURO cannot prove
    // that the account has no active local MFA credential.
    return null;
  }

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    displayName: fullName ?? email,
    email,
    fullName,
    authSource: "platform_header",
    assuranceLevel: "upstream",
    sessionId: null,
  };
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const principal = await getAuthPrincipal();
  if (!principal) return null;
  return {
    displayName: principal.displayName,
    email: principal.email,
    fullName: principal.fullName,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  redirect(`/login?returnTo=${encodeURIComponent(safeReturnTo)}`);
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
