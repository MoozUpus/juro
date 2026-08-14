import assert from "node:assert/strict";
import test from "node:test";
import {
  runStagingEmailDeliveryProbe,
  stagingEmailDeliveryProbeEnabled,
  stagingEmailDeliveryProbeKey,
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
      assert.equal(new Headers(init?.headers).get("idempotency-key"), "juro_staging-resend-acceptance-v2-20260812");
      const body = JSON.parse(String(init?.body)) as { to: string[]; subject: string; html: string };
      assert.deepEqual(body.to, ["operations@example.invalid"]);
      assert.match(body.subject, /приёма Resend/u);
      assert.match(body.html, /нет пользовательских/u);
      assert.match(body.html, /не доставку/u);
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
    const at = new Date("2026-08-12T09:00:00.000Z");
    assert.deepEqual(await runStagingEmailDeliveryProbe(env, { now: at }), {
      attempted: 1,
      accepted: 1,
      failed: 0,
      skipped: 0,
      alreadyAccepted: 0,
      providerMessageId: "resend_probe_0099",
    });
    assert.equal(calls, 1);
    assert.deepEqual(await runStagingEmailDeliveryProbe(env, { now: new Date("2026-08-12T23:59:59.999Z") }), {
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

test("staging probe rotates once per UTC day without reusing a prior acceptance", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const originalFetch = globalThis.fetch;
  const idempotencyKeys: string[] = [];
  try {
    globalThis.fetch = async (_input, init) => {
      const idempotencyKey = new Headers(init?.headers).get("idempotency-key");
      assert.ok(idempotencyKey);
      idempotencyKeys.push(idempotencyKey);
      return new Response(JSON.stringify({ id: `resend_${idempotencyKeys.length}` }), { status: 200 });
    };
    const env = {
      APP_ENV: "staging" as const,
      STAGING_SYNTHETIC_PROBES_ENABLED: "true",
      DB: d1,
      RESEND_API_KEY: "synthetic-resend-key",
      EMAIL_FROM: "JURO <no-reply@juro.uz>",
      OPERATIONS_ALERT_EMAIL: "operations@example.invalid",
    };
    const firstDay = new Date("2026-08-12T23:59:00.000Z");
    const secondDay = new Date("2026-08-13T00:00:00.000Z");
    assert.equal(stagingEmailDeliveryProbeKey(firstDay), "staging-resend-acceptance-v2-20260812");
    assert.equal(stagingEmailDeliveryProbeKey(secondDay), "staging-resend-acceptance-v2-20260813");
    assert.equal((await runStagingEmailDeliveryProbe(env, { now: firstDay })).attempted, 1);
    assert.equal((await runStagingEmailDeliveryProbe(env, { now: secondDay })).attempted, 1);
    assert.deepEqual(idempotencyKeys, [
      "juro_staging-resend-acceptance-v2-20260812",
      "juro_staging-resend-acceptance-v2-20260813",
    ]);
    assert.deepEqual(
      sqlite.prepare("SELECT probe_key AS probeKey,status FROM staging_email_delivery_probes ORDER BY probe_key").all()
        .map((row) => ({ ...(row as object) })),
      [
        { probeKey: "staging-resend-acceptance-v2-20260812", status: "sent" },
        { probeKey: "staging-resend-acceptance-v2-20260813", status: "sent" },
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("missing staging Resend configuration records a bounded technical health failure", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    assert.deepEqual(
      await runStagingEmailDeliveryProbe({
        APP_ENV: "staging",
        STAGING_SYNTHETIC_PROBES_ENABLED: "true",
        DB: d1,
      }, { now: new Date("2026-08-14T00:00:00.000Z") }),
      {
        attempted: 0,
        accepted: 0,
        failed: 1,
        skipped: 0,
        alreadyAccepted: 0,
        providerMessageId: null,
      },
    );
    assert.deepEqual(
      {
        ...(sqlite.prepare(
          `SELECT dependency_key AS dependencyKey,state,safe_error_code AS safeErrorCode,evidence_kind AS evidenceKind
           FROM dependency_health_checks WHERE dependency_key='resend' LIMIT 1`,
        ).get() as object),
      },
      {
        dependencyKey: "resend",
        state: "degraded",
        safeErrorCode: "PROBE_CONFIGURATION_ERROR",
        evidenceKind: "synthetic_probe",
      },
    );
  } finally {
    sqlite.close();
  }
});
