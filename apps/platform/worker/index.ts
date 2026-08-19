/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  handleQueue,
  type PlatformJobEnv,
} from "./platform-jobs";
import {
  handleMalwareScannerServiceRequest,
  MalwareScannerContainer,
} from "./malware-scanner-container";
import { handleScheduled } from "./platform-scheduled";
import {
  handleStagingQueueHealthProbeBatch,
  isStagingQueueHealthProbeQueue,
} from "./staging-queue-health-probe";
import {
  handleStagingLegalEvaluationQueueBatch,
  isStagingLegalEvaluationQueue,
} from "./staging-legal-evaluation-queue";
import { handleInternalAdminRequest } from "../lib/auth/admin-internal-api";
import {
  handleLegalCorpusEmbeddingServiceRequest,
  handleLegalCorpusQdrantServiceRequest,
  LegalCorpusQdrantContainer,
} from "./legal-corpus-private-services";
import { lawyerHostTarget } from "./lawyer-host-router";

export { MalwareScannerContainer, LegalCorpusQdrantContainer };

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
  STATUS_HOSTNAME?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  GUEST_AI_ENABLED?: string;
  APP_URL?: string;
  PUBLIC_SITE_URL?: string;
  PAYMENT_PROVIDER?: string;
  PAYMENT_API_KEY?: string;
  PAYMENT_WEBHOOK_SECRET?: string;
  PAYMENT_FOUNDATION_ENABLED?: string;
  PAYMENT_SANDBOX_ENABLED?: string;
  PAYMENT_PRODUCTION_APPROVED?: string;
  PAYMENT_SANDBOX_WEBHOOK_SECRET?: string;
  ALLOW_PLATFORM_AUTH_HEADERS?: string;
  ADMIN_INTERNAL_TOKEN?: string;
  ADMIN_CONSOLE_TOKEN?: string;
  ADMIN_CONSOLE?: Fetcher;
  QDRANT_CONTAINER?: DurableObjectNamespace<LegalCorpusQdrantContainer>;
  QDRANT_API_KEY?: string;
  QDRANT_COLLECTION?: string;
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
    if (url.hostname === "malware-scanner.internal") {
      return handleMalwareScannerServiceRequest(request, env);
    }
    if (url.hostname === "qdrant.internal") {
      return handleLegalCorpusQdrantServiceRequest(request, env);
    }
    if (url.hostname === "embeddings.internal") {
      return handleLegalCorpusEmbeddingServiceRequest(request, env);
    }
    // Keep the existing custom domain on the production platform Worker while
    // moving the admin UI and its host-only session cookie into the isolated
    // juro-admin Worker. Internal admin API calls return through the juro
    // service binding with a non-public hostname, so this cannot recurse.
    if (
      env.APP_ENV === "production"
      && url.hostname.toLowerCase() === "admin.juro.uz"
      && env.ADMIN_CONSOLE
    ) {
      return withSecurityHeaders(await env.ADMIN_CONSOLE.fetch(request), url);
    }
    const configuredStatusHostname = env.STATUS_HOSTNAME?.trim().toLowerCase();
    const isStatusHost = Boolean(configuredStatusHostname && url.hostname.toLowerCase() === configuredStatusHostname);
    let routedRequest = request;
    let routedUrl = url;

    const hostname = url.hostname.toLowerCase();
    const isLawyerHost = hostname === "lawyer.juro.uz" || hostname === "lawyer.staging.juro.uz";
    const lawyerPassthrough = url.pathname.startsWith("/_next/")
      || url.pathname.startsWith("/api/")
      || url.pathname.startsWith("/legal/")
      || /\.(?:avif|css|gif|ico|jpe?g|js|json|png|svg|webp|woff2?)$/u.test(url.pathname)
      || ["/favicon.ico", "/icon.png", "/apple-touch-icon.png", "/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"].includes(url.pathname);
    if (isLawyerHost && !lawyerPassthrough) {
      const target = lawyerHostTarget(url);
      if (!target) return withSecurityHeaders(new Response("Not Found", { status: 404 }), url);
      const headers = new Headers(request.headers);
      headers.set("x-juro-lawyer-host", "1");
      routedUrl = target;
      routedRequest = new Request(target, { method: request.method, headers, body: request.body, redirect: request.redirect });
    }

    if (isStatusHost) {
      const isStatusAsset = url.pathname.startsWith("/_next/")
        || /^\/(?:favicon|icon|apple-touch-icon)\.(?:png|ico)$/.test(url.pathname);
      const allowedStatusPath = url.pathname === "/"
        || url.pathname === "/status"
        || url.pathname === "/ru"
        || url.pathname === "/uz"
        || url.pathname === "/ru/status"
        || url.pathname === "/uz/status"
        || url.pathname === "/api/status"
        || isStatusAsset;
      if (!allowedStatusPath) {
        return withSecurityHeaders(new Response("Not Found", { status: 404 }), url);
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        return withSecurityHeaders(new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } }), url);
      }
      if (url.pathname === "/" || url.pathname === "/ru" || url.pathname === "/uz") {
        const target = new URL(url);
        if (url.pathname === "/ru" || url.pathname === "/uz") {
          target.pathname = `${url.pathname}/status`;
        } else {
          target.pathname = "/status";
          if (!target.searchParams.has("lang")) target.searchParams.set("lang", "uz");
        }
        routedUrl = target;
        routedRequest = new Request(target, request);
      }
    }

    if (routedUrl.pathname === "/_vinext/image") {
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

    const internalAdminResponse = await handleInternalAdminRequest(routedRequest, env);
    if (internalAdminResponse) return withSecurityHeaders(internalAdminResponse, url);

    const response = await handler.fetch(routedRequest, env, ctx);
    const isPrivateApi = routedUrl.pathname.startsWith("/api/document-builder/") || routedUrl.pathname.startsWith("/api/auth/") || routedUrl.pathname.startsWith("/api/platform/");
    const isPrivateShare = routedUrl.pathname.startsWith("/document-builder/share/")
      || routedUrl.pathname.startsWith("/document-builder/signed-share/");
    const isPublicStatus = routedUrl.pathname === "/status"
      || routedUrl.pathname === "/api/status"
      || /^\/(?:ru|uz)\/status$/.test(routedUrl.pathname);
    const headers = new Headers(response.headers);
    if (isPublicStatus) {
      headers.set(
        "Cache-Control",
        response.status >= 500
          ? "public, max-age=0, s-maxage=5"
          : "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
      );
      headers.delete("Pragma");
    } else if (isPrivateApi || isPrivateShare || (!routedUrl.pathname.startsWith("/_next/") && !routedUrl.pathname.match(/\.(?:png|webp|svg|ico|css|js|woff2?)$/))) {
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
    if (isStagingQueueHealthProbeQueue(batch.queue, env)) {
      await handleStagingQueueHealthProbeBatch(batch, env);
      return;
    }
    if (isStagingLegalEvaluationQueue(batch.queue, env)) {
      await handleStagingLegalEvaluationQueueBatch(batch, env);
      return;
    }
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
