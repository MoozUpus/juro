export type RequiredContentLength =
  | { ok: true; bytes: number }
  | { ok: false; reason: "missing" | "invalid" | "too_large" };

export const MULTIPART_OVERHEAD_BYTES = 512 * 1024;

export function requiredContentLength(
  request: Request,
  maxBytes: number,
): RequiredContentLength {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("INVALID_REQUEST_BODY_LIMIT");
  }
  const raw = request.headers.get("content-length");
  if (raw === null) return { ok: false, reason: "missing" };
  if (!/^(?:0|[1-9]\d*)$/u.test(raw)) return { ok: false, reason: "invalid" };
  const bytes = Number(raw);
  if (!Number.isSafeInteger(bytes) || bytes < 1) return { ok: false, reason: "invalid" };
  if (bytes > maxBytes) return { ok: false, reason: "too_large" };
  return { ok: true, bytes };
}
