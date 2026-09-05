import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("auth handoff and redirects fail closed to JURO destinations", () => {
  const form = source("app/_auth/AuthForm.tsx");

  assert.match(form, /https:\/\/app\.juro\.uz\/api\/auth\/session-handoff/);
  assert.match(form, /https:\/\/lawyer\.juro\.uz\/api\/auth\/session-handoff/);
  assert.match(form, /\^\[A-Za-z0-9_-\]\{43\}\$/);
  assert.match(form, /Number\.isFinite\(expiresAt\)/);
  assert.match(form, /action\.searchParams\.get\("lang"\)/u);
  assert.match(form, /action\.searchParams\.size === 1/u);
  assert.match(form, /AUTH_HANDOFF_LOCALES\.has\(locale as Locale\)/u);
  assert.match(form, /AUTH_HANDOFF_ACTIONS\.has\(canonicalAction\)/u);
  assert.doesNotMatch(form, /&& !action\.search/u);
  assert.match(form, /if \(!validHandoff\(data\.handoff\)\)/);
  assert.match(form, /safeAuthenticationDestination\(data\.redirectTo\)/);
  assert.doesNotMatch(form, /window\.location\.replace\(data\.redirectTo\)/);
});

test("password and verification controls expose password-manager contracts", () => {
  const form = source("app/_auth/AuthForm.tsx");
  const styles = source("app/_auth/auth.css");

  assert.match(form, /name="email"[\s\S]{0,600}?autoComplete="username"/);
  assert.match(form, /name="password"[\s\S]{0,500}?autoComplete="current-password"/);
  assert.match(form, /name="password"[\s\S]{0,500}?autoComplete="new-password"/);
  assert.match(form, /name="password-confirmation"/);
  assert.match(form, /name="username"[^>]*readOnly autoComplete="username"/);
  assert.match(form, /name="one-time-code"[\s\S]{0,500}?autoComplete="one-time-code"/);
  assert.match(styles, /\.auth-password-manager-username\s*\{[^}]*clip-path:\s*inset\(50%\)/s);
  assert.match(form, /ru: "Показать пароль"[\s\S]*uz: "Parolni ko‘rsatish"[\s\S]*en: "Show password"/);
  assert.match(form, /ru: "Включён Caps Lock"[\s\S]*uz: "Caps Lock yoqilgan"[\s\S]*en: "Caps Lock is on"/);
});

test("registration, recovery, resend, and MFA retain distinct guarded actions", () => {
  const form = source("app/_auth/AuthForm.tsx");
  const passwordRoute = source("app/api/auth/password-login/route.ts");
  const otpRoute = source("app/api/auth/request-otp/route.ts");

  for (const action of [
    "auth_password_login",
    "auth_registration",
    "auth_password_reset",
    "auth_registration_resend",
    "auth_password_reset_resend",
  ]) {
    assert.match(form, new RegExp(`action="${action}"`));
  }
  assert.match(passwordRoute, /expectedActions:\s*\[authTurnstileActions\.passwordLogin\]/);
  assert.match(otpRoute, /authTurnstileActions\.registrationResend/);
  assert.match(otpRoute, /authTurnstileActions\.passwordResetResend/);
  assert.match(form, /setChallengeId\(data\.challengeId\)/);
  assert.match(form, /setCooldown\(data\.resendAfterSeconds \?\? 60\)/);
  assert.match(form, /disabled=\{pending \|\| cooldown > 0 \|\| !enabled\}/);
  assert.match(form, /step === "mfa"/);
  assert.match(form, /name="mfa-code"[\s\S]{0,600}?autoComplete="one-time-code"/);
});

test("auth feedback is localized and does not make the whole card live", () => {
  const form = source("app/_auth/AuthForm.tsx");

  assert.doesNotMatch(form, /className="auth-card" aria-live/);
  assert.match(form, /logout === "server-unconfirmed"/);
  assert.match(form, /\["confirmed", "success", "1"\]/);
  assert.match(form, /\["expired", "session-expired"\]/);
  assert.match(form, /\["invalid", "expired", "unavailable"\].*handoff/s);
  assert.match(form, /role="alert"/);
  assert.match(form, /className="auth-notice"[^>]*role="status"/);
  assert.match(form, /ref=\{successPanel\}[^>]*role="status" tabIndex=\{-1\}/);
});

test("English auth routing and supporting controls are complete", () => {
  const authPage = source("app/_auth/AuthPage.tsx");
  const login = source("app/login/page.tsx");
  const register = source("app/register/page.tsx");
  const turnstile = source("app/_auth/TurnstileWidget.tsx");
  const theme = source("app/_theme/ThemeSwitcher.tsx");
  const form = source("app/_auth/AuthForm.tsx");
  const localizedLogin = source("app/[locale]/auth/login/page.tsx");
  const localizedRegister = source("app/[locale]/auth/register/page.tsx");

  assert.match(authPage, /value === "ru" \|\| value === "uz" \|\| value === "en"/);
  assert.match(login, /lang === "en" \? "en"/);
  assert.match(register, /lang === "en" \? "en"/);
  assert.match(turnstile, /locale: "ru" \| "uz" \| "en"/);
  assert.match(theme, /\["light", Sun, "Светлая", "Yorug‘", "Light"\]/);
  assert.match(theme, /Appearance theme/);
  assert.equal(form.match(/"x-juro-locale": locale/g)?.length, 5);
  assert.match(localizedLogin, /generateMetadata[\s\S]*authPageMetadata\(locale, "login"\)/u);
  assert.match(localizedRegister, /generateMetadata[\s\S]*authPageMetadata\(locale, "register"\)/u);
});

test("Turnstile follows explicit theme changes without retaining a stale token", () => {
  const turnstile = source("app/_auth/TurnstileWidget.tsx");

  assert.match(turnstile, /window\.addEventListener\("juro-theme-change", updateTheme\)/);
  assert.match(turnstile, /theme,/);
  assert.match(turnstile, /callback\.current\(""\);[\s\S]*turnstileWindow\.turnstile\.render/);
  assert.match(turnstile, /\[action, attempt, locale, siteKey, theme\]/);
});

test("auth layout protects 320px width, touch targets, and reduced motion", () => {
  const styles = source("app/_auth/auth.css");

  assert.match(styles, /@media \(max-width: 340px\)[\s\S]*?\.auth-card\s*\{[^}]*width:\s*calc\(100% - 12px\);[^}]*padding-inline:\s*12px;/);
  assert.match(styles, /\.auth-card input\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%/s);
  assert.match(styles, /\.auth-language a\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
  assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation-duration:\s*\.001ms !important;/);
});
