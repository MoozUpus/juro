import { legacyRedirect } from "../redirect";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ categorySlug: string }> }): Promise<Response> {
  const { categorySlug } = await params;
  return legacyRedirect(request, `/document-builder/${encodeURIComponent(categorySlug)}`, ["lang", "q", "status", "resume"]);
}
