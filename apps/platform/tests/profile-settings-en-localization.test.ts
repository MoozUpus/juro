import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { POST as confirmMfa } from "../app/api/platform/security/mfa/confirm/route";
import { POST as regenerateBackupCodes } from "../app/api/platform/security/mfa/backup-codes/route";
import { DELETE as disableMfa } from "../app/api/platform/security/mfa/route";
import { POST as changeEmail } from "../app/api/platform/security/email-change/route";
import { POST as requestDeletion } from "../app/api/platform/privacy/deletion-request/route";
import type { PlatformLocale } from "../lib/platform/routing";

const profileClientUrl = new URL(
  "../app/_platform/ProfileSettingsClient.tsx",
  import.meta.url,
);

function malformedRequest(path: string, locale: PlatformLocale): Request {
  return new Request(`https://app.juro.uz${path}?lang=${locale}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://app.juro.uz",
      "sec-fetch-site": "same-origin",
      "x-juro-csrf": "1",
      "x-juro-locale": locale,
    },
    body: "{",
  });
}

test("profile settings use an explicit RU, UZ and EN copy contract", async () => {
  const source = await readFile(profileClientUrl, "utf8");

  assert.match(
    source,
    /const PROFILE_COPY: Record<PlatformLocale, Record<ProfileCopyKey, string>>/,
  );
  assert.match(source, /en: \{[\s\S]*profileTitle: "Profile"/);
  assert.match(source, /sessionsTitle: "Local JURO sessions"/);
  assert.match(source, /privacyTitle: "Privacy & data"/);
  assert.match(source, /<option value="en">English<\/option>/);
  assert.match(source, /formatPlatformDateTime\([^)]*, locale\)/);
  assert.match(source, /isLocale\(profileBody\.profile\.locale\)/);
  assert.match(source, /x-juro-locale": locale/g);
  assert.match(source, /\?lang=\$\{locale\}/g);
  assert.doesNotMatch(source, /const ru = locale === "ru"/);
  assert.doesNotMatch(source, /\bru\s*\?/);
  assert.doesNotMatch(source, /profile\.locale === "uz" \? "uz" : "ru"/);
  assert.doesNotMatch(source, /function formatDateTime\([^)]*ru/);
});

test("profile security mutations return locale-specific malformed-request errors", async () => {
  const handlers = [
    ["/api/platform/security/mfa/confirm", confirmMfa],
    ["/api/platform/security/mfa/backup-codes", regenerateBackupCodes],
    ["/api/platform/security/mfa", disableMfa],
    ["/api/platform/security/email-change", changeEmail],
    ["/api/platform/privacy/deletion-request", requestDeletion],
  ] as const;
  const messages: Record<PlatformLocale, string> = {
    ru: "Проверьте формат запроса.",
    uz: "So‘rov formatini tekshiring.",
    en: "Check the request format.",
  };

  for (const locale of ["ru", "uz", "en"] as const) {
    for (const [path, handler] of handlers) {
      const response = await handler(malformedRequest(path, locale));
      assert.equal(response.status, 400, `${path}:${locale}`);
      assert.deepEqual(await response.json(), {
        code: "INVALID_JSON",
        error: messages[locale],
      }, `${path}:${locale}`);
    }
  }
});

test("profile API boundaries contain explicit English errors without mixed-language fallbacks", async () => {
  const paths = [
    "../app/api/platform/profile/route.ts",
    "../app/api/platform/workspaces/route.ts",
    "../app/api/platform/security/sessions/route.ts",
    "../app/api/platform/security/sessions/[sessionId]/route.ts",
    "../app/api/platform/privacy/export/route.ts",
  ];
  const sources = await Promise.all(
    paths.map(path => readFile(new URL(path, import.meta.url), "utf8")),
  );
  const source = sources.join("\n");

  assert.match(source, /Enter your name\./);
  assert.match(source, /Check the workspace details\./);
  assert.match(source, /Unknown session termination scope\./);
  assert.match(source, /The session identifier is invalid\./);
  assert.match(source, /Encrypted memory is temporarily unavailable/);
  assert.doesNotMatch(source, /Проверьте данные пространства\. \/ Makon/);
  assert.doesNotMatch(source, /недоступна;[^\n]+ \/ Shifrlangan/);
});
