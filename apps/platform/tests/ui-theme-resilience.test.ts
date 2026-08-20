import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("authentication entrypoints use full document navigation", () => {
  const authForm = source("app/_auth/AuthForm.tsx");

  assert.ok(authForm.includes('<a className="auth-submit" href={`/api/auth/dev-login'));
  assert.ok(authForm.includes('<a className="auth-submit" href={`/signin-with-chatgpt'));
  assert.ok(authForm.includes('<a className="auth-siwc" href={`/api/auth/dev-login'));
  assert.ok(authForm.includes('<a className="auth-siwc" href={`/signin-with-chatgpt'));
  assert.doesNotMatch(authForm, /<Link[^>]+(?:dev-login|signin-with-chatgpt)/s);
});

test("authentication surfaces inherit semantic light and dark theme tokens", () => {
  const globals = source("app/globals.css");
  const auth = source("app/_auth/auth.css");

  assert.match(globals, /html\[data-theme=dark\]/);
  assert.match(globals, /--background:var\(--surface-canvas\)/);
  assert.match(globals, /--border-default:var\(--border-subtle\)/);
  assert.match(auth, /\.auth-page\s*\{[\s\S]*?background:\s*var\(--background\)/);
  assert.match(auth, /\.auth-card\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?background:\s*var\(--surface-raised\)/);
  assert.match(auth, /\.auth-brand\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(auth, /\.auth-brand span\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(auth, /\.auth-unavailable\s*\{[^}]*padding-right:\s*0/s);
});

test("a delayed account theme response cannot override a newer user choice", () => {
  const switcher = source("app/_theme/ThemeSwitcher.tsx");

  assert.match(switcher, /function readThemeInteractionRevision\(\)/);
  assert.match(switcher, /document\.documentElement\.dataset\.themeInteractionRevision/);
  assert.match(switcher, /const startedRevision = readThemeInteractionRevision\(\)/);
  assert.match(switcher, /readThemeInteractionRevision\(\) !== startedRevision/);
  assert.match(switcher, /async function select\(next: ThemeMode\)\s*\{\s*markThemeInteraction\(\)/);
});
