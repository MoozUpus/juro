import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  accountModuleRedirect,
  authenticatedAuthRedirect,
  lawyerHubViewForPathname,
  lawyerLandingDestination,
  lawyerPublicOrigin,
  lawyerRoleMismatchHome,
  operationalLawyer,
  type LawyerEntryProfile,
} from "../lib/platform/lawyer-entry-routing";

const approvedLawyer: LawyerEntryProfile = {
  locale: "ru",
  accountType: "lawyer",
  onboardingCompleted: true,
  lawyerProfileStatus: "public_approved",
  lawyerMarketplaceStatus: "public_approved",
};

const pendingLawyer: LawyerEntryProfile = {
  ...approvedLawyer,
  lawyerProfileStatus: "pending",
  lawyerMarketplaceStatus: "pending_review",
};

const client: LawyerEntryProfile = {
  locale: "ru",
  accountType: "individual",
  onboardingCompleted: true,
  lawyerProfileStatus: null,
  lawyerMarketplaceStatus: null,
};

test("the legacy app lawyer entry opens the marketplace instead of consultations", () => {
  const route = readFileSync(new URL("../app/lawyers/route.ts", import.meta.url), "utf8");
  assert.match(route, /platformEntryRoute\("lawyers"\)/);
  assert.doesNotMatch(route, /platformEntryRoute\("consultations"\)/);
});

test("lawyer public origin is selected only for known production and staging hosts", () => {
  assert.equal(lawyerPublicOrigin("app.juro.uz"), "https://lawyer.juro.uz");
  assert.equal(lawyerPublicOrigin("lawyer.juro.uz:443"), "https://lawyer.juro.uz");
  assert.equal(lawyerPublicOrigin("app.staging.juro.uz"), "https://lawyer.staging.juro.uz");
  assert.equal(lawyerPublicOrigin("attacker.invalid"), null);
});

test("authenticated lawyer host auth resolves by actual role and lifecycle", () => {
  assert.equal(authenticatedAuthRedirect({ mode: "login", reauth: false, lawyerHost: true, profile: client }), null);
  assert.equal(authenticatedAuthRedirect({ mode: "register", reauth: false, lawyerHost: true, profile: client }), null);
  assert.equal(authenticatedAuthRedirect({ mode: "login", reauth: true, lawyerHost: true, profile: approvedLawyer }), null);
  assert.equal(authenticatedAuthRedirect({ mode: "login", reauth: false, lawyerHost: true, profile: approvedLawyer }), "/ru/dashboard");
  assert.equal(authenticatedAuthRedirect({ mode: "register", reauth: false, lawyerHost: true, profile: pendingLawyer }), "/ru/application");
});

test("lawyer landing routes onboarding, application, and approved workspace separately", () => {
  assert.equal(operationalLawyer(approvedLawyer), true);
  assert.equal(operationalLawyer(pendingLawyer), false);
  assert.equal(lawyerLandingDestination({ ...pendingLawyer, onboardingCompleted: false }, true, "lawyer.juro.uz"), "/ru/onboarding");
  assert.equal(lawyerLandingDestination(pendingLawyer, true, "lawyer.juro.uz"), "/ru/application");
  assert.equal(lawyerLandingDestination(approvedLawyer, false, "app.juro.uz"), "https://lawyer.juro.uz/ru/dashboard");
});

test("clean lawyer hub paths preserve their selected view after hydration", () => {
  const views = {
    requests: "requests",
    consultations: "schedule",
    clients: "clients",
    matters: "matters",
    messages: "messages",
    documents: "documents",
    tasks: "tasks",
  } as const;
  for (const locale of ["ru", "uz"] as const) {
    for (const [path, view] of Object.entries(views)) {
      assert.equal(lawyerHubViewForPathname(`/${locale}/${path}`), view);
    }
  }
  assert.equal(lawyerHubViewForPathname("/ru/lawyer/consultations"), null);
  assert.equal(lawyerHubViewForPathname("/ru/not-a-lawyer-view"), null);
});

