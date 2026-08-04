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

  const loaded = await json<{ cases: Array<{
    id: string;
    title: string;
    planTitle: string;
    planRevision: number;
    steps: Array<{
      id: string;
      status: string;
      revision: number;
      dueAt: string | null;
      safeDueAt: string | null;
      deadlineConfidence: string;
    }>;
  }> }>(
    `/api/platform/cases?caseId=${encodeURIComponent(created.caseId)}`,
    { headers: headers() },
  );
  assert.equal(loaded.cases.length, 1);
  assert.equal(loaded.cases[0].id, created.caseId);
  assert.equal(loaded.cases[0].title, title);
  assert.equal(loaded.cases[0].planTitle, `План: ${title}`);
  assert.equal(loaded.cases[0].steps.length, 4);

  const step = loaded.cases[0].steps[0];
  const deadlineInput = {
    sourceDate: "2026-08-07",
    daysCount: 3,
    dayType: "business_days",
    includeSourceDate: false,
    rollRule: "next_business_day",
    holidays: [],
    holidayCalendarVersion: null,
    safeMarginBusinessDays: 1,
    legalBasis: null,
  };
  const preview = await json<{
    requiresConfirmation: boolean;
    result: { dueDate: string; safeEarlierDate: string; confidence: string; warnings: string[] };
  }>(`/api/platform/cases/${created.caseId}/steps/${step.id}/deadline`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(deadlineInput),
  });
  assert.equal(preview.requiresConfirmation, true);
  assert.equal(preview.result.dueDate, "2026-08-12");
  assert.equal(preview.result.safeEarlierDate, "2026-08-11");
  assert.equal(preview.result.confidence, "preliminary");
  assert.deepEqual(preview.result.warnings, ["HOLIDAY_CALENDAR_UNVERIFIED", "LEGAL_BASIS_UNCONFIRMED"]);

  const planChange = {
    revision: loaded.cases[0].planRevision,
    changes: [{
      id: step.id,
      status: step.status,
      revision: step.revision,
      dueAt: preview.result.dueDate,
      deadlineCalculation: deadlineInput,
    }],
  };
  const stale = structuredClone(planChange);
  stale.changes[0].dueAt = "2026-08-13";
  const staleResponse = await json<{ code: string }>(`/api/platform/cases/${created.caseId}/plan`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify(stale),
  }, 409);
  assert.equal(staleResponse.code, "DEADLINE_PREVIEW_STALE");

  await json(`/api/platform/cases/${created.caseId}/plan`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify(planChange),
  });
  const recalculated = await json<{ cases: Array<{ steps: Array<{ id: string; dueAt: string; safeDueAt: string; deadlineConfidence: string }> }> }>(
    `/api/platform/cases?caseId=${encodeURIComponent(created.caseId)}`,
    { headers: headers() },
  );
  const recalculatedStep = recalculated.cases[0].steps.find((value) => value.id === step.id);
  assert.equal(recalculatedStep?.dueAt, "2026-08-12");
  assert.equal(recalculatedStep?.safeDueAt, "2026-08-11");
  assert.equal(recalculatedStep?.deadlineConfidence, "preliminary");

  await json(`/api/platform/cases/${created.caseId}/tasks`, {
    method: "POST",
    headers: headers(true),
  }, 201);
  const tasks = await json<{ tasks: Array<{ planStepId: string; dueAt: string; safeDueAt: string; deadlineConfidence: string; deadlineEvidence: { dueDate: string } | null }> }>(
    `/api/platform/cases/${created.caseId}/tasks`,
    { headers: headers() },
  );
  const calculatedTask = tasks.tasks.find((value) => value.planStepId === step.id);
  assert.equal(calculatedTask?.dueAt, "2026-08-12");
  assert.equal(calculatedTask?.safeDueAt, "2026-08-11");
  assert.equal(calculatedTask?.deadlineConfidence, "preliminary");
  assert.equal(calculatedTask?.deadlineEvidence?.dueDate, "2026-08-12");

  console.log(JSON.stringify({
    ok: true,
    caseId: created.caseId,
    planId: created.planId,
    steps: loaded.cases[0].steps.length,
    deadlinePreview: preview.result.dueDate,
    safeEarlierDate: preview.result.safeEarlierDate,
    persistedTaskEvidence: calculatedTask?.deadlineEvidence?.dueDate,
  }, null, 2));
}

await main();
