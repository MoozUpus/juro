import assert from "node:assert/strict";
import test from "node:test";
import {
  runStagingEmailDeliveryProbe,
  stagingEmailDeliveryProbeEnabled,
} from "../worker/staging-email-delivery-probe";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

test("staging email delivery probe cannot run outside explicitly enabled staging", () => {
  assert.equal(stagingEmailDeliveryProbeEnabled({ APP_ENV: "development", STAGING_SYNTHETIC_PROBES_ENABLED: "true" } as never), false);
  assert.equal(stagingEmailDeliveryProbeEnabled({ APP_ENV: "production", STAGING_SYNTHETIC_PROBES_ENABLED: "true" } as never), false);
  assert.equal(stagingEmailDeliveryProbeEnabled({ APP_ENV: "staging", STAGING_SYNTHETIC_PROBES_ENABLED: "false" } as never), false);
  assert.equal(stagingEmailDeliveryProbeEnabled({ APP_ENV: "staging", STAGING_SYNTHETIC_PROBES_ENABLED: "true" } as never), true);
});

test("staging probe records only an idempotent Resend acceptance receipt", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (input, init) => {
      calls += 1;
      assert.equal(String(input), "https://api.resend.com/emails");
      assert.equal(new Headers(init?.headers).get("idempotency-key"), "juro_staging-resend-delivery-v1");
      const body = JSON.parse(String(init?.body)) as { to: string[]; subject: string; html: string };
      assert.deepEqual(body.to, ["operations@example.invalid"]);
      assert.match(body.subject, /staging/u);
      assert.match(body.html, /нет пользовательских/u);
      return new Response(JSON.stringify({ id: "resend_probe_0099" }), { status: 200 });
    };
    const env = {
      APP_ENV: "staging" as const,
      STAGING_SYNTHETIC_PROBES_ENABLED: "true",
      DB: d1,
      RESEND_API_KEY: "synthetic-resend-key",
      EMAIL_FROM: "JURO <no-reply@juro.uz>",
      OPERATIONS_ALERT_EMAIL: "operations@example.invalid",
    };
    assert.deepEqual(await runStagingEmailDeliveryProbe(env), {
      attempted: 1,
      accepted: 1,
      failed: 0,
      skipped: 0,
      alreadyAccepted: 0,
      providerMessageId: "resend_probe_0099",
    });
    assert.equal(calls, 1);
    assert.deepEqual(await runStagingEmailDeliveryProbe(env), {
      attempted: 0,
      accepted: 1,
      failed: 0,
      skipped: 0,
      alreadyAccepted: 1,
      providerMessageId: "resend_probe_0099",
    });
    assert.equal(calls, 1);
    assert.deepEqual(
      sqlite.prepare("PRAGMA table_info(staging_email_delivery_probes)").all().map((row) => (row as { name: string }).name).filter((name) => /email|recipient|body|html|subject|user/i.test(name)),
      [],
    );
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});
