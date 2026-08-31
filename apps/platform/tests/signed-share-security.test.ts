import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { sixDigitCode } from "../lib/document-builder/share-links/crypto";
import {
  reserveSignedShareAttempt,
  SIGNED_SHARE_ATTEMPT_LIMIT,
} from "../lib/document-builder/share-links/verification-attempts";

class SqliteD1Statement {
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly sql: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqliteD1Statement {
    return new SqliteD1Statement(this.sqlite, this.sql, values);
  }

  private bindings(): Array<null | number | bigint | string> {
    return this.values.map((value) => {
      if (value === null || typeof value === "number" || typeof value === "bigint" || typeof value === "string") return value;
      throw new TypeError("Unsupported test binding.");
    });
  }

  async first<T>(): Promise<T | null> {
    return (this.sqlite.prepare(this.sql).get(...this.bindings()) as T | undefined) ?? null;
  }
}

function d1(sqlite: DatabaseSync): D1Database {
  return {
    prepare: (sql: string) => new SqliteD1Statement(sqlite, sql),
  } as unknown as D1Database;
}

test("six-digit share codes use the full numeric presentation", () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(sixDigitCode(), /^\d{6}$/u);
  }
});

test("share verification atomically caps a window and resets only after lock expiry", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`CREATE TABLE standalone_signed_pdf_shares (
      id TEXT PRIMARY KEY NOT NULL,
      expires_at TEXT NOT NULL,
      deactivated_at TEXT,
      deleted_at TEXT,
      verification_attempt_count INTEGER DEFAULT 0 NOT NULL,
      verification_window_started_at TEXT,
      verification_locked_until TEXT
    )`);
    sqlite.prepare("INSERT INTO standalone_signed_pdf_shares(id,expires_at) VALUES (?,?)")
      .run("share-1", "2026-09-01T00:00:00.000Z");
    const database = d1(sqlite);
    const now = new Date("2026-08-31T16:00:00.000Z");
    for (let attempt = 1; attempt <= SIGNED_SHARE_ATTEMPT_LIMIT; attempt += 1) {
      const reservation = await reserveSignedShareAttempt(database, "share-1", now);
      assert.equal(reservation?.attemptCount, attempt);
      assert.equal(Boolean(reservation?.lockedUntil), attempt === SIGNED_SHARE_ATTEMPT_LIMIT);
    }
    assert.equal(await reserveSignedShareAttempt(database, "share-1", now), null);

    const afterLock = new Date("2026-08-31T16:16:00.000Z");
    const reset = await reserveSignedShareAttempt(database, "share-1", afterLock);
    assert.equal(reset?.attemptCount, 1);
    assert.equal(reset?.lockedUntil, null);
  } finally {
    sqlite.close();
  }
});

test("0147 removes stored plaintext codes and adds durable verification state", async () => {
  const migration = await readFile(new URL("../drizzle/0147_signed_share_verification_hardening.sql", import.meta.url), "utf8");
  assert.match(migration, /access_code_digits/u);
  assert.match(migration, /verification_attempt_count/u);
  assert.match(migration, /verification_locked_until/u);
  assert.match(migration, /SET `access_code` = ''/u);
  assert.match(migration, /signed_share_sessions_expiry_idx/u);
});
