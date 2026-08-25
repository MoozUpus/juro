import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import type { IdentityKeyring } from "../lib/auth/keyring";
import {
  protectSignedShareSecret,
  resolveSignedShareSecret,
} from "../lib/document-builder/share-links/protected-secret";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

function keyring(): IdentityKeyring {
  return {
    activeVersion: "v1",
    versions: new Map([
      ["v1", { aead: randomBytes(32), hmac: randomBytes(32) }],
    ]),
  };
}

test("signed share tokens and access codes are record-bound encrypted", async () => {
  const keys = keyring();
  const row = { id: "share-a", ownerUserId: "user-a" };
  const token = await protectSignedShareSecret(keys, row, "publicToken", "secret-token");
  const code = await protectSignedShareSecret(keys, row, "accessCode", "1234");

  assert.notEqual(token.ciphertext, "secret-token");
  assert.notEqual(code.ciphertext, "1234");
  assert.equal((await resolveSignedShareSecret(keys, {
    ...row,
    publicTokenCiphertext: token.ciphertext,
    publicTokenIv: token.iv,
    publicTokenKeyVersion: token.keyVersion,
  }, "publicToken")).plaintext, "secret-token");
  assert.equal((await resolveSignedShareSecret(keys, {
    ...row,
    accessCodeCiphertext: code.ciphertext,
    accessCodeIv: code.iv,
    accessCodeKeyVersion: code.keyVersion,
  }, "accessCode")).plaintext, "1234");

  await assert.rejects(resolveSignedShareSecret(keys, {
    id: "share-b",
    ownerUserId: "user-a",
    publicTokenCiphertext: token.ciphertext,
    publicTokenIv: token.iv,
    publicTokenKeyVersion: token.keyVersion,
  }, "publicToken"), /DECRYPTION_FAILED/);
});

test("legacy plaintext can be read once for lazy encryption while partial ciphertext fails closed", async () => {
  const keys = keyring();
  assert.deepEqual(await resolveSignedShareSecret(keys, {
    id: "share-legacy",
    ownerUserId: "user-a",
    accessCode: "5678",
  }, "accessCode"), { plaintext: "5678", needsBackfill: true });
  await assert.rejects(resolveSignedShareSecret(keys, {
    id: "share-corrupt",
    ownerUserId: "user-a",
    accessCodeCiphertext: "ciphertext-only",
  }, "accessCode"), /DECRYPTION_FAILED/);
});

test("D1 rejects a partial or plaintext-plus-ciphertext signed-share secret state", () => {
  const { sqlite } = sqliteD1Fixture();
  sqlite.exec("PRAGMA foreign_keys = OFF");
  const insert = (values: string) => sqlite.exec(
    `INSERT INTO standalone_signed_pdf_shares
     (id, file_id, owner_user_id, token_hash, public_token, public_token_ciphertext,
      public_token_iv, public_token_key_version, access_code, access_code_hash,
      access_code_ciphertext, access_code_iv, access_code_key_version, expires_at, created_at)
     VALUES (${values})`,
  );
  assert.throws(() => insert(
    "'share-partial', 'file-a', 'user-a', 'token-hash', '', 'cipher', NULL, 'v1', '1234', 'code-hash', NULL, NULL, NULL, '2026-08-26T00:00:00.000Z', '2026-08-25T00:00:00.000Z'",
  ));
  assert.throws(() => insert(
    "'share-plaintext', 'file-a', 'user-a', 'token-hash', 'token', 'cipher', 'iv', 'v1', '1234', 'code-hash', NULL, NULL, NULL, '2026-08-26T00:00:00.000Z', '2026-08-25T00:00:00.000Z'",
  ));
  sqlite.close();
});
