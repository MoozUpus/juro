import { VoiceRecordingError } from "./voice-recording";

export function voiceResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache", ...headers },
  });
}

export function voiceErrorResponse(error: unknown): Response | null {
  if (error instanceof VoiceRecordingError) {
    return voiceResponse({ code: error.code, error: error.message }, error.status);
  }
  if (error instanceof SyntaxError) {
    return voiceResponse({ code: "INVALID_JSON", error: "Некорректный JSON." }, 400);
  }
  return null;
}

export function publicVoiceRecording(recording: {
  id: string;
  status: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  locale: string;
  expiresAt: string;
  errorCode: string | null;
}) {
  return {
    id: recording.id,
    status: recording.status,
    mimeType: recording.mimeType,
    sizeBytes: recording.sizeBytes,
    durationMs: recording.durationMs,
    locale: recording.locale,
    expiresAt: recording.expiresAt,
    errorCode: recording.errorCode,
  };
}
