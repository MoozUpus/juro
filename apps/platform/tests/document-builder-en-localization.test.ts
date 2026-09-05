import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  builderWorkspaceCopy,
  documentBuilderMetadataCopy,
  localizedDocumentStatus,
  workspaceCopy,
} from "../lib/platform/builder-workspace-copy";
import {
  builderError,
  builderIntlLocale,
  builderText,
  builderUiLocale,
  defaultBuilderDocumentLanguage,
} from "../app/_document-builder/builder-localization";
import { BuilderQuestionnaire } from "../app/_document-builder/_components/BuilderQuestionnaire";
import { createDefaultAnswers } from "../lib/document-builder/defaults";

const root = new URL("../", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

test("document workspace exposes explicit professional English copy", () => {
  assert.equal(workspaceCopy("en").documents.title, "My documents");
  assert.equal(workspaceCopy("en").contacts.title, "Saved contacts");
  assert.equal(workspaceCopy("en").notifications.title, "Notifications");
  assert.equal(documentBuilderMetadataCopy("en").title, "Create a document");
  assert.equal(localizedDocumentStatus("Черновик", "en"), "Draft");
  assert.equal(localizedDocumentStatus("Согласован", "en"), "Approved");

  const englishWorkspace = JSON.stringify(builderWorkspaceCopy.en);
  assert.doesNotMatch(englishWorkspace, /[А-Яа-яЁёЎўҚқҒғҲҳ]/);
});

test("English UI locale remains separate from RU and UZ document languages", () => {
  assert.equal(builderUiLocale("en"), "en");
  assert.equal(builderUiLocale(null), "ru");
  assert.equal(defaultBuilderDocumentLanguage("en"), "ru");
  assert.equal(defaultBuilderDocumentLanguage("uz"), "uz");
  assert.equal(builderIntlLocale("en"), "en-GB");
  assert.equal(builderText("en", { ru: "Русский", uz: "O‘zbekcha", en: "English" }), "English");
  assert.equal(builderError("en", new Error("Не удалось выполнить действие"), "The action could not be completed."), "The action could not be completed.");
});

test("legacy receipt questionnaire renders English chrome across every section", () => {
  const answers = createDefaultAnswers("ru");
  for (let step = 0; step < 5; step += 1) {
    const markup = renderToStaticMarkup(createElement(BuilderQuestionnaire, {
      answers,
      contacts: [],
      locale: "en",
      onChange: () => undefined,
      onSaveProfile: async () => undefined,
      onUpdateContact: async () => undefined,
      profile: null,
      step,
    }));
    assert.match(markup, /dbt-step-content/);
    assert.doesNotMatch(markup, /[А-Яа-яЁёЎўҚқҒғҲҳ]/, `step ${step + 1} contains legacy RU or UZ interface copy`);
  }
});

test("authenticated builder surfaces do not route English through a binary RU or UZ UI fallback", async () => {
  const files = await Promise.all([
    source("app/_document-builder/DocumentBuilderClient.tsx"),
    source("app/_document-builder/_components/DocumentLibraryClient.tsx"),
    source("app/_document-builder/_components/ConfigurableDocumentBuilder.tsx"),
    source("app/_document-builder/documents/DocumentsClient.tsx"),
    source("app/_document-builder/notifications/NotificationsClient.tsx"),
    source("app/_document-builder/contacts/ContactsClient.tsx"),
  ]);
  const combined = files.join("\n");

  assert.doesNotMatch(combined, /paths\.locale\s*===\s*["']uz["']\s*\?/);
  assert.match(combined, /The interface remains in English/);
  assert.match(combined, /documentLocale=\{answers\.language/);
  assert.match(combined, /uiLocale=\{uiLocale\}/);
  assert.match(combined, /locale=\{uiLocale\}/);
  assert.match(combined, /builderError\(uiLocale/);
});

test("localized document-analysis and builder metadata boundaries accept English", async () => {
  const routes = await Promise.all([
    source("app/[locale]/[accountType]/document-analysis/route.ts"),
    source("app/[locale]/business/document-analysis/route.ts"),
    source("app/[locale]/business/[workspaceId]/document-analysis/route.ts"),
  ]);
  for (const route of routes) {
    assert.match(route, /PlatformLocale/);
    assert.doesNotMatch(route, /locale:\s*["']ru["']\s*\|\s*["']uz["']/);
  }

  const pages = await Promise.all([
    source("app/[locale]/[accountType]/document-builder/page.tsx"),
    source("app/[locale]/business/[workspaceId]/document-builder/page.tsx"),
  ]);
  for (const page of pages) {
    assert.match(page, /locale === "en" \? "en"/);
  }
});
