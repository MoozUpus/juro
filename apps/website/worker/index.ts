/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function withSecurityHeaders(response: Response, requestUrl: URL): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://app.juro.uz; img-src 'self' data: blob: https://app.juro.uz https://pub-28041c6b6dff4877a700421e6cd2c986.r2.dev; media-src 'self' https://pub-28041c6b6dff4877a700421e6cd2c986.r2.dev; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; upgrade-insecure-requests",
  );
  if (requestUrl.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  const isFingerprintedStaticAsset =
    requestUrl.pathname.startsWith("/_next/static/") ||
    requestUrl.pathname.startsWith("/assets/");
  if ((response.ok || response.status === 304) && isFingerprintedStaticAsset) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === "www.juro.uz") {
      const destination = new URL(url);
      destination.hostname = "juro.uz";
      return withSecurityHeaders(Response.redirect(destination, 308), url);
    }

    // Vinext 0.0.50 currently resolves the unlocalized lawyer catalogue and
    // profiles through generic dynamic routes before their specific App Router
    // entries. Keep every public marketplace entry canonical at the edge.
    if (url.pathname === "/lawyers" || url.pathname.startsWith("/lawyers/")) {
      const destination = new URL(`/ru${url.pathname}`, url);
      destination.search = url.search;
      return withSecurityHeaders(Response.redirect(destination, 308), url);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const optimized = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(optimized, url);
    }

    // Derive the document locale from the URL at the edge. This overwrites any
    // client-supplied value before the App Router receives the request.
    const headers = new Headers(request.headers);
    headers.set("x-juro-request-path", url.pathname);
    const response = await handler.fetch(new Request(request, { headers }), env, ctx);
    return withSecurityHeaders(response, url);
  },
};

export default worker;
