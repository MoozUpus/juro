import assert from "node:assert/strict";
import test from "node:test";

test("protects the application root without demo-only metadata", async () => {
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

  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") ?? "", /\/login/);
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

test("routes /document-builder to the canonical account space", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/document-builder", { headers: { accept: "text/html" } }), runtime, context);
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") ?? "", /\/ru\/individual\/document-builder/);
  const canonical = await worker.fetch(new Request("http://localhost/ru/individual/document-builder", { headers: { accept: "text/html" }, redirect: "manual" }), runtime, context);
  assert.equal(canonical.status, 307);
  assert.match(canonical.headers.get("location") ?? "", /returnTo=%2Fru%2Findividual%2Fdocument-builder/);
});

test("keeps direct category and document URLs through canonical redirects", async () => {
  const worker = await createWorker();
  const routes = [
    "/document-builder/family",
    "/document-builder/family/0101001",
    "/document-builder/work/0201001",
    "/document-builder/debt/0601001",
    "/document-builder/court/0301077",
    "/document-builder/inheritance/1001004",
    "/document-builder/housing/1101010",
    "/document-builder/appeals/1201001",
    "/document-builder/debt/0602001",
  ];
  for (const route of routes) {
    const response = await worker.fetch(new Request(`http://localhost${route}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 307, route);
    assert.match(response.headers.get("location") ?? "", /\/ru\/individual\/document-builder\//, route);
  }
});

test("permanently redirects legacy library routes without dropping safe context", async () => {
  const worker = await createWorker();
  const root = await worker.fetch(new Request("http://localhost/document-builder/library?lang=uz&q=qarz", { redirect: "manual" }), runtime, context);
  assert.equal(root.status, 308);
  assert.match(root.headers.get("location") ?? "", /\/uz\/individual\/document-builder\?q=qarz/);
  const document = await worker.fetch(new Request("http://localhost/document-builder/library/family/0101001?lang=ru&invitation=abc", { redirect: "manual" }), runtime, context);
  assert.equal(document.status, 308);
  assert.match(document.headers.get("location") ?? "", /\/ru\/individual\/document-builder\/family\/0101001\?invitation=abc/);
});

test("protects My Documents and preserves return_to", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/document-builder/documents", { headers: { accept: "text/html" }, redirect: "manual" }), runtime, context);
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") ?? "", /\/ru\/individual\/documents/);
  const canonical = await worker.fetch(new Request("http://localhost/ru/individual/documents", { headers: { accept: "text/html" }, redirect: "manual" }), runtime, context);
  assert.equal(canonical.status, 307);
  assert.match(canonical.headers.get("location") ?? "", /\/login/);
});

test("serves public login and registration routes", async () => {
  const worker = await createWorker();
  for (const route of ["/login?lang=ru", "/register?lang=uz"]) {
    const response = await worker.fetch(new Request(`http://localhost${route}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 200, route);
    assert.match(await response.text(), /Защищённый вход|Himoyalangan kirish|одноразовому коду|Email orqali/);
  }
});

test("login preserves the protected return path for the active sign-in provider", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/login?returnTo=%2Fru%2Findividual%2Fdocument-builder", { headers: { accept: "text/html" } }), runtime, context);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /signin-with-chatgpt\?return_to=%2Fru%2Findividual%2Fdocument-builder/);
});

test("permanently redirects legacy test routes and preserves safe context", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/document-builder-test/debt/0601001?lang=uz&draftId=safe", { redirect: "manual" }), runtime, context);
  assert.equal(response.status, 308);
  assert.match(response.headers.get("location") ?? "", /\/document-builder\/debt\/0601001\?lang=uz&draftId=safe/);
});

test("invitation page requires sign-in without exposing document data", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/document-builder/invitations/test-token", { headers: { accept: "text/html" } }), runtime, context);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Войдите, чтобы открыть приглашение/);
  assert.doesNotMatch(html, /documentTitle|targetIdentifierHash/);
});

test("rejects unauthenticated document writes and disables caching", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/api/document-builder/drafts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-juro-csrf": "1" },
    body: "{}",
  }), runtime, context);
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});

test("applies noindex and no-cache to private share pages", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/document-builder/share/nonexistent", { headers: { accept: "text/html" } }), runtime, context);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});
