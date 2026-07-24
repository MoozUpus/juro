import { legacyRedirect } from "../../redirect";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ categorySlug: string; documentCode: string }> }): Promise<Response> {
  const { categorySlug, documentCode } = await params;
  return legacyRedirect(request, `/document-builder/${encodeURIComponent(categorySlug)}/${encodeURIComponent(documentCode)}`, ["lang", "resume", "draft", "invitation"]);
}
