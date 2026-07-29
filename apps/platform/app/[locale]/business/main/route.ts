import { isLocale } from "../../../../lib/platform/routing";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return Response.redirect(
    new URL(`/${locale}/business/dashboard`, request.url),
    308,
  );
}
