import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("public status API fails safely without D1 and status host exposes no application routes", async () => {
  const worker = await createWorker();
  const statusRuntime = {
    STATUS_HOSTNAME: "status.juro.test",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
  const unavailable = await worker.fetch(
    new Request("https://status.juro.test/api/status?lang=uz"),
    statusRuntime,
    context,
  );
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { code: "STATUS_TEMPORARILY_UNAVAILABLE", locale: "uz" });
  assert.match(unavailable.headers.get("cache-control") ?? "", /s-maxage=5/);
  const privateRoute = await worker.fetch(
    new Request("https://status.juro.test/ru/individual/dashboard"),
    statusRuntime,
    context,
  );
  assert.equal(privateRoute.status, 404);
  assert.equal(await privateRoute.text(), "Not Found");
  const disguisedAsset = await worker.fetch(
    new Request("https://status.juro.test/api/platform/private.js"),
    statusRuntime,
    context,
  );
  assert.equal(disguisedAsset.status, 404);
  const write = await worker.fetch(
    new Request("https://status.juro.test/api/status", { method: "POST" }),
    statusRuntime,
    context,
  );
  assert.equal(write.status, 405);
  assert.equal(write.headers.get("allow"), "GET, HEAD");
});

const runtime = {
  ALLOW_PLATFORM_AUTH_HEADERS: "true",
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const context = { waitUntil() {}, passThroughOnException() {} };

test("retired cinematic prototype path is absent from the production artifact", async () => {
  const worker = await createWorker();
  const assets = { fetch: async () => new Response("Not found", { status: 404 }) };

  const production = await worker.fetch(
    new Request("http://localhost/prototypes/platform/cinematic", {
      headers: { accept: "text/html" },
      redirect: "manual",
    }),
    { APP_ENV: "production", ASSETS: assets },
    context,
  );
  assert.equal(production.status, 404);

  const artifact = await readFile(new URL("../dist/server/index.js", import.meta.url), "utf8");
  assert.doesNotMatch(artifact, /CinematicPrototypeSurface/);
  assert.doesNotMatch(artifact, /cinematic-prototype/);
  assert.doesNotMatch(artifact, /prototypes\/platform\/cinematic/);
});

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
  for (const route of ["/login?lang=ru", "/register?lang=uz", "/ru/auth/login", "/uz/auth/register?accountType=lawyer"]) {
    const response = await worker.fetch(new Request(`http://localhost${route}`, { headers: { accept: "text/html" } }), runtime, context);
    assert.equal(response.status, 200, route);
    assert.match(await response.text(), /Защищённый вход|Himoyalangan kirish|одноразовому коду|Email orqali/);
  }
});

test("keeps the legal-source staff inbox hidden while its exact flag is false", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(
    new Request("http://localhost/ru/admin/legal-sources/reviews", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      LEGAL_SOURCE_STAFF_API_ENABLED: "false",
    },
    context,
  );
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /Проверка юридических источников/);
});

test("localized legacy auth routes redirect to the canonical auth surface", async () => {
  const worker = await createWorker();
  for (const [source, target] of [
    ["/ru/login?returnTo=%2Fru%2Flawyer%2Fmain", "/ru/auth/login?returnTo=%2Fru%2Flawyer%2Fmain"],
    ["/uz/register?accountType=entrepreneur", "/uz/auth/register?accountType=entrepreneur"],
  ]) {
    const response = await worker.fetch(new Request(`http://localhost${source}`, { redirect: "manual" }), runtime, context);
    assert.equal(response.status, 308, source);
    assert.equal(response.headers.get("location"), `http://localhost${target}`, source);
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
    ["/dashboard?lang=uz&accountType=business", "/uz/business/dashboard"],
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
  const csrfRejected = await worker.fetch(new Request(
    "http://localhost/api/document-builder/drafts",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-juro-csrf": "1",
      },
      body: "{}",
    },
  ), runtime, context);
  assert.equal(csrfRejected.status, 403);
  assert.equal((await csrfRejected.json()).code, "FORBIDDEN");
  assert.match(csrfRejected.headers.get("cache-control") ?? "", /no-store/);

  const response = await worker.fetch(new Request("http://localhost/api/document-builder/drafts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      "x-juro-csrf": "1",
    },
    body: "{}",
  }), runtime, context);
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});

test("permanently redirects localized legacy main routes to dashboard", async () => {
  const worker = await createWorker();
  for (const [source, target] of [
    ["/ru/individual/main", "/ru/individual/dashboard"],
    ["/uz/business/main", "/uz/business/dashboard"],
  ]) {
    const response = await worker.fetch(new Request(`http://localhost${source}`, { redirect: "manual" }), runtime, context);
    assert.equal(response.status, 308, source);
    assert.equal(new URL(response.headers.get("location") ?? "", "http://localhost").pathname, target, source);
  }
});

