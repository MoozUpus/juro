import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { EXAMPLE_RU, EXAMPLE_UZ } from "../lib/document-builder/defaults";
import { renderReceipt } from "../lib/document-builder/templates/receipt";

const baseUrl = process.env.JURO_SMOKE_BASE_URL ?? "http://127.0.0.1:4180";
const ownerEmail = "owner@example.test";
const collaboratorEmail = "counterparty@example.test";

interface ApiOptions extends RequestInit {
  user?: string;
  json?: unknown;
  expected?: number | number[];
}

function authHeaders(email: string, write: boolean): Headers {
  const headers = new Headers({
    "oai-authenticated-user-email": email,
    "oai-authenticated-user-full-name": encodeURIComponent(email === ownerEmail ? "Owner Test" : "Counterparty Test"),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  });
  if (write) {
    headers.set("origin", baseUrl);
    headers.set("x-juro-csrf", "1");
  }
  return headers;
}

async function api<T = Record<string, unknown>>(path: string, options: ApiOptions = {}): Promise<{ response: Response; data: T }> {
  const method = options.method ?? "GET";
  const isWrite = method !== "GET" && method !== "HEAD";
  const headers = options.user ? authHeaders(options.user, isWrite) : new Headers();
  if (isWrite) {
    headers.set("origin", baseUrl);
    headers.set("x-juro-csrf", "1");
  }
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
    throw new Error(`${method} ${path}: expected ${expected.join("/")}, got ${response.status}: ${text.slice(0, 800)}`);
  }
  return { response, data: (text ? JSON.parse(text) : {}) as T };
}

async function download(path: string, user: string): Promise<{ response: Response; bytes: Uint8Array }> {
  const response = await fetch(`${baseUrl}${path}`, { headers: authHeaders(user, false) });
  assert.equal(response.status, 200, `GET ${path}`);
  return { response, bytes: new Uint8Array(await response.arrayBuffer()) };
}

