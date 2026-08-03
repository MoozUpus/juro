import assert from "node:assert/strict";

const baseUrl = process.env.JURO_SMOKE_BASE_URL ?? "http://127.0.0.1:4180";
const email = "case-owner@example.test";

function headers(write = false): Headers {
  const value = new Headers({
    "oai-authenticated-user-email": email,
    "oai-authenticated-user-full-name": "Case%20Owner",
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  });
  if (write) {
    value.set("content-type", "application/json");
    value.set("origin", baseUrl);
    value.set("x-juro-csrf", "1");
  }
  return value;
}

async function json<T>(path: string, init: RequestInit = {}, expected = 200): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  assert.equal(response.status, expected, `${init.method ?? "GET"} ${path}: ${text.slice(0, 600)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

async function main() {
  await json("/api/document-builder/bootstrap", { headers: headers() });

  const anonymous = await json<{ code?: string; error?: string }>("/api/platform/cases", {
    method: "POST",
    headers: { "content-type": "application/json", "origin": baseUrl, "x-juro-csrf": "1" },
    body: JSON.stringify({ title: "Denied", legalArea: "debt", locale: "ru", accountType: "individual" }),
  }, 401);
  assert.match(`${anonymous.code ?? ""} ${anonymous.error ?? ""}`, /UNAUTHORIZED|AUTH_REQUIRED|войти|Kirish/i);

  await json("/api/platform/cases", {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ title: "Wrong audience", legalArea: "contract-breach", locale: "ru", accountType: "individual" }),
  }, 400);

  const title = `Smoke case ${crypto.randomUUID()}`;
  const created = await json<{ caseId: string; planId: string }>("/api/platform/cases", {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({
      title,
      description: "Persistent D1 case creation smoke",
      legalArea: "debt",
      locale: "ru",
      accountType: "individual",
    }),
  }, 201);
  assert.match(created.caseId, /^[0-9a-f-]{36}$/);
  assert.match(created.planId, /^[0-9a-f-]{36}$/);

  const loaded = await json<{ cases: Array<{ id: string; title: string; planTitle: string; steps: unknown[] }> }>(
    `/api/platform/cases?caseId=${encodeURIComponent(created.caseId)}`,
    { headers: headers() },
  );
  assert.equal(loaded.cases.length, 1);
  assert.equal(loaded.cases[0].id, created.caseId);
  assert.equal(loaded.cases[0].title, title);
  assert.equal(loaded.cases[0].planTitle, `План: ${title}`);
  assert.equal(loaded.cases[0].steps.length, 4);

  console.log(JSON.stringify({ ok: true, caseId: created.caseId, planId: created.planId, steps: loaded.cases[0].steps.length }, null, 2));
}

await main();
