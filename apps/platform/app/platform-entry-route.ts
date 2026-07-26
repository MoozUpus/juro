import { canonicalBuilderUrl } from "./document-builder/route-helpers";

export function platformEntryRoute(module: string) {
  return async function GET(request: Request) {
    return Response.redirect(await canonicalBuilderUrl(request, module), 307);
  };
}
