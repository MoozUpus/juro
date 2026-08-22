import { z } from "zod";
import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

type Context = { params: Promise<{ requestId: string }> };

const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(3).max(2_000),
  locale: z.enum(["ru", "uz"]),
}).strict();

type RequestRow = {
  id: string;
  lawyerProfileId: string;
  userId: string;
  workspaceId: string;
  userLocale: "ru" | "uz";
  profileStatus: string;
  marketplaceStatus: string;
  profileRevision: number;
};

async function patchDeletionRequest(request: Request, context: Context) {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "lawyer.profiles.moderate", { freshMfaWithinMs: 15 * 60 * 1_000 });
  const requestId = z.string().uuid().safeParse((await context.params).requestId);
  if (!requestId.success) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const parsed = await parseJsonRequest(request, decisionSchema, 3_072);
  if (!parsed.ok) return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
  const db = requireD1();
  const row = await db.prepare(
    `SELECT d.id,d.lawyer_profile_id AS lawyerProfileId,d.requested_by_user_id AS userId,
      u.default_workspace_id AS workspaceId,CASE WHEN u.locale='uz' THEN 'uz' ELSE 'ru' END AS userLocale,
      p.status AS profileStatus,p.marketplace_status AS marketplaceStatus,p.profile_revision AS profileRevision
     FROM lawyer_profile_deletion_requests d
     JOIN lawyer_profiles p ON p.id=d.lawyer_profile_id
     JOIN user_profiles u ON u.id=d.requested_by_user_id
     WHERE d.id=? AND d.status='requested' LIMIT 1`,
  ).bind(requestId.data).first<RequestRow>();
  if (!row?.workspaceId) return Response.json({ code: "DELETION_REQUEST_UNAVAILABLE" }, { status: 409 });

  const now = new Date().toISOString();
  const ru = row.userLocale === "ru";
  const needsArchive = parsed.data.decision === "approved"
    && !["suspended", "blocked", "archived"].includes(row.marketplaceStatus);
  const auditAction = parsed.data.decision === "approved"
    ? "lawyer_profile_deletion_approved"
    : "lawyer_profile_deletion_rejected";
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE lawyer_profile_deletion_requests
       SET status=?,decision_reason=?,reviewed_by_user_id=?,reviewed_at=?,updated_at=?
       WHERE id=? AND status='requested'`,
    ).bind(parsed.data.decision, parsed.data.reason, staff.userId, now, now, row.id),
  ];

  let lifecycleEventId: string | null = null;
  if (needsArchive) {
    lifecycleEventId = crypto.randomUUID();
    statements.push(
      db.prepare(
        `INSERT INTO lawyer_profile_lifecycle_events (
          id,lawyer_profile_id,from_profile_revision,to_profile_revision,actor_user_id,action,reason,
          from_profile_status,to_profile_status,from_marketplace_status,to_marketplace_status,created_at
        ) SELECT ?,?,?,?,?, 'archive',?,?,?,?, 'archived',?
        WHERE EXISTS (
          SELECT 1 FROM lawyer_profile_deletion_requests
          WHERE id=? AND status='approved' AND reviewed_by_user_id=? AND reviewed_at=?
        ) AND EXISTS (
          SELECT 1 FROM lawyer_profiles WHERE id=? AND profile_revision=? AND status=? AND marketplace_status=?
        )`,
      ).bind(
        lifecycleEventId, row.lawyerProfileId, row.profileRevision, row.profileRevision, staff.userId,
        parsed.data.reason, row.profileStatus, "pending", row.marketplaceStatus, now,
        row.id, staff.userId, now,
        row.lawyerProfileId, row.profileRevision, row.profileStatus, row.marketplaceStatus,
      ),
    );
  }

  statements.push(
    db.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       SELECT ?,?,?,'lawyer_profile_deletion_request',?,?,?,?
       WHERE EXISTS (
         SELECT 1 FROM lawyer_profile_deletion_requests
         WHERE id=? AND status=? AND reviewed_by_user_id=? AND reviewed_at=?
       )`,
    ).bind(
      crypto.randomUUID(), row.workspaceId, staff.userId, row.id, auditAction,
      JSON.stringify({ lawyerProfileId: row.lawyerProfileId, previousMarketplaceStatus: row.marketplaceStatus, archived: needsArchive }),
      now, row.id, parsed.data.decision, staff.userId, now,
    ),
    db.prepare(
      `INSERT INTO notifications
       (id,workspace_id,user_id,document_id,target_type,target_id,type,title,body,read_at,created_at)
       SELECT ?,?,?,NULL,'lawyer_profile_deletion',?,'lawyer_profile_status',?,?,NULL,?
       WHERE EXISTS (
         SELECT 1 FROM lawyer_profile_deletion_requests
         WHERE id=? AND status=? AND reviewed_by_user_id=? AND reviewed_at=?
       )`,
    ).bind(
      crypto.randomUUID(), row.workspaceId, row.userId, row.id,
      parsed.data.decision === "approved"
        ? (ru ? "Удаление профиля подтверждено" : "Profilni o‘chirish tasdiqlandi")
        : (ru ? "Запрос на удаление профиля отклонён" : "Profilni o‘chirish so‘rovi rad etildi"),
      parsed.data.decision === "approved"
        ? (ru ? "Публичный профиль архивирован. История решений сохранена для безопасности и аудита." : "Ochiq profil arxivlandi. Qarorlar tarixi xavfsizlik va audit uchun saqlandi.")
        : parsed.data.reason,
      now, row.id, parsed.data.decision, staff.userId, now,
    ),
  );

  if (needsArchive && lifecycleEventId) {
    statements.push(
      db.prepare(
        `UPDATE lawyer_profiles
         SET status='pending',marketplace_status='archived',accepting_new_requests=0,
           public_approved_at=NULL,updated_at=?
         WHERE id=? AND profile_revision=? AND status=? AND marketplace_status=?
           AND EXISTS (SELECT 1 FROM lawyer_profile_lifecycle_events WHERE id=?)`,
      ).bind(now, row.lawyerProfileId, row.profileRevision, row.profileStatus, row.marketplaceStatus, lifecycleEventId),
    );
  }

  const results = await db.batch(statements);
  if (results.some((result) => Number(result.meta.changes ?? 0) !== 1)) {
    return Response.json({ code: "DELETION_REQUEST_CONFLICT" }, { status: 409 });
  }
  return Response.json({ ok: true, status: parsed.data.decision, profileArchived: needsArchive }, {
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

export const PATCH = withPlatformStaffErrors(patchDeletionRequest);
