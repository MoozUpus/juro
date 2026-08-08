import { requireR2 } from "./runtime";
export {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_FILE_SIZE,
  sanitizeFileName,
  sha256Hex,
  validateUpload,
  validateUploadBytes,
} from "./file-validation";
export type { UploadInspection, UploadInspectionCode } from "./file-validation";

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
