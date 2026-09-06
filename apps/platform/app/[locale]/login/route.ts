import { isLocale } from "../../../lib/platform/routing";

export function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  return redirect(request, params);
}

async function redirect(
  request: Request,
  params: Promise<{ locale: string }>,
) {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "ru";
  const source = new URL(request.url);
  const destination = new URL(`/${safeLocale}/auth/login`, request.url);
  const returnTo = source.searchParams.get("returnTo");
  if (returnTo !== null) destination.searchParams.set("returnTo", returnTo);
  return Response.redirect(destination, 308);
}
