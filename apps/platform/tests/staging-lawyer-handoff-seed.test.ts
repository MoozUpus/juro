import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("staging lawyer handoff seed is explicit, synthetic, and idempotent", () => {
  const seed = readFileSync(new URL("../scripts/staging-lawyer-handoff-seed.sql", import.meta.url), "utf8");

  assert.match(seed, /SYNTHETIC STAGING FIXTURE ONLY/);
  assert.match(seed, /Never execute against production/);
  assert.match(seed, /fixtures\.invalid/);
  assert.match(seed, /INSERT OR IGNORE INTO user_profiles/);
  assert.match(seed, /INSERT OR IGNORE INTO lawyer_profiles/);
  assert.doesNotMatch(seed, /INSERT\s+INTO\s+(?:sessions|otp_challenges|cases|lawyer_requests|payment_attempts|marketplace_orders)/i);
});

test("staging lawyer handoff seed exposes both booking states without bypassing moderation", () => {
  const seed = readFileSync(new URL("../scripts/staging-lawyer-handoff-seed.sql", import.meta.url), "utf8");

  assert.match(seed, /'pending','pending_review'/);
  assert.match(seed, /INSERT OR IGNORE INTO lawyer_profile_moderation/);
  assert.match(seed, /Owner-authorized synthetic staging beta fixture/);
  assert.match(seed, /status='public_approved' AND marketplace_status='pending_review'/);
  assert.match(seed, /approved_fixture/);
  assert.match(seed, /pending_fixture/);
});
