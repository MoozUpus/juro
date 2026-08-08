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

test("Advice sitemap discovery accepts only bounded canonical document URLs", async () => {
  const result = await discoverAdviceSitemapDocuments({
    maxDocuments: 2,
    now: () => new Date("2026-08-01T19:00:00.000Z"),
    fetchImpl: sequence([
      response("User-agent: *\nSitemap: https://advice.uz/sitemap.xml\n", "text/plain; charset=utf-8"),
      response("<sitemapindex><sitemap><loc>https://advice.uz/documents_uz.xml</loc></sitemap></sitemapindex>", "application/xml"),
      response([
        "<urlset>",
        "<url><loc>https://advice.uz/oz/documents/21</loc></url>",
        "<url><loc>https://www.advice.uz/ru/documents/22</loc></url>",
        "<url><loc>https://advice.uz/ru/questions/9</loc></url>",
        "<url><loc>https://evil.example/ru/documents/23</loc></url>",
        "</urlset>",
      ].join(""), "application/xml; charset=utf-8"),
    ]),
  });

  assert.deepEqual(result.candidates.map((candidate) => candidate.canonicalUrl), [
    "https://advice.uz/oz/documents/21",
    "https://advice.uz/ru/documents/22",
  ]);
  assert.equal(result.robotsUrl, "https://advice.uz/robots.txt");
  assert.deepEqual(result.sitemapUrls, [
    "https://advice.uz/sitemap.xml",
    "https://advice.uz/documents_uz.xml",
  ]);
  assert.equal(result.fetchedAt, "2026-08-01T19:00:00.000Z");
});

test("Advice sitemap discovery fails closed on untrusted sitemap and oversized content", async () => {
  await assert.rejects(
    () => discoverAdviceSitemapDocuments({
      fetchImpl: sequence([
        response("Sitemap: https://evil.example/sitemap.xml\n", "text/plain"),
      ]),
    }),
    (error: unknown) => error instanceof LegalSourceDiscoveryError
      && error.code === "LEGAL_SOURCE_DISCOVERY_UNAVAILABLE",
  );

  await assert.rejects(
    () => discoverAdviceSitemapDocuments({
      fetchImpl: sequence([
        response("Sitemap: https://advice.uz/sitemap.xml\n", "text/plain"),
        new Response("x", {
          headers: { "content-type": "application/xml", "content-length": "999999" },
        }),
      ]),
    }),
    (error: unknown) => error instanceof LegalSourceDiscoveryError
      && error.code === "LEGAL_SOURCE_DISCOVERY_TOO_LARGE",
  );
});

test("Lex RSS discovery respects robots crawl delay and returns balanced canonical RU/UZ documents", async () => {
  const responses = [
    response("User-agent: *\nCrawl-delay: 20\n", "text/plain; charset=utf-8"),
    response([
      "<?xml version=\"1.0\"?><rss><channel>",
      "<link>/</link>",
      "<item><link>/ru/docs/8372154</link></item>",
      "<item><link>https://www.lex.uz/ru/docs/-8374622</link></item>",
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
