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
  assert.match(styles, /@media\s*\(min-width:\s*801px\)\s*and\s*\(max-width:\s*900px\)/);
  const documentNav = shell.match(/const documentNav = \[(.*?)\];/s)?.[1] ?? "";
  assert.doesNotMatch(documentNav, /\["document-builder",/);
  assert.doesNotMatch(documentNav, /\["document-review",/);
});

test("mobile AI composer ends above the fixed navigation", async () => {
  const styles = await source("../app/_platform/ai-lawyer.css");
  assert.match(styles, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.ai-dialog\s*\{[^}]*height:\s*calc\(100dvh - 70px - 68px\);[^}]*min-height:\s*0;[^}]*overflow:\s*hidden/);
  assert.match(styles, /\.ai-workspace\s*\{[^}]*display:\s*block;[^}]*min-height:\s*0;[^}]*padding-bottom:\s*74px/);
});

test("AI composer keeps idle voice, question, and send controls on one row", async () => {
  const styles = await source("../app/_platform/ai-lawyer.css");

  assert.match(styles, /\.ai-composer-input\s*\{[^}]*grid-template-areas:\s*"voice question send"/su);
  assert.match(styles, /\.ai-composer-input\s*>\s*\.ai-voice-controls\[data-phase="idle"\][^{]*\{[^}]*grid-area:\s*voice\s*;/su);
  assert.match(styles, /\.ai-composer-input\s*>\s*textarea\s*\{[^}]*grid-area:\s*question\s*;/su);
  assert.match(styles, /\.ai-composer-input\s*>\s*button\s*\{[^}]*grid-area:\s*send\s*;/su);
  assert.match(styles, /\.ai-composer-input:has\(> \.ai-voice-controls:not\(\[data-phase="idle"\]\)\)\s*\{[^}]*"voice voice voice"\s*"question question send"/su);
});

test("AI chat keeps the answer in focus and exposes responsive history and evidence controls", async () => {
  const [client, styles] = await Promise.all([
    source("../app/_platform/AiLawyerClient.tsx"),
    source("../app/_platform/ai-lawyer.css"),
  ]);

  assert.match(client, /const \[historyCollapsed, setHistoryCollapsed\]/u);
  assert.match(client, /localStorage\.setItem\("juro:ai-history"/u);
  assert.match(client, /aria-controls="ai-conversations-panel"/u);
  assert.match(client, /className="ai-mobile-context-bar"/u);
  assert.match(client, /role=\{mobileContextOpen \? "dialog" : undefined\}/u);
  assert.match(client, /hidden=\{mobileContextOpen && mobileContextTab !== "facts"\}/u);
  assert.match(client, /hidden=\{mobileContextOpen && mobileContextTab !== "sources"\}/u);
  assert.match(client, /latestAnswerRef\.current\?\.scrollIntoView/u);
  assert.doesNotMatch(client, /transcript\.scrollTo\(\{ top: transcript\.scrollHeight, behavior: preliminary/u);

  assert.match(styles, /\.ai-workspace\.ai-history-collapsed/u);
  assert.match(styles, /\.ai-mobile-context-bar/u);
  assert.match(styles, /\.ai-context\.is-mobile-open/u);
  assert.match(styles, /\.ai-fact[^}]*[\s\S]*?button[^}]*min-(?:width|height):\s*44px/u);
});

test("AI composer grows with its content and does not submit during IME composition", async () => {
  const client = await source("../app/_platform/AiLawyerClient.tsx");
  assert.match(client, /function resizeComposer\(/u);
  assert.match(client, /event\.nativeEvent\.isComposing/u);
  assert.match(client, /resizeComposer\(event\.currentTarget\)/u);
});

test("AI source dialog traps focus and returns it to the citation control", async () => {
  const client = await source("../app/_platform/AiLawyerClient.tsx");
  assert.match(client, /const sourceDialogRef = useRef<HTMLElement \| null>\(null\)/u);
  assert.match(client, /const sourceReturnFocusRef = useRef<HTMLElement \| null>\(null\)/u);
  assert.match(client, /event\.key !== "Tab"/u);
  assert.match(client, /document\.activeElement === last/u);
  assert.match(client, /sourceReturnFocusRef\.current\?\.focus\(\)/u);
  assert.match(client, /ref=\{sourceDialogRef\} className="ai-source-modal" role="dialog"/u);
});

test("guest AI keeps its workspace and interactive states legible in dark mode", async () => {
  const styles = await source("../app/_guest/guest-ai.css");

  assert.match(styles, /html\[data-theme="dark"\] \.guest-ai-workspace\s*\{[^}]*background:\s*#102c3e/u);
  assert.match(styles, /html\[data-theme="dark"\] \.guest-ai-form textarea\s*\{[^}]*background:\s*#081f30;[^}]*color:\s*#edf2f5/u);
  assert.match(styles, /html\[data-theme="dark"\] \.guest-ai-header nav a:hover\s*\{[^}]*background:\s*#17384b;[^}]*color:\s*#f4f7f9/u);
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
  assert.match(styles, /@media\s*\(max-width:\s*1380px\)/);
  assert.match(styles, /\.dashboard-command-hero\s*\{[\s\S]*?grid-template-columns:\s*1fr;[\s\S]*?min-height:\s*0;/);
  assert.match(styles, /\.dashboard-quick-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
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
