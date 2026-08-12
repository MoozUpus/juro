import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shellSource = new URL("../app/_platform/PlatformShell.tsx", import.meta.url);
const stylesheet = new URL("../app/_platform/platform-shell.css", import.meta.url);

test("document hub keeps document work grouped, current and outside More", async () => {
  const [shell, css] = await Promise.all([
    readFile(shellSource, "utf8"),
    readFile(stylesheet, "utf8"),
  ]);
  const navBlock = shell.match(/const nav = \[([\s\S]*?)\] as const;/)?.[1] ?? "";

  assert.doesNotMatch(navBlock, /"document-builder"|"document-review"/);
  assert.match(shell, /const documentNav = \[/);
  assert.match(shell, /\["documents", Files, "Мои документы", "Mening hujjatlarim"\]/);
  assert.match(shell, /\["document-builder", FilePenLine, "Создать документ", "Hujjat yaratish"\]/);
  assert.match(shell, /\["document-review", FileCheck2, "Проверить документ", "Hujjatni tekshirish"\]/);
  assert.match(shell, /\["documents\/comparisons", Files, "Сравнить версии", "Versiyalarni solishtirish"\]/);
  assert.match(shell, /className=\{`platform-nav-documents \$\{active \? "is-active" : ""\}`\}/);
  assert.match(shell, /open=\{active \|\| documentsOpen\}/);
  assert.match(shell, /slug === "documents" \? documentHasActiveRoute/);
  assert.match(css, /\.platform-nav-documents summary,\.platform-nav-more summary\{display:flex;min-height:44px/);
  assert.match(css, /\.platform-nav-documents\.is-active>summary\{box-shadow:inset 3px 0 var\(--p-gold\)\}/);
  assert.doesNotMatch(css, /platform-nav-documents[^\n]*transition:/);
});
