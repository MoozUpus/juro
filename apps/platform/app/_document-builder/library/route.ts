import { legacyRedirect } from "./redirect";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return legacyRedirect(request, "/document-builder", ["lang", "q", "category", "status", "resume"]);
}
