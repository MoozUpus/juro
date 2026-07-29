import { isAccountType, isLocale } from "../../../../lib/platform/routing";

export function GET(
  request: Request,
  context: { params: Promise<{ locale: string; accountType: string }> },
) {
  return context.params.then(({ locale, accountType }) => {
    if (!isLocale(locale) || !isAccountType(accountType)) {
      return new Response("Not found", { status: 404 });
    }
    return Response.redirect(
      new URL(`/${locale}/${accountType}/dashboard`, request.url),
      308,
    );
  });
}
