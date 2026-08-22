import type { PlatformLocale } from "./routing";

type MediaErrorContext = "preflight" | "screen_share";

const CALL_ERROR_MESSAGES: Record<string, { ru: string; uz: string }> = {
  CALL_ENDED: {
    ru: "Звонок уже завершён. Вернитесь к консультациям, чтобы открыть актуальную встречу.",
    uz: "Qo‘ng‘iroq yakunlangan. Amaldagi uchrashuvni ochish uchun maslahatlar ro‘yxatiga qayting.",
  },
  CALL_NOT_FOUND: {
    ru: "Эта видеоконсультация недоступна для текущего аккаунта.",
    uz: "Bu video maslahat joriy hisob uchun mavjud emas.",
  },
  CALL_NOT_PREPARED: {
    ru: "Сначала проверьте камеру и микрофон, затем войдите в комнату.",
    uz: "Avval kamera va mikrofonni tekshiring, so‘ng xonaga kiring.",
  },
  CALL_STATE_UNAVAILABLE: {
    ru: "Звонок станет доступен после подтверждения консультации.",
    uz: "Qo‘ng‘iroq maslahat tasdiqlangandan keyin mavjud bo‘ladi.",
  },
  SIGNAL_RATE_LIMITED: {
    ru: "Соединение временно перегружено. Подождите несколько секунд и переподключитесь.",
    uz: "Ulanish vaqtincha band. Bir necha soniya kutib, qayta ulaning.",
  },
};

function errorName(value: unknown): string {
  if (!value || typeof value !== "object" || !("name" in value)) return "";
  return String((value as { name?: unknown }).name || "");
}

export function describeLawyerCallApiError(value: unknown, locale: PlatformLocale): string {
  const ru = locale === "ru";
  const code = value && typeof value === "object" && "code" in value
    ? String((value as { code?: unknown }).code || "")
    : value instanceof Error
      ? value.message
      : String(value || "");
  const message = CALL_ERROR_MESSAGES[code];
  if (message) return ru ? message.ru : message.uz;
  return ru
    ? "Не удалось обновить звонок. Проверьте соединение и повторите попытку."
    : "Qo‘ng‘iroqni yangilab bo‘lmadi. Ulanishni tekshirib, qayta urinib ko‘ring.";
}

export function describeLawyerCallMediaError(
  value: unknown,
  locale: PlatformLocale,
  context: MediaErrorContext = "preflight",
): string {
  const ru = locale === "ru";
  const name = errorName(value);

  if (context === "screen_share") {
    if (name === "NotAllowedError" || name === "SecurityError") {
      return ru
        ? "Показ экрана отменён или запрещён. Повторите и выберите окно или экран в Chrome."
        : "Ekran ko‘rsatish bekor qilindi yoki taqiqlandi. Qayta urinib, Chrome’da oyna yoki ekranni tanlang.";
    }
    if (name === "NotReadableError" || name === "AbortError") {
      return ru
        ? "Chrome не смог начать показ экрана. Закройте другое приложение, использующее захват экрана, и повторите."
        : "Chrome ekran ko‘rsatishni boshlay olmadi. Ekranni yozib olayotgan boshqa ilovani yoping va qayta urinib ko‘ring.";
    }
    return ru
      ? "Не удалось начать показ экрана. Повторите попытку в Chrome."
      : "Ekran ko‘rsatishni boshlab bo‘lmadi. Chrome’da qayta urinib ko‘ring.";
  }

  if (name === "NotAllowedError" || name === "SecurityError") {
    return ru
      ? "Доступ к камере и микрофону запрещён. В Chrome откройте настройки сайта слева от адресной строки, разрешите камеру и микрофон, затем повторите проверку."
      : "Kamera va mikrofonga ruxsat berilmadi. Chrome manzil satrining chap tomonidagi sayt sozlamalarini oching, kamera va mikrofonga ruxsat bering, so‘ng tekshiruvni takrorlang.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return ru
      ? "Камера или микрофон не найдены. Подключите устройство и повторите проверку."
      : "Kamera yoki mikrofon topilmadi. Qurilmani ulang va tekshiruvni takrorlang.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return ru
      ? "Камера или микрофон заняты другим приложением. Закройте его и повторите проверку."
      : "Kamera yoki mikrofon boshqa ilova tomonidan band. Uni yoping va tekshiruvni takrorlang.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return ru
      ? "Устройство не поддерживает запрошенный режим. Выберите другую камеру или микрофон и повторите проверку."
      : "Qurilma so‘ralgan rejimni qo‘llamaydi. Boshqa kamera yoki mikrofonni tanlab, tekshiruvni takrorlang.";
  }
  if (name === "AbortError") {
    return ru
      ? "Chrome прервал проверку устройств. Повторите попытку."
      : "Chrome qurilmalarni tekshirishni to‘xtatdi. Qayta urinib ko‘ring.";
  }
  return ru
    ? "Не удалось проверить камеру и микрофон. Проверьте разрешения Chrome и повторите попытку."
    : "Kamera va mikrofonni tekshirib bo‘lmadi. Chrome ruxsatlarini tekshirib, qayta urinib ko‘ring.";
}
