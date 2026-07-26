import { ApiAuthError } from "./api";
import { IdentityProtectionError } from "../../auth/identity-protection";
import { ServiceUnavailableError } from "../storage/runtime";

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function apiError(error: unknown): Response {
  if (error instanceof ApiAuthError) {
    return jsonResponse({ error: error.message, code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (error instanceof ServiceUnavailableError) {
    return jsonResponse({ error: error.message, code: error.code }, { status: 503 });
  }
  if (error instanceof IdentityProtectionError) {
    return jsonResponse({
      error: "Защищённое хранилище идентификационных данных временно недоступно.",
      code: "IDENTITY_PROTECTION_UNAVAILABLE",
    }, { status: 503 });
  }
  if (error instanceof SyntaxError) {
    return jsonResponse({ error: "Некорректный формат запроса.", code: "BAD_JSON" }, { status: 400 });
  }
  if (error instanceof Response) return error;
  return jsonResponse({ error: "Не удалось выполнить операцию. Попробуйте ещё раз.", code: "INTERNAL_ERROR" }, { status: 500 });
}

export function badRequest(message: string, code = "BAD_REQUEST"): Response {
  return jsonResponse({ error: message, code }, { status: 400 });
}

export function notFound(message = "Документ не найден."): Response {
  return jsonResponse({ error: message, code: "NOT_FOUND" }, { status: 404 });
}

export function forbidden(message = "У вас нет доступа к этому объекту."): Response {
  return jsonResponse({ error: message, code: "FORBIDDEN" }, { status: 403 });
}