test("protected writes require a canonical same-origin browser context", async () => {
  const worker = await createWorker();
  const route = "http://localhost/api/platform/cases";

  for (const [label, headers] of [
    ["missing Origin", { "x-juro-csrf": "1" }],
    [
      "cross-origin",
      { origin: "https://attacker.example", "x-juro-csrf": "1" },
    ],
    [
      "cross-site Fetch Metadata",
      {
        origin: "http://localhost",
        "sec-fetch-site": "cross-site",
        "x-juro-csrf": "1",
      },
    ],
    [
      "same-site Fetch Metadata",
      {
        origin: "http://localhost",
        "sec-fetch-site": "same-site",
        "x-juro-csrf": "1",
      },
    ],
    [
      "navigation Fetch Metadata",
      {
        origin: "http://localhost",
        "sec-fetch-site": "none",
        "x-juro-csrf": "1",
      },
    ],
    [
      "origin with a path",
      {
        origin: "http://localhost/forged",
        "x-juro-csrf": "1",
      },
    ],
    [
      "combined Origin values",
      {
        origin: "http://localhost, https://attacker.example",
        "x-juro-csrf": "1",
      },
    ],
    [
      "malformed Fetch Metadata",
      {
        origin: "http://localhost",
        "sec-fetch-site": "same-origin, cross-site",
        "x-juro-csrf": "1",
      },
    ],
    ["missing CSRF header", { origin: "http://localhost" }],
  ]) {
    const response = await worker.fetch(
      new Request(route, { method: "POST", headers, body: "{}" }),
      runtime,
      context,
    );
    assert.equal(response.status, 403, label);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/, label);
  }

  for (const [label, headers] of [
    [
      "same-origin without Fetch Metadata",
      { origin: "http://localhost", "x-juro-csrf": "1" },
    ],
    [
      "same-origin browser fetch",
      {
        origin: "http://localhost",
        "sec-fetch-site": "same-origin",
        "x-juro-csrf": "1",
      },
    ],
  ]) {
    const response = await worker.fetch(
      new Request(route, { method: "POST", headers, body: "{}" }),
      runtime,
      context,
    );
    assert.equal(response.status, 401, label);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/, label);
  }
});

test("analysis export deletion enforces CSRF before authentication", async () => {
  const worker = await createWorker();
  const route = "http://localhost/api/platform/document-analysis/exports/export-test";
  const missingProof = await worker.fetch(new Request(route, { method: "DELETE" }), runtime, context);
  assert.equal(missingProof.status, 403);
  assert.match(missingProof.headers.get("cache-control") ?? "", /no-store/);

  const foreignOrigin = await worker.fetch(new Request(route, {
    method: "DELETE",
    headers: {
      origin: "https://attacker.example",
      "x-juro-csrf": "1",
    },
  }), runtime, context);
  assert.equal(foreignOrigin.status, 403);
  assert.match(foreignOrigin.headers.get("cache-control") ?? "", /no-store/);

  const unauthenticated = await worker.fetch(new Request(route, {
    method: "DELETE",
    headers: {
      origin: "http://localhost",
      "sec-fetch-site": "same-origin",
      "x-juro-csrf": "1",
    },
  }), runtime, context);
  assert.equal(unauthenticated.status, 401);
  assert.match(unauthenticated.headers.get("cache-control") ?? "", /no-store/);
});

