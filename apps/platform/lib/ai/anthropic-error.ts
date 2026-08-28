export function anthropicProviderErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const code = (details as { error_code?: unknown }).error_code;
  return typeof code === "string" && /^[a-zA-Z0-9_.-]{3,64}$/u.test(code) ? code : null;
}
