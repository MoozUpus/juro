import {
  identityLookupHmac,
  type IdentityKeyring,
} from "./keyring";

const BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RAW_CODE_CHARACTERS = 16;
const DISPLAY_GROUP_CHARACTERS = 4;

function randomBackupCode(): string {
  const bytes = crypto.getRandomValues(
    new Uint8Array(RAW_CODE_CHARACTERS),
  );
  let code = "";
  for (const byte of bytes) code += BACKUP_ALPHABET[byte & 31];
  return code.match(new RegExp(
    `.{1,${DISPLAY_GROUP_CHARACTERS}}`,
    "g",
  ))!.join("-");
}

export function generateBackupCodes(count = 10): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new Error("INVALID_BACKUP_CODE_COUNT");
  }
  const codes = new Set<string>();
  while (codes.size < count) codes.add(randomBackupCode());
  return [...codes];
}

export function normalizeBackupCode(value: string): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const normalized = value.trim().toUpperCase().replaceAll("-", "");
  if (
    normalized.length !== RAW_CODE_CHARACTERS
    || [...normalized].some(character => !BACKUP_ALPHABET.includes(character))
  ) {
    return null;
  }
  return normalized;
}

export async function hashBackupCode(
  keyring: IdentityKeyring,
  input: {
    userId: string;
    batchId: string;
    code: string;
    keyVersion?: string;
  },
): Promise<{ digest: string; keyVersion: string }> {
  const normalized = normalizeBackupCode(input.code);
  if (!normalized || !input.userId || !input.batchId) {
    throw new Error("INVALID_BACKUP_CODE");
  }
  return identityLookupHmac(
    keyring,
    normalized,
    `backup-code:${input.userId}:${input.batchId}`,
    input.keyVersion,
  );
}

export async function verifyBackupCode(
  keyring: IdentityKeyring,
  input: {
    userId: string;
    batchId: string;
    code: string;
    digest: string;
    keyVersion: string;
  },
): Promise<boolean> {
  const normalized = normalizeBackupCode(input.code);
  if (!normalized || !/^[A-Za-z0-9_-]{43}$/.test(input.digest)) return false;
  const candidate = await hashBackupCode(keyring, {
    userId: input.userId,
    batchId: input.batchId,
    code: normalized,
    keyVersion: input.keyVersion,
  });
  const left = new TextEncoder().encode(input.digest);
  const right = new TextEncoder().encode(candidate.digest);
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}
