import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import PizZip from "pizzip";

const baseUrl = process.env.JURO_SMOKE_BASE_URL ?? "http://127.0.0.1:4180";
const ownerEmail = "owner@example.test";
const otherEmail = "counterparty@example.test";
const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type ApiOptions = RequestInit & {
  user?: string;
  json?: unknown;
  expected?: number | number[];
};

function authHeaders(email: string, write: boolean): Headers {
  const headers = new Headers({
    "oai-authenticated-user-email": email,
    "oai-authenticated-user-full-name": encodeURIComponent(email === ownerEmail ? "Comparison Owner" : "Comparison Other"),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  });
  if (write) {
    headers.set("origin", baseUrl);
    headers.set("x-juro-csrf", "1");
  }
  return headers;
}

async function api<T = Record<string, unknown>>(
  path: string,
  options: ApiOptions = {},
): Promise<{ response: Response; data: T }> {
  const method = options.method ?? "GET";
  const write = method !== "GET" && method !== "HEAD";
  const headers = options.user ? authHeaders(options.user, write) : new Headers();
  for (const [name, value] of new Headers(options.headers)) headers.set(name, value);
  let body = options.body;
  if (options.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  }
  const response = await fetch(`${baseUrl}${path}`, { ...options, method, headers, body });
  const expected = Array.isArray(options.expected) ? options.expected : [options.expected ?? 200];
  const text = await response.text();
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path}: expected ${expected.join("/")}, got ${response.status}: ${text.slice(0, 1_000)}`);
  }
  return { response, data: (text ? JSON.parse(text) : {}) as T };
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function docx(lines: string[]): Uint8Array {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`);
  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`);
  const body = lines.map(line => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join("");
  zip.folder("word")?.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`);
  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}

function file(bytes: Uint8Array, name: string) {
  return new File([Uint8Array.from(bytes).buffer], name, { type: docxType });
}

async function createComparison(first: Uint8Array, second: Uint8Array, suffix: string) {
  const form = new FormData();
  form.set("locale", "ru");
  form.set("consent", "true");
  form.set("versionOne", file(first, `contract-${suffix}-v1.docx`));
  form.set("versionTwo", file(second, `contract-${suffix}-v2.docx`));
  return api<{
    comparison: { id: string; status: string; stage: string };
    warning: string | null;
  }>("/api/platform/document-comparisons", {
    method: "POST",
    user: ownerEmail,
    body: form,
    expected: 201,
  });
}

async function download(path: string, user: string) {
  const response = await fetch(`${baseUrl}${path}`, { headers: authHeaders(user, false) });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { response, bytes };
}

