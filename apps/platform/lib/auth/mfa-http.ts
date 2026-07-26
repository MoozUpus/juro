import {
  IdentityKeyringError,
  parseIdentityKeyring,
  type IdentityKeyring,
} from "./keyring";
import {
  MfaError,
  requireRecentLocalSession,
} from "./mfa-service";
import {
  localSessionFromCookie,
  type LocalSession,
} from "./session-management";
import { sessionTokenFromCookie } from "./session-token";
import {
  requireD1,
  runtimeEnv,
} from "../document-builder/storage/runtime";
import { runtimeIdentityProtection } from "./identity-runtime";

export type MfaLocale = "ru" | "uz";

export class MfaConfigurationError extends Error {
  constructor() {
    super("MFA_CONFIGURATION_UNAVAILABLE");
    this.name = "MfaConfigurationError";
  }
}

export function jsonNoStore(
  body: unknown,
  status = 200,
  cookies: string[] = [],
): Response {
  const headers = new Headers({
    "content-type": "application/json",
    "cache-control": "private, no-store",
    pragma: "no-cache",
  });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export function identityKeyring(): IdentityKeyring {
  try {
    return parseIdentityKeyring(runtimeEnv().IDENTITY_KEYRING);
  } catch (error) {
    if (error instanceof IdentityKeyringError) {
      throw new MfaConfigurationError();
    }
    throw error;
  }
}

export async function localSessionForRequest(
  request: Request,
  options: {
    recent?: boolean;
    minimumAssurance?: "primary" | "mfa";
    now?: Date;
  } = {},
): Promise<LocalSession> {
  const cookie = request.headers.get("cookie");
  if (!sessionTokenFromCookie(cookie)) {
    throw new MfaError("LOCAL_SESSION_REQUIRED");
  }
  const session = await localSessionFromCookie(
    requireD1(),
    cookie,
    {
      touch: false,
      now: options.now,
      identity: runtimeIdentityProtection(),
    },
  );
  if (!options.recent) {
    if (!session) throw new MfaError("LOCAL_SESSION_REQUIRED");
    return session;
  }
  return requireRecentLocalSession(session, {
    now: options.now,
    minimumAssurance: options.minimumAssurance,
  });
}

export function mfaErrorResponse(
  error: unknown,
  locale: MfaLocale,
): Response | null {
  const ru = locale === "ru";
  if (
    error instanceof MfaConfigurationError
    || error instanceof IdentityKeyringError
  ) {
    return jsonNoStore({
      code: "MFA_CONFIGURATION_UNAVAILABLE",
      error: ru
        ? "Двухфакторная защита временно недоступна."
        : "Ikki bosqichli himoya vaqtincha mavjud emas.",
    }, 503);
  }
  if (!(error instanceof MfaError)) return null;
  const messages: Record<MfaError["code"], [number, string, string]> = {
    MFA_ALREADY_ENABLED: [409, "Двухфакторная защита уже включена.", "Ikki bosqichli himoya allaqachon yoqilgan."],
    MFA_NOT_ENABLED: [409, "Двухфакторная защита не включена.", "Ikki bosqichli himoya yoqilmagan."],
    MFA_ENROLLMENT_NOT_FOUND: [404, "Настройка не найдена. Начните подключение заново.", "Sozlash topilmadi. Ulanishni qaytadan boshlang."],
    MFA_ENROLLMENT_EXPIRED: [410, "Время настройки истекло. Начните подключение заново.", "Sozlash vaqti tugadi. Ulanishni qaytadan boshlang."],
    MFA_ENROLLMENT_LOCKED: [429, "Попытки закончились. Начните подключение заново.", "Urinishlar tugadi. Ulanishni qaytadan boshlang."],
    MFA_CHALLENGE_INVALID: [401, "Проверка входа недействительна. Начните вход заново.", "Kirish tekshiruvi yaroqsiz. Kirishni qaytadan boshlang."],
    MFA_CHALLENGE_EXPIRED: [401, "Время проверки истекло. Начните вход заново.", "Tekshiruv vaqti tugagan. Kirishni qaytadan boshlang."],
    MFA_CHALLENGE_USED: [409, "Эта проверка уже использована. Начните вход заново.", "Bu tekshiruv allaqachon ishlatilgan. Kirishni qaytadan boshlang."],
    MFA_ATTEMPTS_EXCEEDED: [429, "Попытки закончились. Начните вход заново.", "Urinishlar tugadi. Kirishni qaytadan boshlang."],
    MFA_CODE_INCORRECT: [400, "Неверный код.", "Kod noto‘g‘ri."],
    MFA_CODE_REPLAYED: [409, "Этот одноразовый код уже использован. Дождитесь нового кода.", "Bu bir martalik kod ishlatilgan. Yangi kodni kuting."],
    LOCAL_SESSION_REQUIRED: [401, "Войдите через email-код JURO, чтобы управлять защитой.", "Himoyani boshqarish uchun JURO email-kodi orqali kiring."],
    SESSION_NOT_RECENT: [401, "Для этого действия войдите в JURO заново.", "Bu amal uchun JURO hisobiga qaytadan kiring."],
    MFA_STATE_CONFLICT: [409, "Состояние защиты изменилось. Обновите страницу и повторите.", "Himoya holati o‘zgardi. Sahifani yangilab, qayta urinib ko‘ring."],
  };
  const [status, ruMessage, uzMessage] = messages[error.code];
  return jsonNoStore({
    code: error.code,
    error: ru ? ruMessage : uzMessage,
  }, status);
}
