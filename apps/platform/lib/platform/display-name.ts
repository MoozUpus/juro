const blockedNames = new Set([
  "test",
  "demo",
  "user",
  "admin",
  "client",
  "lawyer",
  "developer",
  "local",
  "qa",
  "juro",
  "asdf",
  "qwerty",
  "тест",
  "пользователь",
  "клиент",
  "юрист",
  "разработчик",
  "локальный",
]);

function looksLikeLatinKeyboardGibberish(token: string): boolean {
  if (Array.from(token).length < 4) return false;
  if (!/^[\p{Script=Latin}\p{M}]+$/u.test(token)) return false;
  const folded = token
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en");
  return !/[aeiouy]/u.test(folded);
}

/** Returns a name that is safe and credible enough for navigation and greetings. */
export function safeDisplayName(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (normalized.length < 2 || normalized.length > 80) return "";
  if (/[@<>]|https?:\/\/|www\./iu.test(normalized)) return "";
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'‘’ʻʼ -]*$/u.test(normalized)) return "";
  const letters = Array.from(normalized.toLocaleLowerCase()).filter((symbol) => /[\p{L}\p{M}]/u.test(symbol));
  if (letters.length < 2 || new Set(letters).size === 1) return "";
  const tokens = normalized
    .toLocaleLowerCase()
    .split(/[\s'‘’ʻʼ-]+/u)
    .filter(Boolean);
  if (tokens.some((token) => blockedNames.has(token))) return "";
  // A long Latin-script token without any vowel is usually text entered with
  // the wrong keyboard layout (or a keyboard mash), not a credible personal
  // name. Keep short international surnames such as "Ng" available while
  // preventing malformed profile data from becoming a prominent greeting.
  if (tokens.some(looksLikeLatinKeyboardGibberish)) return "";
  return normalized;
}
