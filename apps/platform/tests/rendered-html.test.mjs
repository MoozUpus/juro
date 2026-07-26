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

test("built Worker exposes fetch, queue, and scheduled module handlers", async () => {
  const worker = await createWorker();
  assert.equal(typeof worker.fetch, "function");
  assert.equal(typeof worker.queue, "function");
  assert.equal(typeof worker.scheduled, "function");
});

const runtime = {
  ALLOW_PLATFORM_AUTH_HEADERS: "true",
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

test("login preserves the protected return path while legacy platform sign-in stays hidden", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/login?returnTo=%2Fru%2Findividual%2Fdocument-builder", { headers: { accept: "text/html" } }), runtime, context);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /"returnTo","\/ru\/individual\/document-builder"/);
  assert.doesNotMatch(html, /signin-with-chatgpt\?return_to=/);
});

test("permanently redirects legacy test routes and preserves safe context", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/document-builder-test/debt/0601001?lang=uz&draftId=safe", { redirect: "manual" }), runtime, context);
  assert.equal(response.status, 308);
  assert.match(response.headers.get("location") ?? "", /\/document-builder\/debt\/0601001\?lang=uz&draftId=safe/);
});

test("canonical product entry routes preserve language and account type", async () => {
  const worker = await createWorker();
  const routes = new Map([
    ["/dashboard?lang=uz&accountType=business", "/uz/business/main"],
    ["/ai-lawyer?lang=ru", "/ru/individual/ai-chat"],
    ["/action-plans?lang=uz", "/uz/individual/action-plan"],
    ["/subscriptions?accountType=business", "/ru/business/billing"],
    ["/settings/privacy?lang=uz", "/uz/individual/settings/privacy"],
  ]);
  for (const [source, target] of routes) {
    const response = await worker.fetch(new Request(`http://localhost${source}`, { redirect: "manual" }), runtime, context);
    assert.equal(response.status, 307, source);
    assert.equal(new URL(response.headers.get("location") ?? "", "http://localhost").pathname, target, source);
  }
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

test("built auth routes reject missing and cross-origin CSRF writes", async () => {
  const worker = await createWorker();
  for (const route of [
    "/api/auth/request-otp",
    "/api/auth/verify-otp",
    "/api/auth/logout",
  ]) {
    const missingHeader = await worker.fetch(new Request(
      `http://localhost${route}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    ), runtime, context);
    assert.equal(missingHeader.status, 403, route);
    const foreignOrigin = await worker.fetch(new Request(
      `http://localhost${route}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
          "x-juro-csrf": "1",
        },
        body: "{}",
      },
    ), runtime, context);
    assert.equal(foreignOrigin.status, 403, route);
  }
});

test("platform workflow APIs return private 401 responses without a session", async () => {
  const worker = await createWorker();
  for (const route of [
    "/api/platform/cases",
    "/api/platform/consultations",
    "/api/platform/dashboard",
    "/api/platform/ai",
    "/api/platform/document-review",
    "/api/platform/document-comparisons",
    "/api/platform/search?q=contract",
    "/api/platform/monitoring",
    "/api/platform/workspaces",
    "/api/platform/team",
    "/api/platform/billing",
    "/api/platform/history",
    "/api/platform/archive",
    "/api/platform/profile",
    "/api/platform/security/sessions",
    "/api/platform/privacy/export",
  ]) {
    const response = await worker.fetch(new Request(`http://localhost${route}`), runtime, context);
    assert.equal(response.status, 401, route);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/, route);
  }
});

test("session revocation routes reject missing and foreign CSRF proof", async () => {
  const worker = await createWorker();
  for (const route of [
    "/api/platform/security/sessions?scope=all",
    "/api/platform/security/sessions/11111111-1111-4111-8111-111111111111",
  ]) {
    const missingHeader = await worker.fetch(new Request(
      `http://localhost${route}`,
      { method: "DELETE" },
    ), runtime, context);
    assert.equal(missingHeader.status, 403, route);
    const foreignOrigin = await worker.fetch(new Request(
      `http://localhost${route}`,
      {
        method: "DELETE",
        headers: {
          origin: "https://attacker.example",
          "x-juro-csrf": "1",
        },
      },
    ), runtime, context);
    assert.equal(foreignOrigin.status, 403, route);
  }
});

test("serves app-specific legal pages in both languages with noindex", async () => {
  const worker = await createWorker();
  for (const route of ["/legal/terms?lang=ru", "/legal/privacy?lang=uz", "/legal/cookies?lang=ru", "/legal/ai-rules?lang=uz", "/legal/personal-data?lang=ru"]) {
    const response = await worker.fetch(new Request(`http://localhost${route}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/, route);
    const html = await response.text();
    assert.match(html, /JURO/);
    assert.match(html, /Условия|Политика|cookies|AIdan|Shaxsiy|maxfiylik|cookie|qoidalari/);
  }
});

test("adds production security headers and keeps private HTML out of caches", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/login?lang=ru", { headers: { accept: "text/html" } }), runtime, context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("referrer-policy") ?? "", /strict-origin/);
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/);
});

test("robots excludes application, auth, API and share routes", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/robots.txt"), runtime, context);
  assert.equal(response.status, 200);
  const body = await response.text();
  if (/Disallow:\s*\/\s*$/m.test(body)) {
    assert.match(body, /Host:\s*https:\/\/app\.juro\.uz/);
  } else {
    for (const route of ["/api/", "/login", "/register", "/onboarding", "/document-builder/share/"]) assert.match(body, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("applies noindex and no-cache to private share pages", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request("http://localhost/document-builder/share/nonexistent", { headers: { accept: "text/html" } }), runtime, context);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});
