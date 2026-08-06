import assert from "node:assert/strict";
import test from "node:test";

import { directSourceCards, retrieveDirectLegalSources } from "../lib/legal/direct-retrieval";

type Call = { url: string; init: RequestInit | undefined };

function responseHtml(body: string): Response {
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function officialDocument(title: string, heading: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body><main class="page-document-content"><h1>${title}</h1><h2>${heading}</h2><p>${"Официальный текст нормы и правовое регулирование договора. ".repeat(10)}</p></main></body></html>`;
}

test("direct retrieval uses only query-scoped official links and keeps Lex before Advice", async () => {
  const calls: Call[] = [];
  const responses = [
    responseHtml('<a href="/ru/docs/42">Lex result</a><a href="https://evil.example/ru/docs/13">bad</a>'),
    new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } }),
    responseHtml(officialDocument("Трудовой договор", "Статья 12. Условия")),
    responseHtml('<a href="/ru/document/21?keyword=trud">Advice result</a>'),
    new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } }),
    responseHtml(officialDocument("Практический сценарий трудового договора", "Статья 3. Действия")),
  ];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected network request");
    return next;
  }) as typeof fetch;

  const result = await retrieveDirectLegalSources("трудовой договор", "ru", {
    fetchImpl,
    now: () => new Date("2026-08-06T12:00:00.000Z"),
    wait: async () => undefined,
  });

  assert.equal(result.sourceAccessMode, "direct");
  assert.equal(result.sourceValidationStatus, "validated");
  assert.deepEqual(result.sources.map((source) => source.sourceType), ["lex", "advice"]);
  assert.equal(result.sources[0]?.officialUrl, "https://lex.uz/ru/docs/42");
  assert.equal(result.sources[1]?.officialUrl, "https://advice.uz/ru/document/21");
  assert.equal((result.sources[0]?.excerpt?.length ?? 0) > 0, true);
  assert.equal(result.evidence.length, 2);
  assert.equal(result.evidence.every((item) => item.validationStatus === "validated"), true);
  const cards = directSourceCards(result.sources);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((source) => source.sourceId), result.sources.map((source) => source.id));
  assert.deepEqual(calls.map((item) => item.url), [
    "https://lex.uz/ru/search/all?searchtitle=%D1%82%D1%80%D1%83%D0%B4%D0%BE%D0%B2%D0%BE%D0%B9+%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80",
    "https://lex.uz/robots.txt",
    "https://lex.uz/ru/docs/42",
    "https://advice.uz/ru/search?q=%D1%82%D1%80%D1%83%D0%B4%D0%BE%D0%B2%D0%BE%D0%B9+%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80",
    "https://advice.uz/robots.txt",
    "https://advice.uz/ru/document/21",
  ]);
  assert.equal(calls.every((item) => new URL(item.url).hostname.endsWith(".uz") || new URL(item.url).hostname === "lex.uz" || new URL(item.url).hostname === "advice.uz"), true);
});

test("direct retrieval excludes technically valid but unrelated search documents", async () => {
  const responses = [
    responseHtml('<a href="/ru/docs/42">Unrelated</a><a href="/ru/docs/43">Relevant</a>'),
    new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } }),
    responseHtml(officialDocument("Потребительские права", "Статья 1. Общие нормы")),
    new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } }),
    responseHtml(officialDocument("Трудовой договор", "Статья 12. Условия")),
    responseHtml(""),
  ];
  const result = await retrieveDirectLegalSources("трудовой договор", "ru", {
    fetchImpl: (async () => responses.shift() ?? new Response("offline", { status: 503 })) as typeof fetch,
    now: () => new Date("2026-08-06T12:00:00.000Z"),
    wait: async () => undefined,
  });
  assert.deepEqual(result.sources.map((source) => source.officialUrl), ["https://lex.uz/ru/docs/43"]);
});

test("direct retrieval returns an honest unavailable state and writes no corpus", async () => {
  const result = await retrieveDirectLegalSources("договор", "ru", {
    fetchImpl: (async () => new Response("offline", { status: 503, headers: { "content-type": "text/html" } })) as typeof fetch,
    now: () => new Date("2026-08-06T12:00:00.000Z"),
  });
  assert.equal(result.sources.length, 0);
  assert.equal(result.sourceValidationStatus, "unavailable");
  assert.equal(result.freshness.status, "unavailable");
  assert.equal(result.errors.length, 2);
});
