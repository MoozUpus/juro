export function anthropicProviderErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const details = (error as { details?: unknown }).details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const code = (details as { error_code?: unknown }).error_code;
    if (typeof code === "string" && /^[a-zA-Z0-9_.-]{3,64}$/u.test(code)) return code;
  }

  const rawMessage = (error as { message?: unknown }).message;
  if (typeof rawMessage !== "string") return null;
  const message = rawMessage.toLowerCase();
  if (/usage limits|spend limit|monthly api usage threshold|workspace api usage limit/u.test(message)) {
    return "spend_limit_reached";
  }
  if (/credit balance|purchase credits|add credits/u.test(message)) return "credit_balance_low";
  if (/billing|payment method/u.test(message)) return "billing_configuration";
  if (/model.{0,80}(?:not available|not supported|invalid|does not exist)|invalid model/u.test(message)) {
    return "model_configuration";
  }
  if (/tool_choice|input_schema|json schema|schema/u.test(message)) return "tool_or_schema_configuration";
  if (/prompt is too long|context window|too many tokens|max_tokens/u.test(message)) return "token_limit";
  if (/x-client-request-id|client request id|invalid header/u.test(message)) return "request_header";
  if (/messages\.|system\.|invalid request body|malformed/u.test(message)) return "request_payload";
  return null;
}
