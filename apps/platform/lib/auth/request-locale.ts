export type RequestAuthLocale = "ru" | "uz" | "en";

function supportedLocale(value: string | null | undefined): RequestAuthLocale | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === "ru" || normalized === "uz" || normalized === "en"
    ? normalized
    : null;
}

export function authLocaleFromRequest(
  request: Request,
  fallback: RequestAuthLocale = "ru",
): RequestAuthLocale {
  const explicit = supportedLocale(request.headers.get("x-juro-locale"));
  if (explicit) return explicit;

  const requestUrl = new URL(request.url);
  const query = supportedLocale(
    requestUrl.searchParams.get("locale") ?? requestUrl.searchParams.get("lang"),
  );
  if (query) return query;

  const referrer = request.headers.get("referer");
  if (referrer) {
    try {
      const referrerUrl = new URL(referrer);
      if (referrerUrl.origin === requestUrl.origin) {
        const routeLocale = supportedLocale(
          referrerUrl.pathname.split("/").filter(Boolean)[0],
        );
        if (routeLocale) return routeLocale;
      }
    } catch {
      // Ignore an invalid referrer and continue to the browser language.
    }
  }

  const accepted = request.headers.get("accept-language") ?? "";
  for (const languageRange of accepted.split(",")) {
    const tag = languageRange.split(";", 1)[0]?.trim().split("-", 1)[0];
    const locale = supportedLocale(tag);
    if (locale) return locale;
  }
  return fallback;
}

export function localizedRequestFormatError(request: Request): string {
  const locale = authLocaleFromRequest(request);
  return {
    ru: "Проверьте формат запроса.",
    uz: "So‘rov formatini tekshiring.",
    en: "Check the request format.",
  }[locale];
}
