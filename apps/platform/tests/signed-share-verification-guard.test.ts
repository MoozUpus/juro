import assert from "node:assert/strict";
import test from "node:test";
import {
  activeSignedShareVerificationGuard,
  clearSignedShareVerificationGuardStatement,
  recordSignedShareVerificationFailure,
} from "../lib/document-builder/share-links/verification-guard";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

test("signed share verification locks on the fifth failed code and does not extend an active lock", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  sqlite.exec("PRAGMA foreign_keys = OFF");
  const now = "2026-08-25T06:00:00.000Z";

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const guard = await recordSignedShareVerificationFailure(d1, "share-1", now);
    assert.equal(guard.failedAttemptCount, attempt);
    assert.equal(guard.lockedUntil, null);
    assert.equal(guard.retryAfterSeconds, 0);
  }

  const locked = await recordSignedShareVerificationFailure(d1, "share-1", now);
  assert.equal(locked.failedAttemptCount, 5);
  assert.equal(locked.lockedUntil, "2026-08-25T06:15:00.000Z");
  assert.equal(locked.retryAfterSeconds, 900);

  const repeated = await recordSignedShareVerificationFailure(
    d1,
    "share-1",
    "2026-08-25T06:01:00.000Z",
  );
  assert.equal(repeated.failedAttemptCount, 5);
  assert.equal(repeated.lockedUntil, locked.lockedUntil);
  assert.equal(repeated.retryAfterSeconds, 840);

  const active = await activeSignedShareVerificationGuard(
    d1,
    "share-1",
    "2026-08-25T06:14:59.500Z",
  );
  assert.equal(active?.retryAfterSeconds, 1);
  sqlite.close();
});

test("a successful code clears the guard and an expired window starts from one", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  sqlite.exec("PRAGMA foreign_keys = OFF");

  await recordSignedShareVerificationFailure(d1, "share-2", "2026-08-25T06:00:00.000Z");
  await d1.batch([
    clearSignedShareVerificationGuardStatement(d1, "share-2", "2026-08-25T06:01:00.000Z"),
  ]);
  assert.equal(
    await activeSignedShareVerificationGuard(d1, "share-2", "2026-08-25T06:01:00.000Z"),
    null,
  );
  const cleared = sqlite.prepare(
    "SELECT failed_attempt_count AS failedAttemptCount, locked_until AS lockedUntil FROM signed_share_verification_guards WHERE share_id = ?",
  ).get("share-2") as { failedAttemptCount: number; lockedUntil: string | null };
  assert.equal(cleared.failedAttemptCount, 0);
  assert.equal(cleared.lockedUntil, null);

  const afterWindow = await recordSignedShareVerificationFailure(
    d1,
    "share-2",
    "2026-08-25T06:17:00.000Z",
  );
  assert.equal(afterWindow.failedAttemptCount, 1);
  assert.equal(afterWindow.lockedUntil, null);
  sqlite.close();
});

test("the verification guard migration enforces count and lock invariants", () => {
  const { sqlite } = sqliteD1Fixture();
  sqlite.exec("PRAGMA foreign_keys = OFF");
  assert.throws(() => sqlite.prepare(
    `INSERT INTO signed_share_verification_guards
     (share_id, failed_attempt_count, window_started_at, locked_until, updated_at)
     VALUES (?, 6, ?, NULL, ?)`,
  ).run("share-invalid-count", "2026-08-25T06:00:00.000Z", "2026-08-25T06:00:00.000Z"));
  assert.throws(() => sqlite.prepare(
    `INSERT INTO signed_share_verification_guards
     (share_id, failed_attempt_count, window_started_at, locked_until, updated_at)
     VALUES (?, 5, ?, ?, ?)`,
  ).run(
    "share-invalid-lock",
    "2026-08-25T06:00:00.000Z",
    "2026-08-25T05:59:00.000Z",
    "2026-08-25T06:00:00.000Z",
  ));
  sqlite.close();
});
