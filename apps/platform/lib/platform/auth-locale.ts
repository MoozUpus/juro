export type AuthRouteLocale = "ru" | "uz";

const PLATFORM_ORIGIN = "https://app.juro.uz";

export function localizeAuthReturnPath(
  value: string | null | undefined,
  nextLocale: AuthRouteLocale,
): string | null {
  if (!value?.startsWith("/") || value.startsWith("//")) return null;
  try {
    const target = new URL(value, PLATFORM_ORIGIN);
    if (target.origin !== PLATFORM_ORIGIN) return null;
    target.pathname = target.pathname.replace(
      /^\/(?:ru|uz)(?=\/|$)/u,
      `/${nextLocale}`,
    );
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}
