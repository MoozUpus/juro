"use client";

import { Mic, Pause, Play, RotateCcw, Square, Trash2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { deleteVoiceRecording, uploadAndTranscribeVoice } from "../../lib/ai/client-voice";
import type { VoiceRecorderPhase, VoiceSpeechPhase } from "../../lib/ai/voice-ui";
import type { PlatformLocale } from "../../lib/platform/routing";

function monotonicNow(): number {
  return performance.now();
}

const voiceCopy = {
  ru: {
    unsupported: "Браузер не поддерживает безопасную запись микрофона.",
    microphoneUnavailable: "Микрофон недоступен. Разрешите доступ в браузере или используйте текст.",
    emptyRecording: "Запись пуста. Попробуйте ещё раз.",
    inputAria: "Голосовой ввод",
    recordQuestionAria: "Записать вопрос голосом",
    recordQuestion: "Записать вопрос",
    resume: "Продолжить",
    pause: "Пауза",
    finish: "Завершить",
    cancel: "Отменить",
    removeAudio: "Удалить аудио",
    retry: "Повторить",
    processingAria: "Обработка голосовой записи",
    speechUnavailable: "Озвучивание недоступно.",
    playbackBlocked: "Браузер не разрешил воспроизведение. Нажмите повтор.",
    aiVoice: "AI-голос",
    preparingAudio: "Готовим аудио…",
    speakAnswer: "Озвучить ответ",
    unmute: "Включить звук",
    mute: "Без звука",
    stop: "Остановить",
    replay: "Повторить",
    syntheticNotice: "Синтетический AI-голос, не живой юрист.",
    phases: {
      idle: "Микрофон включается только после нажатия.",
      listening: "Идёт запись.",
      paused: "Запись приостановлена.",
      hashing: "Проверяем запись перед загрузкой…",
      uploading: "Загружаем в private R2…",
      finalizing: "Проверяем формат и контрольную сумму…",
      transcribing: "Распознаём речь…",
      ready: "Текст распознан. Проверьте его в поле и отправьте.",
      error: "Голосовая запись не завершена.",
    },
  },
  uz: {
    unsupported: "Brauzer xavfsiz mikrofon yozuvini qo‘llamaydi.",
    microphoneUnavailable: "Mikrofon mavjud emas. Brauzerda ruxsat bering yoki matndan foydalaning.",
    emptyRecording: "Yozuv bo‘sh. Qayta urinib ko‘ring.",
    inputAria: "Ovozli kiritish",
    recordQuestionAria: "Savolni ovoz bilan yozish",
    recordQuestion: "Savolni yozish",
    resume: "Davom etish",
    pause: "Pauza",
    finish: "Tugatish",
    cancel: "Bekor qilish",
    removeAudio: "Audioni o‘chirish",
    retry: "Qayta urinish",
    processingAria: "Ovozli yozuv qayta ishlanmoqda",
    speechUnavailable: "Ovoz chiqarish mavjud emas.",
    playbackBlocked: "Brauzer ijro etishga ruxsat bermadi. Qayta urinishni bosing.",
    aiVoice: "AI ovozi",
    preparingAudio: "Audio tayyorlanmoqda…",
    speakAnswer: "Javobni ovozlantirish",
    unmute: "Ovozni yoqish",
    mute: "Ovozni o‘chirish",
    stop: "To‘xtatish",
    replay: "Qayta eshitish",
    syntheticNotice: "Sun’iy AI ovozi, tirik yurist emas.",
    phases: {
      idle: "Mikrofon faqat bosgandan keyin yoqiladi.",
      listening: "Yozuv davom etmoqda.",
      paused: "Yozuv pauzada.",
      hashing: "Yozuv yuklashdan oldin tekshirilmoqda…",
      uploading: "Private R2 ga yuklanmoqda…",
      finalizing: "Format va nazorat summasi tekshirilmoqda…",
      transcribing: "Nutq matnga aylantirilmoqda…",
      ready: "Matn tayyor. Uni maydonda tekshirib yuboring.",
      error: "Ovozli yozuv yakunlanmadi.",
    },
  },
  en: {
    unsupported: "This browser does not support secure microphone recording.",
    microphoneUnavailable: "The microphone is unavailable. Allow access in your browser or enter the question as text.",
    emptyRecording: "The recording is empty. Try again.",
    inputAria: "Voice input",
    recordQuestionAria: "Record a voice question",
    recordQuestion: "Record question",
    resume: "Resume",
    pause: "Pause",
    finish: "Finish",
    cancel: "Cancel",
    removeAudio: "Delete audio",
    retry: "Try again",
    processingAria: "Processing voice recording",
    speechUnavailable: "Text-to-speech is unavailable.",
    playbackBlocked: "Your browser blocked playback. Select replay to try again.",
    aiVoice: "AI voice",
    preparingAudio: "Preparing audio…",
    speakAnswer: "Listen to answer",
    unmute: "Turn sound on",
    mute: "Mute",
    stop: "Stop",
    replay: "Replay",
    syntheticNotice: "Synthetic AI voice, not a live lawyer.",
    phases: {
      idle: "The microphone turns on only after you select record.",
      listening: "Recording in progress.",
      paused: "Recording paused.",
      hashing: "Checking the recording before upload…",
      uploading: "Uploading to private storage…",
      finalizing: "Checking the format and checksum…",
      transcribing: "Transcribing speech…",
      ready: "Transcript ready. Review it in the field before sending.",
      error: "The voice recording was not completed.",
    },
  },
} as const;

export function VoiceMessageControls(props: {
  locale: PlatformLocale;
  disabled: boolean;
  onTranscript: (value: { recordingId: string; transcript: string }) => void;
  onClear: () => void;
  recordingId: string;
  presentation?: "inline" | "stage";
  onPhaseChange?: (phase: VoiceRecorderPhase) => void;
}) {
  const t = voiceCopy[props.locale];
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
      setError(t.unsupported);
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
      setError(t.microphoneUnavailable);
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
      setError(t.emptyRecording);
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
  return <section className={`ai-voice-controls ${props.presentation === "stage" ? "is-stage" : ""}`} data-phase={phase} aria-label={t.inputAria}>
    <div className="ai-voice-actions">
      {phase === "idle" && <button type="button" disabled={props.disabled} aria-label={t.recordQuestionAria} title={t.recordQuestionAria} onClick={() => void start()}><Mic /><span>{t.recordQuestion}</span></button>}
      {(phase === "listening" || phase === "paused") && <>
        <button type="button" onClick={pauseOrResume}>{phase === "paused" ? <Play /> : <Pause />}{phase === "paused" ? t.resume : t.pause}</button>
        <button type="button" onClick={() => recorderRef.current?.stop()}><Square />{t.finish}</button>
        <button type="button" onClick={cancel}><Trash2 />{t.cancel}</button>
      </>}
      {phase === "ready" && <button type="button" onClick={() => void clear()}><Trash2 />{t.removeAudio}</button>}
      {phase === "error" && <button type="button" onClick={() => { setPhase("idle"); setError(""); }}><RotateCcw />{t.retry}</button>}
    </div>
    {(phase === "listening" || phase === "paused") && <output>{formatElapsed(elapsedMs)} / 05:00</output>}
    <p role={phase === "error" ? "alert" : "status"} aria-live="polite">
      {error || phaseLabel(phase, props.locale)}
    </p>
    {busy && <progress aria-label={t.processingAria} />}
  </section>;
}

export function AssistantSpeechControls(props: { locale: PlatformLocale; assistantMessageId: string; disabled?: boolean; onPhaseChange?: (phase: VoiceSpeechPhase) => void }) {
  const t = voiceCopy[props.locale];
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
        throw new Error(body?.error || t.speechUnavailable);
      }
      const nextUrl = URL.createObjectURL(await response.blob());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(nextUrl);
      window.setTimeout(() => {
        void audioRef.current?.play().catch(() => {
          setError(t.playbackBlocked);
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
    <label>{t.aiVoice}<select value={voice} onChange={(event) => setVoice(event.target.value as "marin" | "cedar")}><option value="marin">Marin</option><option value="cedar">Cedar</option></select></label>
    <button type="button" disabled={props.disabled || loading} onClick={() => void speak()}><Volume2 />{loading ? t.preparingAudio : t.speakAnswer}</button>
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
      <button type="button" aria-pressed={muted} onClick={() => setMuted((value) => !value)}>{muted ? <VolumeX /> : <Volume2 />}{muted ? t.unmute : t.mute}</button>
      <button type="button" onClick={stop}><Square />{t.stop}</button>
      <button type="button" onClick={replay}><RotateCcw />{t.replay}</button>
    </>}
    <small>{t.syntheticNotice}</small>
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

function phaseLabel(phase: VoiceRecorderPhase, locale: PlatformLocale) {
  return voiceCopy[locale].phases[phase];
}
