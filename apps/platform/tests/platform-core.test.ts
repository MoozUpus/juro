import assert from "node:assert/strict";
import test from "node:test";
import { glob, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { entitlementsForSubscription } from "../lib/billing/entitlements";
import { billingPlanSelectionSchema } from "../lib/billing/input";
import { consultationBookingSchema } from "../lib/platform/consultation";
import { conflictCheckDecisionSchema, lawyerAccessGrantSchema, lawyerRequestSchema } from "../lib/platform/lawyer-request";
import { normalizeEmail, randomOtp, sha256 } from "../lib/auth/crypto";
import { pricingConfig } from "../config/pricing";
import { appLegalContent } from "../content/app-legal";
import { canEditWorkspaceContent, canManageTeam, isWorkspaceRole } from "../lib/platform/role-policy";
import { isAccountType, isLocale, isPlatformModule, isWorkspaceId, platformBasePath, platformPath, workspaceForAccountRoute } from "../lib/platform/routing";
import { actionPlanStepPatchSchema } from "../lib/platform/action-plan";
import { builderNavigationPaths } from "../lib/platform/builder-paths";
import { documentBuilderMetadataCopy, localizedDocumentStatus, workspaceCopy } from "../lib/platform/builder-workspace-copy";
import { isCinematicPrototypeEnvironment } from "../lib/platform/cinematic-prototype";

test("cinematic prototype is fail-closed outside staging", async () => {
  assert.equal(isCinematicPrototypeEnvironment("staging"), true);
  for (const environment of [undefined, "development", "production", "preview"]) {
    assert.equal(isCinematicPrototypeEnvironment(environment), false);
  }
  const [personalRoute, businessRoute, entryRoute, surface, styles] = await Promise.all([
    readFile(new URL("../app/[locale]/[accountType]/prototypes/platform/cinematic/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/[locale]/business/[workspaceId]/prototypes/platform/cinematic/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/prototypes/platform/cinematic/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/CinematicPrototypeSurface.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/cinematic-prototype.css", import.meta.url), "utf8"),
  ]);
  for (const route of [personalRoute, businessRoute, entryRoute]) {
    assert.match(route, /isCinematicPrototypeEnvironment\(runtimeEnv\(\)\.APP_ENV\)/);
    assert.match(route, /notFound\(\)/);
    assert.match(route, /index: false, follow: false, nocache: true/);
  }
  for (const route of [personalRoute, businessRoute]) assert.match(route, /requireChatGPTUser\(returnTo\)/);
  assert.match(surface, /DashboardClient/);
  assert.match(surface, /jurobek-avatar\.webp/);
  assert.match(surface, /MicOff/);
  assert.doesNotMatch(surface, /Canvas|useFrame|onPointerMove|requestAnimationFrame/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(styles, /prefers-reduced-transparency:reduce/);
  assert.match(styles, /prefers-contrast:more/);
  assert.match(styles, /forced-colors:active/);
  assert.doesNotMatch(styles, /transition:\s*all|animation:[^;}]*infinite|width:100vw/i);
});


test("builder navigation preserves canonical locale and account context", () => {
  const caseId = "11111111-1111-4111-8111-111111111111";
  const stepId = "22222222-2222-4222-8222-222222222222";
  const ru = builderNavigationPaths(
    "/ru/individual/document-builder/debt?caseId=discarded",
    { caseId, planStepId: stepId },
  );
  assert.equal(ru.locale, "ru");
  assert.equal(ru.builder, `/ru/individual/document-builder?caseId=${caseId}&stepId=${stepId}`);
  assert.equal(ru.documents, "/ru/individual/documents");
  assert.equal(ru.template("debt", "0602001"), `/ru/individual/document-builder/debt/0602001?caseId=${caseId}&stepId=${stepId}`);
  assert.equal(ru.document("doc / 1"), "/ru/individual/documents/doc%20%2F%201");
  assert.equal(ru.switchLocale("uz"), `/uz/individual/document-builder/debt?caseId=${caseId}&stepId=${stepId}`);

  const uz = builderNavigationPaths("/uz/business/document-builder/");
  assert.equal(uz.contacts, "/uz/business/contacts");
  assert.equal(uz.notifications, "/uz/business/notifications");

  const business = builderNavigationPaths("/ru/business/ws_business_1/document-builder/contracts");
  assert.equal(business.builder, "/ru/business/ws_business_1/document-builder");
  assert.equal(business.documents, "/ru/business/ws_business_1/documents");
  assert.equal(business.switchLocale("uz"), "/uz/business/ws_business_1/document-builder/contracts");

  const legacy = builderNavigationPaths("/document-builder/library");
  assert.equal(legacy.locale, null);
  assert.equal(legacy.library, "/document-builder/library");
  assert.equal(legacy.document("doc-1"), "/document-builder/documents/doc-1");

  const unsafe = builderNavigationPaths("/ru/individual/document-builder", {
    caseId: "not-a-uuid",
    planStepId: stepId,
  });
  assert.equal(unsafe.builder, "/ru/individual/document-builder");
  assert.equal(unsafe.template("debt", "0602001"), "/ru/individual/document-builder/debt/0602001");
});
test("action plan step updates accept only bounded calendar data", () => {
  assert.deepEqual(
    actionPlanStepPatchSchema.parse({
      status: "in_progress",
      revision: 1,
      dueAt: "2026-08-31",
    }),
    { status: "in_progress", revision: 1, dueAt: "2026-08-31" },
  );
  assert.equal(actionPlanStepPatchSchema.safeParse({
    status: "completed",
    revision: 2,
    dueAt: null,
  }).success, true);
  for (const dueAt of ["2026-02-30", "2026-8-01", "tomorrow", "2026-08-01T00:00:00Z"]) {
    assert.equal(actionPlanStepPatchSchema.safeParse({
      status: "not_started",
      revision: 1,
      dueAt,
    }).success, false);
  }
  assert.equal(actionPlanStepPatchSchema.safeParse({ status: "unknown", revision: 1, dueAt: null }).success, false);
  assert.equal(actionPlanStepPatchSchema.safeParse({ status: "completed", revision: 0, dueAt: null }).success, false);
  assert.equal(actionPlanStepPatchSchema.safeParse({ status: "completed", revision: 1, dueAt: null, userId: "other" }).success, false);

});
test("workspace entitlements fail closed without current paid evidence", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");
  assert.deepEqual(entitlementsForSubscription(null, now), {
    planCode: "free",
    subscriptionStatus: null,
    lawyerHandoff: false,
    fullDocumentAnalysis: false,
    expertDocumentAnalysis: false,
    documentComparison: false,
  });
  const active = entitlementsForSubscription({
    planCode: "individual",
    status: "active",
    currentPeriodEndsAt: "2026-08-30T12:00:00.000Z",
  }, now);
  assert.equal(active.lawyerHandoff, true);
  assert.equal(active.planCode, "individual");
  for (const evidence of [
    { planCode: "individual", status: "past_due", currentPeriodEndsAt: "2026-08-30T12:00:00.000Z" },
    { planCode: "individual", status: "active", currentPeriodEndsAt: "invalid" },
    { planCode: "individual", status: "active", currentPeriodEndsAt: "2026-07-01T00:00:00.000Z" },
    { planCode: "unknown", status: "active", currentPeriodEndsAt: null },
  ]) {
    assert.equal(entitlementsForSubscription(evidence, now).lawyerHandoff, false);
  }
});

