import assert from "node:assert/strict";
import test from "node:test";
import {
  executeSecurityEmailJob,
  prepareEmailChangedSecurityEmail,
} from "../lib/auth/security-email";
import { parseIdentityKeyring } from "../lib/auth/keyring";
import { handleQueue, type JobEnvelope, type PlatformJobEnv } from "../worker/platform-jobs";
import { dispatchOutbox } from "../worker/platform-outbox";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const USER_ID = "security-email-user";
const WORKSPACE_ID = "security-email-workspace";
const CHALLENGE_ID = "22222222-2222-4222-8222-222222222222";
const PREVIOUS_EMAIL = "previous@example.test";

function encodedKey(seed: number): string {
  const bytes = Uint8Array.from(
    { length: 32 },
    (_, index) => (seed + index) % 256,
  );
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

const RAW_KEYRING = JSON.stringify({
  active: "v1",
  versions: {
    v1: { aead: encodedKey(1), hmac: encodedKey(33) },
  },
});

function fixture() {
  const value = sqliteD1Fixture();
  const now = "2026-07-29T10:00:00.000Z";
  value.sqlite.prepare(
    `INSERT INTO user_profiles (
       id,email,locale,created_at,updated_at
     ) VALUES (?,?,'ru',?,?)`,
  ).run(USER_ID, "new@example.test", now, now);
  value.sqlite.prepare(
    `INSERT INTO workspaces (
       id,type,name,locale,created_at,updated_at
     ) VALUES (? ,'individual','Security email','ru',?,?)`,
  ).run(WORKSPACE_ID, now, now);
  value.sqlite.prepare(
    `INSERT INTO email_change_challenges (
       id,user_id,session_id,current_email_hash,new_email,
       current_code_salt,current_code_hash,new_code_salt,new_code_hash,
       locale,attempt_count,max_attempts,expires_at,created_at
     ) VALUES (?,?,NULL,?,?,?,?,?,?,'ru',0,5,?,?)`,
  ).run(
    CHALLENGE_ID,
    USER_ID,
    "legacy-current-hash",
    "new@example.test",
    "current-salt",
    "current-hash",
    "new-salt",
    "new-hash",
    "2026-07-29T10:10:00.000Z",
    now,
  );
  return value;
}

type QueueCapture = { envelope: JobEnvelope | null };

function envFor(
  db: D1Database,
  capture: QueueCapture,
): PlatformJobEnv {
  return {
    DB: db,
    APP_ENV: "staging",
    ASYNC_RUNTIME_ENABLED: "true",
    CRON_ENABLED: "false",
    LEGAL_ADVICE_INGESTION_ENABLED: "false",
    JOB_SCHEMA_VERSION: "1",
    RESEND_API_KEY: "synthetic-resend-key",
    EMAIL_FROM: "JURO <no-reply@juro.uz>",
    IDENTITY_KEYRING: RAW_KEYRING,
    PLATFORM_ANALYTICS: { writeDataPoint() {} },
    EMAIL_NOTIFICATIONS_QUEUE: {
      async send(body: JobEnvelope) {
        capture.envelope = body;
        return {
          metadata: {
            metrics: { backlogCount: 0, backlogBytes: 0 },
          },
        };
      },
    },
  } as unknown as PlatformJobEnv;
}

function queueMessage(envelope: JobEnvelope, attempts = 1) {
  const state = { acknowledgements: 0, retries: [] as number[] };
  const message = {
    id: `message-${attempts}`,
    timestamp: new Date(),
    body: envelope,
    attempts,
    ack() { state.acknowledgements += 1; },
    retry(options?: { delaySeconds?: number }) {
      state.retries.push(options?.delaySeconds ?? 0);
    },
  } as Message<unknown>;
  const batch = {
    queue: "staging-email-notifications",
    messages: [message],
    metadata: {
      metrics: { backlogCount: 1, backlogBytes: 0 },
    },
    retryAll() {},
    ackAll() { message.ack(); },
  } as MessageBatch<unknown>;
  return { batch, state };
}

async function preparedFixture() {
  const value = fixture();
  const prepared = await prepareEmailChangedSecurityEmail(value.d1, {
    keyring: parseIdentityKeyring(RAW_KEYRING),
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    challengeId: CHALLENGE_ID,
    previousEmail: PREVIOUS_EMAIL,
    locale: "ru",
    requiredGuard: { selectSql: "SELECT 1", bindings: [] },
    now: "2026-07-29T10:00:00.000Z",
  });
  await value.d1.batch(prepared.statements);
  return { ...value, prepared };
}

test("encrypted security email outbox dispatches identifiers only and sends once", async () => {
  const { sqlite, d1, prepared } = await preparedFixture();
  const capture: QueueCapture = { envelope: null };
  const env = envFor(d1, capture);
  const calls: Array<{ url: string; headers: Headers; body: unknown }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify({ id: "resend_message_1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const stored = sqlite.prepare(
      `SELECT recipient_ciphertext AS ciphertext,recipient_iv AS iv,
         recipient_key_version AS keyVersion,status
       FROM security_email_jobs WHERE id=?`,
    ).get(prepared.jobId) as {
      ciphertext: string;
      iv: string;
      keyVersion: string;
      status: string;
    };
    assert.notEqual(stored.ciphertext, PREVIOUS_EMAIL);
    assert.equal(stored.iv.length, 16);
    assert.equal(stored.keyVersion, "v1");
    assert.equal(stored.status, "pending");
    assert.throws(
      () => sqlite.prepare(
        "UPDATE security_email_jobs SET recipient_ciphertext=? WHERE id=?",
      ).run("changed", prepared.jobId),
      /security email recipient is immutable/,
    );

    assert.deepEqual(
      await dispatchOutbox(env, 1, prepared.jobId),
      { claimed: 1, dispatched: 1, rejected: 0, retrying: 0 },
    );
    assert.ok(capture.envelope);
    assert.equal(capture.envelope.subjectId, prepared.jobId);
    assert.equal(JSON.stringify(capture.envelope).includes(PREVIOUS_EMAIL), false);

    const first = queueMessage(capture.envelope);
    await handleQueue(first.batch, env);
    assert.equal(first.state.acknowledgements, 1);
    assert.deepEqual(first.state.retries, []);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://api.resend.com/emails");
    assert.equal(
      calls[0]?.headers.get("idempotency-key"),
      `juro_security_email_${prepared.jobId}`,
    );
    assert.deepEqual(
      (calls[0]?.body as { to: string[] }).to,
      [PREVIOUS_EMAIL],
    );

    const sent = sqlite.prepare(
      `SELECT status,attempt_count AS attemptCount,
         provider_message_id AS providerMessageId,sent_at AS sentAt
       FROM security_email_jobs WHERE id=?`,
    ).get(prepared.jobId) as {
      status: string;
      attemptCount: number;
      providerMessageId: string;
      sentAt: string;
    };
    assert.equal(sent.status, "sent");
    assert.equal(sent.attemptCount, 1);
    assert.equal(sent.providerMessageId, "resend_message_1");
    assert.ok(sent.sentAt);

    const duplicate = queueMessage(capture.envelope, 2);
    await handleQueue(duplicate.batch, env);
    assert.equal(duplicate.state.acknowledgements, 1);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("concurrent security email delivery has one provider winner", async () => {
  const { sqlite, d1, prepared } = await preparedFixture();
  const capture: QueueCapture = { envelope: null };
  const env = envFor(d1, capture);
  let calls = 0;
  let releaseProvider: (() => void) | undefined;
  let providerStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    providerStarted = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    providerStarted?.();
    await released;
    return new Response(JSON.stringify({ id: "resend_concurrent_1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const winner = executeSecurityEmailJob(env, prepared.jobId);
    await started;
    await assert.rejects(
      executeSecurityEmailJob(env, prepared.jobId),
      /EMAIL_PROVIDER_UNAVAILABLE/,
    );
    assert.equal(calls, 1);
    releaseProvider?.();
    assert.deepEqual(await winner, {
      providerMessageId: "resend_concurrent_1",
      alreadySent: false,
    });
    assert.equal(calls, 1);
    const state = sqlite.prepare(
      "SELECT status,attempt_count AS attemptCount FROM security_email_jobs WHERE id=?",
    ).get(prepared.jobId) as { status: string; attemptCount: number };
    assert.equal(state.status, "sent");
    assert.equal(state.attemptCount, 1);
  } finally {
    releaseProvider?.();
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("stale sending state is reclaimed without losing provider idempotency", async () => {
  const { sqlite, d1, prepared } = await preparedFixture();
  const capture: QueueCapture = { envelope: null };
  const env = envFor(d1, capture);
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ id: "resend_stale_1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    sqlite.prepare(
      `UPDATE security_email_jobs
       SET status='sending',attempt_count=1,updated_at=?
       WHERE id=?`,
    ).run("2000-01-01T00:00:00.000Z", prepared.jobId);
    assert.deepEqual(await executeSecurityEmailJob(env, prepared.jobId), {
      providerMessageId: "resend_stale_1",
      alreadySent: false,
    });
    assert.equal(calls, 1);
    const state = sqlite.prepare(
      "SELECT status,attempt_count AS attemptCount FROM security_email_jobs WHERE id=?",
    ).get(prepared.jobId) as { status: string; attemptCount: number };
    assert.equal(state.status, "sent");
    assert.equal(state.attemptCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("retryable provider failure persists safe state and retries queue message", async () => {
  const { sqlite, d1, prepared } = await preparedFixture();
  const capture: QueueCapture = { envelope: null };
  const env = envFor(d1, capture);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 503 });
  try {
    await dispatchOutbox(env, 1, prepared.jobId);
    assert.ok(capture.envelope);
    const attempt = queueMessage(capture.envelope);
    await handleQueue(attempt.batch, env);
    assert.equal(attempt.state.acknowledgements, 0);
    assert.deepEqual(attempt.state.retries, [15]);
    const state = sqlite.prepare(
      `SELECT status,error_code AS errorCode,attempt_count AS attemptCount
       FROM security_email_jobs WHERE id=?`,
    ).get(prepared.jobId) as {
      status: string;
      errorCode: string;
      attemptCount: number;
    };
    assert.equal(state.status, "retrying");
    assert.equal(state.errorCode, "EMAIL_PROVIDER_UNAVAILABLE");
    assert.equal(state.attemptCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("missing provider configuration fails closed without issuing a request", async () => {
  const { sqlite, d1, prepared } = await preparedFixture();
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    called = true;
    return new Response(null, { status: 200 });
  };
  try {
    await assert.rejects(
      executeSecurityEmailJob({ DB: d1 }, prepared.jobId),
      /EMAIL_CONFIGURATION_UNAVAILABLE/,
    );
    assert.equal(called, false);
    const state = sqlite.prepare(
      "SELECT status,error_code AS errorCode FROM security_email_jobs WHERE id=?",
    ).get(prepared.jobId);
    assert.equal(
      (state as { status: string }).status,
      "failed",
    );
    assert.equal(
      (state as { errorCode: string }).errorCode,
      "EMAIL_CONFIGURATION_UNAVAILABLE",
    );
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});
