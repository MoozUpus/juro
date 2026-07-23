import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

async function createWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const runtime = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const context = { waitUntil() {}, passThroughOnException() {} };

test("opens /document-builder-test directly for a guest", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/document-builder-test", { headers: { accept: "text/html" } }), runtime, context);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Создать документ — JURO<\/title>/);
  assert.match(html, /Рабочий конструктор расписки в получении денежных средств/);
  assert.match(html, /DocumentBuilderLoader/);
  assert.match(html, /Загрузка конструктора/);
});

test("protects My Documents and preserves return_to", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/document-builder-test/documents", { headers: { accept: "text/html" }, redirect: "manual" }), runtime, context);
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") ?? "", /signin-with-chatgpt/);
  assert.match(response.headers.get("location") ?? "", /return_to=%2Fdocument-builder-test%2Fdocuments/);
});

test("rejects unauthenticated document writes and disables caching", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/api/document-builder-test/drafts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-juro-csrf": "1" },
    body: "{}",
  }), runtime, context);
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});

test("applies noindex and no-cache to private share pages", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/document-builder-test/share/nonexistent", { headers: { accept: "text/html" } }), runtime, context);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});
