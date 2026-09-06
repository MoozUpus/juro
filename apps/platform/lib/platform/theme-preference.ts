import { sharedAuthCookieDomain } from "../auth/session-persistence";

export type ThemePreference = "light" | "dark";

export function resolveThemePreference(value: unknown): ThemePreference {
  return value === "dark" ? "dark" : "light";
}

export async function themePreferenceForUser(
  db: D1Database,
  userId: string,
): Promise<ThemePreference> {
  const row = await db.prepare(
    "SELECT theme_preference AS themePreference FROM user_profiles WHERE id=? LIMIT 1",
  ).bind(userId).first<{ themePreference: string }>();
  return resolveThemePreference(row?.themePreference);
}

/**
 * The bootstrap script must read this cookie before React and localStorage are
 * available, so it intentionally is not HttpOnly. Production JURO hosts share
 * the preference; local development remains host-only.
 */
export function themePreferenceCookie(
  themePreference: ThemePreference,
  requestUrl: URL,
): string {
  const domain = sharedAuthCookieDomain(requestUrl.hostname);
  const secure = requestUrl.protocol === "https:";
  return `juro_theme=${themePreference}; Path=/; Max-Age=31536000; SameSite=Lax${
    domain ? `; Domain=${domain}` : ""
  }${secure ? "; Secure" : ""}`;
}
