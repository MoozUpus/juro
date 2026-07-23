import { getChatGPTUser } from "../../../app/chatgpt-auth";
import type { UserProfile } from "../types";
import { getOrCreateUserProfile } from "../storage/db";

export class ApiAuthError extends Error {
  constructor(message = "Для этого действия необходимо войти в JURO.") {
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
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) {
    throw new ApiAuthError("Запрос отклонён проверкой происхождения.");
  }
  if (request.headers.get("x-juro-csrf") !== "1") {
    throw new ApiAuthError("Запрос отклонён: отсутствует защитный заголовок.");
  }
}