async function main(): Promise<void> {
  const page = await fetch(`${baseUrl}/document-builder-test`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>Создать документ — JURO<\/title>/);

  const anonymous = await api("/api/document-builder-test/documents", { expected: 401 });
  assert.equal((anonymous.data as { code?: string }).code, "UNAUTHORIZED");

  const ownerBootstrap = await api<{ storage: { d1: boolean; r2: boolean }; user: { id: string } }>("/api/document-builder-test/bootstrap", { user: ownerEmail });
  assert.deepEqual(ownerBootstrap.data.storage, { d1: true, r2: true });
  const ownerId = ownerBootstrap.data.user.id;

  const collaboratorBootstrap = await api<{ user: { id: string } }>("/api/document-builder-test/bootstrap", { user: collaboratorEmail });
  const collaboratorId = collaboratorBootstrap.data.user.id;

  await api("/api/document-builder-test/drafts", {
    method: "POST",
    user: ownerEmail,
    headers: { "x-juro-csrf": "0" },
    json: { answers: EXAMPLE_RU },
    expected: 401,
  });

  const answers = { ...EXAMPLE_RU, accuracyConfirmed: true };
  const rendered = renderReceipt(answers);
  const created = await api<{ document: { id: string; revision: number; status: string } }>("/api/document-builder-test/drafts", {
    method: "POST",
    user: ownerEmail,
    json: { answers, title: "Интеграционная расписка JURO", autoContent: rendered.plainText, finalContent: rendered.plainText, manuallyEdited: false },
    expected: 201,
  });
  const documentId = created.data.document.id;
  assert.equal(created.data.document.status, "Черновик");

  await api(`/api/document-builder-test/documents/${documentId}`, { user: collaboratorEmail, expected: 404 });

  const saved = await api<{ revision: number; status: string }>(`/api/document-builder-test/documents/${documentId}`, {
    method: "PUT",
    user: ownerEmail,
    json: { title: "Интеграционная расписка JURO", answers, autoContent: rendered.plainText, finalContent: rendered.plainText, manuallyEdited: false, revision: 1 },
  });
  assert.equal(saved.data.revision, 2);

  const review = await api<{ status: string; issues: unknown[]; quality: { legalCompleteness: number } }>("/api/document-builder-test/ai-review", {
    method: "POST",
    user: ownerEmail,
    json: { answers, finalText: rendered.plainText },
  });
  assert.ok(["completed", "unavailable"].includes(review.data.status));
  assert.ok(Array.isArray(review.data.issues));
  assert.ok(review.data.quality.legalCompleteness >= 0);

  const generated = await api<{ status: string; files: Record<"docx" | "pdf" | "zip", { id: string; url: string; mimeType: string; size: number }> }>(`/api/document-builder-test/documents/${documentId}/generate`, {
    method: "POST",
    user: ownerEmail,
    json: {},
  });
  assert.equal(generated.data.status, "Готов");

  const docx = await download(generated.data.files.docx.url, ownerEmail);
  const pdf = await download(generated.data.files.pdf.url, ownerEmail);
  const zip = await download(generated.data.files.zip.url, ownerEmail);
  assert.equal(docx.response.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.deepEqual(Array.from(docx.bytes.slice(0, 2)), [0x50, 0x4b]);
  assert.equal(pdf.response.headers.get("content-type"), "application/pdf");
  assert.equal(new TextDecoder().decode(pdf.bytes.slice(0, 5)), "%PDF-");
  assert.deepEqual(Array.from(zip.bytes.slice(0, 2)), [0x50, 0x4b]);
  assert.ok(docx.bytes.byteLength > 10_000 && pdf.bytes.byteLength > 10_000 && zip.bytes.byteLength > 10_000);

  await mkdir("outputs/smoke", { recursive: true });
  await Promise.all([
    writeFile("outputs/smoke/receipt-ru.docx", docx.bytes),
    writeFile("outputs/smoke/receipt-ru.pdf", pdf.bytes),
    writeFile("outputs/smoke/receipt-ru.zip", zip.bytes),
  ]);

  const uzAnswers = { ...EXAMPLE_UZ, accuracyConfirmed: true };
  const uzRendered = renderReceipt(uzAnswers);
  const uzCreated = await api<{ document: { id: string } }>("/api/document-builder-test/drafts", {
    method: "POST",
    user: ownerEmail,
    json: { answers: uzAnswers, title: "Ўзбекча интеграцион тилхат", autoContent: uzRendered.plainText, finalContent: uzRendered.plainText, manuallyEdited: false },
    expected: 201,
  });
  const uzGenerated = await api<{ files: Record<"docx" | "pdf", { url: string }> }>(`/api/document-builder-test/documents/${uzCreated.data.document.id}/generate`, {
    method: "POST",
    user: ownerEmail,
    json: {},
  });
  const uzDocx = await download(uzGenerated.data.files.docx.url, ownerEmail);
  const uzPdf = await download(uzGenerated.data.files.pdf.url, ownerEmail);
  assert.deepEqual(Array.from(uzDocx.bytes.slice(0, 2)), [0x50, 0x4b]);
  assert.equal(new TextDecoder().decode(uzPdf.bytes.slice(0, 5)), "%PDF-");
  await Promise.all([
    writeFile("outputs/smoke/receipt-uz-cyrl.docx", uzDocx.bytes),
    writeFile("outputs/smoke/receipt-uz-cyrl.pdf", uzPdf.bytes),
  ]);
  await api(`/api/document-builder-test/documents/${uzCreated.data.document.id}`, { method: "DELETE", user: ownerEmail });

  const listed = await api<{ documents: Array<{ id: string }>; total: number }>("/api/document-builder-test/documents?search=Интеграционная", { user: ownerEmail });
  assert.ok(listed.data.documents.some((item) => item.id === documentId));
  assert.ok(listed.data.total >= 1);

  const duplicate = await api<{ document: { id: string } }>("/api/document-builder-test/documents", {
    method: "POST",
    user: ownerEmail,
    json: { sourceDocumentId: documentId },
    expected: 201,
  });
  assert.notEqual(duplicate.data.document.id, documentId);

  const contactInput = {
    label: "Контрагент тест",
    fullName: "Тестов Контрагент",
    birthDate: "1990-01-01",
    idDocumentType: "passport",
    idDocumentNumber: "TEST 0001",
    idIssuedBy: "Тестовый орган",
    idIssueDate: "2020-01-01",
    pinfl: "00000000000000",
    registeredAddress: "Тестовый адрес",
    phone: "+998 00 000 00 00",
  };
  const contact = await api<{ contact: { id: string } }>("/api/document-builder-test/contacts", { method: "POST", user: ownerEmail, json: contactInput, expected: 201 });
  const contacts = await api<{ contacts: Array<{ id: string }> }>("/api/document-builder-test/contacts", { user: ownerEmail });
  assert.ok(contacts.data.contacts.some((item) => item.id === contact.data.contact.id));
  await api(`/api/document-builder-test/contacts/${contact.data.contact.id}`, { method: "PUT", user: ownerEmail, json: { ...contactInput, label: "Обновлённый контакт" } });
  await api(`/api/document-builder-test/contacts/${contact.data.contact.id}`, { method: "DELETE", user: ownerEmail });

  const publicShare = await api<{ url: string }>(`/api/document-builder-test/documents/${documentId}/share`, {
    method: "POST",
    user: ownerEmail,
    json: { action: "create" },
  });
  const publicResponse = await fetch(publicShare.data.url);
  assert.equal(publicResponse.status, 200);
  assert.match(publicResponse.headers.get("x-robots-tag") ?? "", /noindex/);
  assert.match(publicResponse.headers.get("cache-control") ?? "", /no-store/);

  const invited = await api<{ user: { id: string } }>(`/api/document-builder-test/documents/${documentId}/collaboration`, {
    method: "POST",
    user: ownerEmail,
    json: { action: "invite", identifier: collaboratorEmail },
  });
  assert.equal(invited.data.user.id, collaboratorId);

  const collaboratorDocument = await api<{ document: { accessRole: string }; files: unknown[] }>(`/api/document-builder-test/documents/${documentId}`, { user: collaboratorEmail });
  assert.equal(collaboratorDocument.data.document.accessRole, "collaborator");
  assert.deepEqual(collaboratorDocument.data.files, []);
  await api(`/api/document-builder-test/documents/${documentId}/collaboration`, {
    method: "POST",
    user: collaboratorEmail,
    json: { action: "comment", body: "Проверено в интеграционном сценарии." },
    expected: 201,
  });
  const oldText = "Настоящая расписка составлена между:";
  const proposal = await api<{ proposalId: string }>(`/api/document-builder-test/documents/${documentId}/collaboration`, {
    method: "POST",
    user: collaboratorEmail,
    json: { action: "proposal", oldText, newText: "Настоящая расписка добровольно составлена между:" },
    expected: 201,
  });
  const accepted = await api<{ applied: boolean }>(`/api/document-builder-test/documents/${documentId}/collaboration`, {
    method: "POST",
    user: ownerEmail,
    json: { action: "accept_proposal", proposalId: proposal.data.proposalId },
  });
  assert.equal(accepted.data.applied, true);
  await api(`/api/document-builder-test/documents/${documentId}/collaboration`, { method: "POST", user: collaboratorEmail, json: { action: "confirm_data" } });

  await api(`/api/document-builder-test/documents/${documentId}`, { method: "PATCH", user: ownerEmail, json: { action: "confirm_agreement" } });
  const agreedDocument = await api<{ document: { revision: number; status: string; autoContent: string; finalContent: string } }>(`/api/document-builder-test/documents/${documentId}`, { user: ownerEmail });
  assert.equal(agreedDocument.data.document.status, "Согласован");
  const editedText = `${agreedDocument.data.document.finalContent}\nДополнение владельца после согласования.`;
  const afterAgreedEdit = await api<{ status: string }>(`/api/document-builder-test/documents/${documentId}`, {
    method: "PUT",
    user: ownerEmail,
    json: { title: "Интеграционная расписка JURO", answers, autoContent: agreedDocument.data.document.autoContent, finalContent: editedText, manuallyEdited: true, revision: agreedDocument.data.document.revision },
  });
  assert.equal(afterAgreedEdit.data.status, "Готов");

  const signedForm = new FormData();
  const signedPdfBuffer = new ArrayBuffer(pdf.bytes.byteLength);
  new Uint8Array(signedPdfBuffer).set(pdf.bytes);
  signedForm.set("file", new File([signedPdfBuffer], "signed-receipt.pdf", { type: "application/pdf" }));
  const signed = await api<{ file: { id: string }; status: string }>(`/api/document-builder-test/documents/${documentId}/signed-file`, {
    method: "POST",
    user: ownerEmail,
    body: signedForm,
    expected: 201,
  });
  assert.equal(signed.data.status, "Подписан");
  await api(`/api/document-builder-test/documents/${documentId}/collaboration`, {
    method: "POST",
    user: ownerEmail,
    json: { action: "signed_access", collaboratorUserId: collaboratorId, viewAllowed: true, downloadAllowed: true },
  });
  const collaboratorSigned = await download(`/api/document-builder-test/documents/${documentId}/files/${signed.data.file.id}?inline=1`, collaboratorEmail);
  assert.equal(new TextDecoder().decode(collaboratorSigned.bytes.slice(0, 5)), "%PDF-");

  const consultation = await api<{ request: { contextAttached: boolean }; handoffUrl: string }>("/api/document-builder-test/consultations", {
    method: "POST",
    user: ownerEmail,
    json: { documentId, type: "lawyer" },
    expected: 201,
  });
  assert.equal(consultation.data.request.contextAttached, true);
  assert.match(consultation.data.handoffUrl, new RegExp(documentId));

  const ownerNotifications = await api<{ notifications: unknown[] }>("/api/document-builder-test/notifications", { user: ownerEmail });
  assert.ok(ownerNotifications.data.notifications.length > 0);

  await api(`/api/document-builder-test/documents/${documentId}`, { method: "PATCH", user: ownerEmail, json: { action: "archive" } });
  await api(`/api/document-builder-test/documents/${documentId}`, { method: "PATCH", user: ownerEmail, json: { action: "restore" } });

  const removed = await api<{ preservedSignedFileId: string }>(`/api/document-builder-test/documents/${documentId}?signed=keep`, { method: "DELETE", user: ownerEmail });
  assert.equal(removed.data.preservedSignedFileId, signed.data.file.id);

  const standaloneList = await api<{ standaloneFiles: Array<{ id: string }> }>("/api/document-builder-test/documents", { user: ownerEmail });
  assert.ok(standaloneList.data.standaloneFiles.some((item) => item.id === signed.data.file.id));
  const standaloneShare = await api<{ share: { url: string; code: string } }>(`/api/document-builder-test/standalone-files/${signed.data.file.id}/share`, {
    method: "POST",
    user: ownerEmail,
    json: { action: "create" },
    expected: 201,
  });
  const signedShareUrl = new URL(standaloneShare.data.share.url);
  const token = signedShareUrl.pathname.split("/").at(-1);
  assert.ok(token);
  await api(`/api/document-builder-test/standalone-signed-shares/${token}/verify`, { method: "POST", json: { code: "9999" }, expected: 403 });
  const verified = await api<{ viewerUrl: string }>(`/api/document-builder-test/standalone-signed-shares/${token}/verify`, {
    method: "POST",
    json: { code: standaloneShare.data.share.code },
  });
  assert.match(verified.response.headers.get("set-cookie") ?? "", /juro_signed_share_session=/);
  const cookie = (verified.response.headers.get("set-cookie") ?? "").split(";")[0];
  const sharedPdf = await fetch(`${baseUrl}${verified.data.viewerUrl}`, { headers: { cookie } });
  assert.equal(sharedPdf.status, 200);
  assert.equal(new TextDecoder().decode(new Uint8Array(await sharedPdf.arrayBuffer()).slice(0, 5)), "%PDF-");

  const replacedShare = await api<{ share: { url: string; code: string } }>(`/api/document-builder-test/standalone-files/${signed.data.file.id}/share`, {
    method: "POST",
    user: ownerEmail,
    json: { action: "create" },
    expected: 201,
  });
  assert.equal(replacedShare.data.share.code, standaloneShare.data.share.code);
  assert.notEqual(replacedShare.data.share.url, standaloneShare.data.share.url);
  await api(`/api/document-builder-test/standalone-signed-shares/${token}/verify`, { method: "POST", json: { code: standaloneShare.data.share.code }, expected: 403 });

  await api(`/api/document-builder-test/documents/${duplicate.data.document.id}`, { method: "DELETE", user: ownerEmail });
  await api(`/api/document-builder-test/standalone-files/${signed.data.file.id}`, { method: "DELETE", user: ownerEmail });

  console.log(JSON.stringify({
    ok: true,
    ownerId,
    documentId,
    files: {
      docx: docx.bytes.byteLength,
      pdf: pdf.bytes.byteLength,
      zip: zip.bytes.byteLength,
    },
    aiStatus: review.data.status,
    scenarios: 34,
  }, null, 2));
}

await main();
