import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("document review keeps a single main landmark", async () => {
  const client = await source("../app/_platform/DocumentReviewClient.tsx");
  assert.match(client, /<section className="review-result-pane" aria-label=/);
  assert.doesNotMatch(client, /<main(?:\s|>)/);
});

test("document library reveals templates in scannable batches", async () => {
  const library = await source("../app/_document-builder/_components/DocumentLibraryClient.tsx");
  assert.match(library, /const TEMPLATE_PAGE_SIZE = 12;/);
  assert.match(library, /useState\(TEMPLATE_PAGE_SIZE\)/);
  assert.match(library, /setLimit\(\(current\) => current \+ TEMPLATE_PAGE_SIZE\)/);
  assert.match(library, /aria-live="polite"/);
});

test("tablet shell uses the off-canvas navigation before content becomes cramped", async () => {
  const [shell, styles] = await Promise.all([
    source("../app/_platform/PlatformShell.tsx"),
    source("../app/_platform/platform-shell.css"),
  ]);
  assert.match(shell, /matchMedia\("\(max-width: 900px\)"\)/);
  assert.match(styles, /@media\(min-width:801px\) and \(max-width:900px\)/);
  const documentNav = shell.match(/const documentNav = \[(.*?)\];/s)?.[1] ?? "";
  assert.doesNotMatch(documentNav, /\["document-builder",/);
  assert.doesNotMatch(documentNav, /\["document-review",/);
});

test("mobile AI composer ends above the fixed navigation", async () => {
  const styles = await source("../app/_platform/ai-lawyer.css");
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*?\.ai-dialog\{height:calc\(100dvh - 70px - 68px\);min-height:0;overflow:hidden\}/);
  assert.match(styles, /\.ai-workspace\{display:block;min-height:0;padding-bottom:74px/);
});

test("history presents human labels without exposing opaque entity ids", async () => {
  const history = await source("../app/_platform/HistoryClient.tsx");
  assert.doesNotMatch(history, /\{event\.entityId\}/);
  assert.match(history, /ai_chat_completed: \["AI-ответ подготовлен"/);
  assert.match(history, /malware_scan_clean: \["Проверка файла завершена"/);
  assert.match(history, /conversation: \["Юридический диалог"/);
  assert.match(history, /\? "Системное действие" : "Tizim harakati"/);
});

test("dashboard changes composition before the hero controls are squeezed", async () => {
  const styles = await source("../app/_platform/dashboard.css");
  assert.match(styles, /@media\(max-width:1380px\)/);
  assert.match(styles, /\.dashboard-command-hero\{grid-template-columns:1fr;min-height:0\}/);
  assert.match(styles, /\.dashboard-quick-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
});

test("document review mode tabs remain usable at the narrowest supported width", async () => {
  const styles = await source("../app/_platform/document-comparison.css");
  assert.match(styles, /@media\(max-width:620px\)[\s\S]*?\.review-mode-tabs button\{min-width:0;flex:1;/);
  assert.match(styles, /white-space:normal/);
  assert.match(styles, /\.review-mode-tabs button svg\{flex:none\}/);
});

test("document workspace search fields expose localized accessible names", async () => {
  const [library, documents, contacts] = await Promise.all([
    source("../app/_document-builder/_components/DocumentLibraryClient.tsx"),
    source("../app/_document-builder/documents/DocumentsClient.tsx"),
    source("../app/_document-builder/contacts/ContactsClient.tsx"),
  ]);
  assert.match(library, /aria-label=\{language === "uz" \? "Hujjat nomi yoki kodi bo‘yicha qidirish"/);
  assert.match(documents, /placeholder=\{copy\.search\} aria-label=\{copy\.search\}/);
  assert.match(contacts, /placeholder=\{copy\.search\} aria-label=\{copy\.search\}/);
});

test("contact editor modal owns the complete keyboard focus cycle", async () => {
  const contacts = await source("../app/_document-builder/contacts/ContactsClient.tsx");
  assert.match(contacts, /const dialogRef = useRef<HTMLFormElement>\(null\)/);
  assert.match(contacts, /if \(event\.key === "Escape"\)/);
  assert.match(contacts, /document\.activeElement === last/);
  assert.match(contacts, /returnFocusRef\.current\?\.focus\(\)/);
  assert.match(contacts, /<form ref=\{dialogRef\} className="dbt-contact-form" role="dialog" aria-modal="true"/);
});
