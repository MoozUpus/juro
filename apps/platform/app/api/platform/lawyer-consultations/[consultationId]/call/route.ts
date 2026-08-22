import { z } from "zod";
import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../../../lib/document-builder/storage/runtime";
import { generateLawyerCallIceServers, lawyerCallParticipant } from "../../../../../../lib/platform/lawyer-call";

type Context = { params: Promise<{ consultationId: string }> };
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prepare"),
    deviceReadiness: z.object({ camera: z.boolean(), microphone: z.boolean(), speaker: z.boolean(), cameraLabel: z.string().max(200).optional(), microphoneLabel: z.string().max(200).optional() }).strict(),
  }).strict(),
  z.object({ action: z.enum(["join", "heartbeat", "leave", "end"]), reconnect: z.boolean().optional() }).strict(),
]);

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

async function participantForRequest(context: Context, userId: string) {
  const parsed = z.string().uuid().safeParse((await context.params).consultationId);
  if (!parsed.success) return null;
  return lawyerCallParticipant(requireD1(), parsed.data, userId);
}

async function getCall(_request: Request, context: Context) {
  const user = await requireApiUser();
  const participant = await participantForRequest(context, user.id);
  if (!participant) return response({ code: "CALL_NOT_FOUND" }, 404);
  const room = await requireD1().prepare(
    `SELECT r.id,r.provider,r.status,r.started_at AS startedAt,r.ended_at AS endedAt,r.updated_at AS updatedAt,
      (SELECT joined_at FROM lawyer_call_participants WHERE room_id=r.id AND role='lawyer') AS lawyerJoinedAt,
      (SELECT joined_at FROM lawyer_call_participants WHERE room_id=r.id AND role='client') AS clientJoinedAt,
      (SELECT last_seen_at FROM lawyer_call_participants WHERE room_id=r.id AND role=?) AS peerLastSeenAt
     FROM lawyer_call_rooms r WHERE r.consultation_id=? LIMIT 1`,
  ).bind(participant.role === "lawyer" ? "client" : "lawyer", participant.consultationId).first();
  return response({ room: room ?? null, consultation: participant });
}

