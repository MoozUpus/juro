import { runtimeEnv } from "../../../lib/document-builder/storage/runtime";
import { dependencyHealthEnvironment } from "../../../lib/operations/dependency-health";
import { readPublicStatus } from "../../../lib/operations/system-status";

const publicHeaders = {
  "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
  "content-type": "application/json; charset=utf-8",
};

export async function GET(request: Request): Promise<Response> {
  const runtime = runtimeEnv();
  const db = runtime.DB;
  const locale = new URL(request.url).searchParams.get("lang") === "uz" ? "uz" : "ru";
  if (!db) {
    return Response.json(
      { code: "STATUS_TEMPORARILY_UNAVAILABLE", locale },
      { status: 503, headers: { ...publicHeaders, "cache-control": "public, max-age=0, s-maxage=5" } },
    );
  }
  try {
    return Response.json(await readPublicStatus({
      db,
      locale,
      environment: dependencyHealthEnvironment(runtime.APP_ENV),
    }), { headers: publicHeaders });
  } catch {
    return Response.json(
      { code: "STATUS_TEMPORARILY_UNAVAILABLE", locale },
      { status: 503, headers: { ...publicHeaders, "cache-control": "public, max-age=0, s-maxage=5" } },
    );
  }
}
