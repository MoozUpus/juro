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

test("Turnstile reserves its final height and switches to compact mobile layout", () => {
  const auth = source("app/_auth/auth.css");
  const guest = source("app/_guest/guest-ai.css");
  const widget = source("app/_auth/TurnstileWidget.tsx");

  for (const styles of [auth, guest]) {
    assert.match(
      styles,
      /\.auth-turnstile-widget\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*65px;/s,
    );
    assert.match(
      styles,
      /@media \(max-width:\s*361px\)\s*\{[\s\S]*?\.auth-turnstile-widget\s*\{[^}]*min-height:\s*140px;[^}]*justify-content:\s*center;/s,
    );
  }
  assert.match(widget, /className="auth-turnstile-widget"/);
  assert.match(widget, /turnstileClientSize\(availableWidth\(\)\)/);
  assert.match(widget, /new ResizeObserver/);
  assert.match(widget, /resizeObserver\?\.disconnect\(\)/);
});

test("compact theme controls retain a 44px touch target", () => {
  const globals = source("app/globals.css");

  assert.match(globals, /\.theme-switcher button\s*\{[^}]*min-width:\s*44px;[^}]*height:\s*44px;/s);
  assert.match(globals, /\.theme-switcher\.is-compact button\s*\{[^}]*width:\s*44px;/s);
});

test("a delayed account theme response cannot override a newer user choice", () => {
  const switcher = source("app/_theme/ThemeSwitcher.tsx");

  assert.match(switcher, /function readThemeInteractionRevision\(\)/);
  assert.match(switcher, /document\.documentElement\.dataset\.themeInteractionRevision/);
  assert.match(switcher, /const startedRevision = readThemeInteractionRevision\(\)/);
  assert.match(switcher, /readThemeInteractionRevision\(\) !== startedRevision/);
  assert.match(switcher, /async function select\(next: ThemeMode\)[\s\S]*?markThemeInteraction\(\)/);
});

test("the shared theme cookie wins over stale per-host storage and account state", () => {
  const switcher = source("app/_theme/ThemeSwitcher.tsx");

  assert.match(switcher, /function readThemeCookie\(\): ThemeMode \| null/);
  assert.match(switcher, /const cookieTheme = readThemeCookie\(\)/);
  assert.match(switcher, /if \(cookieTheme\) \{[\s\S]*?writePreference\(cookieTheme\);[\s\S]*?applyTheme\(cookieTheme\);/);
  assert.match(switcher, /if \(cookieTheme\) \{[\s\S]*?method: "PATCH"[\s\S]*?JSON\.stringify\(\{ theme: cookieTheme \}\)/);
  assert.match(switcher, /async function select\(next: ThemeMode\)\s*\{\s*accountSyncController\.current\?\.abort\(\);/);
});

test("the account theme API scopes shared cookies only to JURO application hosts", () => {
  const route = source("app/api/platform/theme/route.ts");

  assert.match(route, /sharedAuthCookieDomain\(requestUrl\.hostname\)/);
  assert.match(route, /requestUrl\.protocol === "https:"/);
  assert.match(route, /function GET\(request: Request\)/);
  assert.doesNotMatch(route, /SameSite=Lax; Domain=\.juro\.uz; Secure/);
});

test("the account theme API scopes shared cookies only to JURO application hosts", () => {
  const route = source("app/api/platform/theme/route.ts");

  assert.match(route, /sharedAuthCookieDomain\(requestUrl\.hostname\)/);
  assert.match(route, /requestUrl\.protocol === "https:"/);
  assert.match(route, /function GET\(request: Request\)/);
  assert.doesNotMatch(route, /SameSite=Lax; Domain=\.juro\.uz; Secure/);
});
