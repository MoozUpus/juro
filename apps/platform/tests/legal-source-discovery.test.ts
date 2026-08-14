import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverAdviceSitemapDocuments,
  discoverLexRssDocuments,
  LegalSourceDiscoveryError,
} from "../lib/legal/source-discovery";

function response(body: string, type: string): Response {
  return new Response(body, { headers: { "content-type": type } });
}

function sequence(responses: Response[]): typeof fetch {
  return (async () => {
    const next = responses.shift();
    if (!next) throw new Error("Unexpected fetch.");
    return next;
  }) as typeof fetch;
}

test("Advice sitemap discovery is permanently disabled before network access", async () => {
  let calls = 0;
  await assert.rejects(
    () => discoverAdviceSitemapDocuments({
      fetchImpl: (async () => { calls += 1; throw new Error("network must not run"); }) as typeof fetch,
    }),
    (error: unknown) => error instanceof LegalSourceDiscoveryError
      && error.code === "LEGAL_SOURCE_DISCOVERY_UNAVAILABLE"
      && !error.retryable,
  );
  assert.equal(calls, 0);
});

test("Lex RSS discovery respects robots crawl delay and returns balanced canonical RU/UZ documents", async () => {
  const responses = [
    response("User-agent: *\nCrawl-delay: 20\n", "text/plain; charset=utf-8"),
    response([
      "<?xml version=\"1.0\"?><rss><channel>",
      "<link>/</link>",
      "<item><title>Первый официальный акт</title><pubDate>Tue, 05 Aug 2026 10:00:00 GMT</pubDate><link>/ru/docs/8372154</link></item>",
      "<item><title>Второй официальный акт</title><link>https://www.lex.uz/ru/docs/-8374622</link></item>",
      "<item><link>/uz/docs/8371302</link></item>",
      "<item><link>https://evil.example/ru/docs/8370000</link></item>",
      "</channel></rss>",
    ].join(""), "application/rss+xml; charset=utf-8"),
    response([
      "<?xml version=\"1.0\"?><rss><channel>",
      "<item><link>/uz/docs/-8372025</link></item>",
      "<item><link>https://lex.uz/uz/docs/8374968</link></item>",
      "<item><link>/ru/docs/8371302</link></item>",
      "<item><link>//evil.example/uz/docs/8370001</link></item>",
      "</channel></rss>",
    ].join(""), "application/rss+xml"),
  ];
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const waits: number[] = [];
  const result = await discoverLexRssDocuments({
    maxDocuments: 4,
    now: () => new Date("2026-08-05T19:00:00.000Z"),
    wait: async (delayMs) => { waits.push(delayMs); },
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      const next = responses.shift();
      if (!next) throw new Error("Unexpected fetch.");
      return next;
    }) as typeof fetch,
  });

  assert.deepEqual(result.candidates.map((candidate) => candidate.canonicalUrl), [
    "https://lex.uz/ru/docs/8372154",
    "https://lex.uz/ru/docs/-8374622",
    "https://lex.uz/uz/docs/-8372025",
    "https://lex.uz/uz/docs/8374968",
  ]);
  assert.deepEqual(result.rssUrls, ["https://lex.uz/ru/rss", "https://lex.uz/uz/rss"]);
  assert.deepEqual(result.entries.slice(0, 2).map((entry) => ({
    url: entry.reference.canonicalUrl,
    title: entry.title,
    publishedAt: entry.publishedAt,
  })), [
    { url: "https://lex.uz/ru/docs/8372154", title: "Первый официальный акт", publishedAt: "2026-08-05T10:00:00.000Z" },
    { url: "https://lex.uz/ru/docs/-8374622", title: "Второй официальный акт", publishedAt: null },
  ]);
  assert.equal(result.robotsUrl, "https://lex.uz/robots.txt");
  assert.equal(result.crawlDelaySeconds, 20);
  assert.equal(result.fetchedAt, "2026-08-05T19:00:00.000Z");
  assert.deepEqual(waits, [20_000, 20_000]);
  assert.deepEqual(calls.map((call) => call.url), [
    "https://lex.uz/robots.txt",
    "https://lex.uz/ru/rss",
    "https://lex.uz/uz/rss",
  ]);
  for (const call of calls) {
    assert.equal(call.init?.redirect, "manual");
    assert.equal(new Headers(call.init?.headers).get("user-agent"), "JURO-LegalSourceSync/1.0 (+https://juro.uz)");
  }
});

test("Lex RSS discovery fails closed without a required crawl window or above the rate-policy ceiling", async () => {
  await assert.rejects(
    () => discoverLexRssDocuments({
      fetchImpl: sequence([
        response("User-agent: *\nCrawl-delay: 20\n", "text/plain"),
      ]),
    }),
    (error: unknown) => error instanceof LegalSourceDiscoveryError
      && error.code === "LEGAL_SOURCE_DISCOVERY_CRAWL_WINDOW_REQUIRED"
      && error.retryable,
  );

  await assert.rejects(
    () => discoverLexRssDocuments({
      fetchImpl: sequence([
        response("User-agent: *\nCrawl-delay: 61\n", "text/plain"),
      ]),
      wait: async () => undefined,
    }),
    (error: unknown) => error instanceof LegalSourceDiscoveryError
      && error.code === "LEGAL_SOURCE_DISCOVERY_RATE_POLICY"
      && !error.retryable,
  );
});

test("Lex RSS discovery rejects redirects, non-RSS media and malformed XML", async () => {
  await assert.rejects(
    () => discoverLexRssDocuments({
      fetchImpl: sequence([new Response(null, { status: 302, headers: { location: "https://evil.example" } })]),
    }),
    (error: unknown) => error instanceof LegalSourceDiscoveryError
      && error.code === "LEGAL_SOURCE_DISCOVERY_REDIRECT_REJECTED",
  );

  await assert.rejects(
    () => discoverLexRssDocuments({
      fetchImpl: sequence([
        response("User-agent: *\n", "text/plain"),
        response("<html>not rss</html>", "text/html"),
      ]),
    }),
    (error: unknown) => error instanceof LegalSourceDiscoveryError
      && error.code === "LEGAL_SOURCE_DISCOVERY_CONTENT_TYPE_REJECTED",
  );

  await assert.rejects(
    () => discoverLexRssDocuments({
      fetchImpl: sequence([
        response("User-agent: *\n", "text/plain"),
        response("<not-rss />", "application/rss+xml"),
      ]),
    }),
    (error: unknown) => error instanceof LegalSourceDiscoveryError
      && error.code === "LEGAL_SOURCE_DISCOVERY_UNAVAILABLE",
  );
});
