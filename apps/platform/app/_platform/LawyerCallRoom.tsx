"use client";

import Link from "next/link";
import { Camera, CameraOff, Cast, CircleAlert, LoaderCircle, Mic, MicOff, PhoneOff, RotateCcw, ShieldCheck, UsersRound, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

type IceServer = { urls: string | string[]; username?: string; credential?: string };
type PrepareResponse = { roomId: string; role: "client" | "lawyer"; peerName: string; iceServers: IceServer[]; relayAvailable: boolean; provider: string };
type Signal = { id: string; type: "offer" | "answer" | "ice" | "restart"; payload: Record<string, unknown>; createdAt: string };
type Phase = "preflight" | "preparing" | "ready" | "joining" | "waiting" | "connected" | "reconnecting" | "ended";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json() as T & { code?: string; error?: string };
  if (!response.ok) throw new Error(payload.error || payload.code || `HTTP ${response.status}`);
  return payload;
}

export function LawyerCallRoom({ locale, consultationId, returnPath }: { locale: PlatformLocale; consultationId: string; returnPath: string }) {
  const ru = locale === "ru";
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const cursor = useRef({ after: "", afterId: "" });
  const pollActive = useRef(false);
  const connectedAt = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>("preflight");
  const [prepared, setPrepared] = useState<PrepareResponse | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const endpoint = `/api/platform/lawyer-consultations/${encodeURIComponent(consultationId)}/call`;

  const post = useCallback(<T,>(body: Record<string, unknown>) => api<T>(endpoint, {
    method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" }, body: JSON.stringify(body),
  }), [endpoint]);

  const sendSignal = useCallback(async (type: Signal["type"], payload: Record<string, unknown>) => {
    await api(`${endpoint}/signals`, { method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" }, body: JSON.stringify({ type, payload }) });
  }, [endpoint]);

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
      setError(value instanceof Error ? value.message : String(value));
    } finally { pollActive.current = false; }
  }, [endpoint, handleSignal, phase]);

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
      const result = await post<PrepareResponse>({ action: "prepare", deviceReadiness: { camera: Boolean(camera), microphone: Boolean(microphone), speaker: typeof HTMLMediaElement !== "undefined", cameraLabel: camera?.label || undefined, microphoneLabel: microphone?.label || undefined } });
      setPrepared(result); setPhase("ready");
    } catch (value) {
      localStream.current?.getTracks().forEach((track) => track.stop()); localStream.current = null;
      setPhase("preflight"); setError(value instanceof Error ? value.message : String(value));
    }
  }

  async function join(reconnect = false) {
    if (!prepared || !localStream.current) return;
    setPhase(reconnect ? "reconnecting" : "joining"); setError("");
    try {
      if (!cursor.current.after) {
        cursor.current = { after: new Date(Date.now() - 2_000).toISOString(), afterId: "" };
      }
      peer.current?.close();
      const connection = new RTCPeerConnection({ iceServers: prepared.iceServers as RTCIceServer[], iceCandidatePoolSize: 4 });
      peer.current = connection;
      localStream.current.getTracks().forEach((track) => connection.addTrack(track, localStream.current!));
      connection.ontrack = (event) => { if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0]; };
      connection.onicecandidate = (event) => { if (event.candidate) void sendSignal("ice", event.candidate.toJSON() as unknown as Record<string, unknown>); };
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "connected") {
          connectedAt.current ??= Date.now(); setPhase("connected"); setError("");
        } else if (["disconnected", "failed"].includes(connection.connectionState)) setPhase("reconnecting");
        else if (connection.connectionState === "closed") setPhase((current) => current === "ended" ? current : "waiting");
      };
      await post({ action: "join", reconnect });
      setPhase("waiting");
      if (prepared.role === "lawyer") await createOffer(reconnect);
      else await sendSignal("restart", { reason: reconnect ? "client_reconnect" : "client_ready" });
    } catch (value) { setPhase("ready"); setError(value instanceof Error ? value.message : String(value)); }
  }

  async function shareScreen() {
    if (!peer.current || !navigator.mediaDevices.getDisplayMedia) return;
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = display.getVideoTracks()[0];
      const sender = peer.current.getSenders().find((item) => item.track?.kind === "video");
      if (!screenTrack || !sender) return;
      await sender.replaceTrack(screenTrack); setSharing(true);
      screenTrack.onended = () => { const cameraTrack = localStream.current?.getVideoTracks()[0]; if (cameraTrack) void sender.replaceTrack(cameraTrack); setSharing(false); };
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
  }

  async function endCall() {
    try { await post({ action: "end" }); } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    peer.current?.close(); localStream.current?.getTracks().forEach((track) => track.stop()); setPhase("ended");
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
    peer.current?.close(); localStream.current?.getTracks().forEach((track) => track.stop());
  }, []);

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
        <button type="button" onClick={() => void shareScreen()} disabled={!(["joining", "waiting", "connected", "reconnecting"] as Phase[]).includes(phase) || sharing}><Cast /><span>{sharing ? (ru ? "Экран показан" : "Ekran ko‘rsatilmoqda") : (ru ? "Показать экран" : "Ekranni ko‘rsatish")}</span></button>
        {phase === "reconnecting" && <button type="button" onClick={() => void join(true)}><RotateCcw /><span>{ru ? "Переподключить" : "Qayta ulash"}</span></button>}
        <button className="danger" type="button" onClick={() => void endCall()} disabled={phase === "ended"}><PhoneOff /><span>{ru ? "Завершить" : "Yakunlash"}</span></button>
      </div>
      {phase === "ready" && <button className="lawyer-call-join" type="button" onClick={() => void join()}>{ru ? "Войти в комнату" : "Xonaga kirish"}</button>}
      {phase === "joining" && <p className="lawyer-call-status"><LoaderCircle className="spin" />{ru ? "Подключение…" : "Ulanmoqda…"}</p>}
      {phase === "waiting" && <p className="lawyer-call-status"><UsersRound />{ru ? "Вы в комнате. Ожидаем второго участника…" : "Siz xonadasiz. Ikkinchi ishtirokchi kutilmoqda…"}</p>}
      {phase === "ended" && <p className="lawyer-call-status"><PhoneOff />{ru ? "Звонок завершён. Юрист может добавить итог консультации в карточке заявки." : "Qo‘ng‘iroq yakunlandi. Yurist so‘rov kartasiga maslahat yakunini qo‘shishi mumkin."}</p>}
    </section>
  </main>;
}
