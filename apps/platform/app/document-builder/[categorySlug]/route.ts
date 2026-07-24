import { canonicalBuilderUrl } from "../route-helpers";
export async function GET(request: Request, { params }: { params: Promise<{ categorySlug: string }> }) { const { categorySlug } = await params; return Response.redirect(await canonicalBuilderUrl(request, `document-builder/${encodeURIComponent(categorySlug)}`), 307); }
