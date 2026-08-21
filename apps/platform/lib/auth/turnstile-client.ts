export type TurnstileClientLocale = "ru" | "uz";

export const turnstileClientRetryMode = "never" as const;

const nonRetryableTurnstileCodes = new Set([
  "110100",
  "110110",
  "110200",
  "400020",
  "400070",
]);

function normalizedTurnstileCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^\d{3,6}$/u.test(normalized) ? normalized : null;
}

export function turnstileClientFailure(
  value: unknown,
  locale: TurnstileClientLocale,
): { code: string | null; retryable: boolean; message: string } {
  const code = normalizedTurnstileCode(value);
  const retryable = !code || !nonRetryableTurnstileCodes.has(code);

  if (!retryable) {
    return {
      code,
      retryable,
      message: locale === "ru"
        ? "Проверка безопасности временно недоступна из-за настройки сервиса. Обновите страницу позже или обратитесь в поддержку."
        : "Xavfsizlik tekshiruvi xizmat sozlamalari sabab vaqtincha ishlamayapti. Keyinroq sahifani yangilang yoki yordam xizmatiga murojaat qiling.",
    };
  }

  return {
    code,
    retryable,
    message: locale === "ru"
      ? "Проверка безопасности не завершилась. Повторите проверку."
      : "Xavfsizlik tekshiruvi yakunlanmadi. Tekshiruvni takrorlang.",
  };
}
