import assert from "node:assert/strict";
import test from "node:test";

import { createPacedLexFetch } from "../lib/legal-corpus/lex-request-pacer";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

test("Lex request pacer caches robots and spaces every real request by its observed delay", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  let clock = Date.parse("2026-08-15T08:00:00.000Z");
  const networkCalls: Array<{ url: string; at: number }> = [];
  const waits: number[] = [];
  const pacedFetch = createPacedLexFetch({
    db: d1,
    now: () => new Date(clock),
    wait: async (delayMs) => {
      waits.push(delayMs);
      clock += delayMs;
    },
    fetchImpl: async (input) => {
      const url = String(input);
      networkCalls.push({ url, at: clock });
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 20\n", {
          headers: { "content-type": "text/plain" },
        });
      }
      return new Response("<html></html>", {
        headers: { "content-type": "text/html" },
      });
    },
  });

  const firstRobots = await pacedFetch("https://lex.uz/robots.txt");
  assert.match(await firstRobots.text(), /Crawl-delay: 20/u);
  await pacedFetch("https://lex.uz/ru/docs/-1");
  const cachedRobots = await pacedFetch("https://lex.uz/robots.txt");
  assert.match(await cachedRobots.text(), /Crawl-delay: 20/u);
  await pacedFetch("https://lex.uz/ru/docs/-2");

  assert.deepEqual(networkCalls.map((call) => call.url), [
    "https://lex.uz/robots.txt",
    "https://lex.uz/ru/docs/-1",
    "https://lex.uz/ru/docs/-2",
  ]);
  assert.deepEqual(networkCalls.map((call) => call.at), [
    Date.parse("2026-08-15T08:00:00.000Z"),
    Date.parse("2026-08-15T08:00:20.000Z"),
    Date.parse("2026-08-15T08:00:40.000Z"),
  ]);
  assert.deepEqual(waits, [20_000, 20_000]);
  const row = sqlite.prepare(`SELECT crawl_delay_ms AS crawlDelayMs,
      last_request_at AS lastRequestAt,next_allowed_at AS nextAllowedAt
    FROM legal_source_host_rate_limits WHERE host='lex.uz'`).get() as {
      crawlDelayMs: number;
      lastRequestAt: string;
      nextAllowedAt: string;
    };
  assert.equal(row.crawlDelayMs, 20_000);
  assert.equal(row.lastRequestAt, "2026-08-15T08:00:40.000Z");
  assert.equal(row.nextAllowedAt, "2026-08-15T08:01:00.000Z");
});

test("Lex request pacer reuses only a five-minute persisted public robots policy", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const startedAt = Date.parse("2026-08-15T08:00:00.000Z");
  let clock = startedAt;
  const networkCalls: Array<{ url: string; at: number }> = [];
  const source = async (input: RequestInfo | URL) => {
    const url = String(input);
    networkCalls.push({ url, at: clock });
    if (url.endsWith("/robots.txt")) {
      return new Response("User-agent: *\nAllow: /\nCrawl-delay: 20\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return new Response("<html></html>", { headers: { "content-type": "text/html" } });
  };
  const firstStats = { robotsNetworkRequests: 0, persistentRobotsCacheHits: 0 };
  const first = createPacedLexFetch({
    db: d1,
    now: () => new Date(clock),
    wait: async (delayMs) => { clock += delayMs; },
    fetchImpl: source,
    stats: firstStats,
  });
  await first("https://lex.uz/robots.txt");
  assert.deepEqual(firstStats, { robotsNetworkRequests: 1, persistentRobotsCacheHits: 0 });

  clock = startedAt + 4 * 60_000;
  const secondStats = { robotsNetworkRequests: 0, persistentRobotsCacheHits: 0 };
  const second = createPacedLexFetch({
    db: d1,
    now: () => new Date(clock),
    wait: async (delayMs) => { clock += delayMs; },
    fetchImpl: source,
    stats: secondStats,
  });
  const cachedRobots = await second("https://lex.uz/robots.txt");
  assert.match(await cachedRobots.text(), /Crawl-delay: 20/u);
  await second("https://lex.uz/ru/docs/-1");
  assert.deepEqual(secondStats, { robotsNetworkRequests: 0, persistentRobotsCacheHits: 1 });

  clock = startedAt + 5 * 60_000 + 1;
  const thirdStats = { robotsNetworkRequests: 0, persistentRobotsCacheHits: 0 };
  const third = createPacedLexFetch({
    db: d1,
    now: () => new Date(clock),
    wait: async (delayMs) => { clock += delayMs; },
    fetchImpl: source,
    stats: thirdStats,
  });
  await third("https://lex.uz/robots.txt");

  assert.deepEqual(networkCalls.map((call) => call.url), [
    "https://lex.uz/robots.txt",
    "https://lex.uz/ru/docs/-1",
    "https://lex.uz/robots.txt",
  ]);
  assert.deepEqual(secondStats, { robotsNetworkRequests: 0, persistentRobotsCacheHits: 1 });
  assert.deepEqual(thirdStats, { robotsNetworkRequests: 1, persistentRobotsCacheHits: 0 });
  const row = sqlite.prepare(`SELECT robots_body AS robotsBody,
      robots_body_observed_at AS robotsBodyObservedAt
    FROM legal_source_host_rate_limits WHERE host='lex.uz'`).get() as {
      robotsBody: string;
      robotsBodyObservedAt: string;
    };
  assert.match(row.robotsBody, /User-agent/u);
  assert.equal(row.robotsBodyObservedAt, new Date(clock).toISOString());
});

test("a stalled robots clone cannot keep the paced worker fetch open", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const pacedFetch = createPacedLexFetch({
      db: d1,
      wait: async () => undefined,
      robotsCacheReadTimeoutMs: 5,
      fetchImpl: async () => new Response(
        new ReadableStream<Uint8Array>({ start() {} }),
        { headers: { "content-type": "text/plain" } },
      ),
    });
    const response = await Promise.race([
      pacedFetch("https://lex.uz/robots.txt"),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("PACER_STALLED")), 250)),
    ]);
    assert.equal(response.status, 200);
    await response.body?.cancel().catch(() => undefined);
    const stored = sqlite.prepare(`SELECT robots_body AS robotsBody
      FROM legal_source_host_rate_limits WHERE host='lex.uz'`).get() as { robotsBody: string | null };
    assert.equal(stored.robotsBody, null);
  } finally {
    sqlite.close();
  }
});

test("Lex request pacer rejects non-Lex network targets before fetch", async () => {
  const { d1 } = sqliteD1Fixture();
  let calls = 0;
  const pacedFetch = createPacedLexFetch({
    db: d1,
    wait: async () => undefined,
    fetchImpl: async () => {
      calls += 1;
      return new Response("unexpected");
    },
  });
  await assert.rejects(
    () => pacedFetch("https://example.com/robots.txt"),
    /LEGAL_SOURCE_PACER_URL_REJECTED/u,
  );
  assert.equal(calls, 0);
});
