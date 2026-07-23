"use client";

export class ApiClientError extends Error {
  code: string;
  status: number;
  payload: Record<string, unknown>;

  constructor(message: string, status: number, code = "REQUEST_FAILED", payload: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("x-juro-csrf", "1");
  if (init.body && typeof init.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(url, { ...init, headers, credentials: "same-origin" });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json() as Record<string, unknown>
    : { error: await response.text() };
  if (!response.ok) {
    throw new ApiClientError(
      typeof payload.error === "string" ? payload.error : "Не удалось выполнить операцию.",
      response.status,
      typeof payload.code === "string" ? payload.code : "REQUEST_FAILED",
      payload,
    );
  }
  return payload as T;
}

export async function downloadAuthenticatedFile(url: string, fileName: string): Promise<void> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiClientError(payload.error || "Не удалось скачать файл.", response.status);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
