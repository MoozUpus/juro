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
