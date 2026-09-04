import type { PublicLanguage } from "../../../content/types";

const PLATFORM_ORIGIN = "https://app.juro.uz";

export function platformAuthHref(
  locale: PublicLanguage,
  mode: "login" | "register",
): string {
  return `${PLATFORM_ORIGIN}/${locale}/auth/${mode}`;
}

export function platformRegistrationHref(locale: PublicLanguage): string {
  return `${platformAuthHref(locale, "register")}?accountType=individual`;
}

export function platformPersonalHref(
  locale: PublicLanguage,
  path: string,
): string {
  // The signed-in product shell is intentionally RU/UZ-only for now. Keep the
  // English acquisition journey English instead of sending users to a Russian
  // shell URL or to an unsupported /en protected route.
  if (locale === "en") return platformAuthHref(locale, "login");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${PLATFORM_ORIGIN}/${locale}/individual${normalizedPath}`;
}
