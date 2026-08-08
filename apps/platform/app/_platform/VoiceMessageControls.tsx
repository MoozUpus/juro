"use client";

import { Mic, Pause, Play, RotateCcw, Square, Trash2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { deleteVoiceRecording, uploadAndTranscribeVoice } from "../../lib/ai/client-voice";
import type { VoiceRecorderPhase, VoiceSpeechPhase } from "../../lib/ai/voice-ui";
import type { PlatformLocale } from "../../lib/platform/routing";

function monotonicNow(): number {
  return performance.now();
}

export function VoiceMessageControls(props: {
  locale: PlatformLocale;
  disabled: boolean;
  onTranscript: (value: { recordingId: string; transcript: string }) => void;
  onClear: () => void;
  recordingId: string;
  presentation?: "inline" | "stage";
  onPhaseChange?: (phase: VoiceRecorderPhase) => void;
}) {
  const ru = props.locale === "ru";
  const onPhaseChange = props.onPhaseChange;
  const [phase, setPhase] = useState<VoiceRecorderPhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const pausedAtRef = useRef(0);
  const pausedTotalRef = useRef(0);
  const cancelledRef = useRef(false);

  useEffect(() => () => releaseMedia(recorderRef, streamRef), []);
  useEffect(() => { onPhaseChange?.(phase); }, [phase, onPhaseChange]);

  useEffect(() => {
    if (phase !== "listening") return;
    const update = () => {
      const elapsed = Math.min(300_000, monotonicNow() - startedAtRef.current - pausedTotalRef.current);
      setElapsedMs(elapsed);
      if (elapsed >= 300_000) recorderRef.current?.stop();
    };
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [phase]);

  async function start() {
    if (props.disabled || phase !== "idle") return;
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setPhase("error");
      setError(ru ? "Браузер не поддерживает безопасную запись микрофона." : "Brauzer xavfsiz mikrofon yozuvini qo‘llamaydi.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredMimeType();
      if (!mimeType) throw new TypeError("VOICE_MIME_UNSUPPORTED");
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      streamRef.current = stream;
      chunksRef.current = [];
      startedAtRef.current = monotonicNow();
      pausedTotalRef.current = 0;
      cancelledRef.current = false;
      recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunksRef.current.push(event.data); });
      recorder.addEventListener("stop", () => { void processStoppedRecording(mimeType); }, { once: true });
      recorder.start(250);
      setElapsedMs(0);
      setPhase("listening");
    } catch {
      releaseMedia(recorderRef, streamRef);
      setPhase("error");
      setError(ru ? "Микрофон недоступен. Разрешите доступ в браузере или используйте текст." : "Mikrofon mavjud emas. Brauzerda ruxsat bering yoki matndan foydalaning.");
    }
  }

  async function processStoppedRecording(mimeType: string) {
    releaseMedia(recorderRef, streamRef);
    if (cancelledRef.current) {
      chunksRef.current = [];
      setPhase("idle");
      setElapsedMs(0);
      return;
    }
    const durationMs = Math.max(1, monotonicNow() - startedAtRef.current - pausedTotalRef.current);
    const blob = new Blob(chunksRef.current, { type: mimeType.split(";", 1)[0] });
    chunksRef.current = [];
    if (!blob.size) {
      setPhase("error");
      setError(ru ? "Запись пуста. Попробуйте ещё раз." : "Yozuv bo‘sh. Qayta urinib ko‘ring.");
      return;
    }
    try {
      const result = await uploadAndTranscribeVoice({
        blob, durationMs, locale: props.locale,
        onPhase: setPhase,
      });
      props.onTranscript({ recordingId: result.recording.id, transcript: result.transcript });
      setPhase("ready");
    } catch (value) {
      setPhase("error");
      setError(value instanceof Error ? value.message : String(value));
    }
  }

  function pauseOrResume() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (phase === "listening" && recorder.state === "recording") {
      recorder.pause();
      pausedAtRef.current = monotonicNow();
      setPhase("paused");
    } else if (phase === "paused" && recorder.state === "paused") {
      pausedTotalRef.current += monotonicNow() - pausedAtRef.current;
      recorder.resume();
      setPhase("listening");
    }
  }

  function cancel() {
    cancelledRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    else releaseMedia(recorderRef, streamRef);
  }

  async function clear() {
    if (props.recordingId) await deleteVoiceRecording(props.recordingId, props.locale).catch(() => undefined);
    props.onClear();
    setPhase("idle");
    setElapsedMs(0);
    setError("");
  }

  const busy = new Set<VoiceRecorderPhase>(["hashing", "uploading", "finalizing", "transcribing"]).has(phase);
  return <section className={`ai-voice-controls ${props.presentation === "stage" ? "is-stage" : ""}`} data-phase={phase} aria-label={ru ? "Голосовой ввод" : "Ovozli kiritish"}>
    <div className="ai-voice-actions">
      {phase === "idle" && <button type="button" disabled={props.disabled} onClick={() => void start()}><Mic />{ru ? "Записать вопрос" : "Savolni yozish"}</button>}
      {(phase === "listening" || phase === "paused") && <>
        <button type="button" onClick={pauseOrResume}>{phase === "paused" ? <Play /> : <Pause />}{phase === "paused" ? (ru ? "Продолжить" : "Davom etish") : (ru ? "Пауза" : "Pauza")}</button>
        <button type="button" onClick={() => recorderRef.current?.stop()}><Square />{ru ? "Завершить" : "Tugatish"}</button>
        <button type="button" onClick={cancel}><Trash2 />{ru ? "Отменить" : "Bekor qilish"}</button>
      </>}
      {phase === "ready" && <button type="button" onClick={() => void clear()}><Trash2 />{ru ? "Удалить аудио" : "Audioni o‘chirish"}</button>}
      {phase === "error" && <button type="button" onClick={() => { setPhase("idle"); setError(""); }}><RotateCcw />{ru ? "Повторить" : "Qayta urinish"}</button>}
    </div>
    {(phase === "listening" || phase === "paused") && <output>{formatElapsed(elapsedMs)} / 05:00</output>}
    <p role={phase === "error" ? "alert" : "status"} aria-live="polite">
      {error || phaseLabel(phase, ru)}
    </p>
    {busy && <progress aria-label={ru ? "Обработка голосовой записи" : "Ovozli yozuv qayta ishlanmoqda"} />}
  </section>;
}

