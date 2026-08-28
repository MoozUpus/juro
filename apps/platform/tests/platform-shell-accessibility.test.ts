import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shellSource = new URL("../app/_platform/PlatformShell.tsx", import.meta.url);
const searchStylesheet = new URL("../app/_platform/global-search.css", import.meta.url);
const shellStylesheet = new URL("../app/_platform/platform-shell.css", import.meta.url);
const profileStylesheet = new URL("../app/_platform/profile-settings.css", import.meta.url);
const lawyerStylesheet = new URL("../app/_platform/lawyer-workspace.css", import.meta.url);
const lawyerConsultationsStylesheet = new URL("../app/_platform/consultations-phase7.css", import.meta.url);
const dashboardStylesheet = new URL("../app/_platform/dashboard.css", import.meta.url);
const calendarStylesheet = new URL("../app/_platform/calendar.css", import.meta.url);
const documentBuilderStylesheet = new URL("../app/_document-builder/document-builder.css", import.meta.url);
const accountDocumentsLayout = new URL("../app/[locale]/[accountType]/documents/layout.tsx", import.meta.url);
const businessDocumentsLayout = new URL("../app/[locale]/business/[workspaceId]/documents/layout.tsx", import.meta.url);

test("skip link moves focus to the platform main landmark", async () => {
  const shell = await readFile(shellSource, "utf8");

  assert.match(shell, /className="platform-skip-link" href="#main-content"/);
  assert.match(shell, /<main className="platform-content" id="main-content" tabIndex=\{-1\}>/);
});

