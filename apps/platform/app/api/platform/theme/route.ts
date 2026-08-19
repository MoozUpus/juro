import { parseJsonRequest } from "../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { z } from "zod";

const themeInput = z.object({ theme: z.enum(["system", "light", "dark"]) }).strict();

function response(body: unknown, status = 200, theme?: "system" | "light" | "dark") {
  const headers = new Headers({ "cache-control": "private, no-store", pragma: "no-cache" });
  if (theme) headers.append("set-cookie", `juro_theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax; Domain=.juro.uz; Secure`);
  return Response.json(body, { status, headers });
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const row = await requireD1().prepare(
    "SELECT theme_preference AS theme FROM user_profiles WHERE id=? LIMIT 1",
  ).bind(user.id).first<{ theme: "system" | "light" | "dark" }>();
  const theme = row?.theme === "light" || row?.theme === "dark" ? row.theme : "system";
  return response({ theme }, 200, theme);
});

export const PATCH = withApiErrors(async function PATCH(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const parsed = await parseJsonRequest(request, themeInput, 256);
  if (!parsed.ok) return response({ code: "INVALID_THEME", error: "Проверьте тему / Mavzuni tekshiring." }, 400);
  await requireD1().prepare(
    "UPDATE user_profiles SET theme_preference=?,updated_at=? WHERE id=?",
  ).bind(parsed.data.theme, new Date().toISOString(), user.id).run();
  return response({ theme: parsed.data.theme }, 200, parsed.data.theme);
});