test("consultation and billing requests are strict and tenant-context shaped", () => {
  const slotId = "11111111-1111-4111-8111-111111111111";
  const caseId = "22222222-2222-4222-8222-222222222222";
  const planStepId = "33333333-3333-4333-8333-333333333333";
  assert.equal(consultationBookingSchema.safeParse({
    slotId,
    caseId,
    planStepId,
    consent: true,
    locale: "uz",
  }).success, true);
  assert.equal(consultationBookingSchema.safeParse({
    slotId,
    planStepId,
    consent: true,
    locale: "ru",
  }).success, false);
  assert.equal(consultationBookingSchema.safeParse({
    slotId,
    consent: false,
    locale: "ru",
  }).success, false);
  assert.equal(consultationBookingSchema.safeParse({
    slotId,
    consent: true,
    locale: "ru",
    userId: "other",
  }).success, false);
  assert.equal(billingPlanSelectionSchema.safeParse({ planCode: "individual", locale: "ru" }).success, true);
  assert.equal(billingPlanSelectionSchema.safeParse({ planCode: "free", locale: "ru" }).success, false);
  assert.equal(billingPlanSelectionSchema.safeParse({ planCode: "business" }).success, false);
});

test("personal routes retain the personal workspace when business is default", () => {
  const personal = { id: "ws_personal", type: "individual" as const };
  const business = { id: "ws_business", type: "business" as const };

  assert.equal(
    workspaceForAccountRoute(business, [personal, business], "individual"),
    personal,
  );
  assert.equal(
    workspaceForAccountRoute(business, [personal, business], "entrepreneur"),
    personal,
  );
  assert.equal(
    workspaceForAccountRoute(business, [personal, business], "lawyer"),
    personal,
  );
  assert.equal(
    workspaceForAccountRoute(business, [personal, business], "business"),
    business,
  );
});

test("builder workspaces expose complete RU and UZ navigation copy", () => {
  const ru = workspaceCopy("ru");
  const uz = workspaceCopy("uz");
  assert.equal(ru.documents.title, "Мои документы");
  assert.equal(uz.documents.title, "Mening hujjatlarim");
  assert.equal(uz.contacts.newTitle, "Yangi kontakt");
  assert.equal(uz.notifications.emptyTitle, "Yangi bildirishnomalar yo‘q");
  assert.equal(localizedDocumentStatus("Черновик", "uz"), "Qoralama");
  assert.equal(localizedDocumentStatus("custom", "uz"), "custom");
  assert.equal(localizedDocumentStatus("Черновик", "ru"), "Черновик");
  assert.equal(documentBuilderMetadataCopy("ru").title, "Создать документ");
  assert.equal(documentBuilderMetadataCopy("uz").title, "Hujjat yaratish");
});

test("OTP values are six decimal digits and email normalization is stable", () => {
  for (let index=0; index<200; index++) assert.match(randomOtp(), /^\d{6}$/);
  assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
});

test("OTP hashes are deterministic and do not expose the code", async () => {
  const digest = await sha256("salt:123456");
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest, await sha256("salt:123456"));
  assert.doesNotMatch(digest, /123456/);
});

test("session cookies are HttpOnly, secure and revocable", async () => {
  const source=await readFile(new URL("../lib/auth/session.ts",import.meta.url),"utf8");
  assert.match(source,/HttpOnly/);assert.match(source,/Secure/);assert.match(source,/SameSite=Lax/);assert.match(source,/Max-Age=0/);assert.doesNotMatch(source,/Domain=/);
});

