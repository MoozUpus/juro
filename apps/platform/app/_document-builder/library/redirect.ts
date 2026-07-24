const MAX_QUERY_VALUE_LENGTH = 160;

export function legacyRedirect(request: Request, pathname: string, allowedKeys: readonly string[]): Response {
  const source = new URL(request.url);
  const destination = new URL(pathname, source.origin);
  const allowed = new Set(allowedKeys);
  for (const [key, value] of source.searchParams) {
    if (allowed.has(key) && value && value.length <= MAX_QUERY_VALUE_LENGTH) destination.searchParams.set(key, value);
  }
  return Response.redirect(destination, 308);
}
