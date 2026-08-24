import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateLawyerCallIceServers, type LawyerCallParticipant } from "../lib/platform/lawyer-call";
import { createLawyerCallProvider } from "../lib/platform/lawyer-call-provider";
import { describeLawyerCallApiError, describeLawyerCallMediaError } from "../lib/platform/lawyer-call-media-error";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

test("lawyer calls fail over to Cloudflare STUN without exposing a long-lived key", async () => {
  const result = await generateLawyerCallIceServers({});
  assert.equal(result.provider, "cloudflare_stun_only");
  assert.equal(result.relayAvailable, false);
  assert.deepEqual(result.iceServers, [{ urls: ["stun:stun.cloudflare.com:3478"] }]);
});

test("lawyer calls exchange the server-only TURN key for short-lived browser credentials", async () => {
  let authorization = "";
  const result = await generateLawyerCallIceServers({
    CLOUDFLARE_TURN_KEY_ID: "turn-key-id",
    CLOUDFLARE_TURN_KEY_API_TOKEN: "server-only-token",
  }, async (_url, init) => {
    authorization = new Headers(init?.headers).get("authorization") || "";
    return Response.json({ iceServers: [
      { urls: ["stun:stun.cloudflare.com:53", "stun:stun.cloudflare.com:3478"] },
      { urls: ["turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "short-user", credential: "short-secret" },
    ] }, { status: 201 });
  });
  assert.equal(authorization, "Bearer server-only-token");
  assert.equal(result.provider, "cloudflare_realtime_turn");
  assert.equal(result.relayAvailable, true);
  assert.equal(JSON.stringify(result.iceServers).includes(":53"), false);
  assert.equal(JSON.stringify(result.iceServers).includes("server-only-token"), false);
});

test("call provider adapter owns the room lifecycle without changing consultation business state boundaries", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const now = "2026-08-24T12:00:00.000Z";
  const workspaceId = "10000000-0000-4000-8000-000000000001";
  const clientUserId = "10000000-0000-4000-8000-000000000002";
  const lawyerUserId = "10000000-0000-4000-8000-000000000003";
  const consultationId = "10000000-0000-4000-8000-000000000004";
  sqlite.exec(`
    INSERT INTO user_profiles (id,email,full_name,created_at,updated_at)
    VALUES
      ('${clientUserId}','synthetic-call-client@example.test','Synthetic Client','${now}','${now}'),
      ('${lawyerUserId}','synthetic-call-lawyer@example.test','Synthetic Lawyer','${now}','${now}');
    INSERT INTO workspaces (id,type,name,created_at,updated_at)
    VALUES ('${workspaceId}','personal','Synthetic Call Workspace','${now}','${now}');
    PRAGMA foreign_keys=OFF;
    INSERT INTO lawyer_consultations
      (id,lawyer_request_id,lawyer_profile_id,client_user_id,case_id,starts_at,ends_at,timezone,format,status,created_at,updated_at)
    VALUES
      ('${consultationId}','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000006',
       '${clientUserId}','10000000-0000-4000-8000-000000000007','${now}','2026-08-24T13:00:00.000Z',
       'Asia/Tashkent','video','confirmed','${now}','${now}');
    PRAGMA foreign_keys=ON;
  `);
  const participant = (role: "client" | "lawyer"): LawyerCallParticipant => ({
    consultationId,
    consultationStatus: "confirmed",
    format: "video",
    startsAt: now,
    endsAt: "2026-08-24T13:00:00.000Z",
    requestId: "10000000-0000-4000-8000-000000000005",
    workspaceId,
    caseId: "10000000-0000-4000-8000-000000000007",
    lawyerUserId,
    clientUserId,
    lawyerName: "Synthetic Lawyer",
    clientName: "Synthetic Client",
    role,
    otherUserId: role === "lawyer" ? clientUserId : lawyerUserId,
  });
  const provider = createLawyerCallProvider(d1, {});
  const readiness = { camera: true, microphone: true, speaker: true };
  const clientRoom = await provider.createRoom({ participant: participant("client"), userId: clientUserId, deviceReadiness: readiness, now });
  const lawyerRoom = await provider.createRoom({ participant: participant("lawyer"), userId: lawyerUserId, deviceReadiness: readiness, now });
  assert.ok(clientRoom);
  assert.ok(lawyerRoom);
  assert.equal(clientRoom.roomId, lawyerRoom.roomId);
  assert.equal(clientRoom.token.provider, "cloudflare_stun_only");
  assert.equal(clientRoom.peerName, "Synthetic Lawyer");
  assert.equal(lawyerRoom.peerName, "Synthetic Client");

  await provider.joinRoom({ participant: participant("lawyer"), roomId: clientRoom.roomId, userId: lawyerUserId, now: "2026-08-24T12:01:00.000Z", reconnect: false });
  await provider.joinRoom({ participant: participant("client"), roomId: clientRoom.roomId, userId: clientUserId, now: "2026-08-24T12:01:01.000Z", reconnect: false });
  const active = await provider.getCallMetadata(consultationId, "lawyer");
  assert.equal(active?.status, "active");
  assert.equal(active?.provider, "cloudflare_stun_only");
  assert.equal(active?.clientJoinedAt, "2026-08-24T12:01:01.000Z");
  assert.equal(active?.lawyerJoinedAt, "2026-08-24T12:01:00.000Z");
  assert.equal((sqlite.prepare("SELECT status FROM lawyer_consultations WHERE id=?").get(consultationId) as { status: string }).status, "in_progress");

  sqlite.prepare(
    `INSERT INTO lawyer_call_signals
      (id,room_id,sender_user_id,recipient_user_id,signal_type,payload_json,created_at,expires_at)
     VALUES (?,?,?,?,?,'{}',?,?)`,
  ).run("10000000-0000-4000-8000-000000000008", clientRoom.roomId, clientUserId, lawyerUserId, "restart", now, "2026-08-24T14:00:00.000Z");
  await provider.endRoom({ participant: participant("client"), roomId: clientRoom.roomId, userId: clientUserId, now: "2026-08-24T12:05:00.000Z" });
  await provider.observeEndedRoom(clientRoom.roomId, lawyerUserId, "2026-08-24T12:05:01.000Z");

  const ended = await provider.getCallMetadata(consultationId, "client");
  assert.equal(ended?.status, "ended");
  assert.equal(ended?.endedAt, "2026-08-24T12:05:00.000Z");
  assert.equal((sqlite.prepare("SELECT count(*) AS count FROM lawyer_call_signals WHERE room_id=?").get(clientRoom.roomId) as { count: number }).count, 0);
  assert.deepEqual(
    sqlite.prepare("SELECT event_type AS type,count(*) AS count FROM lawyer_call_events WHERE room_id=? GROUP BY event_type ORDER BY event_type").all(clientRoom.roomId)
      .map((row) => ({ ...row })),
    [
      { type: "ended", count: 1 },
      { type: "joined", count: 2 },
      { type: "prepared", count: 2 },
    ],
  );
  assert.deepEqual(
    sqlite.prepare("SELECT role,left_at AS leftAt FROM lawyer_call_participants WHERE room_id=? ORDER BY role").all(clientRoom.roomId)
      .map((row) => ({ ...row })),
    [
      { role: "client", leftAt: "2026-08-24T12:05:00.000Z" },
      { role: "lawyer", leftAt: "2026-08-24T12:05:01.000Z" },
    ],
  );
  assert.equal(
    (sqlite.prepare("SELECT count(*) AS count FROM workspace_audit_events WHERE entity_id=?").get(clientRoom.roomId) as { count: number }).count,
    5,
  );
});

test("call room is participant-scoped, ephemeral, audited and never records media", async () => {
  const [roomRoute, signalRoute, provider, ui, panel, migration] = await Promise.all([
    readFile(new URL("../app/api/platform/lawyer-consultations/[consultationId]/call/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/lawyer-consultations/[consultationId]/call/signals/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/platform/lawyer-call-provider.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/LawyerCallRoom.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/LawyerConsultationPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0148_lawyer_call_rooms.sql", import.meta.url), "utf8"),
  ]);
  for (const source of [roomRoute, signalRoute]) {
    assert.match(source, /requireApiUser/);
    assert.match(source, /lawyerCallParticipant/);
    assert.match(source, /assertSafeWrite/);
  }
  assert.match(roomRoute, /createLawyerCallProvider/);
  assert.match(roomRoute, /room\.status === "ended" && \["end", "heartbeat"\]\.includes\(parsed\.data\.action\)/);
  assert.match(roomRoute, /status: "ended"/);
  assert.doesNotMatch(roomRoute, /INSERT INTO lawyer_call_rooms|DELETE FROM lawyer_call_signals/);
  assert.match(provider, /export interface LawyerCallProvider/);
  for (const method of ["createRoom", "createParticipantToken", "joinRoom", "endRoom", "getRoomStatus", "getCallMetadata"]) {
    assert.match(provider, new RegExp(`${method}\\(`));
  }
  assert.match(provider, /class CloudflareRealtimeLawyerCallProvider implements LawyerCallProvider/);
  assert.match(provider, /workspace_audit_events/);
  assert.match(provider, /left_at=COALESCE\(left_at,\?\)/);
  assert.match(provider, /DELETE FROM lawyer_call_signals/);
  assert.match(signalRoute, /expires_at/);
  assert.match(signalRoute, /created_at>=\?\) < 480/);
  assert.match(signalRoute, /SIGNAL_RATE_LIMITED/);
  assert.match(ui, /getUserMedia/);
  assert.match(ui, /RTCPeerConnection/);
  assert.match(ui, /getDisplayMedia/);
  assert.match(ui, /reconnecting/);
  assert.match(ui, /MAX_AUTO_RECONNECT_ATTEMPTS = 3/);
  assert.match(ui, /connection\.oniceconnectionstatechange/);
  assert.match(ui, /createOffer\(\{ iceRestart \}\)/);
  assert.match(ui, /peer\.current !== connection/);
  assert.match(ui, /action: "prepare", deviceReadiness: deviceReadiness\.current/);
  assert.match(ui, /navigator\.mediaDevices\.enumerateDevices\(\)/);
  assert.match(ui, /api<CallStatusResponse>\(endpoint, \{ cache: "no-store", signal: controller\.signal \}\)/);
  assert.match(ui, /result\.room\?\.status === "ended"/);
  assert.match(ui, /phase === "ended" && <section className="lawyer-call-preflight"/);
  assert.match(ui, /Устройства не включались/);
  assert.match(ui, /Консультация отменена/);
  assert.match(ui, /Итог консультации доступен/);
  assert.match(ui, /phase === "preflight" \|\| phase === "preparing"/);
  assert.match(ui, /deviceId: \{ exact: nextDeviceId \}/);
  assert.match(ui, /sender\.replaceTrack\(nextTrack\)/);
  assert.match(ui, /setSinkId\?/);
  assert.match(ui, /connection\.getStats\(\)/);
  assert.match(ui, /networkQualityLabel/);
  assert.match(ui, /Только аудио/);
  assert.doesNotMatch(ui, /MediaRecorder|recording/i);
  assert.match(panel, /role === "lawyer"/);
  assert.match(panel, /\/lawyer\/consultations\/call\//);
  assert.doesNotMatch(panel, /pathname\.replace\([^\n]+requests\/call/);
  assert.match(migration, /FOREIGN KEY \(`consultation_id`\)/);
  assert.match(migration, /CHECK \(`signal_type` IN \('offer','answer','ice','restart'\)\)/);
  assert.doesNotMatch(migration, /DROP\s+TABLE/iu);
});

test("call reconnect and screen sharing fail closed without leaving capture active", async () => {
  const [ui, styles] = await Promise.all([
    readFile(new URL("../app/_platform/LawyerCallRoom.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/lawyer-call-room.css", import.meta.url), "utf8"),
  ]);

  assert.match(ui, /const screenStream = useRef<MediaStream \| null>\(null\)/);
  assert.match(ui, /activeScreen\?\.getTracks\(\)\.forEach/);
  assert.match(ui, /display\?\.getTracks\(\)\.forEach/);
  assert.match(ui, /screenStream\.current\?\.getTracks\(\)\.forEach/);
  assert.match(ui, /sharing \? void stopScreenShare\(\) : void shareScreen\(\)/);
  assert.match(ui, /aria-pressed=\{sharing\}/);
  assert.match(ui, /clearReconnectTimer\(\)/);
  assert.match(ui, /result\.status === "ended"/);
  assert.match(ui, /remoteVideo\.current\.srcObject = null/);
  assert.match(ui, /localVideo\.current\.srcObject = null/);
  assert.match(ui, /Автоматическое переподключение не удалось/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(styles, /\.lawyer-call-room \.spin\{animation:none\}/);
  assert.match(styles, /\.lawyer-call-device-controls\{/);
  assert.match(styles, /@media\(max-width:900px\)\{\.lawyer-call-device-controls/);
});

test("call room converts browser media failures into actionable RU and UZ guidance", () => {
  const denied = { name: "NotAllowedError", message: "Permission denied" };
  const busy = { name: "NotReadableError" };
  const missing = { name: "NotFoundError" };

  assert.match(describeLawyerCallMediaError(denied, "ru"), /настройки сайта.*разрешите камеру и микрофон/iu);
  assert.doesNotMatch(describeLawyerCallMediaError(denied, "ru"), /Permission denied/u);
  assert.match(describeLawyerCallMediaError(denied, "uz"), /sayt sozlamalarini.*ruxsat bering/iu);
  assert.match(describeLawyerCallMediaError(busy, "ru"), /заняты другим приложением/iu);
  assert.match(describeLawyerCallMediaError(missing, "uz"), /topilmadi/iu);
  assert.match(describeLawyerCallMediaError(denied, "ru", "screen_share"), /Показ экрана отменён или запрещён/iu);
});

test("call room converts API codes into investor-safe RU and UZ guidance", () => {
  assert.match(describeLawyerCallApiError({ code: "CALL_ENDED" }, "ru"), /Звонок уже завершён/iu);
  assert.match(describeLawyerCallApiError({ code: "CALL_NOT_PREPARED" }, "uz"), /Avval kamera va mikrofonni tekshiring/iu);
  assert.doesNotMatch(describeLawyerCallApiError(new Error("CALL_ENDED"), "ru"), /CALL_ENDED/u);
  assert.doesNotMatch(describeLawyerCallApiError(new Error("unexpected"), "uz"), /unexpected/u);
});
