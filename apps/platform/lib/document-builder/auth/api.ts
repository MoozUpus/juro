import { getChatGPTUser } from "../../../app/chatgpt-auth";
import { IdentityProtectionError } from "../../auth/identity-protection";
import type { UserProfile } from "../types";
import { getOrCreateUserProfile } from "../storage/db";

export class ApiAuthError extends Error {
  constructor(message = "Для этого действия необходимо войти в JURO.", public readonly status = 401) {
    super(message);
    this.name = "ApiAuthError";
  }
}

export async function optionalApiUser(): Promise<UserProfile | null> {
  const user = await getChatGPTUser();
  return user ? getOrCreateUserProfile(user) : null;
}

export async function requireApiUser(): Promise<UserProfile> {
  const profile = await optionalApiUser();
  if (!profile) throw new ApiAuthError();
  return profile;
}

export function assertSafeWrite(request: Request): void {
  const requestOrigin = new URL(request.url).origin;
  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin) {
    throw new ApiAuthError("Запрос отклонён: отсутствует происхождение запроса.", 403);
  }

  let canonicalOrigin: string;
  try {
    canonicalOrigin = new URL(suppliedOrigin).origin;
  } catch {
    throw new ApiAuthError("Запрос отклонён проверкой происхождения.", 403);
  }
  if (suppliedOrigin !== canonicalOrigin || canonicalOrigin !== requestOrigin) {
    throw new ApiAuthError("Запрос отклонён проверкой происхождения.", 403);
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") {
    throw new ApiAuthError("Запрос отклонён проверкой контекста браузера.", 403);
  }

  if (request.headers.get("x-juro-csrf") !== "1") {
    throw new ApiAuthError("Запрос отклонён: отсутствует защитный заголовок.", 403);
  }
}

export function withApiErrors<TArgs extends unknown[]>(handler: (...args: TArgs) => Promise<Response>) {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiAuthError) {
        return Response.json(
          { error: error.message },
          { status: error.status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } },
        );
      }
      if (error instanceof IdentityProtectionError) {
        return Response.json(
          {
            code: "IDENTITY_PROTECTION_UNAVAILABLE",
            error: "Защищённое хранилище идентификационных данных временно недоступно.",
          },
          {
            status: 503,
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
