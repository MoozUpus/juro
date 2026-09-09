export type PrivateServiceBoundary = {
  environment: string;
  marker: string;
  method: "GET" | "POST";
  path: string;
  requireJson?: boolean;
};

export function acceptsPrivateServiceRequest(
  request: Request,
  boundary: PrivateServiceBoundary,
): boolean {
  const url = new URL(request.url);
  return request.method === boundary.method
    && url.hostname === "legal-corpus.internal"
    && url.pathname === boundary.path
    && (!boundary.requireJson
      || request.headers.get("content-type")?.toLowerCase().startsWith("application/json") === true)
    && request.headers.get("x-juro-service-binding") === boundary.marker
    && request.headers.get("x-juro-legal-environment") === boundary.environment;
}

export function declaredRequestBodyWithinLimit(request: Request, maximumBytes: number): boolean {
  const rawLength = request.headers.get("content-length");
  if (rawLength === null) return true;
  const declaredLength = Number(rawLength);
  return Number.isSafeInteger(declaredLength)
    && declaredLength >= 0
    && declaredLength <= maximumBytes;
}

export function privateServiceJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    },
  });
}
