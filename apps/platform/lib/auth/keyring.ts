const KEY_BYTES = 32;
const IV_BYTES = 12;
const MAX_KEY_VERSIONS = 8;

type KeyVersionConfig = {
  aead: string;
  hmac: string;
};

type SerializedKeyring = {
  active: string;
  versions: Record<string, KeyVersionConfig>;
};

export type IdentityKeyring = {
  activeVersion: string;
  versions: Map<string, { aead: Uint8Array; hmac: Uint8Array }>;
};

export type ProtectedIdentityValue = {
  ciphertext: string;
  iv: string;
  keyVersion: string;
};

export class IdentityKeyringError extends Error {
  constructor(
    public readonly code:
      | "KEYRING_MISSING"
      | "KEYRING_INVALID"
      | "KEY_VERSION_UNKNOWN"
      | "DECRYPTION_FAILED",
  ) {
    super(code);
    this.name = "IdentityKeyringError";
  }
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const raw = atob(base64);
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function bytesToBase64Url(value: Uint8Array): string {
  let raw = "";
  for (const byte of value) raw += String.fromCharCode(byte);
  return btoa(raw)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function parseKey(value: unknown): Uint8Array | null {
  if (typeof value !== "string") return null;
  const bytes = base64UrlToBytes(value);
  return bytes?.byteLength === KEY_BYTES ? bytes : null;
}

export function parseIdentityKeyring(
  raw: string | null | undefined,
): IdentityKeyring {
  if (!raw) throw new IdentityKeyringError("KEYRING_MISSING");
  let serialized: SerializedKeyring;
  try {
    serialized = JSON.parse(raw) as SerializedKeyring;
  } catch {
    throw new IdentityKeyringError("KEYRING_INVALID");
  }
  if (
    !serialized
    || typeof serialized !== "object"
    || typeof serialized.active !== "string"
    || !/^[a-z0-9][a-z0-9._-]{0,31}$/i.test(serialized.active)
    || !serialized.versions
    || typeof serialized.versions !== "object"
  ) {
    throw new IdentityKeyringError("KEYRING_INVALID");
  }
  const versions = new Map<
    string,
    { aead: Uint8Array; hmac: Uint8Array }
  >();
  for (const [version, config] of Object.entries(serialized.versions)) {
    if (
      !/^[a-z0-9][a-z0-9._-]{0,31}$/i.test(version)
      || !config
      || typeof config !== "object"
    ) {
      throw new IdentityKeyringError("KEYRING_INVALID");
    }
    const aead = parseKey(config.aead);
    const hmac = parseKey(config.hmac);
    if (!aead || !hmac) {
      throw new IdentityKeyringError("KEYRING_INVALID");
    }
    versions.set(version, { aead, hmac });
  }
  if (
    versions.size === 0
    || versions.size > MAX_KEY_VERSIONS
    || !versions.has(serialized.active)
  ) {
    throw new IdentityKeyringError("KEYRING_INVALID");
  }
  return { activeVersion: serialized.active, versions };
}

function versionKeys(
  keyring: IdentityKeyring,
  version: string,
): { aead: Uint8Array; hmac: Uint8Array } {
  const keys = keyring.versions.get(version);
  if (!keys) throw new IdentityKeyringError("KEY_VERSION_UNKNOWN");
  return keys;
}

function additionalData(input: {
  purpose: string;
  subjectId: string;
  recordId: string;
  keyVersion: string;
}): Uint8Array {
  for (const value of [
    input.purpose,
    input.subjectId,
    input.recordId,
    input.keyVersion,
  ]) {
    if (!value || value.includes("\n")) {
      throw new IdentityKeyringError("KEYRING_INVALID");
    }
  }
  return new TextEncoder().encode([
    "juro-identity-aead-v1",
    input.purpose,
    input.subjectId,
    input.recordId,
    input.keyVersion,
  ].join("\n"));
}

export async function protectIdentityValue(
  keyring: IdentityKeyring,
  plaintext: string,
  context: { purpose: string; subjectId: string; recordId: string },
): Promise<ProtectedIdentityValue> {
  const keyVersion = keyring.activeVersion;
  const keys = versionKeys(keyring, keyVersion);
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keys.aead),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(
        additionalData({ ...context, keyVersion }),
      ),
      tagLength: 128,
    },
    key,
    toArrayBuffer(new TextEncoder().encode(plaintext)),
  );
  return {
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    iv: bytesToBase64Url(iv),
    keyVersion,
  };
}

export async function revealIdentityValue(
  keyring: IdentityKeyring,
  value: ProtectedIdentityValue,
  context: { purpose: string; subjectId: string; recordId: string },
): Promise<string> {
  const keys = versionKeys(keyring, value.keyVersion);
  const iv = base64UrlToBytes(value.iv);
  const ciphertext = base64UrlToBytes(value.ciphertext);
  if (iv?.byteLength !== IV_BYTES || !ciphertext) {
    throw new IdentityKeyringError("DECRYPTION_FAILED");
  }
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      toArrayBuffer(keys.aead),
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(
          additionalData({
            ...context,
            keyVersion: value.keyVersion,
          }),
        ),
        tagLength: 128,
      },
      key,
      toArrayBuffer(ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    if (error instanceof IdentityKeyringError) throw error;
    throw new IdentityKeyringError("DECRYPTION_FAILED");
  }
}

export async function identityLookupHmac(
  keyring: IdentityKeyring,
  normalizedValue: string,
  purpose: string,
  keyVersion = keyring.activeVersion,
): Promise<{ digest: string; keyVersion: string }> {
  if (!purpose || purpose.includes("\n")) {
    throw new IdentityKeyringError("KEYRING_INVALID");
  }
  const keys = versionKeys(keyring, keyVersion);
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keys.hmac),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    toArrayBuffer(
      new TextEncoder().encode([
        "juro-identity-hmac-v1",
        purpose,
        normalizedValue,
      ].join("\n")),
    ),
  );
  return {
    digest: bytesToBase64Url(new Uint8Array(digest)),
    keyVersion,
  };
}
