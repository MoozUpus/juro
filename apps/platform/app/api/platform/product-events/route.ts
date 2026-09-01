import { z } from "zod";
import { parseJsonRequest } from "../../../../lib/auth/input";
import {
  assertSafeWrite,
  requireApiUser,
  withApiErrors,
} from "../../../../lib/document-builder/auth/api";
import { trackProductEvent } from "../../../../lib/platform/analytics";
import { workspaceForUser } from "../../../../lib/platform/workspace";

const browserProductEventSchema = z.object({
  event: z.literal("source_opened"),
  locale: z.enum(["ru", "uz"]),
}).strict();

function response(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

function hasAnalyticsConsent(request: Request): boolean {
  return /(?:^|;\s*)juro_consent=analytics(?:;|$)/.test(request.headers.get("cookie") ?? "");
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  if (!hasAnalyticsConsent(request)) return response({ code: "ANALYTICS_CONSENT_REQUIRED" }, 403);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const parsed = await parseJsonRequest(request, browserProductEventSchema, 256);
  if (!parsed.ok) {
    return response(
      { code: "INVALID_PRODUCT_EVENT" },
      parsed.error === "payload_too_large" ? 413 : 400,
    );
  }
  trackProductEvent({
    event: parsed.data.event,
    surface: "platform",
    locale: parsed.data.locale,
    accountType: workspace.type,
    outcome: "completed",
  });
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
});
