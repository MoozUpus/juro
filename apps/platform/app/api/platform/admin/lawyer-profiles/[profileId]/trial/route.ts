import { z } from "zod";
import { parseJsonRequest } from "../../../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../../../lib/document-builder/storage/runtime";

type Context = { params: Promise<{ profileId: string }> };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("extend"), days: z.number().int().min(1).max(365), reason: z.string().trim().min(3).max(2_000) }).strict(),
  z.object({ action: z.literal("set_mode"), mode: z.enum(["stay_published", "limit_new_requests", "hide_profile"]), reason: z.string().trim().min(3).max(2_000) }).strict(),
]);

async function postTrial(request: Request, context: Context) {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "lawyer.profiles.moderate", { freshMfaWithinMs: 15 * 60 * 1_000 });
  const profileId = z.string().uuid().safeParse((await context.params).profileId);
  if (!profileId.success) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const parsed = await parseJsonRequest(request, schema, 3_072);
  if (!parsed.ok) return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
  const db = requireD1();
  const row = await db.prepare(
    `SELECT t.id,t.ends_at AS endsAt,t.status,t.post_expiry_mode AS postExpiryMode,
      p.user_id AS userId,u.default_workspace_id AS workspaceId
     FROM lawyer_trials t JOIN lawyer_profiles p ON p.id=t.lawyer_profile_id
     JOIN user_profiles u ON u.id=p.user_id WHERE p.id=? LIMIT 1`,
  ).bind(profileId.data).first<{ id: string; endsAt: string; status: string; postExpiryMode: string; userId: string; workspaceId: string }>();
  if (!row?.workspaceId) return Response.json({ code: "TRIAL_UNAVAILABLE" }, { status: 404 });
  const now = new Date();
  const at = now.toISOString();
  const nextEndsAt = parsed.data.action === "extend"
    ? new Date(Math.max(Date.parse(row.endsAt), now.getTime()) + parsed.data.days * 86_400_000).toISOString()
    : row.endsAt;
  const nextMode = parsed.data.action === "set_mode" ? parsed.data.mode : row.postExpiryMode;
  const results = await db.batch([
    parsed.data.action === "extend"
      ? db.prepare(
        `UPDATE lawyer_trials SET ends_at=?,status='extended',reminder_30_sent_at=NULL,
          reminder_7_sent_at=NULL,reminder_1_sent_at=NULL,reminder_expired_sent_at=NULL,updated_at=?
         WHERE id=? AND ends_at=?`,
      ).bind(nextEndsAt, at, row.id, row.endsAt)
      : db.prepare(
        "UPDATE lawyer_trials SET post_expiry_mode=?,updated_at=? WHERE id=? AND post_expiry_mode=?",
      ).bind(nextMode, at, row.id, row.postExpiryMode),
    db.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       SELECT ?,?,?,'lawyer_trial',?,?,?,?
       WHERE EXISTS (SELECT 1 FROM lawyer_trials WHERE id=? AND ends_at=? AND post_expiry_mode=?)`,
    ).bind(
      crypto.randomUUID(), row.workspaceId, staff.userId, row.id,
      parsed.data.action === "extend" ? "lawyer_trial_extended" : "lawyer_trial_post_expiry_mode_changed",
      JSON.stringify({ previousEndsAt: row.endsAt, nextEndsAt, previousMode: row.postExpiryMode, nextMode, reason: parsed.data.reason }),
      at, row.id, nextEndsAt, nextMode,
    ),
  ]);
  if (results.some((result) => Number(result.meta.changes ?? 0) !== 1)) return Response.json({ code: "TRIAL_STATE_CONFLICT" }, { status: 409 });
  return Response.json({ ok: true, endsAt: nextEndsAt, postExpiryMode: nextMode }, { headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const POST = withPlatformStaffErrors(postTrial);
