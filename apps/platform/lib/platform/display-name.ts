const blockedNames = new Set([
  "test",
  "demo",
  "user",
  "admin",
  "asdf",
  "qwerty",
  "тест",
  "пользователь",
]);

/** Returns a name that is safe and credible enough for navigation and greetings. */
export function safeDisplayName(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (normalized.length < 2 || normalized.length > 80) return "";
  if (/[@<>]|https?:\/\/|www\./iu.test(normalized)) return "";
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'‘’ʻʼ -]*$/u.test(normalized)) return "";
  const letters = Array.from(normalized.toLocaleLowerCase()).filter((symbol) => /[\p{L}\p{M}]/u.test(symbol));
  if (letters.length < 2 || new Set(letters).size === 1) return "";
  if (blockedNames.has(normalized.toLocaleLowerCase())) return "";
  return normalized;
}
