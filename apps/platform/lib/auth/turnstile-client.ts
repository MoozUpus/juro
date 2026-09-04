export type TurnstileClientLocale = "ru" | "uz" | "en";

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
        : locale === "uz"
          ? "Xavfsizlik tekshiruvi xizmat sozlamalari sabab vaqtincha ishlamayapti. Keyinroq sahifani yangilang yoki yordam xizmatiga murojaat qiling."
          : "The security check is temporarily unavailable because of a service configuration issue. Try again later or contact support.",
    };
  }

  return {
    code,
    retryable,
    message: locale === "ru"
      ? "Проверка безопасности не завершилась. Повторите проверку."
      : locale === "uz"
        ? "Xavfsizlik tekshiruvi yakunlanmadi. Tekshiruvni takrorlang."
        : "The security check did not finish. Try the check again.",
  };
}
