import { z } from "zod";
import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../../../lib/document-builder/storage/runtime";
import { lawyerCallParticipant } from "../../../../../../lib/platform/lawyer-call";
import { createLawyerCallProvider } from "../../../../../../lib/platform/lawyer-call-provider";

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
  const provider = createLawyerCallProvider(requireD1(), runtimeEnv());
  const room = await provider.getCallMetadata(
    participant.consultationId,
    participant.role === "lawyer" ? "client" : "lawyer",
  );
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
  const provider = createLawyerCallProvider(db, runtimeEnv());
  const now = new Date().toISOString();
  const callStateAvailable = ["confirmed", "in_progress"].includes(participant.consultationStatus);

  if (parsed.data.action === "prepare") {
    if (!callStateAvailable) return response({ code: "CALL_STATE_UNAVAILABLE" }, 409);
    const room = await provider.createRoom({
      participant,
      userId: user.id,
      deviceReadiness: parsed.data.deviceReadiness,
      now,
    });
    if (!room) return response({ code: "CALL_ENDED" }, 409);
    return response({ roomId: room.roomId, role: room.role, peerName: room.peerName, ...room.token });
  }

  const room = await provider.getRoomStatus(participant.consultationId, user.id);
  if (!room?.preparedAt) return response({ code: "CALL_NOT_PREPARED" }, 409);
  if (room.status === "ended" && ["end", "heartbeat"].includes(parsed.data.action)) {
    await provider.observeEndedRoom(room.id, user.id, now);
    return response({ ok: true, roomId: room.id, at: now, status: "ended" });
  }
  if (room.status === "ended") return response({ code: "CALL_ENDED" }, 409);
  if (!callStateAvailable) return response({ code: "CALL_STATE_UNAVAILABLE" }, 409);

  if (parsed.data.action === "heartbeat") {
    await provider.heartbeatRoom(room.id, user.id, now);
    return response({ ok: true, at: now });
  }

  const actionInput = { participant, roomId: room.id, userId: user.id, now };
  if (parsed.data.action === "join") {
    await provider.joinRoom({ ...actionInput, reconnect: Boolean(parsed.data.reconnect) });
  } else if (parsed.data.action === "leave") {
    await provider.leaveRoom(actionInput);
  } else {
    await provider.endRoom(actionInput);
  }
  return response({ ok: true, roomId: room.id, status: parsed.data.action === "end" ? "ended" : parsed.data.action === "join" ? "active" : room.status });
}

export const GET = withApiErrors(getCall);
export const POST = withApiErrors(postCall);
