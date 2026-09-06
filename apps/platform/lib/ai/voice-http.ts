import { VoiceRecordingError } from "./voice-recording";

export type VoiceLocale = "ru" | "uz" | "en";

const VOICE_MESSAGES: Record<string, Record<VoiceLocale, string>> = {
  INVALID_JSON: { ru: "Некорректный JSON.", uz: "JSON formati noto‘g‘ri.", en: "The JSON payload is invalid." },
  INVALID_CONTENT_TYPE: { ru: "Инициализация записи принимает только JSON.", uz: "Ovozli yozuvni boshlash faqat JSON qabul qiladi.", en: "A recording can be started only with a JSON request." },
  INVALID_VOICE_REQUEST: { ru: "Некорректные параметры голосовой функции.", uz: "Ovozli funksiya parametrlari noto‘g‘ri.", en: "Check the voice request settings." },
  INVALID_IDEMPOTENCY_KEY: { ru: "Некорректный ключ повторного запроса.", uz: "Takroriy so‘rov kaliti noto‘g‘ri.", en: "The retry key is invalid." },
  VOICE_IDEMPOTENCY_CONFLICT: { ru: "Повторная загрузка не совпадает с исходной.", uz: "Takroriy yuklash dastlabki yuklashga mos kelmadi.", en: "The repeated upload does not match the original request." },
  VOICE_RECORDING_NOT_FOUND: { ru: "Голосовая запись недоступна.", uz: "Ovozli yozuv mavjud emas.", en: "The voice recording is unavailable." },
  VOICE_RESPONSE_NOT_FOUND: { ru: "Ответ недоступен.", uz: "Javob mavjud emas.", en: "The response is unavailable." },
  VOICE_UPLOAD_STATE_INVALID: { ru: "Запись уже обработана либо ещё не готова.", uz: "Yozuv allaqachon qayta ishlangan yoki hali tayyor emas.", en: "The recording has already been processed or is not ready yet." },
  VOICE_UPLOAD_INTEGRITY_FAILED: { ru: "Не удалось подтвердить целостность аудио.", uz: "Audio yaxlitligini tasdiqlab bo‘lmadi.", en: "The audio integrity check failed." },
  VOICE_FORMAT_UNSUPPORTED: { ru: "Формат аудио не поддерживается.", uz: "Audio formati qo‘llab-quvvatlanmaydi.", en: "This audio format is not supported." },
  VOICE_TRANSCRIPTION_BUSY: { ru: "Аудио уже распознаётся.", uz: "Audio allaqachon matnga aylantirilmoqda.", en: "This audio is already being transcribed." },
  VOICE_TRANSCRIPTION_UNAVAILABLE: { ru: "Распознавание речи временно недоступно.", uz: "Nutqni matnga aylantirish vaqtincha mavjud emas.", en: "Speech transcription is temporarily unavailable." },
  VOICE_SPEECH_UNAVAILABLE: { ru: "Озвучивание временно недоступно.", uz: "Ovozli ijro vaqtincha mavjud emas.", en: "Text-to-speech is temporarily unavailable." },
  VOICE_TRANSCRIPT_INVALID: { ru: "Проверьте распознанный текст.", uz: "Aniqlangan matnni tekshiring.", en: "Check the transcribed text." },
  VOICE_TRANSCRIPT_MISMATCH: { ru: "Сначала подтвердите изменённый текст.", uz: "Avval o‘zgartirilgan matnni tasdiqlang.", en: "Confirm the edited transcript first." },
  VOICE_ENCRYPTION_UNAVAILABLE: { ru: "Распознанный текст временно недоступен.", uz: "Aniqlangan matn vaqtincha mavjud emas.", en: "The transcribed text is temporarily unavailable." },
};

export function voiceResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache", ...headers },
  });
}

export function voiceLocale(request: Request, fallback: VoiceLocale = "ru"): VoiceLocale {
  const locale = request.headers.get("x-juro-locale");
  return locale === "uz" || locale === "en" ? locale : fallback;
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
