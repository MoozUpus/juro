import { z } from "zod";
import {
  assertSafeWrite,
  requireApiUser,
  withApiErrors,
} from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";

const consultationInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("propose"),
    requestId: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    format: z.enum(["video", "phone", "office"]),
    internalNote: z.string().trim().max(1_000).optional(),
  }),
  z.object({
    action: z.enum(["confirm", "start", "cancel"]),
    requestId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("complete"),
    requestId: z.string().uuid(),
    resultNote: z.string().trim().min(1).max(4_000),
  }),
]);

type Handoff = {
  workspaceId: string;
  caseId: string;
  clientUserId: string;
  lawyerProfileId: string;
  lawyerUserId: string;
  profileStatus: string;
  marketplaceStatus: string;
  grantId: string | null;
};

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

async function handoffForRequest(requestId: string): Promise<Handoff | null> {
  const now = new Date().toISOString();
  return requireD1()
    .prepare(
      `SELECT r.workspace_id AS workspaceId,r.case_id AS caseId,r.requester_user_id AS clientUserId,
      p.id AS lawyerProfileId,p.user_id AS lawyerUserId,p.status AS profileStatus,
      p.marketplace_status AS marketplaceStatus,g.id AS grantId
     FROM lawyer_requests r
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id
     LEFT JOIN lawyer_access_grants g ON g.lawyer_request_id=r.id AND g.lawyer_user_id=p.user_id
       AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?)
     WHERE r.id=? LIMIT 1`,
    )
    .bind(now, requestId)
    .first<Handoff>();
}

