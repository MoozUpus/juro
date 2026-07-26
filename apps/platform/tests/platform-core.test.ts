import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeEmail, randomOtp, sha256 } from "../lib/auth/crypto";
import { pricingConfig } from "../config/pricing";
import { appLegalContent } from "../content/app-legal";
import { canEditWorkspaceContent, canManageTeam, isWorkspaceRole } from "../lib/platform/role-policy";
import { isAccountType, isLocale, isPlatformModule, platformPath } from "../lib/platform/routing";

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
  assert.match(sessionRoute, /s\.user_id=\?/);
  assert.match(sessionRoute, /externalProviderSessionsIncluded: false/);
  assert.match(sessionRoute, /scope !== "all" && scope !== "others"/);
  assert.match(singleRoute, /userId: user\.id,\s*sessionId/s);
  assert.match(singleRoute, /assertSafeWrite\(request\)/);
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

test("canonical platform route classifier is stable", () => {
  assert.ok(isLocale("ru"));assert.ok(isLocale("uz"));assert.ok(!isLocale("en"));
  assert.ok(isAccountType("individual"));assert.ok(isAccountType("business"));assert.ok(!isAccountType("admin"));
  assert.ok(isPlatformModule("action-plan"));assert.ok(!isPlatformModule("document-builder-test"));
  assert.equal(platformPath("uz","business","document-builder"),"/uz/business/document-builder");
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
  const [workspaceLibrary, route] = await Promise.all([
    readFile(new URL("../lib/platform/workspace.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/workspaces/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /m\.user_id=\? AND m\.status='active'/);
  assert.match(route, /UPDATE user_profiles SET default_workspace_id=\?,account_type=\?/);
  assert.match(route, /workspace_selected/);
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
  assert.match(source, /automaticPublication: false/);
  assert.ok(source.includes('new URL(String(item.officialUrl)).protocol === "https:"'));
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
  const [globals, shell, dashboard, comparison, monitoring, readability] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/platform-shell.css", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/dashboard.css", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/document-comparison.css", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/monitoring.css", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/platform-readability.css", import.meta.url), "utf8"),
  ]);

  assert.match(globals, /:focus-visible/);
  assert.match(globals, /outline:3px solid/);
  assert.match(shell, /min-height:44px/);
  assert.match(shell, /max-width:800px/);
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
