import { z } from "zod";
import { parseJsonRequest } from "../../../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../../lib/document-builder/storage/runtime";
import { lawyerCallParticipant } from "../../../../../../../lib/platform/lawyer-call";

type Context = { params: Promise<{ consultationId: string }> };
const signalSchema = z.object({
  type: z.enum(["offer", "answer", "ice", "restart"]),
  payload: z.record(z.string(), z.unknown()),
}).strict();
function response(body: unknown, status = 200) { return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } }); }

async function contextFor(context: Context, userId: string) {
  const id = z.string().uuid().safeParse((await context.params).consultationId);
  if (!id.success) return null;
  const participant = await lawyerCallParticipant(requireD1(), id.data, userId);
  if (!participant) return null;
  const room = await requireD1().prepare(
    `SELECT r.id,r.status,p.prepared_at AS preparedAt FROM lawyer_call_rooms r
     JOIN lawyer_call_participants p ON p.room_id=r.id AND p.user_id=? WHERE r.consultation_id=? LIMIT 1`,
  ).bind(userId, id.data).first<{ id: string; status: string; preparedAt: string }>();
  return room ? { participant, room } : null;
}

async function getSignals(request: Request, context: Context) {
  const user = await requireApiUser();
  const call = await contextFor(context, user.id);
  if (!call) return response({ code: "CALL_NOT_PREPARED" }, 404);
  const params = new URL(request.url).searchParams;
  const after = params.get("after") || call.room.preparedAt;
  const afterId = params.get("afterId") || "";
  if (!z.string().datetime({ offset: true }).safeParse(after).success || (afterId && !z.string().uuid().safeParse(afterId).success)) return response({ code: "INVALID_CURSOR" }, 400);
  const now = new Date().toISOString();
  const rows = await requireD1().prepare(
    `SELECT id,signal_type AS type,payload_json AS payloadJson,created_at AS createdAt
     FROM lawyer_call_signals WHERE room_id=? AND recipient_user_id=? AND expires_at>?
       AND (created_at>? OR (created_at=? AND id>?)) ORDER BY created_at,id LIMIT 200`,
  ).bind(call.room.id, user.id, now, after, after, afterId).all<{ id: string; type: string; payloadJson: string; createdAt: string }>();
  return response({ signals: rows.results.map((row) => ({ id: row.id, type: row.type, payload: JSON.parse(row.payloadJson), createdAt: row.createdAt })) });
}

async function postSignal(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const call = await contextFor(context, user.id);
  if (!call) return response({ code: "CALL_NOT_PREPARED" }, 404);
  if (call.room.status === "ended") return response({ code: "CALL_ENDED" }, 409);
  const parsed = await parseJsonRequest(request, signalSchema, 36_000);
  if (!parsed.ok) return response({ code: "INVALID_SIGNAL" }, 400);
  const payloadJson = JSON.stringify(parsed.data.payload);
  if (payloadJson.length > 32_000) return response({ code: "SIGNAL_TOO_LARGE" }, 413);
  const createdAt = new Date().toISOString();
  const rateWindowStartsAt = new Date(Date.now() - 60_000).toISOString();
  const expiresAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  const id = crypto.randomUUID();
  const inserted = await requireD1().prepare(
    `INSERT INTO lawyer_call_signals
      (id,room_id,sender_user_id,recipient_user_id,signal_type,payload_json,created_at,expires_at)
     SELECT ?,?,?,?,?,?,?,?
     WHERE (SELECT count(*) FROM lawyer_call_signals
       WHERE room_id=? AND sender_user_id=? AND created_at>=?) < 480`,
  ).bind(
    id,
    call.room.id,
    user.id,
    call.participant.otherUserId,
    parsed.data.type,
    payloadJson,
    createdAt,
    expiresAt,
    call.room.id,
    user.id,
    rateWindowStartsAt,
  ).run();
  if (Number(inserted.meta.changes ?? 0) !== 1) {
    return response({ code: "SIGNAL_RATE_LIMITED" }, 429);
  }
  return response({ ok: true, id, createdAt }, 201);
}

export const GET = withApiErrors(getSignals);
export const POST = withApiErrors(postSignal);
