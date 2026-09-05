import {
  requireD1,
} from "../document-builder/storage/runtime";
import { ApiAuthError } from "./safe-write";
import {
  localSessionForRequest,
  mfaErrorResponse,
} from "./mfa-http";
import {
  PlatformStaffAccessError,
  requirePlatformStaffAccess,
  type PlatformStaffAccess,
  type PlatformStaffCapability,
} from "./staff-access";
import {
  authLocaleFromRequest,
  type RequestAuthLocale,
} from "./request-locale";

export async function requirePlatformStaffRequest(
  request: Request,
  capability: PlatformStaffCapability,
  options: {
    now?: Date;
    freshMfaWithinMs?: number;
  } = {},
): Promise<PlatformStaffAccess> {
  const session = await localSessionForRequest(request, {
    now: options.now,
  });
  return requirePlatformStaffAccess(
    requireD1(),
    session,
    capability,
    options,
  );
}

function staffRequestLocale(request: Request): RequestAuthLocale {
  return authLocaleFromRequest(request);
}

function staffError(
  locale: RequestAuthLocale,
  messages: Record<RequestAuthLocale, string>,
): string {
  return messages[locale];
}

/**
 * Converts the shared local-session and staff-capability failures into typed,
 * no-store HTTP responses. Staff routes must use this wrapper so an absent,
 * expired, non-MFA, or unauthorized session never becomes an empty 500.
 */
export function withPlatformStaffErrors<TArgs extends [Request, ...unknown[]]>(
  handler: (...args: TArgs) => Promise<Response>,
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      const mfa = mfaErrorResponse(error, staffRequestLocale(args[0]));
      if (mfa) return mfa;
      if (error instanceof ApiAuthError) {
        const locale = staffRequestLocale(args[0]);
        const rejected = error.status === 403;
        return Response.json(
          {
            code: rejected ? "REQUEST_REJECTED" : "UNAUTHORIZED",
            error: rejected
              ? staffError(locale, {
                ru: "Запрос отклонён проверкой безопасности.",
                uz: "So‘rov xavfsizlik tekshiruvi tomonidan rad etildi.",
                en: "The request was rejected by the security check.",
              })
              : staffError(locale, {
                ru: "Для этого действия необходимо войти в JURO.",
                uz: "Bu amal uchun JURO hisobiga kiring.",
                en: "Sign in to JURO to complete this action.",
              }),
          },
          {
            status: rejected ? 403 : 401,
            headers: {
              "cache-control": "private, no-store",
              pragma: "no-cache",
            },
          },
        );
      }
      if (error instanceof PlatformStaffAccessError) {
        const locale = staffRequestLocale(args[0]);
        return Response.json(
          {
            code: "PLATFORM_STAFF_ACCESS_DENIED",
            error: staffError(locale, {
              ru: "У вашей учётной записи нет доступа к этому разделу.",
              uz: "Hisobingizda bu bo‘limga kirish huquqi yo‘q.",
              en: "Your account does not have access to this area.",
            }),
          },
          {
            status: 403,
            headers: {
              "cache-control": "private, no-store",
              pragma: "no-cache",
            },
          },
        );
      }
      throw error;
    }
  };
}