async function postCall(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const participant = await participantForRequest(context, user.id);
  if (!participant) return response({ code: "CALL_NOT_FOUND" }, 404);
  if (participant.format !== "video") return response({ code: "CALL_FORMAT_UNAVAILABLE" }, 409);
  const parsed = await parseJsonRequest(request, schema, 4_096);
  if (!parsed.ok) return response({ code: "INVALID_INPUT" }, 400);
  const db = requireD1();
  const now = new Date().toISOString();
  const callStateAvailable = ["confirmed", "in_progress"].includes(participant.consultationStatus);

  if (parsed.data.action === "prepare") {
    if (!callStateAvailable) return response({ code: "CALL_STATE_UNAVAILABLE" }, 409);
    const ice = await generateLawyerCallIceServers(runtimeEnv());
    const candidateId = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO lawyer_call_rooms (id,consultation_id,provider,status,created_at,updated_at)
       VALUES (?,?,?,'waiting',?,?) ON CONFLICT(consultation_id) DO NOTHING`,
    ).bind(candidateId, participant.consultationId, ice.provider, now, now).run();
    const room = await db.prepare("SELECT id,status FROM lawyer_call_rooms WHERE consultation_id=? LIMIT 1")
      .bind(participant.consultationId).first<{ id: string; status: string }>();
    if (!room || room.status === "ended") return response({ code: "CALL_ENDED" }, 409);
    const readiness = JSON.stringify(parsed.data.deviceReadiness);
    await db.batch([
      db.prepare(
        `INSERT INTO lawyer_call_participants (room_id,user_id,role,device_readiness_json,prepared_at,last_seen_at)
         VALUES (?,?,?,?,?,?) ON CONFLICT(room_id,user_id) DO UPDATE SET
         role=excluded.role,device_readiness_json=excluded.device_readiness_json,prepared_at=excluded.prepared_at,
         last_seen_at=excluded.last_seen_at,left_at=NULL`,
      ).bind(room.id, user.id, participant.role, readiness, now, now),
      db.prepare("INSERT INTO lawyer_call_events (id,room_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'prepared',?,?)")
        .bind(crypto.randomUUID(), room.id, user.id, readiness, now),
      db.prepare(
        "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'lawyer_call_room',?,'lawyer_call_prepared',?,?)",
      ).bind(crypto.randomUUID(), participant.workspaceId, user.id, room.id, JSON.stringify({ consultationId: participant.consultationId, role: participant.role, provider: ice.provider, relayAvailable: ice.relayAvailable }), now),
    ]);
    return response({ roomId: room.id, role: participant.role, peerName: participant.role === "lawyer" ? participant.clientName : participant.lawyerName, ...ice });
  }

  const room = await db.prepare(
    `SELECT r.id,r.status,p.prepared_at AS preparedAt FROM lawyer_call_rooms r
     LEFT JOIN lawyer_call_participants p ON p.room_id=r.id AND p.user_id=?
     WHERE r.consultation_id=? LIMIT 1`,
  ).bind(user.id, participant.consultationId).first<{ id: string; status: string; preparedAt: string | null }>();
  if (!room?.preparedAt) return response({ code: "CALL_NOT_PREPARED" }, 409);
  if (room.status === "ended" && ["end", "heartbeat"].includes(parsed.data.action)) {
    await db.prepare(
      "UPDATE lawyer_call_participants SET left_at=COALESCE(left_at,?),last_seen_at=? WHERE room_id=? AND user_id=?",
    ).bind(now, now, room.id, user.id).run();
    return response({ ok: true, roomId: room.id, at: now, status: "ended" });
  }
  if (room.status === "ended") return response({ code: "CALL_ENDED" }, 409);
  if (!callStateAvailable) return response({ code: "CALL_STATE_UNAVAILABLE" }, 409);

  if (parsed.data.action === "heartbeat") {
    await db.prepare("UPDATE lawyer_call_participants SET last_seen_at=? WHERE room_id=? AND user_id=?")
      .bind(now, room.id, user.id).run();
    return response({ ok: true, at: now });
  }

  const eventType = parsed.data.action === "join" && parsed.data.reconnect ? "reconnected" : parsed.data.action === "join" ? "joined" : parsed.data.action === "leave" ? "left" : "ended";
  const statements: D1PreparedStatement[] = [];
  if (parsed.data.action === "join") {
    statements.push(
      db.prepare("UPDATE lawyer_call_participants SET joined_at=COALESCE(joined_at,?),last_seen_at=?,left_at=NULL WHERE room_id=? AND user_id=?").bind(now, now, room.id, user.id),
      db.prepare("UPDATE lawyer_call_rooms SET status='active',started_at=COALESCE(started_at,?),updated_at=? WHERE id=? AND status<>'ended'").bind(now, now, room.id),
    );
    if (participant.role === "lawyer" && participant.consultationStatus === "confirmed") {
      statements.push(db.prepare("UPDATE lawyer_consultations SET status='in_progress',updated_at=? WHERE id=? AND status='confirmed'").bind(now, participant.consultationId));
    }
  } else if (parsed.data.action === "leave") {
    statements.push(db.prepare("UPDATE lawyer_call_participants SET left_at=?,last_seen_at=? WHERE room_id=? AND user_id=?").bind(now, now, room.id, user.id));
  } else {
    statements.push(
      db.prepare("UPDATE lawyer_call_rooms SET status='ended',ended_at=?,ended_by_user_id=?,updated_at=? WHERE id=? AND status<>'ended'").bind(now, user.id, now, room.id),
      db.prepare("UPDATE lawyer_call_participants SET left_at=?,last_seen_at=? WHERE room_id=? AND user_id=?").bind(now, now, room.id, user.id),
      db.prepare("DELETE FROM lawyer_call_signals WHERE room_id=?").bind(room.id),
    );
  }
  statements.push(
    db.prepare("INSERT INTO lawyer_call_events (id,room_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), room.id, user.id, eventType, JSON.stringify({ role: participant.role }), now),
    db.prepare("INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'lawyer_call_room',?,?,?,?)")
      .bind(crypto.randomUUID(), participant.workspaceId, user.id, room.id, `lawyer_call_${eventType}`, JSON.stringify({ consultationId: participant.consultationId, role: participant.role }), now),
  );
  await db.batch(statements);
  return response({ ok: true, roomId: room.id, status: parsed.data.action === "end" ? "ended" : parsed.data.action === "join" ? "active" : room.status });
}

export const GET = withApiErrors(getCall);
export const POST = withApiErrors(postCall);
