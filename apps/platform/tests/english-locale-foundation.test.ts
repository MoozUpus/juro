import assert from "node:assert/strict";
import test from "node:test";

import {
  accountDeletionInputSchema,
  emailChangeInputSchema,
  passwordLoginInputSchema,
  verifyMfaInputSchema,
} from "../lib/auth/input";
import { consultationBookingSchema } from "../lib/platform/consultation";
import {
  platformIntlLocale,
  type PlatformDateLocale,
} from "../lib/platform/date-time";
import { onboardingInputSchema } from "../lib/platform/onboarding";
import {
  isAuthenticatedPlatformLocaleReady,
  isAuthenticatedPlatformPathReady,
  isLocale,
  platformPath,
} from "../lib/platform/routing";
import { supportTicketSchema } from "../lib/platform/support";
import { createBusinessWorkspaceInputSchema } from "../lib/platform/workspace-creation";
import { workspaceInvitationAcceptInputSchema } from "../lib/platform/workspace-invitation";

const uuid = "11111111-1111-4111-8111-111111111111";

test("English is canonical, persisted and ready across authenticated routes", () => {
  assert.deepEqual(
    ["ru", "uz", "en"].map((locale) => isLocale(locale)),
    [true, true, true],
  );
  assert.equal(isLocale("de"), false);
  assert.equal(isAuthenticatedPlatformLocaleReady("ru"), true);
  assert.equal(isAuthenticatedPlatformLocaleReady("uz"), true);
  assert.equal(isAuthenticatedPlatformLocaleReady("en"), true);
  assert.equal(isAuthenticatedPlatformPathReady("/en/auth/login"), true);
  assert.equal(isAuthenticatedPlatformPathReady("/en/help"), true);
  assert.equal(isAuthenticatedPlatformPathReady("/en/individual/dashboard"), true);
  assert.equal(isAuthenticatedPlatformPathReady("/en/business/workspace_1/cases"), true);
  assert.equal(platformPath("en", "individual", "dashboard"), "/en/individual/dashboard");
});

test("authentication and persistence schemas preserve English and reject unknown locales", () => {
  const localePayloads = [
    [
      passwordLoginInputSchema,
      {
        email: "person@example.test",
        password: "a secure passphrase",
        locale: "en",
        rememberMe: true,
        turnstileToken: "verified",
      },
    ],
    [
      verifyMfaInputSchema,
      { code: "123456", locale: "en", rememberMe: false },
    ],
    [
      accountDeletionInputSchema,
      { action: "request_code", locale: "en" },
    ],
    [
      emailChangeInputSchema,
      { action: "request_codes", newEmail: "next@example.test", locale: "en" },
    ],
    [
      createBusinessWorkspaceInputSchema,
      {
        action: "create",
        requestId: uuid,
        fullName: "Example Company LLC",
        shortName: "Example Company",
        locale: "en",
      },
    ],
    [
      workspaceInvitationAcceptInputSchema,
      { token: "invitation-token", locale: "en" },
    ],
    [
      onboardingInputSchema,
      {
        firstName: "Alice",
        lastName: "Smith",
        phone: "+998901234567",
        locale: "en",
        accountPersona: "individual",
        primaryGoal: "legal_answer",
      },
    ],
    [
      supportTicketSchema,
      {
        category: "technical",
        severity: "normal",
        subject: "Unable to open a document",
        message: "The document does not open after upload.",
        locale: "en",
      },
    ],
    [
      consultationBookingSchema,
      { slotId: uuid, consent: true, locale: "en" },
    ],
  ] as const;

  for (const [schema, payload] of localePayloads) {
    assert.equal(schema.safeParse(payload).success, true);
    assert.equal(
      schema.safeParse({ ...payload, locale: "de" }).success,
      false,
    );
  }
});

test("date formatting keeps existing RU/UZ mappings and uses a real English locale", () => {
  const mappings: Record<PlatformDateLocale, string> = {
    ru: "ru-RU",
    uz: "uz-Latn-UZ",
    en: "en-GB",
  };
  for (const [locale, expected] of Object.entries(mappings) as Array<
    [PlatformDateLocale, string]
  >) {
    assert.equal(platformIntlLocale(locale), expected);
  }
});
