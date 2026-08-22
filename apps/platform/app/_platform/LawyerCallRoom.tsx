"use client";

import Link from "next/link";
import { Camera, CameraOff, Cast, CircleAlert, LoaderCircle, Mic, MicOff, PhoneOff, RotateCcw, ShieldCheck, UsersRound, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { describeLawyerCallApiError, describeLawyerCallMediaError } from "../../lib/platform/lawyer-call-media-error";
import type { PlatformLocale } from "../../lib/platform/routing";

type IceServer = { urls: string | string[]; username?: string; credential?: string };
type DeviceReadiness = { camera: boolean; microphone: boolean; speaker: boolean; cameraLabel?: string; microphoneLabel?: string };
type PrepareResponse = { roomId: string; role: "client" | "lawyer"; peerName: string; iceServers: IceServer[]; relayAvailable: boolean; provider: string };
type Signal = { id: string; type: "offer" | "answer" | "ice" | "restart"; payload: Record<string, unknown>; createdAt: string };
type Phase = "preflight" | "preparing" | "ready" | "joining" | "waiting" | "connected" | "reconnecting" | "ended";

const MAX_AUTO_RECONNECT_ATTEMPTS = 3;
const reconnectDelay = (attempt: number, failed: boolean) => failed ? 300 : Math.min(1_000 * 2 ** (attempt - 1), 4_000);
const initialSignalCursor = () => new Date(Date.now() - 2_000).toISOString();

class LawyerCallApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "LawyerCallApiError";
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json() as T & { code?: string; error?: string };
  if (!response.ok) throw new LawyerCallApiError(payload.code || payload.error || `HTTP_${response.status}`);
  return payload;
}

