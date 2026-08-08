import { parseJsonRequest } from "../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { notificationPreferencesSchema, optionalEmailPreferenceKeys } from "../../../../lib/platform/notification-preferences";
import { workspaceForUser } from "../../../../lib/platform/workspace";

const VERSION = "2026-08-02";
const headers = { "cache-control": "private, no-store", pragma: "no-cache" };
function response(body: unknown, status = 200) { return Response.json(body, { status, headers }); }

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const rows = await requireD1().prepare(
    `SELECT type,revoked_at AS revokedAt FROM consents
     WHERE user_id=? AND workspace_id IS NULL
       AND type IN ('marketing_email','weekly_case_summary','unfinished_document','comments','lawyer_request_updates')
     ORDER BY granted_at DESC, rowid DESC`,
  ).bind(user.id).all<{ type: string; revokedAt: string | null }>();
  const preferences = Object.fromEntries(optionalEmailPreferenceKeys.map((key) => [key, false])) as Record<typeof optionalEmailPreferenceKeys[number], boolean>;
  const resolved = new Set<string>();
  for (const row of rows.results) {
    if (!(row.type in preferences) || resolved.has(row.type)) continue;
    preferences[row.type as keyof typeof preferences] = row.revokedAt === null;
    resolved.add(row.type);
  }
  return response({ preferences });
});

export const PUT = withApiErrors(async function PUT(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const parsed = await parseJsonRequest(request, notificationPreferencesSchema, 2_048);
  if (!parsed.ok) return response({ code: "INVALID_INPUT", error: "Некорректные настройки уведомлений." }, 400);
  const now = isoNow(); const db = requireD1();
  const statements: D1PreparedStatement[] = [];
  for (const type of optionalEmailPreferenceKeys) {
    statements.push(db.prepare("UPDATE consents SET revoked_at=? WHERE user_id=? AND workspace_id IS NULL AND type=? AND revoked_at IS NULL").bind(now, user.id, type));
    if (parsed.data.preferences[type]) statements.push(db.prepare("INSERT INTO consents (id,user_id,workspace_id,type,version,scope_json,granted_at,revoked_at) VALUES (?,?,NULL,?,?,?, ?,NULL)").bind(crypto.randomUUID(), user.id, type, VERSION, JSON.stringify({ channel: "email", source: "settings" }), now));
  }
  statements.push(db.prepare("INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'notification_preferences',?,'notification_preferences_updated',?,?)").bind(crypto.randomUUID(), workspace.id, user.id, user.id, JSON.stringify({ types: optionalEmailPreferenceKeys }), now));
  await db.batch(statements);
  return response({ ok: true, preferences: parsed.data.preferences });
});
