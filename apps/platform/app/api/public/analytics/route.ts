import { runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { trackPublicSiteEvent, type ProductEventName } from "../../../../lib/platform/analytics";

const productionOrigins = new Set(["https://juro.uz", "https://www.juro.uz"]);
const stagingOrigins = new Set(["https://staging.juro.uz", "https://www.staging.juro.uz"]);
const MAX_BODY_BYTES = 512;

function noStore(status = 204): Response {
  return new Response(null, {
    status,
    headers: { "cache-control": "no-store", pragma: "no-cache", vary: "origin" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin") ?? "";
  const allowed = runtimeEnv().APP_ENV === "staging" ? stagingOrigins : productionOrigins;
  if (!allowed.has(origin)) return noStore(403);
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== "same-site" && fetchSite !== "same-origin") return noStore(403);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return noStore(413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return noStore(413);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return noStore(400);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return noStore(400);
  const keys = Object.keys(value);
  if (keys.length !== 3 || !keys.every((key) => ["event", "locale", "page"].includes(key))) return noStore(400);
  const candidate = value as { event?: string; locale?: string; page?: string };
  const recorded = trackPublicSiteEvent({
    event: candidate.event as ProductEventName,
    locale: candidate.locale ?? "",
    page: candidate.page as "landing" | "lawyers" | "video" | "legal" | "knowledge" | "other",
  });
  return noStore(recorded ? 204 : 400);
}
