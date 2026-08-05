import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const migration = readFileSync(
  new URL("../drizzle/0099_staging_email_delivery_probe.sql", import.meta.url),
  "utf8",
);
const journal = JSON.parse(
  readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
) as { entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }> };

test("migration 0099 is content-free, additive and journaled", () => {
  const entry = journal.entries.find((item) => item.tag === "0099_staging_email_delivery_probe");
  assert.deepEqual(entry, {
    idx: 99,
    version: "6",
    when: entry?.when,
    tag: "0099_staging_email_delivery_probe",
    breakpoints: true,
  });
  assert.match(migration, /CREATE TABLE `staging_email_delivery_probes`/u);
  assert.match(migration, /staging_email_delivery_probe_transition_guard/u);
  assert.doesNotMatch(migration, /`(?:email|recipient|body|html|subject|user_id|workspace_id)`/u);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/u);
});

test("0099 enforces immutable probe identity and terminal Resend receipt", () => {
  const { sqlite } = sqliteD1Fixture();
  const now = "2026-08-06T00:00:00.000Z";
  try {
    sqlite.prepare(
      `INSERT INTO staging_email_delivery_probes
       (probe_key,status,attempt_count,provider_message_id,error_code,sent_at,created_at,updated_at)
       VALUES ('staging-resend-delivery-v1','pending',0,NULL,NULL,NULL,?,?)`,
    ).run(now, now);
    assert.throws(
      () => sqlite.prepare("UPDATE staging_email_delivery_probes SET probe_key='staging-resend-other' WHERE probe_key='staging-resend-delivery-v1'").run(),
      /STAGING_EMAIL_DELIVERY_PROBE_(?:IDENTITY_IMMUTABLE|TRANSITION_INVALID)/u,
    );
    sqlite.prepare(
      "UPDATE staging_email_delivery_probes SET status='sending',attempt_count=1,updated_at=? WHERE probe_key='staging-resend-delivery-v1'",
    ).run(now);
    sqlite.prepare(
      `UPDATE staging_email_delivery_probes
       SET status='sent',provider_message_id='resend_probe_0099',sent_at=?,updated_at=?
       WHERE probe_key='staging-resend-delivery-v1'`,
    ).run(now, now);
    assert.deepEqual(
      { ...(sqlite.prepare("SELECT status,attempt_count AS attempts,provider_message_id AS providerMessageId FROM staging_email_delivery_probes").get() as object) },
      { status: "sent", attempts: 1, providerMessageId: "resend_probe_0099" },
    );
  } finally {
    sqlite.close();
  }
});
