import { cookies } from "next/headers";

import { isLocale, type PlatformLocale } from "../../lib/platform/routing";

export async function publicBuilderLocale(
  requestedLocale: string | string[] | undefined,
): Promise<PlatformLocale> {
  if (typeof requestedLocale === "string" && isLocale(requestedLocale)) return requestedLocale;
  const storedLocale = (await cookies()).get("juro_locale")?.value;
  return typeof storedLocale === "string" && isLocale(storedLocale) ? storedLocale : "ru";
}

export function publicBuilderReturnPath(path: string, locale: PlatformLocale): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}lang=${locale}`;
}