test("compact global-search trigger retains a 44px touch target", async () => {
  const css = await readFile(searchStylesheet, "utf8");

  assert.match(css, /\.global-search-trigger\{[^}]*min-height:44px/);
  assert.match(css, /@media\(max-width:1050px\)\{\.global-search-trigger\{min-width:44px!important\}/);
});

test("closed mobile navigation cannot create horizontal page scrolling", async () => {
  const [shell, css] = await Promise.all([
    readFile(shellSource, "utf8"),
    readFile(shellStylesheet, "utf8"),
  ]);

  assert.match(css, /@media\(max-width:800px\)\{\.platform-shell\{display:block;overflow-x:clip\}/);
  assert.match(shell, /if \(event\.key === "Escape"\) \{\s+setOpen\(false\);\s+openButtonRef\.current\?\.focus\(\);/);
  assert.match(shell, /const closeMobileMenu = \(\) => \{\s+setOpen\(false\);\s+window\.requestAnimationFrame\(\(\) => openButtonRef\.current\?\.focus\(\)\);/);
});

test("320px and 360px topbars keep actions reachable without clipping", async () => {
  const [shell, css] = await Promise.all([
    readFile(shellSource, "utf8"),
    readFile(shellStylesheet, "utf8"),
  ]);

  assert.match(shell, /className="platform-language-switcher"/);
  assert.match(shell, /className="platform-sidebar-logout"/);
  assert.match(shell, /className="platform-topbar-logout"/);
  assert.match(css, /\.platform-topbar button,.platform-topbar a,.platform-menu\{min-width:44px;height:44px\}/);
  assert.match(css, /@media\(max-width:420px\)\{\s+\.platform-topbar\{padding-inline:3px\}\s+\.platform-topbar>div:last-child\{gap:4px\}/);
  assert.match(css, /\.platform-topbar \.platform-language-switcher\{width:58px;padding-inline:4px;gap:3px\}/);
  assert.match(css, /@media\(max-width:340px\)\{\.platform-topbar-logout\{display:none!important\}\}/);
  assert.match(css, /@media\(max-width:520px\)\{\.platform-topbar>div:first-of-type\{display:none\}\}/);
  assert.match(css, /@media\(max-width:800px\)\{\s+\.platform-sidebar-logout\{display:flex;/);
});

test("mid-width profile controls shrink inside the platform content column", async () => {
  const css = await readFile(profileStylesheet, "utf8");

  assert.match(css, /\.profile-form\{min-width:0;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(css, /\.profile-form section,\.profile-form label\{min-width:0\}/);
  assert.match(css, /\.profile-form input,\.profile-form select,\.profile-form textarea\{width:100%;max-width:100%;min-width:0\}/);
});

test("lawyer calendar actions retain a 44px touch target", async () => {
  const css = await readFile(lawyerStylesheet, "utf8");

  assert.match(css, /\.lawyer-schedule-section>header>button\{min-height:44px\}/);
});

test("lawyer professional workflows retain the 44px interaction floor", async () => {
  const [workspace, consultations] = await Promise.all([
    readFile(lawyerStylesheet, "utf8"),
    readFile(lawyerConsultationsStylesheet, "utf8"),
  ]);

  assert.match(workspace, /\.lawyer-status-banner a,[\s\S]*?\.lawyer-task-source\{min-height:44px\}/);
  assert.match(workspace, /\.lawyer-time-tool summary\{display:flex;align-items:center\}/);
  assert.match(workspace, /\.lawyer-knowledge-grid article header button\{width:44px;min-height:44px\}/);
  assert.match(consultations, /\.lawyer-offer-form :is\(input,button\),[\s\S]*?\.lawyer-internal-notes button\{min-height:44px\}/);
  assert.match(consultations, /\.lawyer-message-actions button,[\s\S]*?\.lawyer-reply-preview>button\{width:44px;height:44px\}/);
});

test("lawyer trial banner keeps readable theme-aware foregrounds", async () => {
  const css = await readFile(lawyerStylesheet, "utf8");

  assert.match(css, /\.lawyer-trial-banner>svg\{width:24px;color:var\(--brand-gold\)\}/);
  assert.match(css, /\.lawyer-trial-banner strong\{color:var\(--text-primary\)\}/);
  assert.doesNotMatch(css, /\.lawyer-trial-banner strong\{color:var\(--brand-navy\)\}/);
});

test("client dashboard and calendar actions retain 44px touch targets", async () => {
  const [dashboard, calendar] = await Promise.all([
    readFile(dashboardStylesheet, "utf8"),
    readFile(calendarStylesheet, "utf8"),
  ]);

  assert.match(dashboard, /\.dashboard-section-title-row > button \{\s+display: inline-flex;\s+min-height: 44px;/);
  assert.match(dashboard, /\.dashboard-section-title-row > button \{\s+width: 44px;\s+padding: 0;/);
  assert.match(calendar, /\.calendar-tabs button\{min-width:0;min-height:44px/);
  assert.match(calendar, /@media \(max-width:430px\)\{[\s\S]*?\.calendar-range button\{width:44px;height:44px\}/);
});

test("live Client work controls retain the 44px interaction target", async () => {
  const css = await readFile(shellStylesheet, "utf8");

  assert.match(css, /\.scenario-pills button\{min-height:44px\}/);
  assert.match(css, /\.plan-section-title button\{width:44px;height:44px\}/);
  assert.match(css, /\.platform-shell \.history-filter select\{min-height:44px\}/);
  assert.match(css, /\.platform-shell \.profile-workspace>nav a,\.platform-shell \.session-actions button\{min-height:44px\}/);
  assert.match(css, /\.cases-live-list article>a\{display:inline-flex;min-height:44px;align-items:center\}/);
  assert.match(css, /\.platform-shell \.dbt-brand\{min-height:44px\}/);
  assert.match(css, /\.platform-shell \.dbt-notification-list a,\.platform-shell \.dbt-notification-list button\{display:inline-flex;min-height:44px;/);
});

test("canonical document routes load the builder styles and keep folder controls touchable", async () => {
  const [css, accountLayout, businessLayout] = await Promise.all([
    readFile(documentBuilderStylesheet, "utf8"),
    readFile(accountDocumentsLayout, "utf8"),
    readFile(businessDocumentsLayout, "utf8"),
  ]);

  assert.match(css, /\.dbt-folders button \{ min-height: 44px; min-width: 44px;/);
  assert.match(css, /@media \(max-width: 1180px\) \{\s+\.platform-shell \.dbt-docs-layout \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.platform-shell \.dbt-doc-filters \{ grid-template-columns: 1fr 1fr; \}/);
  assert.match(accountLayout, /import "\.\.\/\.\.\/\.\.\/_document-builder\/document-builder\.css";/);
  assert.match(businessLayout, /import "\.\.\/\.\.\/\.\.\/\.\.\/_document-builder\/document-builder\.css";/);
});