test("built auth routes reject missing and cross-origin CSRF writes", async () => {
  const worker = await createWorker();
  for (const route of [
    "/api/auth/request-otp",
    "/api/auth/verify-otp",
    "/api/auth/verify-mfa",
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
    "/api/platform/ai/runs/recovery-request-0001",
    "/api/platform/document-review",
    "/api/platform/document-comparisons",
    "/api/platform/document-analysis/analysis-test/exports",
    "/api/platform/document-analysis/exports/export-test/file",
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

test("MFA management mutations reject missing and foreign CSRF proof", async () => {
  const worker = await createWorker();
  for (const [method, route] of [
    ["POST", "/api/platform/security/mfa/setup?lang=ru"],
    ["POST", "/api/platform/security/mfa/confirm"],
    ["POST", "/api/platform/security/mfa/backup-codes"],
    ["DELETE", "/api/platform/security/mfa"],
  ]) {
    const missingHeader = await worker.fetch(new Request(
      `http://localhost${route}`,
      {
        method,
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    ), runtime, context);
    assert.equal(missingHeader.status, 403, route);
    const foreignOrigin = await worker.fetch(new Request(
      `http://localhost${route}`,
      {
        method,
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

test("MFA boundaries do not accept platform headers or a missing pre-auth cookie", async () => {
  const worker = await createWorker();
  const platformHeaders = {
    "oai-authenticated-user-email": "mfa@example.com",
    "oai-authenticated-user-full-name": "MFA%20User",
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
  const status = await worker.fetch(
    new Request("http://localhost/api/platform/security/mfa", {
      headers: platformHeaders,
    }),
    runtime,
    context,
  );
  assert.equal(status.status, 200);
  assert.match(status.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await status.json(), {
    available: false,
    canManage: false,
    enabled: false,
    verifiedAt: null,
    backupCodesRemaining: 0,
    reason: "LOCAL_SESSION_REQUIRED",
  });

  const setup = await worker.fetch(
    new Request("http://localhost/api/platform/security/mfa/setup?lang=ru", {
      method: "POST",
      headers: {
        ...platformHeaders,
        origin: "http://localhost",
        "x-juro-csrf": "1",
      },
    }),
    runtime,
    context,
  );
  assert.equal(setup.status, 401);
  assert.match(setup.headers.get("cache-control") ?? "", /no-store/);

  const verify = await worker.fetch(
    new Request("http://localhost/api/auth/verify-mfa", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        "x-juro-csrf": "1",
      },
      body: JSON.stringify({ code: "123456", locale: "ru" }),
    }),
    runtime,
    context,
  );
  assert.equal(verify.status, 401);
  assert.match(verify.headers.get("cache-control") ?? "", /no-store/);
  assert.match(
    verify.headers.get("set-cookie") ?? "",
    /juro_mfa_challenge=; Path=\/api\/auth\/verify-mfa;[^,]*Max-Age=0/,
  );
});

test("email change requires CSRF and a recent local JURO session", async () => {
  const worker = await createWorker();
  const route = "/api/platform/security/email-change";
  const body = JSON.stringify({
    action: "cancel",
    challengeId: "11111111-1111-4111-8111-111111111111",
    locale: "ru",
  });
  const missingHeader = await worker.fetch(new Request(
    `http://localhost${route}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    },
  ), runtime, context);
  assert.equal(missingHeader.status, 403);

  const foreignOrigin = await worker.fetch(new Request(
    `http://localhost${route}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
        "x-juro-csrf": "1",
      },
      body,
    },
  ), runtime, context);
  assert.equal(foreignOrigin.status, 403);

  const platformHeaders = {
    "oai-authenticated-user-email": "owner@example.test",
    "oai-authenticated-user-full-name": "Owner%20User",
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
  const status = await worker.fetch(
    new Request(`http://localhost${route}`, { headers: platformHeaders }),
    runtime,
    context,
  );
  assert.equal(status.status, 200);
  assert.match(status.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await status.json(), {
    available: false,
    canManage: false,
    reason: "LOCAL_SESSION_REQUIRED",
    active: null,
  });

  const platformOnly = await worker.fetch(new Request(
    `http://localhost${route}`,
    {
      method: "POST",
      headers: {
        ...platformHeaders,
        "content-type": "application/json",
        origin: "http://localhost",
        "x-juro-csrf": "1",
      },
      body,
    },
  ), runtime, context);
  assert.equal(platformOnly.status, 401);
  assert.match(platformOnly.headers.get("cache-control") ?? "", /no-store/);
  assert.match(await platformOnly.text(), /LOCAL_SESSION_REQUIRED/);
});

test("account deletion requires CSRF and a recent local JURO session", async () => {
  const worker = await createWorker();
  const route = "/api/platform/privacy/deletion-request";
  const missingHeader = await worker.fetch(new Request(
    `http://localhost${route}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "request_code", locale: "ru" }),
    },
  ), runtime, context);
  assert.equal(missingHeader.status, 403);

  const foreignOrigin = await worker.fetch(new Request(
    `http://localhost${route}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
        "x-juro-csrf": "1",
      },
      body: JSON.stringify({ action: "request_code", locale: "ru" }),
    },
  ), runtime, context);
  assert.equal(foreignOrigin.status, 403);

  const platformOnly = await worker.fetch(new Request(
    `http://localhost${route}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        "x-juro-csrf": "1",
        "oai-authenticated-user-email": "owner@example.test",
      },
      body: JSON.stringify({ action: "request_code", locale: "ru" }),
    },
  ), runtime, context);
  assert.equal(platformOnly.status, 401);
  assert.match(platformOnly.headers.get("cache-control") ?? "", /no-store/);
  assert.match(await platformOnly.text(), /LOCAL_SESSION_REQUIRED/);
});

test("admin handoff rejects missing CSRF proof without an empty 500", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(new Request(
    "http://localhost/api/platform/admin/handoff",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: "ru" }),
    },
  ), runtime, context);

  assert.equal(response.status, 403);
  assert.match(response.headers.get("cache-control") ?? "", /private, no-store/u);
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.deepEqual(await response.json(), {
    code: "REQUEST_REJECTED",
    error: "Запрос отклонён проверкой безопасности.",
  });
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
    assert.match(html, /2026-07-26\.draft\.1/);
    assert.match(html, /SHA-256/);
    assert.match(html, /Проект для юридического утверждения|Yuridik tasdiqlash uchun loyiha/);
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
