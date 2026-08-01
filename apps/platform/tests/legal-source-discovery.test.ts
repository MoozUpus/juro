import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverAdviceSitemapDocuments,
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
