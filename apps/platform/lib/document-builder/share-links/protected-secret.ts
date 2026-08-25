import {
  IdentityKeyringError,
  protectIdentityValue,
  revealIdentityValue,
  type IdentityKeyring,
  type ProtectedIdentityValue,
} from "../../auth/keyring";

export type SignedShareSecretKind = "publicToken" | "accessCode";

export type SignedShareSecretRow = {
  id: string;
  ownerUserId: string;
  publicToken?: string;
  publicTokenCiphertext?: string | null;
  publicTokenIv?: string | null;
  publicTokenKeyVersion?: string | null;
  accessCode?: string;
  accessCodeCiphertext?: string | null;
  accessCodeIv?: string | null;
  accessCodeKeyVersion?: string | null;
};

export type ProtectedSignedShareSecret = {
  ciphertext: string;
  iv: string;
  keyVersion: string;
};

function purpose(kind: SignedShareSecretKind): string {
  return kind === "publicToken"
    ? "standalone-signed-share-public-token"
    : "standalone-signed-share-access-code";
}

function context(row: Pick<SignedShareSecretRow, "id" | "ownerUserId">, kind: SignedShareSecretKind) {
  return { purpose: purpose(kind), subjectId: row.ownerUserId, recordId: row.id };
}

function protectedValue(
  row: SignedShareSecretRow,
  kind: SignedShareSecretKind,
): ProtectedIdentityValue | null {
  const values = kind === "publicToken"
    ? [row.publicTokenCiphertext, row.publicTokenIv, row.publicTokenKeyVersion]
    : [row.accessCodeCiphertext, row.accessCodeIv, row.accessCodeKeyVersion];
  const populated = values.filter(value => value != null).length;
  if (populated === 0) return null;
  if (populated !== 3 || values.some(value => !value)) {
    throw new IdentityKeyringError("DECRYPTION_FAILED");
  }
  return { ciphertext: values[0]!, iv: values[1]!, keyVersion: values[2]! };
}

export async function protectSignedShareSecret(
  keyring: IdentityKeyring,
  row: Pick<SignedShareSecretRow, "id" | "ownerUserId">,
  kind: SignedShareSecretKind,
  plaintext: string,
): Promise<ProtectedSignedShareSecret> {
  if (!plaintext) throw new IdentityKeyringError("DECRYPTION_FAILED");
  return protectIdentityValue(keyring, plaintext, context(row, kind));
}

export async function resolveSignedShareSecret(
  keyring: IdentityKeyring,
  row: SignedShareSecretRow,
  kind: SignedShareSecretKind,
): Promise<{ plaintext: string; needsBackfill: boolean }> {
  const protectedSecret = protectedValue(row, kind);
  if (protectedSecret) {
    return {
      plaintext: await revealIdentityValue(keyring, protectedSecret, context(row, kind)),
      needsBackfill: false,
    };
  }
  const plaintext = kind === "publicToken" ? row.publicToken : row.accessCode;
  if (!plaintext) throw new IdentityKeyringError("DECRYPTION_FAILED");
  return { plaintext, needsBackfill: true };
}
