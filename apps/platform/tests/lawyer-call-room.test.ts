import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateLawyerCallIceServers } from "../lib/platform/lawyer-call";
import { describeLawyerCallApiError, describeLawyerCallMediaError } from "../lib/platform/lawyer-call-media-error";

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

test("call room is participant-scoped, ephemeral, audited and never records media", async () => {
  const [roomRoute, signalRoute, ui, migration] = await Promise.all([
    readFile(new URL("../app/api/platform/lawyer-consultations/[consultationId]/call/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/lawyer-consultations/[consultationId]/call/signals/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/LawyerCallRoom.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0148_lawyer_call_rooms.sql", import.meta.url), "utf8"),
  ]);
  for (const source of [roomRoute, signalRoute]) {
    assert.match(source, /requireApiUser/);
    assert.match(source, /lawyerCallParticipant/);
    assert.match(source, /assertSafeWrite/);
  }
  assert.match(roomRoute, /workspace_audit_events/);
  assert.match(roomRoute, /room\.status === "ended" && \["end", "heartbeat"\]\.includes\(parsed\.data\.action\)/);
  assert.match(roomRoute, /left_at=COALESCE\(left_at,\?\)/);
  assert.match(roomRoute, /status: "ended"/);
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
  assert.match(ui, /deviceId: \{ exact: nextDeviceId \}/);
  assert.match(ui, /sender\.replaceTrack\(nextTrack\)/);
  assert.match(ui, /setSinkId\?/);
  assert.match(ui, /connection\.getStats\(\)/);
  assert.match(ui, /networkQualityLabel/);
  assert.match(ui, /Только аудио/);
  assert.doesNotMatch(ui, /MediaRecorder|recording/i);
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
