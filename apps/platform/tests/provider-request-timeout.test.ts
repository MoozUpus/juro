import assert from "node:assert/strict";
import test from "node:test";

import {
  ProviderRequestAbortError,
  runProviderRequestWithTimeouts,
} from "../lib/ai/provider-request-timeout";

function rejectWhenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(new DOMException("aborted", "AbortError")),
      { once: true },
    );
  });
}

test("provider request distinguishes a first-byte timeout", async () => {
  await assert.rejects(
    runProviderRequestWithTimeouts({
      firstByteTimeoutMs: 10,
      totalResponseTimeoutMs: 200,
      start: rejectWhenAborted,
      consume: async () => "unreachable",
    }),
    (error: unknown) => error instanceof ProviderRequestAbortError
      && error.reason === "first_byte_timeout",
  );
});

test("provider request keeps a separate deadline for the complete response stream", async () => {
  await assert.rejects(
    runProviderRequestWithTimeouts({
      firstByteTimeoutMs: 100,
      totalResponseTimeoutMs: 20,
      start: async () => new Response(null, { status: 200 }),
      consume: (_response, signal) => rejectWhenAborted(signal),
    }),
    (error: unknown) => error instanceof ProviderRequestAbortError
      && error.reason === "total_response_timeout",
  );
});

test("provider request preserves caller cancellation separately from deadlines", async () => {
  const caller = new AbortController();
  const pending = runProviderRequestWithTimeouts({
    firstByteTimeoutMs: 200,
    totalResponseTimeoutMs: 400,
    callerSignal: caller.signal,
    start: rejectWhenAborted,
    consume: async () => "unreachable",
  });
  caller.abort();
  await assert.rejects(
    pending,
    (error: unknown) => error instanceof ProviderRequestAbortError
      && error.reason === "caller",
  );
});

test("provider request clears both deadlines after a successful response", async () => {
  const result = await runProviderRequestWithTimeouts({
    firstByteTimeoutMs: 100,
    totalResponseTimeoutMs: 200,
    start: async () => new Response("ok", { status: 200 }),
    consume: (response) => response.text(),
  });
  assert.equal(result, "ok");
});

test("provider request honours an absolute deadline after headers arrive", async () => {
  await assert.rejects(
    runProviderRequestWithTimeouts({
      firstByteTimeoutMs: 200,
      totalResponseTimeoutMs: 400,
      deadlineAt: Date.now() + 15,
      start: async () => new Response(null, { status: 200 }),
      consume: (_response, signal) => rejectWhenAborted(signal),
    }),
    (error: unknown) => error instanceof ProviderRequestAbortError
      && error.reason === "absolute_deadline_exceeded",
  );
});

test("provider request rejects an already exhausted absolute deadline before starting", async () => {
  let started = false;
  await assert.rejects(
    runProviderRequestWithTimeouts({
      firstByteTimeoutMs: 200,
      totalResponseTimeoutMs: 400,
      deadlineAt: Date.now() - 1,
      start: async () => {
        started = true;
        return new Response(null, { status: 200 });
      },
      consume: async () => "unreachable",
    }),
    (error: unknown) => error instanceof ProviderRequestAbortError
      && error.reason === "absolute_deadline_exceeded",
  );
  assert.equal(started, false);
});

test("provider request records first actual content exactly once without treating headers as content", async () => {
  const observed: Array<{ elapsedMs: number; firstContentAt: number }> = [];
  let now = 1_000;
  const result = await runProviderRequestWithTimeouts({
    firstByteTimeoutMs: 200,
    totalResponseTimeoutMs: 400,
    now: () => now,
    onFirstContent: (timing) => {
      observed.push(timing);
    },
    start: async () => new Response("body", { status: 200 }),
    consume: async (_response, _signal, context) => {
      now = 1_021;
      await context.markFirstContent();
      now = 1_099;
      await context.markFirstContent();
      return "ok";
    },
  });
  assert.equal(result, "ok");
  assert.deepEqual(observed, [{ elapsedMs: 21, firstContentAt: 1_021, startedAt: 1_000 }]);
});

test("a streaming request does not treat headers as its first useful content", async () => {
  await assert.rejects(
    runProviderRequestWithTimeouts({
      firstByteTimeoutMs: 10,
      totalResponseTimeoutMs: 200,
      requireFirstContent: true,
      start: async () => new Response(null, { status: 200 }),
      consume: (_response, signal) => rejectWhenAborted(signal),
    }),
    (error: unknown) => error instanceof ProviderRequestAbortError
      && error.reason === "first_byte_timeout",
  );
});
