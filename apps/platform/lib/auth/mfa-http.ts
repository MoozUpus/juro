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

export type MfaLocale = "ru" | "uz" | "en";

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

export function optionalIdentityKeyring(): IdentityKeyring | null {
  const raw = runtimeEnv().IDENTITY_KEYRING?.trim();
  if (!raw) return null;
  return parseIdentityKeyring(raw);
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
  const localized = (ru: string, uz: string, en: string) =>
    locale === "ru" ? ru : locale === "uz" ? uz : en;
  if (
    error instanceof MfaConfigurationError
    || error instanceof IdentityKeyringError
  ) {
    return jsonNoStore({
      code: "MFA_CONFIGURATION_UNAVAILABLE",
      error: localized(
        "Двухфакторная защита временно недоступна.",
        "Ikki bosqichli himoya vaqtincha mavjud emas.",
        "Two-factor authentication is temporarily unavailable.",
      ),
    }, 503);
  }
  if (!(error instanceof MfaError)) return null;
  const messages: Record<MfaError["code"], [number, string, string, string]> = {
    MFA_ALREADY_ENABLED: [409, "Двухфакторная защита уже включена.", "Ikki bosqichli himoya allaqachon yoqilgan.", "Two-factor authentication is already enabled."],
    MFA_NOT_ENABLED: [409, "Двухфакторная защита не включена.", "Ikki bosqichli himoya yoqilmagan.", "Two-factor authentication is not enabled."],
    MFA_ENROLLMENT_NOT_FOUND: [404, "Настройка не найдена. Начните подключение заново.", "Sozlash topilmadi. Ulanishni qaytadan boshlang.", "The setup was not found. Start enrollment again."],
    MFA_ENROLLMENT_EXPIRED: [410, "Время настройки истекло. Начните подключение заново.", "Sozlash vaqti tugadi. Ulanishni qaytadan boshlang.", "The setup has expired. Start enrollment again."],
    MFA_ENROLLMENT_LOCKED: [429, "Попытки закончились. Начните подключение заново.", "Urinishlar tugadi. Ulanishni qaytadan boshlang.", "No attempts remain. Start enrollment again."],
    MFA_CHALLENGE_INVALID: [401, "Проверка входа недействительна. Начните вход заново.", "Kirish tekshiruvi yaroqsiz. Kirishni qaytadan boshlang.", "The sign-in check is invalid. Start signing in again."],
    MFA_CHALLENGE_EXPIRED: [401, "Время проверки истекло. Начните вход заново.", "Tekshiruv vaqti tugagan. Kirishni qaytadan boshlang.", "The sign-in check has expired. Start signing in again."],
    MFA_CHALLENGE_USED: [409, "Эта проверка уже использована. Начните вход заново.", "Bu tekshiruv allaqachon ishlatilgan. Kirishni qaytadan boshlang.", "This sign-in check has already been used. Start again."],
    MFA_ATTEMPTS_EXCEEDED: [429, "Попытки закончились. Начните вход заново.", "Urinishlar tugadi. Kirishni qaytadan boshlang.", "No attempts remain. Start signing in again."],
    MFA_RATE_LIMITED: [429, "Слишком много попыток второго фактора. Повторите позже.", "Ikkinchi omil urinishlari juda ko‘p. Keyinroq qayta urinib ko‘ring.", "Too many second-factor attempts. Try again later."],
    MFA_CODE_INCORRECT: [400, "Неверный код.", "Kod noto‘g‘ri.", "The code is incorrect."],
    MFA_CODE_REPLAYED: [409, "Этот одноразовый код уже использован. Дождитесь нового кода.", "Bu bir martalik kod ishlatilgan. Yangi kodni kuting.", "This one-time code has already been used. Wait for a new code."],
    LOCAL_SESSION_REQUIRED: [401, "Войдите в JURO, чтобы управлять защитой.", "Himoyani boshqarish uchun JURO hisobiga kiring.", "Sign in to JURO to manage account security."],
    SESSION_NOT_RECENT: [401, "Для этого действия войдите в JURO заново.", "Bu amal uchun JURO hisobiga qaytadan kiring.", "Sign in to JURO again to complete this action."],
    MFA_STATE_CONFLICT: [409, "Состояние защиты изменилось. Обновите страницу и повторите.", "Himoya holati o‘zgardi. Sahifani yangilab, qayta urinib ko‘ring.", "Your security settings changed. Refresh the page and try again."],
  };
  const [status, ruMessage, uzMessage, enMessage] = messages[error.code];
  return jsonNoStore({
    code: error.code,
    error: localized(ruMessage, uzMessage, enMessage),
  }, status);
}
