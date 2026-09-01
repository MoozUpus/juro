/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

const SITES_SERVICE_HOST_SUFFIX = ".chatgpt.site";
const PRODUCT_EVENT_PATH = "/_juro/product-event";
const MAX_PRODUCT_EVENT_BYTES = 512;
const PUBLIC_PRODUCT_EVENTS = new Set([
  "landing_view",
  "start_scenario",
  "source_opened",
  "lawyer_viewed",
]);
const PUBLIC_PRODUCT_LOCALES = new Set(["ru", "uz", "en"]);
const PUBLIC_PRODUCT_ACCOUNT_TYPES = new Set([
  "individual",
  "business",
  "entrepreneur",
  "lawyer",
  "guest",
]);

type PublicProductEvent = {
  event: string;
  locale: string;
  accountType: string;
};

type ImagesOutputFormat =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "image/avif"
  | "rgb"
  | "rgba";
const IMAGES_OUTPUT_FORMATS = new Set<ImagesOutputFormat>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "rgb",
  "rgba",
]);

function isImagesOutputFormat(value: string): value is ImagesOutputFormat {
  return IMAGES_OUTPUT_FORMATS.has(value as ImagesOutputFormat);
}

export function isSitesServiceHost(hostname: string): boolean {
  return hostname.toLowerCase().endsWith(SITES_SERVICE_HOST_SUFFIX);
}

export function withSecurityHeaders(response: Response, requestUrl: URL): Response {
  const headers = new Headers(response.headers);
  if (response.status === 200 && requestUrl.pathname.startsWith("/assets/")) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://app.juro.uz; img-src 'self' data: blob: https://app.juro.uz https://pub-28041c6b6dff4877a700421e6cd2c986.r2.dev; manifest-src 'self'; media-src 'self' https://pub-28041c6b6dff4877a700421e6cd2c986.r2.dev; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; upgrade-insecure-requests",
  );
  if (requestUrl.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  // Sites keeps a provider hostname beside the custom domain. Canonical HTML
  // still points to juro.uz, while this header prevents the provider surface
  // from becoming a separately indexed copy of the public website.
  if (isSitesServiceHost(requestUrl.hostname)) {
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function analyticsResponse(requestUrl: URL, status: number, error?: string): Response {
  const response = error
    ? Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } })
    : new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  return withSecurityHeaders(response, requestUrl);
}

function hasAnalyticsConsent(request: Request): boolean {
  if (request.headers.get("x-juro-analytics-consent") !== "analytics") return false;
  return /(?:^|;\s*)juro_consent=analytics(?:;|$)/.test(request.headers.get("cookie") ?? "");
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PRODUCT_EVENT_BYTES) {
    throw new RangeError("payload_too_large");
  }
  if (!request.body) throw new SyntaxError("invalid_json");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PRODUCT_EVENT_BYTES) {
      try {
        await reader.cancel("payload_too_large");
      } catch {
        // The bounded response is authoritative even if the stream cannot be cancelled.
      }
      throw new RangeError("payload_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function parsePublicProductEvent(value: unknown): PublicProductEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 3 || keys.join(",") !== "accountType,event,locale") return null;
  if (
    typeof record.event !== "string" ||
    typeof record.locale !== "string" ||
    typeof record.accountType !== "string" ||
    !PUBLIC_PRODUCT_EVENTS.has(record.event) ||
    !PUBLIC_PRODUCT_LOCALES.has(record.locale) ||
    !PUBLIC_PRODUCT_ACCOUNT_TYPES.has(record.accountType)
  ) return null;
  return { event: record.event, locale: record.locale, accountType: record.accountType };
}

async function handleProductEvent(request: Request, env: WebsiteEnv, requestUrl: URL): Promise<Response> {
  if (request.method !== "POST") {
    const response = analyticsResponse(requestUrl, 405, "method_not_allowed");
    response.headers.set("Allow", "POST");
    return response;
  }
  const origin = request.headers.get("origin");
  if (origin !== requestUrl.origin) return analyticsResponse(requestUrl, 403, "forbidden");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return analyticsResponse(requestUrl, 403, "forbidden");
  if (!hasAnalyticsConsent(request)) return analyticsResponse(requestUrl, 403, "consent_required");
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return analyticsResponse(requestUrl, 415, "unsupported_media_type");
  }

  let raw: unknown;
  try {
    raw = await readBoundedJson(request);
  } catch (error) {
    return analyticsResponse(
      requestUrl,
      error instanceof RangeError ? 413 : 400,
      error instanceof RangeError ? "payload_too_large" : "invalid_json",
    );
  }
  const event = parsePublicProductEvent(raw);
  if (!event) return analyticsResponse(requestUrl, 400, "invalid_event");
  if (!env.PRODUCT_ANALYTICS) return analyticsResponse(requestUrl, 503, "analytics_unavailable");

  try {
    env.PRODUCT_ANALYTICS.writeDataPoint({
      blobs: [
        "product_event_v1",
        event.event,
        "website",
        event.locale,
        event.accountType,
        event.event === "start_scenario" ? "started" : "completed",
        "none",
      ],
      doubles: [1, 0],
    });
  } catch {
    return analyticsResponse(requestUrl, 503, "analytics_unavailable");
  }
  return analyticsResponse(requestUrl, 204);
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: WebsiteEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === PRODUCT_EVENT_PATH) {
      return handleProductEvent(request, env, url);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const optimized = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          if (!isImagesOutputFormat(format)) throw new Error("Unsupported image output format");
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
