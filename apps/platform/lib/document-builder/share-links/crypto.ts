import {
  identityLookupHmac,
  parseIdentityKeyring,
} from "../../auth/keyring";

const ACCESS_CODE_HMAC_PURPOSE = "signed-share-access-code";
const ACCESS_CODE_HMAC_PATTERN = /^h1:([a-z0-9][a-z0-9._-]{0,31}):([A-Za-z0-9_-]{43})$/u;

function secureEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0)
      ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function randomToken(bytes = 32): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function accessCodeVerifier(
  rawKeyring: string | null | undefined,
  code: string,
): Promise<string> {
  const verifier = await identityLookupHmac(
    parseIdentityKeyring(rawKeyring),
    code,
    ACCESS_CODE_HMAC_PURPOSE,
  );
  return `h1:${verifier.keyVersion}:${verifier.digest}`;
}

export async function accessCodeMatches(
  rawKeyring: string | null | undefined,
  code: string,
  storedVerifier: string,
): Promise<boolean> {
  const keyed = ACCESS_CODE_HMAC_PATTERN.exec(storedVerifier);
  if (!keyed) {
    return secureEqual(await sha256(code), storedVerifier);
  }
  const expected = await identityLookupHmac(
    parseIdentityKeyring(rawKeyring),
    code,
    ACCESS_CODE_HMAC_PURPOSE,
    keyed[1],
  );
  return secureEqual(expected.digest, keyed[2]);
}

export function sixDigitCode(): string {
  const data = new Uint32Array(1);
  const space = 1_000_000;
  const unbiasedLimit = 2 ** 32 - ((2 ** 32) % space);
  do crypto.getRandomValues(data);
  while (data[0] >= unbiasedLimit);
  return String(data[0] % space).padStart(6, "0");
}

export function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

export function addDays(iso: string, days: number): string {
  return addHours(iso, days * 24);
}
