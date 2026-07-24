import { canonicalBuilderUrl } from "../../route-helpers";
export async function GET(request: Request, { params }: { params: Promise<{ categorySlug: string; documentCode: string }> }) { const { categorySlug, documentCode } = await params; return Response.redirect(await canonicalBuilderUrl(request, `document-builder/${encodeURIComponent(categorySlug)}/${encodeURIComponent(documentCode)}`), 307); }
