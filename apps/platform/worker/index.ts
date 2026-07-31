/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  handleQueue,
  type PlatformJobEnv,
} from "./platform-jobs";
import { handleScheduled } from "./platform-scheduled";

type FrameworkEnv = PlatformJobEnv & {
  AI?: Ai;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_CHAT_MODEL?: string;
  OPENAI_DEEP_MODEL?: string;
  OPENAI_FALLBACK_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_DOCUMENT_MODEL?: string;
  ANTHROPIC_FALLBACK_MODEL?: string;
  AI_PROVIDER?: string;
  AI_PROVIDER_API_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  APP_URL?: string;
  PUBLIC_SITE_URL?: string;
  PAYMENT_PROVIDER?: string;
  PAYMENT_API_KEY?: string;
  PAYMENT_WEBHOOK_SECRET?: string;
  ALLOW_PLATFORM_AUTH_HEADERS?: string;
};

type SupportedImageOutputFormat =
  | "image/jpeg"
  | "image/webp"
  | "image/avif";

function isSupportedImageOutputFormat(
  format: string,
): format is SupportedImageOutputFormat {
  return (
    format === "image/jpeg" ||
    format === "image/webp" ||
    format === "image/avif"
  );
}

function withSecurityHeaders(response: Response, url: URL): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; upgrade-insecure-requests",
  );
  if (url.protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: FrameworkEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const optimized = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          if (!isSupportedImageOutputFormat(format)) {
            throw new Error("Unsupported optimized image output format.");
          }
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(optimized, url);
    }

    const response = await handler.fetch(request, env, ctx);
    const isPrivateApi = url.pathname.startsWith("/api/document-builder/") || url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/platform/");
    const isPrivateShare = url.pathname.startsWith("/document-builder/share/")
      || url.pathname.startsWith("/document-builder/signed-share/");
    const headers = new Headers(response.headers);
    if (isPrivateApi || isPrivateShare || (!url.pathname.startsWith("/_next/") && !url.pathname.match(/\.(?:png|webp|svg|ico|css|js|woff2?)$/))) {
      headers.set("Cache-Control", "private, no-store, max-age=0");
      headers.set("Pragma", "no-cache");
    }
    if (isPrivateShare) headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return withSecurityHeaders(new Response(response.body, { status: response.status, statusText: response.statusText, headers }), url);
  },
  async queue(
    batch: MessageBatch<unknown>,
    env: FrameworkEnv,
  ): Promise<void> {
    await handleQueue(batch, env);
  },
  async scheduled(
    controller: ScheduledController,
    env: FrameworkEnv,
  ): Promise<void> {
    await handleScheduled(controller, env);
  },
} satisfies ExportedHandler<FrameworkEnv, unknown>;

export default worker;