export function AssistantSpeechControls(props: { locale: PlatformLocale; assistantMessageId: string; disabled?: boolean; onPhaseChange?: (phase: VoiceSpeechPhase) => void }) {
  const ru = props.locale === "ru";
  const onPhaseChange = props.onPhaseChange;
  const [voice, setVoice] = useState<"marin" | "cedar">("marin");
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    onPhaseChange?.("idle");
  }, [audioUrl, onPhaseChange]);

  async function speak() {
    setLoading(true);
    setError("");
    onPhaseChange?.("preparing");
    try {
      const response = await fetch("/api/platform/voice/speech", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1", "x-juro-locale": props.locale },
        body: JSON.stringify({ assistantMessageId: props.assistantMessageId, voice, locale: props.locale }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || (ru ? "Озвучивание недоступно." : "Ovoz chiqarish mavjud emas."));
      }
      const nextUrl = URL.createObjectURL(await response.blob());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(nextUrl);
      window.setTimeout(() => {
        void audioRef.current?.play().catch(() => {
          setError(ru ? "Браузер не разрешил воспроизведение. Нажмите повтор." : "Brauzer ijro etishga ruxsat bermadi. Qayta urinishni bosing.");
          onPhaseChange?.("error");
        });
      }, 0);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
      onPhaseChange?.("error");
    } finally {
      setLoading(false);
    }
  }

  function stop() {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    onPhaseChange?.("completed");
  }

  function replay() {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    void audioRef.current.play().catch(() => onPhaseChange?.("error"));
  }

  return <div className="ai-speech-controls">
    <label>{ru ? "AI-голос" : "AI ovozi"}<select value={voice} onChange={(event) => setVoice(event.target.value as "marin" | "cedar")}><option value="marin">Marin</option><option value="cedar">Cedar</option></select></label>
    <button type="button" disabled={props.disabled || loading} onClick={() => void speak()}><Volume2 />{loading ? (ru ? "Готовим аудио…" : "Audio tayyorlanmoqda…") : (ru ? "Озвучить ответ" : "Javobni ovozlantirish")}</button>
    {audioUrl && <>
      <audio
        ref={audioRef}
        src={audioUrl}
        controls
        muted={muted}
        preload="metadata"
        onPlay={() => onPhaseChange?.("speaking")}
        onPause={() => { if (audioRef.current && audioRef.current.currentTime > 0 && !audioRef.current.ended) onPhaseChange?.("paused"); }}
        onEnded={() => onPhaseChange?.("completed")}
        onError={() => onPhaseChange?.("error")}
      />
      <button type="button" aria-pressed={muted} onClick={() => setMuted((value) => !value)}>{muted ? <VolumeX /> : <Volume2 />}{muted ? (ru ? "Включить звук" : "Ovozni yoqish") : (ru ? "Без звука" : "Ovozni o‘chirish")}</button>
      <button type="button" onClick={stop}><Square />{ru ? "Остановить" : "To‘xtatish"}</button>
      <button type="button" onClick={replay}><RotateCcw />{ru ? "Повторить" : "Qayta eshitish"}</button>
    </>}
    <small>{ru ? "Синтетический AI-голос, не живой юрист." : "Sun’iy AI ovozi, tirik yurist emas."}</small>
    {error && <p role="alert">{error}</p>}
  </div>;
}

function preferredMimeType(): string | null {
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((value) => MediaRecorder.isTypeSupported(value)) ?? null;
}

function releaseMedia(recorderRef: React.MutableRefObject<MediaRecorder | null>, streamRef: React.MutableRefObject<MediaStream | null>) {
  for (const track of streamRef.current?.getTracks() ?? []) track.stop();
  recorderRef.current = null;
  streamRef.current = null;
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1_000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function phaseLabel(phase: VoiceRecorderPhase, ru: boolean) {
  const labels: Record<VoiceRecorderPhase, [string, string]> = {
    idle: ["Микрофон включается только после нажатия.", "Mikrofon faqat bosgandan keyin yoqiladi."],
    listening: ["Идёт запись.", "Yozuv davom etmoqda."],
    paused: ["Запись приостановлена.", "Yozuv pauzada."],
    hashing: ["Проверяем запись перед загрузкой…", "Yozuv yuklashdan oldin tekshirilmoqda…"],
    uploading: ["Загружаем в private R2…", "Private R2 ga yuklanmoqda…"],
    finalizing: ["Проверяем формат и контрольную сумму…", "Format va nazorat summasi tekshirilmoqda…"],
    transcribing: ["Распознаём речь…", "Nutq matnga aylantirilmoqda…"],
    ready: ["Текст распознан. Проверьте его в поле и отправьте.", "Matn tayyor. Uni maydonda tekshirib yuboring."],
    error: ["Голосовая запись не завершена.", "Ovozli yozuv yakunlanmadi."],
  };
  return labels[phase][ru ? 0 : 1];
}