export const GET = withApiErrors(async function GET(request: Request) {
  const user = await requireApiUser();
  const requestId =
    new URL(request.url).searchParams.get("requestId")?.trim() || null;
  if (requestId && !z.string().uuid().safeParse(requestId).success) {
    return response(
      {
        code: "INVALID_REQUEST_ID",
        error: "Некорректная заявка / Noto‘g‘ri so‘rov.",
      },
      400,
    );
  }
  const account = await requireD1()
    .prepare(
      "SELECT account_type AS accountType FROM user_profiles WHERE id=? LIMIT 1",
    )
    .bind(user.id)
    .first<{ accountType: string }>();
  const isLawyer = account?.accountType === "lawyer";
  const rows = await requireD1()
    .prepare(
      `SELECT c.id,c.lawyer_request_id AS requestId,c.case_id AS caseId,c.starts_at AS startsAt,
      c.ends_at AS endsAt,c.timezone,c.format,c.status,
      CASE WHEN ?=1 THEN c.internal_note ELSE NULL END AS internalNote,
      c.result_note AS resultNote,p.display_name AS lawyerName,u.full_name AS clientName,
      cs.title AS caseTitle,c.updated_at AS updatedAt
     FROM lawyer_consultations c
     JOIN lawyer_profiles p ON p.id=c.lawyer_profile_id
     JOIN user_profiles u ON u.id=c.client_user_id
     JOIN cases cs ON cs.id=c.case_id
     WHERE ${isLawyer ? "p.user_id=?" : "c.client_user_id=?"}
       AND (? IS NULL OR c.lawyer_request_id=?)
     ORDER BY c.starts_at ASC LIMIT 100`,
    )
    .bind(isLawyer ? 1 : 0, user.id, requestId, requestId)
    .all();
  return response({ consultations: rows.results });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return response(
      {
        code: "INVALID_INPUT",
        error: "Некорректные данные / Noto‘g‘ri ma’lumot.",
      },
      400,
    );
  }
  const parsed = consultationInput.safeParse(raw);
  if (!parsed.success) {
    return response(
      {
        code: "INVALID_INPUT",
        error:
          "Проверьте дату и формат консультации / Sana va formatni tekshiring.",
      },
      400,
    );
  }
  const handoff = await handoffForRequest(parsed.data.requestId);
  if (!handoff)
    return response(
      {
        code: "REQUEST_UNAVAILABLE",
        error: "Заявка недоступна / So‘rov mavjud emas.",
      },
      404,
    );
  const isLawyer = handoff.lawyerUserId === user.id;
  const isClient = handoff.clientUserId === user.id;
  if (!isLawyer && !isClient)
    return response(
      {
        code: "REQUEST_UNAVAILABLE",
        error: "Заявка недоступна / So‘rov mavjud emas.",
      },
      404,
    );

  const now = new Date().toISOString();
  const db = requireD1();
  const existing = await db
    .prepare(
      "SELECT id,status FROM lawyer_consultations WHERE lawyer_request_id=? LIMIT 1",
    )
    .bind(parsed.data.requestId)
    .first<{ id: string; status: string }>();

  if (parsed.data.action === "propose") {
    if (
      !isLawyer ||
      !handoff.grantId ||
      handoff.profileStatus !== "public_approved" ||
      handoff.marketplaceStatus !== "public_approved"
    ) {
      return response(
        {
          code: "CONSULTATION_FORBIDDEN",
          error:
            "Предложение доступно только одобренному юристу с активным доступом к делу.",
        },
        403,
      );
    }
    const startsAt = new Date(parsed.data.startsAt).toISOString();
    const endsAt = new Date(parsed.data.endsAt).toISOString();
    const duration = Date.parse(endsAt) - Date.parse(startsAt);
    if (
      startsAt <= now ||
      duration < 15 * 60_000 ||
      duration > 8 * 60 * 60_000
    ) {
      return response(
        {
          code: "INVALID_CONSULTATION_TIME",
          error:
            "Выберите будущее время и длительность от 15 минут до 8 часов.",
        },
        400,
      );
    }
    const overlap = await db
      .prepare(
        `SELECT id FROM lawyer_consultations
       WHERE lawyer_profile_id=? AND id<>? AND status IN ('proposed','confirmed','in_progress')
         AND starts_at<? AND ends_at>? LIMIT 1`,
      )
      .bind(handoff.lawyerProfileId, existing?.id || "", endsAt, startsAt)
      .first<{ id: string }>();
    if (overlap)
      return response(
        {
          code: "CONSULTATION_OVERLAP",
          error: "Это время пересекается с другой консультацией.",
        },
        409,
      );
    const id = existing?.id || crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          `INSERT INTO lawyer_consultations
          (id,lawyer_request_id,lawyer_profile_id,client_user_id,case_id,starts_at,ends_at,timezone,format,status,internal_note,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,'Asia/Tashkent',?,'proposed',?,?,?)
         ON CONFLICT(lawyer_request_id) DO UPDATE SET starts_at=excluded.starts_at,ends_at=excluded.ends_at,
           timezone=excluded.timezone,format=excluded.format,status='proposed',internal_note=excluded.internal_note,
           result_note=NULL,updated_at=excluded.updated_at`,
        )
        .bind(
          id,
          parsed.data.requestId,
          handoff.lawyerProfileId,
          handoff.clientUserId,
          handoff.caseId,
          startsAt,
          endsAt,
          parsed.data.format,
          parsed.data.internalNote || null,
          now,
          now,
        ),
      db
        .prepare(
          `INSERT INTO workspace_audit_events
          (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'lawyer_consultation',?,'lawyer_consultation_proposed',?,?)`,
        )
        .bind(
          crypto.randomUUID(),
          handoff.workspaceId,
          user.id,
          id,
          JSON.stringify({
            requestId: parsed.data.requestId,
            startsAt,
            endsAt,
            format: parsed.data.format,
          }),
          now,
        ),
      db.prepare(
        `INSERT INTO case_events
          (id,case_id,actor_user_id,event_type,metadata_json,created_at)
         VALUES (?,?,?,'lawyer_consultation_proposed',?,?)`,
      ).bind(
        crypto.randomUUID(),
        handoff.caseId,
        user.id,
        JSON.stringify({ requestId: parsed.data.requestId, consultationId: id }),
        now,
      ),
      db.prepare(
        `INSERT INTO notifications
          (id,workspace_id,user_id,document_id,target_type,target_id,type,title,body,read_at,created_at)
         VALUES (?,(SELECT default_workspace_id FROM user_profiles WHERE id=?),?,NULL,
           'lawyer_consultation',?,'lawyer_consultation_proposed',?,?,NULL,?)`,
      ).bind(
        crypto.randomUUID(),
        handoff.clientUserId,
        handoff.clientUserId,
        id,
        "Юрист предложил время консультации / Yurist maslahat vaqtini taklif qildi",
        startsAt,
        now,
      ),
    ]);
    return response({ ok: true, id, status: "proposed" }, existing ? 200 : 201);
  }

  if (!existing)
    return response(
      {
        code: "CONSULTATION_NOT_FOUND",
        error: "Консультация не найдена / Konsultatsiya topilmadi.",
      },
      404,
    );
  const transition = parsed.data.action;
  if (
    transition === "confirm" &&
    (!isClient || existing.status !== "proposed")
  ) {
    return response(
      {
        code: "INVALID_CONSULTATION_TRANSITION",
        error: "Подтвердить предложенное время может только клиент.",
      },
      409,
    );
  }
  if (
    transition === "start" &&
    (!isLawyer || existing.status !== "confirmed")
  ) {
    return response(
      {
        code: "INVALID_CONSULTATION_TRANSITION",
        error: "Начать можно только подтверждённую консультацию.",
      },
      409,
    );
  }
  if (
    transition === "cancel" &&
    !["proposed", "confirmed"].includes(existing.status)
  ) {
    return response(
      {
        code: "INVALID_CONSULTATION_TRANSITION",
        error: "Эту консультацию уже нельзя отменить.",
      },
      409,
    );
  }
  if (
    transition === "complete" &&
    (!isLawyer || !["confirmed", "in_progress"].includes(existing.status))
  ) {
    return response(
      {
        code: "INVALID_CONSULTATION_TRANSITION",
        error: "Завершить можно только подтверждённую консультацию.",
      },
      409,
    );
  }
  const status =
    transition === "confirm"
      ? "confirmed"
      : transition === "start"
        ? "in_progress"
        : transition === "cancel"
          ? "cancelled"
          : "completed";
  const recipientUserId = isLawyer ? handoff.clientUserId : handoff.lawyerUserId;
  await db.batch([
    db
      .prepare(
        "UPDATE lawyer_consultations SET status=?,result_note=CASE WHEN ?='completed' THEN ? ELSE result_note END,updated_at=? WHERE id=?",
      )
      .bind(
        status,
        status,
        parsed.data.action === "complete" ? parsed.data.resultNote : null,
        now,
        existing.id,
      ),
    db
      .prepare(
        `INSERT INTO workspace_audit_events
        (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'lawyer_consultation',?,?,?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        handoff.workspaceId,
        user.id,
        existing.id,
        `lawyer_consultation_${status}`,
        JSON.stringify({ requestId: parsed.data.requestId }),
        now,
      ),
    db.prepare(
      `INSERT INTO case_events
        (id,case_id,actor_user_id,event_type,metadata_json,created_at)
       VALUES (?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      handoff.caseId,
      user.id,
      `lawyer_consultation_${status}`,
      JSON.stringify({ requestId: parsed.data.requestId, consultationId: existing.id }),
      now,
    ),
    db.prepare(
      `INSERT INTO notifications
        (id,workspace_id,user_id,document_id,target_type,target_id,type,title,body,read_at,created_at)
       VALUES (?,(SELECT default_workspace_id FROM user_profiles WHERE id=?),?,NULL,'lawyer_consultation',?,?,?,?,NULL,?)`,
    ).bind(
      crypto.randomUUID(),
      recipientUserId,
      recipientUserId,
      existing.id,
      `lawyer_consultation_${status}`,
      `Консультация: ${status} / Konsultatsiya: ${status}`,
      parsed.data.action === "complete" ? parsed.data.resultNote : "",
      now,
    ),
  ]);
  return response({ ok: true, id: existing.id, status });
});
