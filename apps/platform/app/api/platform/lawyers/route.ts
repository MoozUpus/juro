import { requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";

export const GET = withApiErrors(async function GET() {
  await requireApiUser();
  const rows = await requireD1().prepare(
    `SELECT id,display_name AS displayName,specialties_json AS specialtiesJson,languages_json AS languagesJson
     FROM lawyer_profiles
     WHERE status='public_approved' AND public_approved_at IS NOT NULL
     ORDER BY display_name COLLATE NOCASE LIMIT 100`,
  ).all<Record<string, unknown>>();
  return Response.json({
    lawyers: rows.results.map((row) => ({
      id: String(row.id),
      displayName: String(row.displayName),
      specialties: safeStringList(row.specialtiesJson),
      languages: safeStringList(row.languagesJson),
    })),
  }, { headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
});

function safeStringList(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string").slice(0, 20) : [];
  } catch { return []; }
}
