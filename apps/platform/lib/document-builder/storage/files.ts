import { requireR2 } from "./runtime";

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = new Map([
  ["application/pdf", ["pdf"]],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ["docx"]],
  ["image/jpeg", ["jpg", "jpeg"]],
  ["image/png", ["png"]],
]);

export function sanitizeFileName(input: string): string {
  const normalized = input.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim();
  const safe = normalized.replace(/^\.+/, "").slice(0, 180);
  return safe || "document";
}

export function validateUpload(file: File, signedPdfOnly = false): string | null {
  if (file.size <= 0) return "Файл пуст.";
  if (file.size > MAX_FILE_SIZE) return "Размер файла превышает 10 МБ.";
  const extension = file.name.split(".").pop()?.toLocaleLowerCase() ?? "";
  const allowed = ALLOWED_ATTACHMENT_TYPES.get(file.type);
  if (!allowed || !allowed.includes(extension)) return "Формат, MIME-тип или расширение файла не поддерживается.";
  if (signedPdfOnly && (file.type !== "application/pdf" || extension !== "pdf")) return "Подписанная версия должна быть PDF-файлом.";
  return null;
}

export async function putPrivateObject(
  key: string,
  bytes: ArrayBuffer | Uint8Array,
  mimeType: string,
  metadata: Record<string, string> = {},
): Promise<void> {
  const bucket = requireR2();
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: mimeType, cacheControl: "private, no-store" },
    customMetadata: metadata,
  });
}

export async function deletePrivateObject(key: string): Promise<void> {
  await requireR2().delete(key);
}

export async function getPrivateObject(key: string): Promise<R2ObjectBody | null> {
  return requireR2().get(key);
}
