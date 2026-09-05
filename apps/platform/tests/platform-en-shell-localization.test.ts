import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  comparisonResultText,
  comparisonText,
  dashboardCopy,
  platformApiError,
} from "../content/platform-ui";

const CYRILLIC = /[\u0400-\u04ff]/u;

function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(stringLeaves);
  }
  return [];
}

test("shared authenticated workspace copy has an explicit English branch", () => {
  const dashboard = dashboardCopy("en");

  assert.equal(dashboard.question, "What would you like to resolve today?");
  assert.equal(dashboard.actions.ask.title, "Ask the AI legal assistant");
  assert.equal(comparisonText.en.start, "Start comparison");
  assert.equal(comparisonResultText.en.tabs.risks, "Risk changes");
  assert.notEqual(dashboard.question, dashboardCopy("uz").question);
  assert.equal(
    platformApiError("en", "Makonni almashtirib bo‘lmadi.", "We could not switch workspaces."),
    "We could not switch workspaces.",
  );
  assert.equal(
    platformApiError("uz", "Makonni almashtirib bo‘lmadi.", "Fallback"),
    "Makonni almashtirib bo‘lmadi.",
  );

  const englishLeaves = stringLeaves({
    dashboard,
    comparison: comparisonText.en,
    comparisonResult: comparisonResultText.en,
  });
  assert.ok(englishLeaves.length > 150, "expected the full shared copy surface");
  assert.equal(
    englishLeaves.some((value) => CYRILLIC.test(value)),
    false,
    "English shared copy must not contain a Russian fallback",
  );
});

test("core English shell source does not use the legacy RU-or-UZ selector", async () => {
  const files = [
    "PlatformShell.tsx",
    "GlobalSearch.tsx",
    "ModuleContent.tsx",
    "CalendarClient.tsx",
    "DashboardClient.tsx",
    "ActionPlanClient.tsx",
    "ArchiveClient.tsx",
    "CaseCreateClient.tsx",
    "CasesClient.tsx",
    "CaseWorkspaceClient.tsx",
    "HistoryClient.tsx",
    "TeamClient.tsx",
    "ConsultationsClient.tsx",
    "LegalAnswerView.tsx",
    "SafeMarkdown.tsx",
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../app/_platform/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /const\s+ru\s*=\s*locale\s*===\s*["']ru["']/u,
      `${file} must select all three locales explicitly`,
    );
    assert.doesNotMatch(
      source,
      /Record<\s*["']ru["']\s*\|\s*["']uz["']/u,
      `${file} must not retain a two-locale copy contract`,
    );
  }
});

test("authenticated route adapters keep English fail-closed until the full UI is ready", async () => {
  const [accountRoute, workspaceLayout] = await Promise.all([
    readFile(new URL("../app/_platform/ModuleRoutePage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/WorkspaceShellLayout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(accountRoute, /isAuthenticatedPlatformLocaleReady\(locale\)/u);
  assert.match(workspaceLayout, /isAuthenticatedPlatformLocaleReady\(locale\)/u);
});
