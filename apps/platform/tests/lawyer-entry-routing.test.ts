import assert from "node:assert/strict";
import test from "node:test";

import {
  accountModuleRedirect,
  authenticatedAuthRedirect,
  lawyerLandingDestination,
  lawyerPublicOrigin,
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
