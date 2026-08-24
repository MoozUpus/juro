import type { BuilderRuntimeEnv } from "../document-builder/storage/runtime";
import {
  generateLawyerCallIceServers,
  type BrowserIceServer,
  type LawyerCallParticipant,
  type LawyerCallRole,
} from "./lawyer-call";

export type LawyerCallTransportProvider = "cloudflare_realtime_turn" | "cloudflare_stun_only";
export type LawyerCallRoomStatus = "waiting" | "active" | "ended";
export type LawyerCallDeviceReadiness = {
  camera: boolean;
  microphone: boolean;
  speaker: boolean;
  cameraLabel?: string;
  microphoneLabel?: string;
};
export type LawyerCallParticipantToken = {
  iceServers: BrowserIceServer[];
  relayAvailable: boolean;
  provider: LawyerCallTransportProvider;
};
export type LawyerCallRoomState = {
  id: string;
  status: LawyerCallRoomStatus;
  preparedAt: string | null;
};
export type LawyerCallMetadata = {
  id: string;
  provider: LawyerCallTransportProvider;
  status: LawyerCallRoomStatus;
  startedAt: string | null;
  endedAt: string | null;
  updatedAt: string;
  lawyerJoinedAt: string | null;
  clientJoinedAt: string | null;
  peerLastSeenAt: string | null;
};
export type PreparedLawyerCallRoom = {
  roomId: string;
  role: LawyerCallRole;
  peerName: string;
  token: LawyerCallParticipantToken;
};

type RoomActionInput = {
  participant: LawyerCallParticipant;
  roomId: string;
  userId: string;
  now: string;
};
type CreateRoomInput = Omit<RoomActionInput, "roomId"> & { deviceReadiness: LawyerCallDeviceReadiness };

export interface LawyerCallProvider {
  createParticipantToken(): Promise<LawyerCallParticipantToken>;
  createRoom(input: CreateRoomInput): Promise<PreparedLawyerCallRoom | null>;
  getRoomStatus(consultationId: string, userId: string): Promise<LawyerCallRoomState | null>;
  getCallMetadata(consultationId: string, peerRole: LawyerCallRole): Promise<LawyerCallMetadata | null>;
  joinRoom(input: RoomActionInput & { reconnect: boolean }): Promise<void>;
  leaveRoom(input: RoomActionInput): Promise<void>;
  endRoom(input: RoomActionInput): Promise<void>;
  heartbeatRoom(roomId: string, userId: string, now: string): Promise<void>;
  observeEndedRoom(roomId: string, userId: string, now: string): Promise<void>;
}

