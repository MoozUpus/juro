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
  const destination = new URL(`/${safeLocale}/auth/register`, request.url);
  for (const key of ["accountType", "returnTo"]) {
    const value = source.searchParams.get(key);
    if (value !== null) destination.searchParams.set(key, value);
  }
  return Response.redirect(destination, 308);
}
