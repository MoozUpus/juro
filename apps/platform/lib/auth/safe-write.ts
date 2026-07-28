export class ApiAuthError extends Error {
  constructor(
    message = "Для этого действия необходимо войти в JURO.",
    public readonly status = 401,
  ) {
    super(message);
    this.name = "ApiAuthError";
  }
}

export function assertSafeWrite(request: Request): void {
  const requestOrigin = new URL(request.url).origin;
  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin) {
    throw new ApiAuthError(
      "Запрос отклонён: отсутствует происхождение запроса.",
      403,
    );
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
    throw new ApiAuthError(
      "Запрос отклонён проверкой контекста браузера.",
      403,
    );
  }

  if (request.headers.get("x-juro-csrf") !== "1") {
    throw new ApiAuthError(
      "Запрос отклонён: отсутствует защитный заголовок.",
      403,
    );
  }
}