test("application shell refreshes due local sessions through the protected periodic-rotation route", async () => {
  const [route, shell, refresh, rotation] = await Promise.all([
    readFile(
      new URL(
        "../app/api/platform/security/sessions/refresh/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/_platform/PlatformShell.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/_platform/useSessionRefresh.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/auth/session-rotation.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.match(route, /localSessionForRequest\(request/);
  assert.match(route, /rotatePeriodicSessionToken/);
  assert.match(
    route,
    /sessionCookieUntil\(result\.token, result\.expiresAt, now\)/,
  );
  assert.match(route, /jsonNoStore/);
  assert.match(shell, /useSessionRefresh\(locale\)/);
  assert.match(refresh, /sessions\/refresh\?lang=\$\{locale\}/);
  assert.match(refresh, /"x-juro-csrf": "1"/);
  assert.match(refresh, /credentials: "same-origin"/);
  assert.match(refresh, /visibilitychange/);
  assert.match(refresh, /authenticationRetryUsed/);
  assert.match(refresh, /response\.status === 401/);
  assert.match(rotation, /PERIODIC_SESSION_ROTATION_MS = 12 \* 60 \* 60/);
  assert.match(rotation, /replayed\.rotationReason === "periodic"/);
  assert.match(rotation, /replayElapsedMs < PERIODIC_REPLAY_GRACE_MS/);
});

test("OTP, MFA, and logout writes require the application CSRF contract", async () => {
  const [
    authForm,
    logoutButton,
    requestRoute,
    verifyRoute,
    verifyMfaRoute,
    logoutRoute,
  ] =
    await Promise.all([
      readFile(new URL("../app/_auth/AuthForm.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/_platform/LogoutButton.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/auth/request-otp/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/auth/verify-otp/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/auth/verify-mfa/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/auth/logout/route.ts", import.meta.url),
        "utf8",
      ),
    ]);
  assert.equal(authForm.match(/"x-juro-csrf": "1"/g)?.length, 3);
  assert.match(logoutButton, /"x-juro-csrf":"1"/);
  for (const route of [
    requestRoute,
    verifyRoute,
    verifyMfaRoute,
    logoutRoute,
  ]) {
    assert.match(route, /assertSafeWrite\(request\)/);
    assert.match(route, /withApiErrors/);
  }
  assert.match(requestRoute, /requestOtpInputSchema/);
  assert.match(verifyRoute, /verifyOtpInputSchema/);
  assert.match(verifyMfaRoute, /verifyMfaInputSchema/);
  assert.match(authForm, /rememberMe/);
  assert.match(verifyRoute, /rememberMe: body\.rememberMe/);
  assert.match(
    verifyRoute,
    /sessionCookie\(session\.token, body\.rememberMe\)/,
  );
  assert.match(verifyMfaRoute, /sessionCookie\(result\.session\.token, rememberMe\)/);
  assert.match(verifyRoute, /deviceContinuityCookie\(session\.deviceContinuityToken\)/);
  assert.match(verifyMfaRoute, /deviceContinuityCookie\(result\.session\.deviceContinuityToken\)/);
});

test("production identity prefers OTP sessions and gates trusted edge headers", async () => {
  const source = await readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf("const sessionUser = await getSessionUser()") < source.indexOf("const requestHeaders = await headers()"));
  assert.match(source, /ALLOW_PLATFORM_AUTH_HEADERS/);
  assert.match(source, /NODE_ENV !== "production"/);
  assert.match(source, /authSource: "platform_header"/);
  assert.match(source, /assuranceLevel: "upstream"/);
  assert.match(source, /sessionId: null/);
  assert.match(source, /hasActiveMfa/);
  assert.match(
    source,
    /localUserId && await hasActiveMfa\(db, localUserId\)/,
  );
  assert.match(source, /userIdByEmail/);
  assert.match(source, /runtimeIdentityProtection/);
});

test("canonical identity expand stays disabled and public projections omit protected fields", async () => {
  const [
    identity,
    session,
    profile,
    storage,
    team,
    collaboration,
    workspaceInvitation,
    documentInvitation,
    identityEvidence,
    config,
  ] = await Promise.all([
    readFile(new URL("../lib/auth/identity-protection.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth/session-management.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/profile/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/document-builder/storage/db.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/team/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/document-builder/documents/[id]/collaboration/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/api/platform/team/invitations/accept/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/document-builder/invitations/[token]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../lib/auth/identity-evidence.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  ]);
  assert.match(identity, /"legacy" \| "dual_write"/);
  assert.match(identity, /backfillUserIdentityBatch/);
  assert.match(identity, /IDENTITY_VALUE_DIVERGED/);
  assert.equal(
    (config.match(/"IDENTITY_PROTECTION_MODE": "legacy"/g) ?? []).length,
    3,
  );
  assert.match(session, /return \{\s*sessionId:/);
  assert.doesNotMatch(storage, /\.\.\.existing/);
  assert.doesNotMatch(profile, /profile:\s*profile\.results/);
  assert.doesNotMatch(team, /members:\s*members\.results/);
  assert.doesNotMatch(team, /invitations:\s*invitations\.results/);
  assert.match(team, /invitations:\s*resolvedInvitations/);
  assert.doesNotMatch(
    collaboration,
    /collaborators:\s*collaborators\.results/,
  );
  assert.match(
    collaboration,
    /target_identifier_lookup_hash/,
  );
  assert.match(workspaceInvitation, /identityEvidenceMatches/);
  assert.match(documentInvitation, /identityEvidenceMatches/);
  assert.match(identityEvidence, /context\.mode === "legacy"/);
  assert.match(identityEvidence, /IDENTITY_VALUE_DIVERGED/);
  assert.match(identityEvidence, /secureEqual/);
});

test("short-lived challenge evidence is keyed without enabling rollout", async () => {
  const [
    requestOtp,
    verifyOtp,
    otpReservation,
    otpConsumption,
    deletionRoute,
    deletionService,
    challengeEvidence,
    migration,
  ] = await Promise.all([
    readFile(
      new URL("../app/api/auth/request-otp/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/auth/verify-otp/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/auth/otp-request.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../lib/auth/otp-challenge.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/platform/privacy/deletion-request/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../lib/auth/account-deletion.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/auth/challenge-evidence.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/0018_loud_puck.sql", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(requestOtp, /runtimeIdentityProtection/);
  assert.match(verifyOtp, /identityContext/);
  assert.match(otpReservation, /prepareAuthOtpChallengeEvidence/);
  assert.match(otpReservation, /email_lookup_key_version/);
  assert.match(otpConsumption, /authOtpEmailMatches/);
  assert.match(otpConsumption, /authOtpCodeMatches/);
  assert.match(deletionRoute, /runtimeIdentityProtection/);
  assert.match(deletionService, /accountDeletionEmailMatches/);
  assert.match(deletionService, /accountDeletionCodeMatches/);
  assert.match(challengeEvidence, /identityEvidenceLookupPairs/);
  assert.match(challengeEvidence, /legacyNormalizedValue/);
  assert.match(migration, /auth_otp_challenge_evidence_insert_guard/);
  assert.match(
    migration,
    /account_deletion_challenge_evidence_insert_guard/,
  );
});

test("session management distinguishes the current local device and audits revocation", async () => {
  const [sessionStore, sessionRoute, singleRoute, settings] =
    await Promise.all([
      readFile(
        new URL("../lib/auth/session-management.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/platform/security/sessions/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/platform/security/sessions/[sessionId]/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../app/_platform/ProfileSettingsClient.tsx", import.meta.url),
        "utf8",
      ),
    ]);
  assert.match(sessionStore, /coalesce\(s\.idle_expires_at,s\.expires_at\)>\?/);
  assert.match(sessionStore, /TOUCH_INTERVAL_MS/);
  assert.match(sessionStore, /batchWithSecurityEvent/);
  assert.match(sessionStore, /auth_device_continuities/);
  assert.match(sessionRoute, /s\.user_id=\?/);
  assert.match(sessionRoute, /externalProviderSessionsIncluded: false/);
  assert.match(sessionRoute, /scope !== "all" && scope !== "others"/);
  assert.match(singleRoute, /userId: user\.id,\s*sessionId/s);
  assert.match(singleRoute, /assertSafeWrite\(request\)/);
  assert.match(sessionRoute, /clearDeviceContinuityCookie/);
  assert.match(singleRoute, /clearDeviceContinuityCookie/);
  assert.match(settings, /JURO email-сессии/);
  assert.match(settings, /внешнего защищённого провайдера/);
  assert.match(settings, /2FA включена/);
  assert.match(settings, /резервн/);
});

test("MFA cookies and logout use narrow, server-only boundaries", async () => {
  const [session, logout] = await Promise.all([
    readFile(new URL("../lib/auth/session.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/auth/logout/route.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(
    session,
    /Path=\/api\/auth\/verify-mfa; HttpOnly; Secure; SameSite=Strict/,
  );
  assert.match(session, /clearMfaChallengeCookie/);
  assert.match(
    session,
    /DEVICE_CONTINUITY_COOKIE.*Path=\/; HttpOnly; Secure; SameSite=Lax/s,
  );
  assert.match(logout, /clearSessionCookie/);
  assert.match(logout, /clearMfaChallengeCookie/);
  assert.match(logout, /headers\.append\("set-cookie"/);
});

test("email OTP defers primary-session issuance while MFA is active", async () => {
  const [verifyOtp, sessionManagement] = await Promise.all([
    readFile(
      new URL("../app/api/auth/verify-otp/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/auth/session-management.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(verifyOtp, /hasActiveMfa/);
  assert.match(verifyOtp, /createLoginMfaChallenge/);
  assert.match(verifyOtp, /requiresTwoFactor: true/);
  assert.match(verifyOtp, /createPrimarySessionIfMfaDisabled/);
  assert.match(
    sessionManagement,
    /NOT EXISTS \(\s*SELECT 1 FROM auth_totp_credentials/s,
  );
});

test("successful OTP and MFA routes record bounded request evidence", async () => {
  const [verifyOtp, verifyMfa, evidence] = await Promise.all([
    readFile(
      new URL("../app/api/auth/verify-otp/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/auth/verify-mfa/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/auth/request-security-evidence.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(verifyOtp, /prepareAuthRequestSecurityEvidence/);
  assert.match(verifyOtp, /authRequestSecurityContext\(request\)/);
  assert.match(verifyOtp, /optionalIdentityKeyring/);
  assert.match(verifyMfa, /securityContext: authRequestSecurityContext\(request\)/);
  assert.match(evidence, /identityLookupHmac/);
  assert.match(evidence, /MAX_IP_CHARACTERS = 64/);
  assert.match(evidence, /MAX_USER_AGENT_CHARACTERS = 512/);
  assert.match(evidence, /\{ cf\?: IncomingRequestCf \}/);
  assert.match(evidence, /countryCode/);
  assert.match(evidence, /regionCode/);
  assert.doesNotMatch(evidence, /city|postalCode|latitude|longitude/);
});
test("MFA HTTP helpers fail closed and accept only a local session", async () => {
  const source = await readFile(
    new URL("../lib/auth/mfa-http.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /sessionTokenFromCookie/);
  assert.match(source, /LOCAL_SESSION_REQUIRED/);
  assert.ok(
    source.indexOf("sessionTokenFromCookie(cookie)")
      < source.indexOf("requireD1()"),
  );
  assert.match(source, /MfaConfigurationError/);
  assert.match(source, /IdentityKeyringError/);
  assert.match(source, /cache-control": "private, no-store"/);
});

test("MFA management routes require protected writes and local reauthentication", async () => {
  const routes = await Promise.all([
    "../app/api/platform/security/mfa/route.ts",
    "../app/api/platform/security/mfa/setup/route.ts",
    "../app/api/platform/security/mfa/confirm/route.ts",
    "../app/api/platform/security/mfa/backup-codes/route.ts",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const route of routes) {
    assert.match(route, /localSessionForRequest/);
  }
  for (const route of routes) {
    if (!/export const (POST|DELETE)/.test(route)) continue;
    assert.match(route, /assertSafeWrite\(request\)/);
  }
  assert.match(routes[1], /recent: true/);
  assert.match(routes[2], /recent: true/);
  assert.match(routes[2], /confirmTotpEnrollmentInputSchema/);
  assert.match(routes[3], /manageMfaInputSchema/);
  assert.match(routes[0], /sessionTokenFromCookie/);
  assert.match(routes[0], /sessionCookieUntil/);
  assert.match(routes[0], /currentToken/);
});

test("MFA factor claims bind replay fences to the exact operation and credential", async () => {
  const source = await readFile(
    new URL("../lib/auth/mfa-service.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /auth_mfa_factor_claims/);
  assert.match(source, /id=\? AND operation_id=\? AND credential_id=\?/);
  assert.match(source, /used_at IS NULL AND revoked_at IS NULL/);
  assert.match(source, /last_used_step IS NULL OR last_used_step<\?/);
  assert.match(source, /disabledByOperationGuard/);
  assert.match(source, /batchWithSecurityEvent/);
});

test("email change binds both address proofs to one fresh local session", async () => {
  const [route, service, profileUi] = await Promise.all([
    readFile(
      new URL(
        "../app/api/platform/security/email-change/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../lib/auth/email-change.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/_platform/ProfileSettingsClient.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.match(route, /emailChangeInputSchema/);
  assert.match(route, /recentEmailChangeSession/);
  assert.match(route, /hasActiveMfa/);
  assert.match(route, /while \(newCode === currentCode\)/);
  assert.match(route, /https:\/\/api\.resend\.com\/emails\/batch/);
  assert.match(route, /"idempotency-key"/);
  assert.match(route, /markEmailChangeCodesQueued/);
  assert.match(route, /sessionTokenFromCookie/);
  assert.match(route, /sessionCookieUntil/);
  assert.match(route, /currentToken,/);
  assert.ok(
    route.indexOf("localSessionForRequest(request)")
      < route.indexOf("invalidateEmailChangeChallenge(requireD1()"),
  );

  assert.match(service, /batchWithSecurityEvent/);
  assert.match(service, /account\.email_changed/);
  assert.match(service, /account_email_changed/);
  assert.match(service, /prepareSessionTokenRotation/);
  assert.match(service, /reason: "email_change"/);
  assert.match(service, /sessionTokenRotated: true/);
  for (const table of [
    "auth_sessions",
    "auth_otp_challenges",
    "account_deletion_challenges",
    "auth_mfa_challenges",
  ]) {
    assert.match(service, new RegExp(table));
  }

  assert.match(profileUi, /\/api\/platform\/security\/email-change/);
  assert.match(profileUi, /currentEmailCode/);
  assert.match(profileUi, /newEmailCode/);
  assert.match(profileUi, /Защищённая смена email/);
});

test("platform staff access is separate, local-MFA-only, and grants no customer-content capability", async () => {
  const [policy, httpBoundary] = await Promise.all([
    readFile(new URL("../lib/auth/staff-access.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth/staff-http.ts", import.meta.url), "utf8"),
  ]);
  assert.match(
    policy,
    /"administrator",\s*"support",\s*"legal_reviewer"/,
  );
  assert.doesNotMatch(
    policy,
    /"owner"|"admin"|"lawyer"|"employee"/,
  );
  assert.match(policy, /s\.assurance_level='mfa'/);
  assert.match(policy, /auth_totp_credentials/);
  assert.match(policy, /a\.revoked_at IS NULL/);
  assert.match(policy, /a\.expires_at>\?/);
  assert.doesNotMatch(
    policy,
    /documents?\.|cases?\.|customer\.|workspace\.content/,
  );
  assert.match(httpBoundary, /localSessionForRequest/);
  assert.match(httpBoundary, /requirePlatformStaffAccess/);
  assert.doesNotMatch(httpBoundary, /getChatGPTUser|getAuthPrincipal/);
});

test("staff role lifecycle is internal, fresh-MFA-gated, and atomically audited", async () => {
  const [management, events] = await Promise.all([
    readFile(
      new URL("../lib/auth/staff-role-management.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/auth/staff-role-events.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(management, /STAFF_ROLE_FRESH_MFA_MS = 5 \* 60/);
  assert.match(management, /MAX_STAFF_ROLE_TTL_MS = 30 \* 24/);
  assert.match(management, /requirePlatformStaffAccess/);
  assert.match(management, /"staff\.roles\.manage"/);
  assert.match(management, /auth_totp_credentials/);
  assert.match(management, /PLATFORM_STAFF_ROLE_SELF_GRANT_FORBIDDEN/);
  assert.match(management, /batchWithPlatformStaffRoleEvent/);
  assert.match(events, /juro-platform-staff-role-event-v1/);
  assert.match(events, /platform_staff_role_events/);
  assert.match(events, /"staff\.roles\.manage"/);
  assert.match(events, /MAX_CHAIN_RETRIES = 3/);
  assert.doesNotMatch(
    `${management}\n${events}`,
    /operator_bootstrap|getChatGPTUser|getAuthPrincipal|NextRequest|cookies\(/,
  );
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  for await (const path of glob(
    ["app/**/*.{ts,tsx}", "worker/**/*.ts"],
    { cwd: projectRoot },
  )) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /staff-role-management/,
      `${path} must not expose the internal staff role mutation service`,
    );
  }
});

test("canonical platform route classifier is stable", () => {
  assert.ok(isLocale("ru"));assert.ok(isLocale("uz"));assert.ok(!isLocale("en"));
  assert.ok(isAccountType("individual"));assert.ok(isAccountType("entrepreneur"));assert.ok(isAccountType("lawyer"));assert.ok(isAccountType("business"));assert.ok(!isAccountType("admin"));
  assert.ok(isPlatformModule("dashboard"));assert.ok(isPlatformModule("action-plan"));assert.ok(!isPlatformModule("main"));assert.ok(!isPlatformModule("document-builder-test"));
  assert.equal(platformPath("uz","business","document-builder"),"/uz/business/document-builder");
  assert.equal(platformPath("uz","business","dashboard","ws_business_1"),"/uz/business/ws_business_1/dashboard");
  assert.equal(platformBasePath("ru","business","ws_business_1"),"/ru/business/ws_business_1");
  assert.equal(platformPath("ru","lawyer","dashboard"),"/ru/lawyer/dashboard");
  assert.ok(isWorkspaceId("ws_business_1"));
  assert.ok(!isWorkspaceId("workspace/escape"));
  assert.throws(() => platformBasePath("ru", "business", "workspace/escape"), /INVALID_WORKSPACE_ID/);
});

test("legacy builder routing preserves every supported profile persona", async () => {
  const source = await readFile(new URL("../app/document-builder/route-helpers.ts", import.meta.url), "utf8");
  assert.match(source, /isAccountType\(queryType\)/);
  assert.match(source, /isAccountType\(storedType\)/);
  assert.doesNotMatch(source, /queryType === "business"/);
});

test("workspace role permissions deny management and writes by default", () => {
  for (const role of ["owner", "admin", "lawyer", "employee", "viewer", "external"]) assert.ok(isWorkspaceRole(role));
  assert.ok(canManageTeam("owner"));
  assert.ok(canManageTeam("admin"));
  assert.ok(!canManageTeam("lawyer"));
  assert.ok(!canManageTeam("viewer"));
  assert.ok(canEditWorkspaceContent("employee"));
  assert.ok(!canEditWorkspaceContent("viewer"));
  assert.ok(!canEditWorkspaceContent("unexpected"));
});

test("pricing is centralized, bilingual and retains explicit non-fiction placeholders", () => {
  assert.equal(pricingConfig.currency, "UZS");
  assert.equal(pricingConfig.freeStart.priceMinor, 0);
  assert.deepEqual(pricingConfig.plans.map((plan) => plan.code), ["individual", "business", "legal_team"]);
  for (const plan of pricingConfig.plans) {
    assert.ok(plan.name.ru.length > 2);
    assert.ok(plan.name.uz.length > 2);
    assert.match(plan.priceLabel, /\{PRICE_/);
    assert.ok(plan.features.ru.length >= 3);
    assert.equal(plan.features.ru.length, plan.features.uz.length);
  }
});

test("application legal documents have matching complete RU and UZ keys", () => {
  const ruKeys = Object.keys(appLegalContent.ru).sort();
  const uzKeys = Object.keys(appLegalContent.uz).sort();
  assert.deepEqual(ruKeys, uzKeys);
  assert.deepEqual(ruKeys, ["ai-rules", "cookies", "personal-data", "privacy", "terms"]);
  for (const key of ruKeys) {
    const slug = key as keyof typeof appLegalContent.ru;
    for (const locale of ["ru", "uz"] as const) {
      const document = appLegalContent[locale][slug];
      assert.ok(document.title.length > 12);
      assert.ok(document.description.length > 30);
      assert.ok(document.sections.length >= 3);
      assert.ok(document.sections.every((section) => section.paragraphs.every((paragraph) => paragraph.length > 30)));
    }
  }
});

test("production migration creates a data snapshot before account and workflow changes", async () => {
  const sql=await readFile(new URL("../drizzle/0004_secure_sandstone.sql",import.meta.url),"utf8");
  const backup=sql.indexOf("CREATE TABLE `__backup_20260724_user_profiles`");
  const alter=sql.indexOf("ALTER TABLE `user_profiles` ADD `locale`");
  assert.ok(backup>=0&&alter>backup);
  for(const table of ["auth_otp_challenges","auth_sessions","cases","action_plans","action_plan_steps","consultation_slots","consultation_bookings"]) assert.ok(sql.includes("CREATE TABLE `" + table + "`"));
});

test("workspace and product migrations enforce tenant links, token hashes and analysis indexes", async () => {
  const migrations = await Promise.all([
    "0005_sticky_smiling_tiger.sql",
    "0006_lumpy_ravenous.sql",
    "0007_tranquil_zzzax.sql",
    "0008_noisy_tomorrow_man.sql",
  ].map((name) => readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8")));
  const sql = migrations.join("\n");
  for (const table of [
    "workspaces", "workspace_members", "workspace_invitations", "workspace_audit_events", "consents",
    "conversations", "conversation_messages", "confirmed_facts", "legal_sources", "subscriptions", "payments",
    "document_analyses", "document_risks", "account_deletion_requests",
  ]) assert.match(sql, new RegExp(`CREATE TABLE \\\`${table}\\\``));
  for (const table of ["cases", "documents", "notifications", "consultation_bookings", "document_files"]) {
    assert.match(sql, new RegExp(`ALTER TABLE \\\`${table}\\\` ADD \\\`workspace_id\\\``));
  }
  assert.match(sql, /workspace_invitations_token_uidx/);
  assert.match(sql, /legal_sources_url_locale_uidx/);
  assert.match(sql, /document_analyses_file_uidx/);
  assert.doesNotMatch(sql, /otp[^;\n]*text[^;\n]*123456/i);
});

test("AI platform migration adds tenant-scoped run and usage evidence without destructive SQL", async () => {
  const sql = await readFile(new URL("../drizzle/0037_square_blacklash.sql", import.meta.url), "utf8");
  for (const table of ["ai_runs", "ai_usage_ledger"]) {
    assert.match(sql, new RegExp("CREATE TABLE `" + table + "`"));
  }
  for (const index of [
    "ai_runs_idempotency_uidx", "ai_usage_ledger_run_uidx",
    "ai_usage_ledger_idempotency_uidx", "ai_usage_ledger_period_idx",
  ]) assert.match(sql, new RegExp(index));
  assert.doesNotMatch(sql, /^\s*(?:DROP\b|DELETE\s+FROM\b|TRUNCATE\b)/im);
});

test("comparison and monitoring migrations preserve immutable versions and verified-source publishing", async () => {
  const [comparisonSql, monitoringSql] = await Promise.all([
    readFile(new URL("../drizzle/0009_glossy_sunspot.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0010_jittery_micromax.sql", import.meta.url), "utf8"),
  ]);
  for (const table of ["document_comparisons", "comparison_changes"]) {
    assert.match(comparisonSql, new RegExp(`CREATE TABLE \\\`${table}\\\``));
  }
  assert.match(comparisonSql, /ALTER TABLE `document_files` ADD `sha256`/);
  assert.match(comparisonSql, /ON DELETE restrict/);
  assert.match(comparisonSql, /document_comparisons_owner_idx/);
  assert.match(comparisonSql, /comparison_changes_type_idx/);
  for (const table of ["legislation_updates", "monitoring_preferences"]) {
    assert.match(monitoringSql, new RegExp(`CREATE TABLE \\\`${table}\\\``));
  }
  assert.match(monitoringSql, /legislation_updates_source_uidx/);
  assert.match(monitoringSql, /monitoring_preferences_user_workspace_uidx/);
  assert.doesNotMatch(monitoringSql, /INSERT INTO `legislation_updates`/);
});

test("AI conversations and facts remain owner-scoped inside a tenant", async () => {
  const [conversationRoute, factRoute] = await Promise.all([
    readFile(new URL("../app/api/platform/ai/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/ai/facts/[factId]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(conversationRoute, /owner_user_id=\?/);
  assert.match(conversationRoute, /c\.owner_user_id=\?/);
  assert.match(factRoute, /conversations WHERE workspace_id=\? AND owner_user_id=\?/);
  assert.doesNotMatch(conversationRoute, /WHERE workspace_id=\?\s+ORDER BY updated_at/s);
});

test("workspace switching is membership-scoped and never reuses an invalid default tenant", async () => {
  const [workspaceLibrary, workspaceAccess, route] = await Promise.all([
    readFile(new URL("../lib/platform/workspace.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/platform/workspace-route-access.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/workspaces/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /workspaceForUserById\(user\.id, body\.workspaceId/);
  assert.match(route, /source: "workspace_switcher"/);
  assert.doesNotMatch(route, /SET default_workspace_id=\?,account_type=\?/);
  assert.match(route, /isPersonalAccountType\(profile\.accountPersona\)/);
  assert.match(workspaceAccess, /m\.user_id=\? AND m\.status='active'/);
  assert.match(workspaceAccess, /UPDATE user_profiles SET default_workspace_id=\?,updated_at=\?/);
  assert.match(workspaceAccess, /workspace_selected/);
  assert.match(workspaceLibrary, /const workspaceId = `ws_\$\{crypto\.randomUUID\(\)/);
  assert.doesNotMatch(workspaceLibrary, /profile\.defaultWorkspaceId \?\? `ws_/);
  assert.match(workspaceLibrary, /m\.status='active'/);
});

test("global search is tenant-scoped, escapes LIKE input and avoids document-text leakage", async () => {
  const source = await readFile(new URL("../app/api/platform/search/route.ts", import.meta.url), "utf8");
  assert.match(source, /workspace_id=\?/);
  assert.match(source, /owner_user_id=\?/);
  assert.ok(source.includes("ESCAPE '\\\\'"));
  assert.ok(source.includes('replaceAll("%", "\\\\%")'));
  assert.doesNotMatch(source, /final_content|auto_content|structured_json AS/);
});

test("legislation monitoring never auto-publishes or invents feed entries", async () => {
  const source = await readFile(new URL("../app/api/platform/monitoring/route.ts", import.meta.url), "utf8");
  assert.match(source, /u\.status='published_verified'/);
  assert.match(source, /u\.verified_at IS NOT NULL/);
  assert.match(source, /s\.status='verified'/);
  assert.match(source, /s\.verification_state='verified'/);
  assert.match(source, /s\.content_sha256 IS NOT NULL/);
  assert.match(source, /automaticPublication: false/);
  assert.match(source, /isTrustedVerifiedLegalSource/);
  assert.match(source, /trustedSourceStatusRows\.length/);
});

test("JURO motion tokens are bounded and reduced motion resolves to a static route", async () => {
  const [globals, dashboard] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/dashboard.css", import.meta.url), "utf8"),
  ]);
  for (const value of ["140ms", "220ms", "360ms", "680ms"]) assert.match(globals, new RegExp(value));
  assert.ok(globals.includes("cubic-bezier(.16,1,.3,1)"));
  assert.ok(globals.includes("cubic-bezier(.2,.8,.2,1)"));
  assert.match(globals, /prefers-reduced-motion:\s*reduce/);
  assert.match(dashboard, /stroke-dashoffset/);
  assert.match(dashboard, /golden-route/);
  assert.doesNotMatch(dashboard, /infinite|parallax|perspective/);
});

test("new work surfaces keep mobile, zoom and keyboard accessibility safeguards", async () => {
  const [globals, shell, shellComponent, dashboard, comparison, monitoring, readability] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/platform-shell.css", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/PlatformShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/dashboard.css", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/document-comparison.css", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/monitoring.css", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/platform-readability.css", import.meta.url), "utf8"),
  ]);

  assert.match(globals, /:focus-visible/);
  assert.match(globals, /outline:3px solid/);
  assert.match(shell, /min-height:44px/);
  assert.match(shell, /max-width:800px/);
  assert.match(shell, /prefers-reduced-transparency:reduce/);
  assert.match(shellComponent, /\["dashboard", Home/);
  assert.match(shellComponent, /\["ai-chat", Bot/);
  assert.match(shellComponent, /\["documents", Files/);
  assert.match(shellComponent, /\["cases", BriefcaseBusiness/);
  assert.match(shellComponent, /href=\{`\$\{base\}\/profile`\}/);
  assert.doesNotMatch(shellComponent, /MoreHorizontal/);
  assert.match(dashboard, /max-width:820px/);
  assert.match(dashboard, /max-width:460px/);
  assert.match(comparison, /max-width:820px/);
  assert.match(comparison, /max-width:560px/);
  assert.match(comparison, /prefers-reduced-motion:reduce/);
  assert.match(monitoring, /max-width:700px/);
  assert.match(readability, /font-size:14px/);
  assert.match(readability, /min-height:44px/);
  for (const source of [dashboard, comparison, monitoring]) {
    assert.doesNotMatch(source, /width:100vw/);
    assert.doesNotMatch(source, /cursor-trail|particle|3d-tilt|animation:[^;}]*infinite/i);
  }
});

test("Jurobek is a static optimized image without animation handlers or 3D dependencies", async () => {
  const [component, styles, packageSource] = await Promise.all([
    readFile(new URL("../app/onboarding/OnboardingForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/onboarding/onboarding.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(component, /next\/image/);
  assert.match(component, /jurobek-avatar\.webp/);
  assert.doesNotMatch(component, /onPointerMove|onMouseMove|requestAnimationFrame|useFrame|Canvas/);
  assert.doesNotMatch(styles, /@keyframes[^}]*jurobek|animation[^;]*jurobek/i);
  assert.doesNotMatch(packageSource, /three|react-three|lottie|framer-motion/);
});

test("case-detail routes remain tenant-scoped and do not render the workspace-wide plan", async () => {
  const [api, client, personalPage, businessPage] = await Promise.all([
    readFile(new URL("../app/api/platform/cases/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/ActionPlanClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/[locale]/[accountType]/cases/[caseId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/[locale]/business/[workspaceId]/cases/[caseId]/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(api, /new URL\(request\.url\)\.searchParams\.get\("caseId"\)/);
  assert.match(api, /WHERE c\.workspace_id=\?\$\{caseScope\}/);
  assert.match(api, /bind\(workspace\.id,caseId\)/);
  assert.match(client, /initialCaseId \? `\/api\/platform\/cases\?caseId=\$\{encodeURIComponent\(initialCaseId\)\}`/);
  assert.match(client, /!initialCaseId && <form className="plan-create"/);
  assert.match(personalPage, /initialCaseId=\{caseId\}/);
  assert.match(businessPage, /initialCaseId=\{caseId\}/);
});

test("lawyer handoff keeps conflict review anonymized and access explicitly consented", async () => {
  const caseId = "11111111-1111-4111-8111-111111111111";
  const lawyerProfileId = "22222222-2222-4222-8222-222222222222";
  assert.equal(lawyerRequestSchema.safeParse({
    caseId,
    lawyerProfileId,
    anonymizedSummary: "Нужна проверка договорного спора без раскрытия персональных данных.",
    consent: true,
    locale: "ru",
  }).success, true);
  assert.equal(lawyerRequestSchema.safeParse({ caseId, anonymizedSummary: "слишком коротко", consent: true, locale: "ru" }).success, false);
  assert.equal(lawyerRequestSchema.safeParse({ caseId, anonymizedSummary: "Достаточно длинное нейтральное описание ситуации для проверки конфликта.", consent: false, locale: "ru" }).success, false);
  assert.equal(conflictCheckDecisionSchema.safeParse({ decision: "clear", locale: "uz" }).success, true);
  assert.equal(conflictCheckDecisionSchema.safeParse({ decision: "approve", locale: "uz" }).success, false);
  assert.equal(lawyerAccessGrantSchema.safeParse({ consent: true, locale: "ru" }).success, true);
  assert.equal(lawyerAccessGrantSchema.safeParse({ consent: false, locale: "ru" }).success, false);

  const [requestRoute, conflictRoute, grantRoute] = await Promise.all([
    readFile(new URL("../app/api/platform/lawyer-requests/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/lawyer-requests/[requestId]/conflict-check/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/lawyer-requests/[requestId]/access-grant/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(requestRoute, /workspaceEntitlements\(db, workspace\.id\)/);
  assert.match(requestRoute, /WHERE id=\? AND workspace_id=\? AND archived_at IS NULL/);
  assert.match(requestRoute, /anonymized_summary/);
  assert.match(conflictRoute, /anonymized summary/);
  assert.match(conflictRoute, /p\.user_id=\? AND p\.status='public_approved'/);
  assert.match(grantRoute, /c\.status='clear'/);
  assert.match(grantRoute, /requester_user_id=\?/);
  assert.match(grantRoute, /lawyer_case_access_granted/);
  assert.match(grantRoute, /lawyer_case_access_revoked/);
});
test("assigned lawyer view reveals case metadata only for an active grant", async () => {
  const route = await readFile(new URL("../app/api/platform/lawyer-requests/assigned/route.ts", import.meta.url), "utf8");
  assert.match(route, /p\.user_id=\? AND p\.status='public_approved'/);
  assert.match(route, /g\.revoked_at IS NULL/);
  assert.match(route, /g\.expires_at IS NULL OR g\.expires_at>\?/);
  assert.match(route, /CASE WHEN g\.id IS NOT NULL THEN cs\.description END/);
});
test("support tickets are tenant-scoped, validated, and audited", async () => {
  const support = await readFile(new URL("../app/api/platform/support-tickets/route.ts", import.meta.url), "utf8");
  const input = await readFile(new URL("../lib/platform/support.ts", import.meta.url), "utf8");
  assert.match(input, /supportTicketSchema/);
  assert.match(input, /technical.*ai_error.*wrong_norm/s);
  assert.match(support, /WHERE workspace_id=\? AND requester_user_id=\?/);
  assert.match(support, /assertSafeWrite\(request\)/);
  assert.match(support, /support_ticket_created/);
  assert.match(support, /INSERT INTO support_messages/);
  const [detail, staffQueue, staffReply] = await Promise.all([
    readFile(new URL("../app/api/platform/support-tickets/[ticketId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/admin/support-tickets/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/admin/support-tickets/[ticketId]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(detail, /id=\? AND workspace_id=\? AND requester_user_id=\?/);
  assert.match(detail, /FROM support_messages WHERE ticket_id=\?/);
  assert.match(staffQueue, /freshMfaWithinMs: 15 \* 60 \* 1000/);
  assert.match(staffReply, /support_ticket_replied/);
});
test("legal-source health route is staff-gated, same-origin, and no-store", async () => {
  const route = await readFile(new URL("../app/api/platform/legal-sources/health/route.ts", import.meta.url), "utf8");
  assert.match(route, /LEGAL_SOURCE_STAFF_API_ENABLED !== "true"/);
  assert.match(route, /x-juro-csrf/);
  assert.match(route, /sec-fetch-site/);
  assert.match(route, /legal\.sources\.review/);
  assert.match(route, /freshMfaWithinMs: 15 \* 60 \* 1_000/);
  assert.match(route, /cache-control": "private, no-store/);
  assert.match(route, /ACCESS_DENIED/);
});