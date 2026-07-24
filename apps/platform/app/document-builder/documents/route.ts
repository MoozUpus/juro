import { canonicalBuilderUrl } from "../route-helpers";
export async function GET(request: Request) { return Response.redirect(await canonicalBuilderUrl(request, "documents"), 307); }
