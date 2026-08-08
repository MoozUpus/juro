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

test("direct retrieval supports the official UZ and oz paths without relaxing the allowlist", async () => {
  const calls: Call[] = [];
  const responses = [
    responseHtml('<a href="/uz/docs/42">Lex result</a>'),
    new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } }),
    responseHtml(officialDocument("Mehnat shartnomasi", "Modda 12. Shartlar")),
    responseHtml('<a href="/oz/document/21?keyword=mehnat">Advice result</a>'),
    new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } }),
    responseHtml(officialDocument("Mehnat shartnomasi bo‘yicha amaliy ssenariy", "Modda 3. Harakatlar")),
  ];
  const result = await retrieveDirectLegalSources("mehnat shartnomasi", "uz", {
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return responses.shift() ?? new Response("offline", { status: 503 });
    }) as typeof fetch,
    now: () => new Date("2026-08-06T12:00:00.000Z"),
    wait: async () => undefined,
  });

  assert.equal(result.sourceValidationStatus, "validated");
  assert.deepEqual(result.sources.map((source) => source.officialUrl), [
    "https://lex.uz/uz/docs/42",
    "https://advice.uz/oz/document/21",
  ]);
  assert.deepEqual(calls.slice(0, 4).map((item) => item.url), [
    "https://lex.uz/uz/search/all?searchtitle=mehnat+shartnomasi",
    "https://lex.uz/robots.txt",
    "https://lex.uz/uz/docs/42",
    "https://advice.uz/oz/search?q=mehnat+shartnomasi",
  ]);
  assert.equal(calls.every((item) => new URL(item.url).hostname === "lex.uz" || new URL(item.url).hostname === "advice.uz"), true);
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

test("direct retrieval does not treat jurisdiction or platform words as document relevance", async () => {
  const responses = [
    responseHtml('<a href="/ru/docs/42">Unrelated but official</a>'),
    new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } }),
    responseHtml(officialDocument("Апостиль на официальных документах Республики Узбекистан", "Статья 1. Общие правила")),
    responseHtml(""),
  ];
  const result = await retrieveDirectLegalSources(
    "Staging QA: какие официальные источники JURO использует для ответов по праву Узбекистана? Ответьте кратко.",
    "ru",
    {
      fetchImpl: (async () => responses.shift() ?? new Response("offline", { status: 503 })) as typeof fetch,
      now: () => new Date("2026-08-07T12:00:00.000Z"),
      wait: async () => undefined,
    },
  );
  assert.equal(result.sources.length, 0);
  assert.equal(result.sourceValidationStatus, "unavailable");
});

test("direct retrieval strips reader controls from a quoted Lex act title", async () => {
  const responses = [
    responseHtml('<a href="/ru/docs/42">Lex result</a>'),
    new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } }),
    responseHtml(officialDocument("Предложения по документу Прослушать аудио «Трудовой договор»", "Статья 12. Условия")),
    responseHtml(""),
  ];
  const result = await retrieveDirectLegalSources("трудовой договор", "ru", {
    fetchImpl: (async () => responses.shift() ?? new Response("offline", { status: 503 })) as typeof fetch,
    now: () => new Date("2026-08-06T12:00:00.000Z"),
    wait: async () => undefined,
  });
  assert.equal(result.sources[0]?.actTitle, "«Трудовой договор»");
});

test("direct retrieval follows only a bounded same-host search redirect", async () => {
  const calls: Call[] = [];
  const responses = [
    new Response("", {
      status: 302,
      headers: { location: "/ru/search/all?searchtitle=%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80" },
    }),
    responseHtml('<a href="/ru/docs/42">Lex result</a>'),
    new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } }),
    responseHtml(officialDocument("Договор", "Статья 12. Условия")),
    new Response("offline", { status: 503, headers: { "content-type": "text/html" } }),
  ];
  const result = await retrieveDirectLegalSources("договор", "ru", {
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return responses.shift() ?? new Response("offline", { status: 503 });
    }) as typeof fetch,
    now: () => new Date("2026-08-06T12:00:00.000Z"),
    wait: async () => undefined,
  });
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0]?.officialUrl, "https://lex.uz/ru/docs/42");
  assert.equal(calls[0]?.init?.redirect, "manual");
  assert.equal(calls[1]?.url, "https://lex.uz/ru/search/all?searchtitle=%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80");
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
  assert.deepEqual(result.errors.map((error) => error.code), [
    "LEGAL_SOURCE_SEARCH_HTTP_503",
    "LEGAL_SOURCE_SEARCH_HTTP_503",
  ]);
});

test("direct retrieval reports bounded source timeouts without writing a corpus", async () => {
  const result = await retrieveDirectLegalSources("договор", "ru", {
    fetchImpl: (async () => { throw new DOMException("aborted", "AbortError"); }) as typeof fetch,
    now: () => new Date("2026-08-06T12:00:00.000Z"),
  });
  assert.deepEqual(result.errors.map((error) => error.code), [
    "LEGAL_SOURCE_SEARCH_TIMEOUT",
    "LEGAL_SOURCE_SEARCH_TIMEOUT",
  ]);
});

test("caller cancellation aborts direct retrieval before it can reach the AI provider", async () => {
  const controller = new AbortController();
  let signalSeen: AbortSignal | undefined;
  let beginFetch: (() => void) | undefined;
  const fetchStarted = new Promise<void>((resolve) => { beginFetch = resolve; });
  const pending = retrieveDirectLegalSources("mehnat shartnomasi", "uz", {
    signal: controller.signal,
    fetchImpl: ((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
      signalSeen = init?.signal ?? undefined;
      beginFetch?.();
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })) as typeof fetch,
  });

  await fetchStarted;
  controller.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  assert.equal(signalSeen?.aborted, true);
});
