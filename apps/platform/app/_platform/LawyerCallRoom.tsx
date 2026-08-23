"use client";

import Link from "next/link";
import { Camera, CameraOff, Cast, CircleAlert, LoaderCircle, Mic, MicOff, PhoneOff, RotateCcw, ShieldCheck, UsersRound, Volume2, Wifi } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { describeLawyerCallApiError, describeLawyerCallMediaError } from "../../lib/platform/lawyer-call-media-error";
import type { PlatformLocale } from "../../lib/platform/routing";

type IceServer = { urls: string | string[]; username?: string; credential?: string };
type DeviceReadiness = { camera: boolean; microphone: boolean; speaker: boolean; cameraLabel?: string; microphoneLabel?: string };
type PrepareResponse = { roomId: string; role: "client" | "lawyer"; peerName: string; iceServers: IceServer[]; relayAvailable: boolean; provider: string };
type Signal = { id: string; type: "offer" | "answer" | "ice" | "restart"; payload: Record<string, unknown>; createdAt: string };
type Phase = "preflight" | "preparing" | "ready" | "joining" | "waiting" | "connected" | "reconnecting" | "ended";
type NetworkQuality = "checking" | "excellent" | "stable" | "weak";
type DeviceInventory = { cameras: MediaDeviceInfo[]; microphones: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] };

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
  const [devices, setDevices] = useState<DeviceInventory>({ cameras: [], microphones: [], speakers: [] });
  const [cameraDeviceId, setCameraDeviceId] = useState("");
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState("");
  const [speakerDeviceId, setSpeakerDeviceId] = useState("");
  const [switchingDevice, setSwitchingDevice] = useState<"camera" | "microphone" | "speaker" | "">("");
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>("checking");
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

  const finishLocalCall = useCallback(async () => {
    callEnded.current = true;
    clearReconnectTimer();
    await stopScreenShare(false);
    const connection = peer.current;
    peer.current = null;
    connection?.close();
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    setPhase("ended");
  }, [clearReconnectTimer, stopScreenShare]);

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
      const available = await navigator.mediaDevices.enumerateDevices();
      const camera = available.find((item) => item.kind === "videoinput");
      const microphone = available.find((item) => item.kind === "audioinput");
      setDevices({
        cameras: available.filter((item) => item.kind === "videoinput"),
        microphones: available.filter((item) => item.kind === "audioinput"),
        speakers: available.filter((item) => item.kind === "audiooutput"),
      });
      setCameraDeviceId(stream.getVideoTracks()[0]?.getSettings().deviceId || camera?.deviceId || "");
      setMicrophoneDeviceId(stream.getAudioTracks()[0]?.getSettings().deviceId || microphone?.deviceId || "");
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

  async function switchInput(kind: "camera" | "microphone", nextDeviceId: string) {
    if (!nextDeviceId || !navigator.mediaDevices?.getUserMedia) return;
    setSwitchingDevice(kind); setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia(kind === "camera"
        ? { video: { deviceId: { exact: nextDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }
        : { audio: { deviceId: { exact: nextDeviceId }, echoCancellation: true, noiseSuppression: true }, video: false });
      const nextTrack = kind === "camera" ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0];
      if (!nextTrack) throw new DOMException("Requested media device is unavailable", "NotFoundError");
      const currentStream = localStream.current;
      const previousTrack = kind === "camera" ? currentStream?.getVideoTracks()[0] : currentStream?.getAudioTracks()[0];
      const sender = peer.current?.getSenders().find((item) => item.track?.kind === nextTrack.kind);
      if (sender && (kind === "microphone" || !sharing)) await sender.replaceTrack(nextTrack);
      if (currentStream) {
        if (previousTrack) currentStream.removeTrack(previousTrack);
        currentStream.addTrack(nextTrack);
      } else {
        localStream.current = stream;
      }
      previousTrack?.stop();
      stream.getTracks().filter((track) => track !== nextTrack).forEach((track) => track.stop());
      if (localVideo.current) localVideo.current.srcObject = localStream.current;
      if (kind === "camera") {
        setCameraDeviceId(nextDeviceId); setCameraOn(nextTrack.enabled);
      } else {
        setMicrophoneDeviceId(nextDeviceId); setMicrophoneOn(nextTrack.enabled);
      }
      const available = await navigator.mediaDevices.enumerateDevices();
      const selected = available.find((item) => item.deviceId === nextDeviceId);
      const readiness = deviceReadiness.current;
      if (readiness) deviceReadiness.current = kind === "camera"
        ? { ...readiness, camera: true, cameraLabel: selected?.label || readiness.cameraLabel }
        : { ...readiness, microphone: true, microphoneLabel: selected?.label || readiness.microphoneLabel };
    } catch (value) {
      setError(describeLawyerCallMediaError(value, locale));
    } finally {
      setSwitchingDevice("");
    }
  }

  async function switchSpeaker(nextDeviceId: string) {
    if (!nextDeviceId || !remoteVideo.current) return;
    setSwitchingDevice("speaker"); setError("");
    try {
      const output = remoteVideo.current as HTMLVideoElement & { setSinkId?: (deviceId: string) => Promise<void> };
      if (!output.setSinkId) throw new DOMException("Audio output selection is unavailable", "NotSupportedError");
      await output.setSinkId(nextDeviceId);
      setSpeakerDeviceId(nextDeviceId);
    } catch {
      setError(ru
        ? "Chrome не разрешил сменить устройство вывода. Выберите динамик в системных настройках звука."
        : "Chrome audio chiqish qurilmasini almashtirishga ruxsat bermadi. Dinamikni tizim ovoz sozlamalarida tanlang.");
    } finally {
      setSwitchingDevice("");
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
    await finishLocalCall();
    try { await post({ action: "end" }); } catch (value) { setError(describeLawyerCallApiError(value, locale)); }
  }

  useEffect(() => {
    if (!peer.current || ["preflight", "preparing", "ready", "ended"].includes(phase)) return;
    const poll = window.setInterval(() => void pollSignals(), 900);
    const heartbeat = window.setInterval(() => {
      void post<{ status?: string }>({ action: "heartbeat" })
        .then((result) => { if (result.status === "ended") void finishLocalCall(); })
        .catch(() => undefined);
    }, 5_000);
    void pollSignals();
    return () => { window.clearInterval(poll); window.clearInterval(heartbeat); };
  }, [finishLocalCall, phase, pollSignals, post]);

  useEffect(() => {
    if (phase !== "connected") return;
    const timer = window.setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - (connectedAt.current || Date.now())) / 1_000))), 1_000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "connected" || !peer.current) {
      setNetworkQuality("checking");
      return;
    }
    let active = true;
    const sample = async () => {
      const connection = peer.current;
      if (!connection || connection.connectionState !== "connected") return;
      try {
        const report = await connection.getStats();
        let roundTripTime = 0;
        let packetsLost = 0;
        let packetsReceived = 0;
        report.forEach((entry) => {
          if (entry.type === "candidate-pair") {
            const pair = entry as RTCIceCandidatePairStats;
            if (pair.state === "succeeded" && pair.currentRoundTripTime) roundTripTime = Math.max(roundTripTime, pair.currentRoundTripTime);
          } else if (entry.type === "inbound-rtp") {
            const inbound = entry as RTCInboundRtpStreamStats;
            packetsLost += Math.max(0, inbound.packetsLost || 0);
            packetsReceived += Math.max(0, inbound.packetsReceived || 0);
          }
        });
        const lossRate = packetsLost / Math.max(1, packetsLost + packetsReceived);
        const next: NetworkQuality = roundTripTime > .6 || lossRate > .08
          ? "weak"
          : roundTripTime > .25 || lossRate > .025
            ? "stable"
            : "excellent";
        if (active) setNetworkQuality(next);
      } catch {
        if (active) setNetworkQuality("stable");
      }
    };
    void sample();
    const timer = window.setInterval(() => void sample(), 3_000);
    return () => { active = false; window.clearInterval(timer); };
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
      <section className="lawyer-call-device-controls" aria-label={ru ? "Устройства звонка" : "Qo‘ng‘iroq qurilmalari"}>
        <label><Camera aria-hidden="true" /><span>{ru ? "Камера" : "Kamera"}</span><select value={cameraDeviceId} disabled={switchingDevice !== ""} onChange={(event) => void switchInput("camera", event.target.value)}>{devices.cameras.map((device, index) => <option value={device.deviceId} key={device.deviceId}>{device.label || `${ru ? "Камера" : "Kamera"} ${index + 1}`}</option>)}</select></label>
        <label><Mic aria-hidden="true" /><span>{ru ? "Микрофон" : "Mikrofon"}</span><select value={microphoneDeviceId} disabled={switchingDevice !== ""} onChange={(event) => void switchInput("microphone", event.target.value)}>{devices.microphones.map((device, index) => <option value={device.deviceId} key={device.deviceId}>{device.label || `${ru ? "Микрофон" : "Mikrofon"} ${index + 1}`}</option>)}</select></label>
        {devices.speakers.length > 0 && <label><Volume2 aria-hidden="true" /><span>{ru ? "Динамик" : "Dinamik"}</span><select value={speakerDeviceId} disabled={switchingDevice !== ""} onChange={(event) => void switchSpeaker(event.target.value)}><option value="">{ru ? "Системный вывод" : "Tizim chiqishi"}</option>{devices.speakers.map((device, index) => <option value={device.deviceId} key={device.deviceId}>{device.label || `${ru ? "Динамик" : "Dinamik"} ${index + 1}`}</option>)}</select></label>}
        <p data-quality={networkQuality}><Wifi aria-hidden="true" /><span>{ru ? "Качество сети" : "Tarmoq sifati"}</span><strong>{networkQualityLabel(networkQuality, ru)}</strong>{switchingDevice && <LoaderCircle className="spin" aria-label={ru ? "Переключаем устройство" : "Qurilma almashtirilmoqda"} />}</p>
      </section>
      {prepared && !prepared.relayAvailable && <p className="lawyer-call-warning"><CircleAlert />{ru ? "TURN relay не настроен: прямой WebRTC может не пройти через строгий firewall." : "TURN relay sozlanmagan: to‘g‘ridan-to‘g‘ri WebRTC qat’iy firewall orqali o‘tmasligi mumkin."}</p>}
      <div className="lawyer-call-controls">
        <button type="button" onClick={() => toggleTrack("audio")} aria-pressed={!microphoneOn}>{microphoneOn ? <Mic /> : <MicOff />}<span>{ru ? "Микрофон" : "Mikrofon"}</span></button>
        <button type="button" onClick={() => toggleTrack("video")} aria-pressed={!cameraOn}>{cameraOn ? <Camera /> : <CameraOff />}<span>{cameraOn ? (ru ? "Камера" : "Kamera") : (ru ? "Только аудио" : "Faqat audio")}</span></button>
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

function networkQualityLabel(quality: NetworkQuality, ru: boolean) {
  const labels: Record<NetworkQuality, [string, string]> = {
    checking: ["Проверяем", "Tekshirilmoqda"],
    excellent: ["Отличное", "A’lo"],
    stable: ["Стабильное", "Barqaror"],
    weak: ["Слабое", "Zaif"],
  };
  return labels[quality][ru ? 0 : 1];
}
