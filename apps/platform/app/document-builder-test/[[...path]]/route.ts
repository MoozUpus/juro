const ALLOWED_QUERY = new Set(["lang", "accountType", "draftId", "documentId", "caseId", "stepId", "return_to"]);

export function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return redirectLegacy(request, context);
}

async function redirectLegacy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const source = new URL(request.url);
  const { path = [] } = await context.params;
  const target = new URL(`/document-builder${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}`, source.origin);
  for (const [key, value] of source.searchParams) if (ALLOWED_QUERY.has(key)) target.searchParams.append(key, value);
  return Response.redirect(target, 308);
}
