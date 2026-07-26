const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const SECRET_BYTES = 20;
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_DIGITS = 6;
const ACCEPTED_WINDOW = 1;

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let buffer = 0;
  let encoded = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += BASE32_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) {
    encoded += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  }
  return encoded;
}

export function base32Decode(value: string): Uint8Array {
  const normalized = value.trim().toUpperCase();
  if (
    !/^[A-Z2-7]+={0,6}$/.test(normalized)
    || normalized.length === 0
    || normalized.includes("=")
      && !/^(?:[A-Z2-7]{8})*(?:[A-Z2-7]{2}======|[A-Z2-7]{4}====|[A-Z2-7]{5}===|[A-Z2-7]{7}=)?$/.test(
        normalized,
      )
  ) {
    throw new Error("INVALID_BASE32");
  }
  const unpadded = normalized.replace(/=+$/, "");
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];
  for (const character of unpadded) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("INVALID_BASE32");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >>> bits) & 0xff);
    }
  }
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) {
    throw new Error("INVALID_BASE32");
  }
  return Uint8Array.from(output);
}

function counterBytes(counter: number | bigint): Uint8Array {
  const numeric = typeof counter === "bigint" ? counter : BigInt(counter);
  if (numeric < 0n || numeric > 0xffff_ffff_ffff_ffffn) {
    throw new Error("INVALID_HOTP_COUNTER");
  }
  const bytes = new Uint8Array(8);
  let remaining = numeric;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

export async function hotpCode(
  secret: string,
  counter: number | bigint,
  digits = DEFAULT_DIGITS,
): Promise<string> {
  if (!Number.isInteger(digits) || digits < 6 || digits > 8) {
    throw new Error("INVALID_HOTP_DIGITS");
  }
  const keyBytes = base32Decode(secret);
  if (keyBytes.byteLength < 10 || keyBytes.byteLength > 128) {
    throw new Error("INVALID_TOTP_SECRET");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    toArrayBuffer(counterBytes(counter)),
  ));
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (
    ((digest[offset] & 0x7f) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3]
  ) >>> 0;
  return String(binary % (10 ** digits)).padStart(digits, "0");
}

export async function totpCode(
  secret: string,
  now = new Date(),
  options: { periodSeconds?: number; digits?: number } = {},
): Promise<{ code: string; counter: number }> {
  const periodSeconds = options.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const digits = options.digits ?? DEFAULT_DIGITS;
  if (
    !Number.isInteger(periodSeconds)
    || periodSeconds < 15
    || periodSeconds > 300
    || !Number.isFinite(now.getTime())
    || now.getTime() < 0
  ) {
    throw new Error("INVALID_TOTP_TIME");
  }
  const counter = Math.floor(now.getTime() / 1_000 / periodSeconds);
  return { code: await hotpCode(secret, counter, digits), counter };
}

export async function verifyTotpCode(
  secret: string,
  candidate: string,
  now = new Date(),
): Promise<{ matchedCounter: number } | null> {
  if (!/^\d{6}$/.test(candidate)) return null;
  const current = (await totpCode(secret, now)).counter;
  for (
    let counter = current - ACCEPTED_WINDOW;
    counter <= current + ACCEPTED_WINDOW;
    counter += 1
  ) {
    if (counter < 0) continue;
    const expected = await hotpCode(secret, counter);
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) {
      difference |= expected.charCodeAt(index) ^ candidate.charCodeAt(index);
    }
    if (difference === 0) return { matchedCounter: counter };
  }
  return null;
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
}
