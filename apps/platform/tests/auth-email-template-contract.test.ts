import assert from "node:assert/strict";
import test from "node:test";
import {
  renderJuroAuthEmail,
  type AuthEmailLocale,
  type AuthEmailPurpose,
} from "../lib/auth/transactional-email";

const locales = ["ru", "uz", "en"] as const satisfies readonly AuthEmailLocale[];
const purposes = [
  "registration",
  "password_reset",
  "email_change_current",
  "email_change",
  "email_changed",
  "password_changed",
  "new_device",
  "new_region",
  "account_deletion",
  "critical_action",
  "login_code",
] as const satisfies readonly AuthEmailPurpose[];
const codePurposes = new Set<AuthEmailPurpose>([
  "registration",
  "password_reset",
  "email_change_current",
  "email_change",
  "account_deletion",
  "critical_action",
  "login_code",
]);

const localeContract: Record<AuthEmailLocale, {
  security: RegExp;
  alert: RegExp;
  footer: RegExp;
  expiry: RegExp;
}> = {
  ru: {
    security: /(?:Никому не сообщайте|Не передавайте)/u,
    alert: /Если это (?:сделали|были) не вы/u,
    footer: /Ташкент, Республика Узбекистан/u,
    expiry: /10 минут/u,
  },
  uz: {
    security: /(?:Kod(?:ni|larni) hech kimga bermang|Kodni boshqa shaxslarga bermang)/u,
    alert: /Agar (?:buni siz qilmagan|bu siz bo‘lmasangiz)/u,
    footer: /Toshkent, O‘zbekiston Respublikasi/u,
    expiry: /10 daqiqa/u,
  },
  en: {
    security: /(?:Never share|Do not share)/u,
    alert: /If this was not you/u,
    footer: /Tashkent, Republic of Uzbekistan/u,
    expiry: /10 minutes/u,
  },
};

test("every auth email variant keeps the JURO email-safe HTML and text contract", () => {
  for (const locale of locales) {
    for (const purpose of purposes) {
      const withCode = codePurposes.has(purpose);
      const message = renderJuroAuthEmail({
        locale,
        purpose,
        code: withCode ? "482731" : undefined,
        details: purpose === "new_device"
          ? [{ label: "Device", value: "Chrome · Windows" }]
          : undefined,
      });

      assert.match(message.subject, /JURO/u, `${locale}/${purpose} subject`);
      assert.match(message.html, /^<!doctype html>/u, `${locale}/${purpose} doctype`);
      assert.match(message.html, new RegExp(`<html lang="${locale}"`, "u"));
      assert.match(message.html, /<meta name="viewport"/u);
      assert.match(message.html, /role="presentation"/u);
      assert.match(message.html, /width="600"/u);
      assert.match(message.html, /mailto:admin@juro\.uz/u);
      assert.match(message.html, /#062844/iu);
      assert.match(message.html, /#f8f6f2/iu);
      assert.doesNotMatch(message.html, /<(?:script|iframe|form|video)\b/iu);
      assert.doesNotMatch(message.html, /\b(?:src|href)="https?:\/\//iu);
      assert.doesNotMatch(message.html, /(?:undefined|null)/u);
      assert.ok(Buffer.byteLength(message.html, "utf8") < 50_000);

      assert.equal(message.text.includes("<table"), false);
      assert.equal(message.text.includes("\r"), false);
      assert.match(message.text, /admin@juro\.uz/u);
      assert.match(message.text, localeContract[locale].footer);
      assert.match(
        message.text,
        withCode
          ? localeContract[locale].security
          : localeContract[locale].alert,
      );
      assert.doesNotMatch(message.text, /(?:undefined|null)/u);

      if (withCode) {
        assert.match(message.html, /482731/u);
        assert.match(message.text, /482731/u);
        assert.match(message.text, localeContract[locale].expiry);
      } else {
        assert.doesNotMatch(message.html, /482731/u);
        assert.doesNotMatch(message.text, /482731/u);
      }
    }
  }
});

test("English and Uzbek auth emails do not leak Cyrillic copy", () => {
  for (const locale of ["uz", "en"] as const) {
    for (const purpose of purposes) {
      const message = renderJuroAuthEmail({
        locale,
        purpose,
        code: codePurposes.has(purpose) ? "482731" : undefined,
      });
      assert.doesNotMatch(message.subject, /[А-Яа-яЁё]/u);
      assert.doesNotMatch(message.text, /[А-Яа-яЁё]/u);
    }
  }
});
