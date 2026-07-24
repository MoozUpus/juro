import { canonicalBuilderUrl } from "../../route-helpers";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; return Response.redirect(await canonicalBuilderUrl(request, `documents/${encodeURIComponent(id)}`), 307); }
