export type VoiceRecorderPhase = "idle" | "listening" | "paused" | "hashing" | "uploading" | "finalizing" | "transcribing" | "ready" | "error";
export type VoiceSpeechPhase = "idle" | "preparing" | "speaking" | "paused" | "completed" | "error";
export type VoiceModeState = "idle" | "ready" | "listening" | "transcribing" | "thinking" | "speaking" | "paused" | "completed" | "offline" | "error";

export function resolveVoiceModeState(input: {
  configured: boolean;
  answerReady: boolean;
  sending: boolean;
  recorderPhase: VoiceRecorderPhase;
  speechPhase: VoiceSpeechPhase;
}): VoiceModeState {
  if (!input.configured) return "offline";
  if (input.speechPhase === "error" || input.recorderPhase === "error") return "error";
  if (input.speechPhase === "speaking") return "speaking";
  if (input.speechPhase === "paused" || input.recorderPhase === "paused") return "paused";
  if (input.speechPhase === "preparing" || input.sending) return "thinking";
  if (["hashing", "uploading", "finalizing", "transcribing"].includes(input.recorderPhase)) return "transcribing";
  if (input.recorderPhase === "listening") return "listening";
  if (input.speechPhase === "completed" || input.answerReady) return "completed";
  if (input.recorderPhase === "ready" || input.recorderPhase === "idle") return "ready";
  return "idle";
}