export function LawyerCallRoom({ locale, consultationId, returnPath }: { locale: PlatformLocale; consultationId: string; returnPath: string }) {
  const ru = locale === "ru";
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const cursor = useRef({ after: "", afterId: "" });
  const pollActive = useRef(false);
  const connectedAt = useRef<number | null>(null);
  const deviceReadiness = useRef<DeviceReadiness | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectInFlight = useRef(false);
  const callEnded = useRef(false);
  const [phase, setPhase] = useState<Phase>("preflight");
  const [prepared, setPrepared] = useState<PrepareResponse | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [error, setError] = useState("");
  const endpoint = `/api/platform/lawyer-consultations/${encodeURIComponent(consultationId)}/call`;

  const post = useCallback(<T,>(body: Record<string, unknown>) => api<T>(endpoint, {
    method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" }, body: JSON.stringify(body),
  }), [endpoint]);

  const sendSignal = useCallback(async (type: Signal["type"], payload: Record<string, unknown>) => {
    await api(`${endpoint}/signals`, { method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" }, body: JSON.stringify({ type, payload }) });
  }, [endpoint]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimer.current === null) return;
    window.clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
  }, []);

  const stopScreenShare = useCallback(async (restoreCamera = true) => {
    const activeScreen = screenStream.current;
    screenStream.current = null;
    activeScreen?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (restoreCamera) {
      const sender = peer.current?.getSenders().find((item) => item.track?.kind === "video");
      const cameraTrack = localStream.current?.getVideoTracks()[0];
      if (sender && cameraTrack) {
        try { await sender.replaceTrack(cameraTrack); }
        catch (value) { setError(describeLawyerCallMediaError(value, locale, "screen_share")); }
      }
    }
    setSharing(false);
  }, [locale]);

  const flushIce = useCallback(async () => {
    if (!peer.current?.remoteDescription) return;
    for (const candidate of pendingIce.current.splice(0)) await peer.current.addIceCandidate(candidate);
  }, []);

  const createOffer = useCallback(async (iceRestart = false) => {
    const connection = peer.current;
    if (!connection) return;
    const offer = await connection.createOffer({ iceRestart });
    await connection.setLocalDescription(offer);
    await sendSignal("offer", { type: offer.type, sdp: offer.sdp });
  }, [sendSignal]);

  const handleSignal = useCallback(async (signal: Signal) => {
    const connection = peer.current;
    if (!connection) return;
    if (signal.type === "offer") {
      await connection.setRemoteDescription({ type: "offer", sdp: String(signal.payload.sdp || "") });
      await flushIce();
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await sendSignal("answer", { type: answer.type, sdp: answer.sdp });
    } else if (signal.type === "answer" && connection.signalingState === "have-local-offer") {
      await connection.setRemoteDescription({ type: "answer", sdp: String(signal.payload.sdp || "") });
      await flushIce();
    } else if (signal.type === "ice") {
      const candidate = signal.payload as RTCIceCandidateInit;
      if (connection.remoteDescription) await connection.addIceCandidate(candidate);
      else pendingIce.current.push(candidate);
    } else if (signal.type === "restart" && prepared?.role === "lawyer") {
      await createOffer(true);
    }
  }, [createOffer, flushIce, prepared?.role, sendSignal]);

  const pollSignals = useCallback(async () => {
    if (!peer.current || pollActive.current || phase === "ended") return;
    pollActive.current = true;
    try {
      const params = new URLSearchParams(cursor.current);
      const payload = await api<{ signals: Signal[] }>(`${endpoint}/signals?${params}`, { cache: "no-store" });
      for (const signal of payload.signals) {
        await handleSignal(signal);
        cursor.current = { after: signal.createdAt, afterId: signal.id };
      }
    } catch (value) {
      setError(describeLawyerCallApiError(value, locale));
    } finally { pollActive.current = false; }
  }, [endpoint, handleSignal, locale, phase]);

  async function prepare() {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setError(ru ? "Chrome не предоставляет WebRTC или доступ к устройствам." : "Chrome WebRTC yoki qurilmalarga kirishni bermadi.");
      return;
    }
    setPhase("preparing"); setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
      localStream.current = stream;
      if (localVideo.current) localVideo.current.srcObject = stream;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const camera = devices.find((item) => item.kind === "videoinput");
      const microphone = devices.find((item) => item.kind === "audioinput");
      const readiness = { camera: Boolean(camera), microphone: Boolean(microphone), speaker: typeof HTMLMediaElement !== "undefined", cameraLabel: camera?.label || undefined, microphoneLabel: microphone?.label || undefined };
      deviceReadiness.current = readiness;
      const result = await post<PrepareResponse>({ action: "prepare", deviceReadiness: readiness });
      setPrepared(result); setPhase("ready");
    } catch (value) {
      localStream.current?.getTracks().forEach((track) => track.stop()); localStream.current = null;
      setPhase("preflight");
      setError(value instanceof LawyerCallApiError ? describeLawyerCallApiError(value, locale) : describeLawyerCallMediaError(value, locale));
    }
  }

  async function join(reconnect = false) {
    if (!prepared || !localStream.current || (reconnect && reconnectInFlight.current)) return;
    clearReconnectTimer();
    callEnded.current = false;
    if (!reconnect) {
      reconnectAttempts.current = 0;
      setReconnectAttempt(0);
    } else {
      reconnectInFlight.current = true;
      await stopScreenShare(false);
    }
    setPhase(reconnect ? "reconnecting" : "joining"); setError("");
    let retryAfterFailure = false;
    try {
      let callConfiguration = prepared;
      if (reconnect && deviceReadiness.current) {
        callConfiguration = await post<PrepareResponse>({ action: "prepare", deviceReadiness: deviceReadiness.current });
        setPrepared(callConfiguration);
      }
      if (!cursor.current.after) {
        cursor.current = { after: initialSignalCursor(), afterId: "" };
      }
      const previousConnection = peer.current;
      peer.current = null;
      previousConnection?.close();
      pendingIce.current = [];
      const connection = new RTCPeerConnection({ iceServers: callConfiguration.iceServers as RTCIceServer[], iceCandidatePoolSize: 4 });
      peer.current = connection;
      localStream.current.getTracks().forEach((track) => connection.addTrack(track, localStream.current!));
      connection.ontrack = (event) => { if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0]; };
      connection.onicecandidate = (event) => { if (event.candidate) void sendSignal("ice", event.candidate.toJSON() as unknown as Record<string, unknown>); };
      connection.onconnectionstatechange = () => {
        if (peer.current !== connection || callEnded.current) return;
        if (connection.connectionState === "connected") {
          clearReconnectTimer(); reconnectAttempts.current = 0; setReconnectAttempt(0);
          connectedAt.current ??= Date.now(); setPhase("connected"); setError("");
        } else if (["disconnected", "failed"].includes(connection.connectionState)) {
          scheduleReconnect(connection, connection.connectionState === "failed");
        }
        else if (connection.connectionState === "closed") setPhase((current) => current === "ended" ? current : "waiting");
      };
      connection.oniceconnectionstatechange = () => {
        if (peer.current !== connection || callEnded.current) return;
        if (["disconnected", "failed"].includes(connection.iceConnectionState)) {
          scheduleReconnect(connection, connection.iceConnectionState === "failed");
        }
      };
      await post({ action: "join", reconnect });
      setPhase("waiting");
      if (callConfiguration.role === "lawyer") await createOffer(reconnect);
      else await sendSignal("restart", { reason: reconnect ? "client_reconnect" : "client_ready" });
    } catch (value) {
      retryAfterFailure = reconnect;
      setPhase(reconnect ? "reconnecting" : "ready");
      setError(describeLawyerCallApiError(value, locale));
    } finally {
      reconnectInFlight.current = false;
      if (retryAfterFailure && peer.current) scheduleReconnect(peer.current, true);
    }
  }

  function scheduleReconnect(connection: RTCPeerConnection, failed: boolean) {
    if (callEnded.current || peer.current !== connection || reconnectTimer.current !== null || reconnectInFlight.current) return;
    if (reconnectAttempts.current >= MAX_AUTO_RECONNECT_ATTEMPTS) {
      setPhase("reconnecting");
      setError(ru
        ? "Автоматическое переподключение не удалось. Проверьте сеть и нажмите «Переподключить»."
        : "Avtomatik qayta ulanish amalga oshmadi. Tarmoqni tekshiring va «Qayta ulash» tugmasini bosing.");
      return;
    }
    const attempt = reconnectAttempts.current + 1;
    reconnectAttempts.current = attempt;
    setReconnectAttempt(attempt);
    setPhase("reconnecting");
    reconnectTimer.current = window.setTimeout(() => {
      reconnectTimer.current = null;
      if (!callEnded.current && peer.current === connection && connection.connectionState !== "connected") void join(true);
    }, reconnectDelay(attempt, failed));
  }

  async function shareScreen() {
    if (!peer.current || !navigator.mediaDevices.getDisplayMedia) return;
    let display: MediaStream | null = null;
    setError("");
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = display.getVideoTracks()[0];
      const sender = peer.current.getSenders().find((item) => item.track?.kind === "video");
      if (!screenTrack || !sender) {
        display.getTracks().forEach((track) => track.stop());
        setError(ru ? "Показ экрана недоступен для текущего соединения." : "Joriy ulanishda ekran ko‘rsatish mavjud emas.");
        return;
      }
      screenStream.current?.getTracks().forEach((track) => track.stop());
      screenStream.current = display;
      await sender.replaceTrack(screenTrack); setSharing(true);
      screenTrack.onended = () => { void stopScreenShare(); };
    } catch (value) {
      display?.getTracks().forEach((track) => track.stop());
      if (screenStream.current === display) screenStream.current = null;
      setSharing(false);
      setError(describeLawyerCallMediaError(value, locale, "screen_share"));
    }
  }

  async function endCall() {
    callEnded.current = true;
    clearReconnectTimer();
    await stopScreenShare(false);
    peer.current?.close(); localStream.current?.getTracks().forEach((track) => track.stop()); setPhase("ended");
    try { await post({ action: "end" }); } catch (value) { setError(describeLawyerCallApiError(value, locale)); }
  }

  useEffect(() => {
    if (!peer.current || ["preflight", "preparing", "ready", "ended"].includes(phase)) return;
    const poll = window.setInterval(() => void pollSignals(), 900);
    const heartbeat = window.setInterval(() => void post({ action: "heartbeat" }).catch(() => undefined), 10_000);
    void pollSignals();
    return () => { window.clearInterval(poll); window.clearInterval(heartbeat); };
  }, [phase, pollSignals, post]);

  useEffect(() => {
    if (phase !== "connected") return;
    const timer = window.setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - (connectedAt.current || Date.now())) / 1_000))), 1_000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => () => {
    callEnded.current = true;
    clearReconnectTimer();
    screenStream.current?.getTracks().forEach((track) => track.stop());
    peer.current?.close(); localStream.current?.getTracks().forEach((track) => track.stop());
  }, [clearReconnectTimer]);

  const toggleTrack = (kind: "audio" | "video") => {
    const track = kind === "audio" ? localStream.current?.getAudioTracks()[0] : localStream.current?.getVideoTracks()[0];
    if (!track) return; track.enabled = !track.enabled;
    if (kind === "audio") setMicrophoneOn(track.enabled); else setCameraOn(track.enabled);
  };
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return <main className="lawyer-call-room">
    <header className="lawyer-call-heading"><div><small>JURO · SECURE CONSULTATION</small><h1>{ru ? "Видеоконсультация" : "Video maslahat"}</h1><p><ShieldCheck aria-hidden="true" />{ru ? "Peer-to-peer WebRTC. JURO не записывает аудио или видео." : "Peer-to-peer WebRTC. JURO audio yoki videoni yozmaydi."}</p></div><Link href={returnPath}>{ru ? "Вернуться к консультациям" : "Maslahatlarga qaytish"}</Link></header>
    {error && <p className="lawyer-call-error" role="alert"><CircleAlert />{error}</p>}
    {!prepared && <section className="lawyer-call-preflight"><div><Camera /><Mic /><Volume2 /></div><h2>{ru ? "Проверьте камеру и микрофон" : "Kamera va mikrofonni tekshiring"}</h2><p>{ru ? "Chrome запросит разрешение. До нажатия кнопки устройства не включаются." : "Chrome ruxsat so‘raydi. Tugma bosilmaguncha qurilmalar yoqilmaydi."}</p><button type="button" onClick={() => void prepare()} disabled={phase === "preparing"}>{phase === "preparing" && <LoaderCircle className="spin" />}{ru ? "Проверить устройства" : "Qurilmalarni tekshirish"}</button></section>}
    <section className="lawyer-call-stage" hidden={!prepared}>
      <div className="lawyer-call-videos"><figure className="remote"><video ref={remoteVideo} autoPlay playsInline /><figcaption><UsersRound />{prepared?.peerName || (ru ? "Собеседник" : "Suhbatdosh")}<span>{phase === "connected" ? clock : ru ? "Ожидание подключения" : "Ulanish kutilmoqda"}</span></figcaption></figure><figure className="local"><video ref={localVideo} autoPlay muted playsInline /><figcaption>{ru ? "Вы" : "Siz"}</figcaption></figure></div>
      {prepared && !prepared.relayAvailable && <p className="lawyer-call-warning"><CircleAlert />{ru ? "TURN relay не настроен: прямой WebRTC может не пройти через строгий firewall." : "TURN relay sozlanmagan: to‘g‘ridan-to‘g‘ri WebRTC qat’iy firewall orqali o‘tmasligi mumkin."}</p>}
      <div className="lawyer-call-controls">
        <button type="button" onClick={() => toggleTrack("audio")} aria-pressed={!microphoneOn}>{microphoneOn ? <Mic /> : <MicOff />}<span>{ru ? "Микрофон" : "Mikrofon"}</span></button>
        <button type="button" onClick={() => toggleTrack("video")} aria-pressed={!cameraOn}>{cameraOn ? <Camera /> : <CameraOff />}<span>{ru ? "Камера" : "Kamera"}</span></button>
        <button type="button" onClick={() => sharing ? void stopScreenShare() : void shareScreen()} disabled={!(["joining", "waiting", "connected", "reconnecting"] as Phase[]).includes(phase)} aria-pressed={sharing}><Cast /><span>{sharing ? (ru ? "Остановить показ" : "Ko‘rsatishni to‘xtatish") : (ru ? "Показать экран" : "Ekranni ko‘rsatish")}</span></button>
        {phase === "reconnecting" && <button type="button" onClick={() => void join(true)}><RotateCcw /><span>{ru ? "Переподключить" : "Qayta ulash"}</span></button>}
        <button className="danger" type="button" onClick={() => void endCall()} disabled={phase === "ended"}><PhoneOff /><span>{ru ? "Завершить" : "Yakunlash"}</span></button>
      </div>
      {phase === "ready" && <button className="lawyer-call-join" type="button" onClick={() => void join()}>{ru ? "Войти в комнату" : "Xonaga kirish"}</button>}
      {phase === "joining" && <p className="lawyer-call-status"><LoaderCircle className="spin" />{ru ? "Подключение…" : "Ulanmoqda…"}</p>}
      {phase === "waiting" && <p className="lawyer-call-status"><UsersRound />{ru ? "Вы в комнате. Ожидаем второго участника…" : "Siz xonadasiz. Ikkinchi ishtirokchi kutilmoqda…"}</p>}
      {phase === "reconnecting" && <p className="lawyer-call-status" role="status"><LoaderCircle className="spin" />{ru ? `Восстанавливаем защищённое соединение${reconnectAttempt ? ` · попытка ${reconnectAttempt}/${MAX_AUTO_RECONNECT_ATTEMPTS}` : ""}…` : `Himoyalangan ulanish tiklanmoqda${reconnectAttempt ? ` · urinish ${reconnectAttempt}/${MAX_AUTO_RECONNECT_ATTEMPTS}` : ""}…`}</p>}
      {phase === "ended" && <p className="lawyer-call-status"><PhoneOff />{ru ? "Звонок завершён. Юрист может добавить итог консультации в карточке заявки." : "Qo‘ng‘iroq yakunlandi. Yurist so‘rov kartasiga maslahat yakunini qo‘shishi mumkin."}</p>}
    </section>
  </main>;
}
