import assert from "node:assert/strict";
import test from "node:test";

async function createWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const runtime = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const context = { waitUntil() {}, passThroughOnException() {} };

test("renders the production home page with canonical metadata and real actions", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), runtime, context);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<link rel="canonical" href="https:\/\/juro\.uz\/"/);
  assert.match(html, /JURO — Юрист в кармане/);
  assert.match(html, /https:\/\/app\.juro\.uz\/register\?lang=ru/);
  assert.doesNotMatch(html, /Демонстрационный frontend-прототип/);
});

test("redirects obsolete landing routes permanently", async () => {
  const worker = await createWorker();
  for (const route of ["/landing-test?lang=uz", "/lending-test?lang=ru"]) {
    const response = await worker.fetch(new Request(`http://localhost${route}`, { redirect: "manual" }), runtime, context);
    assert.equal(response.status, 308, route);
    assert.match(response.headers.get("location") ?? "", /\/\?lang=(ru|uz)$/);
  }
});

test("serves all RU and UZ legal pages without authentication", async () => {
  const worker = await createWorker();
  const slugs = ["terms", "privacy-policy", "personal-data-processing", "cookies", "ai-rules"];
  for (const locale of ["ru", "uz"]) for (const slug of slugs) {
    const route = `/${locale}/${slug}`;
    const response = await worker.fetch(new Request(`http://localhost${route}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, new RegExp(`<main[^>]+lang="${locale}"`), route);
    assert.match(html, new RegExp(`https://juro\\.uz/${locale}/${slug}`), route);
  }
});