async function main() {
  for (const [email, name] of [[ownerEmail, "Comparison Owner"], [otherEmail, "Comparison Other"]] as const) {
    await api("/api/document-builder/bootstrap", { user: email });
    await api("/api/onboarding", {
      method: "POST",
      user: email,
      json: {
        lastName: "Tester",
        firstName: name,
        middleName: "",
        phone: email === ownerEmail ? "+998901234567" : "+998909876543",
        locale: "ru",
        accountPersona: "individual",
        primaryGoal: "review_document",
      },
    });
  }

  const protectedList = await api("/api/platform/document-comparisons", { expected: 401 });
  assert.equal(protectedList.response.status, 401);

  const first = docx([
    "ДОГОВОР ОКАЗАНИЯ УСЛУГ",
    "1. Заказчик оплачивает услуги в течение 30 календарных дней после подписания акта.",
    "2. Автоматическое продление допускается при уведомлении за 30 календарных дней.",
    "3. Ответственность сторон определяется настоящим договором.",
  ]);
  const second = docx([
    "ДОГОВОР ОКАЗАНИЯ УСЛУГ",
    "1. Заказчик оплачивает услуги в течение 5 календарных дней после подписания акта.",
    "2. Автоматическое продление допускается при уведомлении за 5 календарных дней.",
    "3. Ответственность сторон определяется настоящим договором.",
    "4. За каждый день просрочки начисляется неустойка 1 процент.",
  ]);

  const created = await createComparison(first, second, "changed");
  const comparisonId = created.data.comparison.id;
  assert.equal(created.data.comparison.stage, "uploaded");

  await api(`/api/platform/document-comparisons/${comparisonId}`, {
    user: otherEmail,
    expected: 404,
  });
  const processed = await api<{
    comparison: { status: string; stage: string; summary: { totalChanges: number; materialChanges: number; aiStatus: string } };
  }>(`/api/platform/document-comparisons/${comparisonId}/process`, {
    method: "POST",
    user: ownerEmail,
  });
  assert.ok(["completed", "completed_partial"].includes(processed.data.comparison.status));
  assert.equal(processed.data.comparison.stage, "completed");
  assert.ok(processed.data.comparison.summary.totalChanges >= 2);
  assert.ok(processed.data.comparison.summary.materialChanges >= 2);

  const detail = await api<{
    comparison: {
      status: string;
      versionOne: { fileName: string; detectedLanguage: string; sections: unknown[] };
      versionTwo: { fileName: string; detectedLanguage: string; sections: unknown[] };
      changes: Array<{ id: string; changeType: string; riskLevel: string; beforeText: string | null; afterText: string | null }>;
      summary: { sourceStatus: string; likelyDifferentDocuments: boolean };
      sources: unknown[];
    };
  }>(`/api/platform/document-comparisons/${comparisonId}`, { user: ownerEmail });
  assert.equal(detail.data.comparison.versionOne.detectedLanguage, "ru");
  assert.equal(detail.data.comparison.versionTwo.detectedLanguage, "ru");
  assert.ok(detail.data.comparison.versionOne.sections.length >= 4);
  assert.ok(detail.data.comparison.changes.some(change => change.changeType === "changed"));
  assert.ok(detail.data.comparison.changes.some(change => change.changeType === "added"));
  assert.ok(["verified", "partial", "unverified"].includes(detail.data.comparison.summary.sourceStatus));
  if (detail.data.comparison.sources.length === 0) {
    assert.equal(detail.data.comparison.summary.sourceStatus, "unverified");
  }

  const firstChange = detail.data.comparison.changes.find(change => change.changeType !== "unchanged");
  assert.ok(firstChange);
  await api(`/api/platform/document-comparisons/${comparisonId}`, {
    method: "PATCH",
    user: ownerEmail,
    json: { changeId: firstChange.id, reviewed: true },
  });

  const sourceOne = await download(`/api/platform/document-comparisons/${comparisonId}/files/one`, ownerEmail);
  assert.equal(sourceOne.response.status, 200);
  assert.match(sourceOne.response.headers.get("cache-control") || "", /private.*no-store/);
  assert.deepEqual(Array.from(sourceOne.bytes.slice(0, 2)), [0x50, 0x4b]);

  const pdf = await download(`/api/platform/document-comparisons/${comparisonId}/export?format=pdf`, ownerEmail);
  const editable = await download(`/api/platform/document-comparisons/${comparisonId}/export?format=docx`, ownerEmail);
  assert.equal(pdf.response.status, 200);
  assert.equal(new TextDecoder().decode(pdf.bytes.slice(0, 5)), "%PDF-");
  assert.equal(editable.response.status, 200);
  assert.deepEqual(Array.from(editable.bytes.slice(0, 2)), [0x50, 0x4b]);
  assert.ok(pdf.bytes.byteLength > 5_000);
  assert.ok(editable.bytes.byteLength > 5_000);
  await mkdir("outputs/smoke", { recursive: true });
  await Promise.all([
    writeFile("outputs/smoke/comparison-report-ru.pdf", pdf.bytes),
    writeFile("outputs/smoke/comparison-redline-ru.docx", editable.bytes),
  ]);

  const identical = await createComparison(first, first, "identical");
  assert.ok(identical.data.warning);
  const identicalProcessed = await api<{
    comparison: { status: string; summary: { totalChanges: number; materialChanges: number; aiStatus: string } };
  }>(`/api/platform/document-comparisons/${identical.data.comparison.id}/process`, {
    method: "POST",
    user: ownerEmail,
  });
  assert.equal(identicalProcessed.data.comparison.status, "completed");
  assert.equal(identicalProcessed.data.comparison.summary.totalChanges, 0);
  assert.equal(identicalProcessed.data.comparison.summary.materialChanges, 0);
  assert.equal(identicalProcessed.data.comparison.summary.aiStatus, "not_required");

  const spoofed = new FormData();
  spoofed.set("locale", "ru");
  spoofed.set("consent", "true");
  spoofed.set("versionOne", file(first, "valid.docx"));
  spoofed.set("versionTwo", new File(["not a pdf"], "spoofed.pdf", { type: "application/pdf" }));
  const rejected = await api<{ code: string }>("/api/platform/document-comparisons", {
    method: "POST",
    user: ownerEmail,
    body: spoofed,
    expected: 400,
  });
  assert.equal(rejected.data.code, "CONTENT_TYPE_MISMATCH");

  const list = await api<{
    comparisons: Array<{ id: string }>;
    reusableFiles: Array<{ id: string }>;
  }>("/api/platform/document-comparisons", { user: ownerEmail });
  assert.ok(list.data.comparisons.some(item => item.id === comparisonId));
  assert.ok(list.data.reusableFiles.length >= 2);
  const duplicateReference = new FormData();
  duplicateReference.set("locale", "ru");
  duplicateReference.set("consent", "true");
  duplicateReference.set("versionOneFileId", list.data.reusableFiles[0].id);
  duplicateReference.set("versionTwoFileId", list.data.reusableFiles[0].id);
  const duplicateRejected = await api<{ code: string }>("/api/platform/document-comparisons", {
    method: "POST",
    user: ownerEmail,
    body: duplicateReference,
    expected: 400,
  });
  assert.equal(duplicateRejected.data.code, "SAME_FILE_REFERENCE");

  const monitoring = await api<{
    updates: unknown[];
    status: { automaticPublication: boolean };
  }>("/api/platform/monitoring?locale=ru", { user: ownerEmail });
  assert.equal(monitoring.data.status.automaticPublication, false);
  assert.deepEqual(monitoring.data.updates, []);
  await api("/api/platform/monitoring", {
    method: "POST",
    user: ownerEmail,
    json: {
      audience: "individual",
      topics: ["civil", "contract"],
      channels: ["in_app"],
      frequency: "weekly",
      locale: "ru",
      documentImpactConsent: true,
    },
  });
  const savedMonitoring = await api<{
    preference: { topics: string[]; documentImpactConsent: boolean };
  }>("/api/platform/monitoring?locale=ru", { user: ownerEmail });
  assert.deepEqual(savedMonitoring.data.preference.topics, ["civil", "contract"]);
  assert.equal(savedMonitoring.data.preference.documentImpactConsent, true);

  await api("/api/platform/workspaces", {
    method: "POST",
    user: ownerEmail,
    json: { workspaceId: "workspace-not-owned", locale: "ru" },
    expected: 403,
  });
  const search = await api<{ results: Array<{ type: string; id: string }> }>(
    "/api/platform/search?q=contract&locale=ru",
    { user: ownerEmail },
  );
  assert.ok(search.data.results.some(result => result.type === "comparison" && result.id === comparisonId));

  await api(`/api/platform/document-comparisons/${comparisonId}`, {
    method: "DELETE",
    user: ownerEmail,
  });
  await api(`/api/platform/document-comparisons/${comparisonId}`, {
    user: ownerEmail,
    expected: 404,
  });

  console.log(JSON.stringify({
    ok: true,
    comparisonId,
    changedCount: processed.data.comparison.summary.totalChanges,
    pdfBytes: pdf.bytes.byteLength,
    docxBytes: editable.bytes.byteLength,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