export class CloudflareRealtimeLawyerCallProvider implements LawyerCallProvider {
  constructor(
    private readonly db: D1Database,
    private readonly env: Pick<BuilderRuntimeEnv, "CLOUDFLARE_TURN_KEY_ID" | "CLOUDFLARE_TURN_KEY_API_TOKEN">,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async createParticipantToken(): Promise<LawyerCallParticipantToken> {
    return generateLawyerCallIceServers(this.env, this.fetcher);
  }

  async createRoom(input: CreateRoomInput): Promise<PreparedLawyerCallRoom | null> {
    const token = await this.createParticipantToken();
    const candidateId = crypto.randomUUID();
    await this.db.prepare(
      `INSERT INTO lawyer_call_rooms (id,consultation_id,provider,status,created_at,updated_at)
       VALUES (?,?,?,'waiting',?,?) ON CONFLICT(consultation_id) DO NOTHING`,
    ).bind(candidateId, input.participant.consultationId, token.provider, input.now, input.now).run();
    const room = await this.db.prepare(
      "SELECT id,status FROM lawyer_call_rooms WHERE consultation_id=? LIMIT 1",
    ).bind(input.participant.consultationId).first<{ id: string; status: LawyerCallRoomStatus }>();
    if (!room || room.status === "ended") return null;

    const readiness = JSON.stringify(input.deviceReadiness);
    await this.db.batch([
      this.db.prepare(
        `INSERT INTO lawyer_call_participants (room_id,user_id,role,device_readiness_json,prepared_at,last_seen_at)
         VALUES (?,?,?,?,?,?) ON CONFLICT(room_id,user_id) DO UPDATE SET
         role=excluded.role,device_readiness_json=excluded.device_readiness_json,prepared_at=excluded.prepared_at,
         last_seen_at=excluded.last_seen_at,left_at=NULL`,
      ).bind(room.id, input.userId, input.participant.role, readiness, input.now, input.now),
      this.db.prepare(
        "INSERT INTO lawyer_call_events (id,room_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'prepared',?,?)",
      ).bind(crypto.randomUUID(), room.id, input.userId, readiness, input.now),
      this.db.prepare(
        "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'lawyer_call_room',?,'lawyer_call_prepared',?,?)",
      ).bind(
        crypto.randomUUID(),
        input.participant.workspaceId,
        input.userId,
        room.id,
        JSON.stringify({
          consultationId: input.participant.consultationId,
          role: input.participant.role,
          provider: token.provider,
          relayAvailable: token.relayAvailable,
        }),
        input.now,
      ),
    ]);
    return {
      roomId: room.id,
      role: input.participant.role,
      peerName: input.participant.role === "lawyer" ? input.participant.clientName : input.participant.lawyerName,
      token,
    };
  }

  async getRoomStatus(consultationId: string, userId: string): Promise<LawyerCallRoomState | null> {
    return this.db.prepare(
      `SELECT r.id,r.status,p.prepared_at AS preparedAt FROM lawyer_call_rooms r
       LEFT JOIN lawyer_call_participants p ON p.room_id=r.id AND p.user_id=?
       WHERE r.consultation_id=? LIMIT 1`,
    ).bind(userId, consultationId).first<LawyerCallRoomState>();
  }

  async getCallMetadata(consultationId: string, peerRole: LawyerCallRole): Promise<LawyerCallMetadata | null> {
    return this.db.prepare(
      `SELECT r.id,r.provider,r.status,r.started_at AS startedAt,r.ended_at AS endedAt,r.updated_at AS updatedAt,
        (SELECT joined_at FROM lawyer_call_participants WHERE room_id=r.id AND role='lawyer') AS lawyerJoinedAt,
        (SELECT joined_at FROM lawyer_call_participants WHERE room_id=r.id AND role='client') AS clientJoinedAt,
        (SELECT last_seen_at FROM lawyer_call_participants WHERE room_id=r.id AND role=?) AS peerLastSeenAt
       FROM lawyer_call_rooms r WHERE r.consultation_id=? LIMIT 1`,
    ).bind(peerRole, consultationId).first<LawyerCallMetadata>();
  }

  async heartbeatRoom(roomId: string, userId: string, now: string): Promise<void> {
    await this.db.prepare(
      "UPDATE lawyer_call_participants SET last_seen_at=? WHERE room_id=? AND user_id=?",
    ).bind(now, roomId, userId).run();
  }

  async observeEndedRoom(roomId: string, userId: string, now: string): Promise<void> {
    await this.db.prepare(
      "UPDATE lawyer_call_participants SET left_at=COALESCE(left_at,?),last_seen_at=? WHERE room_id=? AND user_id=?",
    ).bind(now, now, roomId, userId).run();
  }

  async joinRoom(input: RoomActionInput & { reconnect: boolean }): Promise<void> {
    const eventType = input.reconnect ? "reconnected" : "joined";
    const statements = [
      this.db.prepare(
        "UPDATE lawyer_call_participants SET joined_at=COALESCE(joined_at,?),last_seen_at=?,left_at=NULL WHERE room_id=? AND user_id=?",
      ).bind(input.now, input.now, input.roomId, input.userId),
      this.db.prepare(
        "UPDATE lawyer_call_rooms SET status='active',started_at=COALESCE(started_at,?),updated_at=? WHERE id=? AND status<>'ended'",
      ).bind(input.now, input.now, input.roomId),
    ];
    if (input.participant.role === "lawyer" && input.participant.consultationStatus === "confirmed") {
      statements.push(this.db.prepare(
        "UPDATE lawyer_consultations SET status='in_progress',updated_at=? WHERE id=? AND status='confirmed'",
      ).bind(input.now, input.participant.consultationId));
    }
    statements.push(...this.eventAndAuditStatements(input, eventType));
    await this.db.batch(statements);
  }

  async leaveRoom(input: RoomActionInput): Promise<void> {
    await this.db.batch([
      this.db.prepare(
        "UPDATE lawyer_call_participants SET left_at=?,last_seen_at=? WHERE room_id=? AND user_id=?",
      ).bind(input.now, input.now, input.roomId, input.userId),
      ...this.eventAndAuditStatements(input, "left"),
    ]);
  }

  async endRoom(input: RoomActionInput): Promise<void> {
    await this.db.batch([
      this.db.prepare(
        "UPDATE lawyer_call_rooms SET status='ended',ended_at=?,ended_by_user_id=?,updated_at=? WHERE id=? AND status<>'ended'",
      ).bind(input.now, input.userId, input.now, input.roomId),
      this.db.prepare(
        "UPDATE lawyer_call_participants SET left_at=?,last_seen_at=? WHERE room_id=? AND user_id=?",
      ).bind(input.now, input.now, input.roomId, input.userId),
      this.db.prepare("DELETE FROM lawyer_call_signals WHERE room_id=?").bind(input.roomId),
      ...this.eventAndAuditStatements(input, "ended"),
    ]);
  }

  private eventAndAuditStatements(input: RoomActionInput, eventType: "joined" | "reconnected" | "left" | "ended"): D1PreparedStatement[] {
    return [
      this.db.prepare(
        "INSERT INTO lawyer_call_events (id,room_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?,?)",
      ).bind(crypto.randomUUID(), input.roomId, input.userId, eventType, JSON.stringify({ role: input.participant.role }), input.now),
      this.db.prepare(
        "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'lawyer_call_room',?,?,?,?)",
      ).bind(
        crypto.randomUUID(),
        input.participant.workspaceId,
        input.userId,
        input.roomId,
        `lawyer_call_${eventType}`,
        JSON.stringify({ consultationId: input.participant.consultationId, role: input.participant.role }),
        input.now,
      ),
    ];
  }
}

export function createLawyerCallProvider(
  db: D1Database,
  env: Pick<BuilderRuntimeEnv, "CLOUDFLARE_TURN_KEY_ID" | "CLOUDFLARE_TURN_KEY_API_TOKEN">,
  fetcher: typeof fetch = fetch,
): LawyerCallProvider {
  return new CloudflareRealtimeLawyerCallProvider(db, env, fetcher);
}