test("account module guard rejects URL role spoofing on the lawyer host", () => {
  const destination = accountModuleRedirect({
    requestedLocale: "ru",
    requestedAccountType: "lawyer",
    module: "dashboard",
    lawyerHost: true,
    requestHost: "lawyer.juro.uz",
    profile: client,
  });
  assert.equal(destination, "/ru/auth/login?accountType=lawyer&reauth=1&returnTo=%2Fru%2Fdashboard");
});

test("a signed-in client gets an explicit route back from lawyer reauthentication", () => {
  assert.equal(lawyerRoleMismatchHome({
    locale: "ru",
    requestedAccountType: "lawyer",
    reauth: true,
    lawyerHost: true,
    requestHost: "lawyer.juro.uz",
    profile: client,
  }), "https://app.juro.uz/ru");
  assert.equal(lawyerRoleMismatchHome({
    locale: "uz",
    requestedAccountType: "lawyer",
    reauth: true,
    lawyerHost: true,
    requestHost: "lawyer.staging.juro.uz",
    profile: client,
  }), "https://app.staging.juro.uz/uz");
  for (const input of [
    { locale: "ru" as const, requestedAccountType: "individual" as const, reauth: true, lawyerHost: true, requestHost: "lawyer.juro.uz", profile: client },
    { locale: "ru" as const, requestedAccountType: "lawyer" as const, reauth: false, lawyerHost: true, requestHost: "lawyer.juro.uz", profile: client },
    { locale: "ru" as const, requestedAccountType: "lawyer" as const, reauth: true, lawyerHost: false, requestHost: "app.juro.uz", profile: client },
    { locale: "ru" as const, requestedAccountType: "lawyer" as const, reauth: true, lawyerHost: true, requestHost: "lawyer.juro.uz", profile: approvedLawyer },
  ]) {
    assert.equal(lawyerRoleMismatchHome(input), null);
  }
});

test("the lawyer reauthentication surface explains the client-role boundary", () => {
  const authPage = readFileSync(new URL("../app/_auth/AuthPage.tsx", import.meta.url), "utf8");
  const authForm = readFileSync(new URL("../app/_auth/AuthForm.tsx", import.meta.url), "utf8");
  const authCss = readFileSync(new URL("../app/_auth/auth.css", import.meta.url), "utf8");
  assert.match(authPage, /lawyerRoleMismatchHome/);
  assert.match(authPage, /accountBoundaryHomeHref=\{accountBoundaryHomeHref\}/);
  assert.match(authForm, /Открыт клиентский профиль/);
  assert.match(authForm, /Вернуться в клиентский кабинет/);
  assert.match(authForm, /Mijoz kabinetiga qaytish/);
  assert.match(authCss, /\.auth-role-boundary a\s*\{[\s\S]*?min-height:\s*44px/);
});

test("pending lawyers stay in application surfaces until approval", () => {
  for (const requestedModule of ["dashboard", "consultations", "calendar"] as const) {
    assert.equal(accountModuleRedirect({
      requestedLocale: "ru",
      requestedAccountType: "lawyer",
      module: requestedModule,
      lawyerHost: true,
      requestHost: "lawyer.juro.uz",
      profile: pendingLawyer,
    }), "/ru/application");
  }
  for (const requestedModule of ["profile", "settings", "security"] as const) {
    assert.equal(accountModuleRedirect({
      requestedLocale: "ru",
      requestedAccountType: "lawyer",
      module: requestedModule,
      lawyerHost: true,
      requestHost: "lawyer.juro.uz",
      profile: pendingLawyer,
    }), null);
  }
});

test("approved lawyers are canonicalized from the client host", () => {
  assert.equal(accountModuleRedirect({
    requestedLocale: "ru",
    requestedAccountType: "lawyer",
    module: "dashboard",
    lawyerHost: false,
    requestHost: "app.juro.uz",
    profile: approvedLawyer,
  }), "https://lawyer.juro.uz/ru/dashboard");
});
