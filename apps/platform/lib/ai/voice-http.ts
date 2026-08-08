import { VoiceRecordingError } from "./voice-recording";

export type VoiceLocale = "ru" | "uz";

const VOICE_MESSAGES: Record<string, Record<VoiceLocale, string>> = {
  INVALID_JSON: { ru: "Некорректный JSON.", uz: "JSON formati noto‘g‘ri." },
  INVALID_CONTENT_TYPE: { ru: "Инициализация записи принимает только JSON.", uz: "Ovozli yozuvni boshlash faqat JSON qabul qiladi." },
  INVALID_VOICE_REQUEST: { ru: "Некорректные параметры голосовой функции.", uz: "Ovozli funksiya parametrlari noto‘g‘ri." },
  INVALID_IDEMPOTENCY_KEY: { ru: "Некорректный ключ повторного запроса.", uz: "Takroriy so‘rov kaliti noto‘g‘ri." },
  VOICE_IDEMPOTENCY_CONFLICT: { ru: "Повторная загрузка не совпадает с исходной.", uz: "Takroriy yuklash dastlabki yuklashga mos kelmadi." },
  VOICE_RECORDING_NOT_FOUND: { ru: "Голосовая запись недоступна.", uz: "Ovozli yozuv mavjud emas." },
  VOICE_RESPONSE_NOT_FOUND: { ru: "Ответ недоступен.", uz: "Javob mavjud emas." },
  VOICE_UPLOAD_STATE_INVALID: { ru: "Запись уже обработана либо ещё не готова.", uz: "Yozuv allaqachon qayta ishlangan yoki hali tayyor emas." },
  VOICE_UPLOAD_INTEGRITY_FAILED: { ru: "Не удалось подтвердить целостность аудио.", uz: "Audio yaxlitligini tasdiqlab bo‘lmadi." },
  VOICE_FORMAT_UNSUPPORTED: { ru: "Формат аудио не поддерживается.", uz: "Audio formati qo‘llab-quvvatlanmaydi." },
  VOICE_TRANSCRIPTION_BUSY: { ru: "Аудио уже распознаётся.", uz: "Audio allaqachon matnga aylantirilmoqda." },
  VOICE_TRANSCRIPTION_UNAVAILABLE: { ru: "Распознавание речи временно недоступно.", uz: "Nutqni matnga aylantirish vaqtincha mavjud emas." },
  VOICE_SPEECH_UNAVAILABLE: { ru: "Озвучивание временно недоступно.", uz: "Ovozli ijro vaqtincha mavjud emas." },
  VOICE_TRANSCRIPT_INVALID: { ru: "Проверьте распознанный текст.", uz: "Aniqlangan matnni tekshiring." },
  VOICE_TRANSCRIPT_MISMATCH: { ru: "Сначала подтвердите изменённый текст.", uz: "Avval o‘zgartirilgan matnni tasdiqlang." },
  VOICE_ENCRYPTION_UNAVAILABLE: { ru: "Распознанный текст временно недоступен.", uz: "Aniqlangan matn vaqtincha mavjud emas." },
};

export function voiceResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache", ...headers },
  });
}

export function voiceLocale(request: Request, fallback: VoiceLocale = "ru"): VoiceLocale {
  return request.headers.get("x-juro-locale") === "uz" ? "uz" : fallback;
}

export function voiceProblem(code: string, status: number, locale: VoiceLocale): Response {
  return voiceResponse({ code, error: VOICE_MESSAGES[code]?.[locale] ?? VOICE_MESSAGES.INVALID_VOICE_REQUEST[locale] }, status);
}

export function voiceErrorResponse(error: unknown, locale: VoiceLocale = "ru"): Response | null {
  if (error instanceof VoiceRecordingError) {
    return voiceProblem(error.code, error.status, locale);
  }
  if (error instanceof SyntaxError) {
    return voiceProblem("INVALID_JSON", 400, locale);
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
