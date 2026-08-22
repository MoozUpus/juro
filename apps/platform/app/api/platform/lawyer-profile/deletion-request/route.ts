import { z } from "zod";
import { parseJsonRequest } from "../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

const requestSchema = z.object({
  locale: z.enum(["ru", "uz"]),
  reason: z.string().trim().min(3).max(1_000).optional(),
  confirmation: z.literal(true),
}).strict();

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

async function ownProfile(userId: string) {
  return requireD1().prepare(
    "SELECT id FROM lawyer_profiles WHERE user_id=? LIMIT 1",
  ).bind(userId).first<{ id: string }>();
}

async function latest(profileId: string) {
  return requireD1().prepare(
    `SELECT id,status,reason,decision_reason AS decisionReason,requested_at AS requestedAt,
      reviewed_at AS reviewedAt,updated_at AS updatedAt
     FROM lawyer_profile_deletion_requests WHERE lawyer_profile_id=?
     ORDER BY requested_at DESC,id DESC LIMIT 1`,
  ).bind(profileId).first();
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const profile = await ownProfile(user.id);
  if (!profile) return response({ code: "PROFILE_UNAVAILABLE" }, 404);
  return response({ deletionRequest: await latest(profile.id) ?? null });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const parsed = await parseJsonRequest(request, requestSchema, 2_048);
  if (!parsed.ok) return response({ code: "INVALID_INPUT" }, parsed.error === "payload_too_large" ? 413 : 400);
  const profile = await ownProfile(user.id);
  if (!profile) return response({ code: "PROFILE_UNAVAILABLE" }, 404);
  const open = await requireD1().prepare(
    "SELECT id FROM lawyer_profile_deletion_requests WHERE lawyer_profile_id=? AND status='requested' LIMIT 1",
  ).bind(profile.id).first();
  if (open) return response({ code: "DELETION_REQUEST_ALREADY_OPEN" }, 409);

  const workspace = await workspaceForUser(user);
  const now = isoNow();
  const id = crypto.randomUUID();
  const ru = parsed.data.locale === "ru";
  const results = await requireD1().batch([
    requireD1().prepare(
      `INSERT INTO lawyer_profile_deletion_requests
       (id,lawyer_profile_id,requested_by_user_id,status,reason,requested_at,created_at,updated_at)
       VALUES (?,?,?,'requested',?,?,?,?)`,
    ).bind(id, profile.id, user.id, parsed.data.reason ?? null, now, now, now),
    requireD1().prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       SELECT ?,?,?,'lawyer_profile_deletion_request',?,'lawyer_profile_deletion_requested',?,?
       WHERE EXISTS (SELECT 1 FROM lawyer_profile_deletion_requests WHERE id=? AND status='requested')`,
    ).bind(crypto.randomUUID(), workspace.id, user.id, id, JSON.stringify({ lawyerProfileId: profile.id, hasReason: Boolean(parsed.data.reason) }), now, id),
    requireD1().prepare(
      `INSERT INTO notifications
       (id,workspace_id,user_id,document_id,target_type,target_id,type,title,body,read_at,created_at)
       SELECT ?,?,?,NULL,'lawyer_profile_deletion',?,'lawyer_profile_status',?,?,NULL,?
       WHERE EXISTS (SELECT 1 FROM lawyer_profile_deletion_requests WHERE id=? AND status='requested')`,
    ).bind(
      crypto.randomUUID(), workspace.id, user.id, id,
      ru ? "Запрос на удаление профиля отправлен" : "Profilni o‘chirish so‘rovi yuborildi",
      ru ? "Профиль останется доступным до решения администратора. Статус запроса появится в настройках профиля." : "Administrator qaroriga qadar profil mavjud bo‘lib qoladi. So‘rov holati profil sozlamalarida ko‘rinadi.",
      now, id,
    ),
    requireD1().prepare(
      `INSERT INTO notifications
       (id,workspace_id,user_id,document_id,target_type,target_id,type,title,body,read_at,created_at)
       SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),
         u.default_workspace_id,a.user_id,NULL,'admin_lawyer_profile_deletion',?,'lawyer_profile_deletion_requested',?,?,NULL,?
       FROM platform_staff_assignments a JOIN user_profiles u ON u.id=a.user_id
       WHERE a.role='administrator' AND a.granted_at<=? AND a.expires_at>?
         AND (a.revoked_at IS NULL OR a.revoked_at>?) AND u.default_workspace_id IS NOT NULL`,
    ).bind(
      id,
      "Новый запрос на удаление профиля / Profilni o‘chirish uchun yangi so‘rov",
      "Откройте конкретный запрос и примите контролируемое решение / So‘rovni ochib, nazoratli qaror qabul qiling.",
      now,
      now,
      now,
      now,
    ),
  ]);
  if (results.slice(0, 3).some((result) => Number(result.meta.changes ?? 0) !== 1)) return response({ code: "DELETION_REQUEST_CONFLICT" }, 409);
  return response({ deletionRequest: await latest(profile.id) }, 201);
});

export const DELETE = withApiErrors(async function DELETE(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const profile = await ownProfile(user.id);
  if (!profile) return response({ code: "PROFILE_UNAVAILABLE" }, 404);
  const now = isoNow();
  const result = await requireD1().prepare(
    `UPDATE lawyer_profile_deletion_requests SET status='cancelled',updated_at=?
     WHERE lawyer_profile_id=? AND requested_by_user_id=? AND status='requested'`,
  ).bind(now, profile.id, user.id).run();
  if (Number(result.meta.changes ?? 0) !== 1) return response({ code: "DELETION_REQUEST_UNAVAILABLE" }, 409);
  return response({ deletionRequest: await latest(profile.id) });
});
