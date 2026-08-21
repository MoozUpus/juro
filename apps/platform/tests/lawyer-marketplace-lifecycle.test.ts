import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  isLawyerMarketplaceProfileComplete,
  isRestrictedLawyerMarketplaceStatus,
  marketplaceStatusAfterProfileEdit,
  mayReceiveLawyerRequests,
  missingLawyerMarketplaceFields,
  type LawyerMarketplaceCompletionInput,
} from "../lib/platform/lawyer-marketplace";
import { projectPublicLawyerDirectory } from "../lib/platform/lawyer-directory-reviews";
import { localizedLawyerProfileStatusNotification } from "../lib/platform/lawyer-profile-notifications";

const completeProfile: LawyerMarketplaceCompletionInput = {
  displayName: "Юрист JURO",
  specialties: ["Договоры"],
  languages: ["ru", "uz"],
  experienceYears: 5,
  education: "Ташкентский государственный юридический университет",
  firmName: "JURO Legal",
  city: "Ташкент",
  region: "Ташкент",
  priceDescription: "По договорённости",
  consultationFormats: ["чат", "телефон"],
  availabilityStatus: "available",
  profilePhotoKey: "lawyer-profiles/user/photo.webp",
  hasPhone: true,
};

test("a lawyer profile is reviewable only after every required professional field is present", () => {
  assert.equal(isLawyerMarketplaceProfileComplete(completeProfile), true);
  assert.equal(marketplaceStatusAfterProfileEdit(completeProfile), "pending_review");

  const incomplete = { ...completeProfile, profilePhotoKey: null, hasPhone: false };
  assert.deepEqual(missingLawyerMarketplaceFields(incomplete), ["profilePhoto", "phone"]);
  assert.equal(isLawyerMarketplaceProfileComplete(incomplete), false);
  assert.equal(marketplaceStatusAfterProfileEdit(incomplete), "profile_incomplete");
});

test("only an approved profile may receive a client request", () => {
  assert.equal(mayReceiveLawyerRequests("profile_incomplete"), false);
  assert.equal(mayReceiveLawyerRequests("pending_review"), false);
  assert.equal(mayReceiveLawyerRequests("changes_requested"), false);
  assert.equal(mayReceiveLawyerRequests("rejected"), false);
  assert.equal(mayReceiveLawyerRequests("suspended"), false);
  assert.equal(mayReceiveLawyerRequests("blocked"), false);
  assert.equal(mayReceiveLawyerRequests("archived"), false);
  assert.equal(mayReceiveLawyerRequests("public_approved"), true);
  assert.equal(isRestrictedLawyerMarketplaceStatus("suspended"), true);
  assert.equal(isRestrictedLawyerMarketplaceStatus("blocked"), true);
  assert.equal(isRestrictedLawyerMarketplaceStatus("archived"), true);
  assert.equal(isRestrictedLawyerMarketplaceStatus("pending_review"), true);
});

test("restricted profiles are locked for edits and excluded from new handoff work", () => {
  const profileRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/route.ts", import.meta.url), "utf8");
  const photoRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/photo/route.ts", import.meta.url), "utf8");
  const handoffRoute = readFileSync(new URL("../app/api/platform/lawyer-requests/route.ts", import.meta.url), "utf8");
  const lifecycleRoute = readFileSync(new URL("../app/api/platform/admin/lawyer-profiles/[profileId]/lifecycle/route.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0110_lawyer_profile_lifecycle_controls.sql", import.meta.url), "utf8");
  assert.match(profileRoute, /PROFILE_LOCKED/);
  assert.match(photoRoute, /PROFILE_LOCKED/);
  assert.match(handoffRoute, /marketplace_status='public_approved'/);
  assert.match(lifecycleRoute, /staff\.operations\.manage/);
  assert.match(lifecycleRoute, /freshMfaWithinMs: 15 \* 60 \* 1_000/);
  assert.match(migration, /lawyer_profile_lifecycle_events/);
  assert.match(migration, /append-only/);
  assert.match(migration, /lifecycle evidence required/);
  assert.doesNotMatch(migration, /DROP\s+TABLE|DELETE\s+FROM/iu);
});

test("profile status notifications are localized and preserve only a bounded review reason", () => {
  const ru = localizedLawyerProfileStatusNotification("ru", "changes_requested", "Уточните формат консультации.");
  assert.equal(ru.title, "Профиль юриста нужно доработать");
  assert.match(ru.body, /Уточните формат консультации\./u);
  const uz = localizedLawyerProfileStatusNotification("uz", "pending_review");
  assert.equal(uz.title, "Yurist profilingiz tekshiruvga yuborildi");
  assert.doesNotMatch(uz.body, /Izoh:/u);
});

test("lawyer scheduling persists recurring hours and bounded unavailability", () => {
  const route = readFileSync(new URL("../app/api/platform/lawyer-schedule/route.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0142_legal_ecosystem_foundation.sql", import.meta.url), "utf8");
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.match(route, /requireApiUser\(\)/);
  assert.match(route, /lawyer_unavailability_periods/);
  assert.match(route, /datetime\(\{ offset: true \}\)/);
  assert.match(route, /max\(100\)/);
  assert.match(migration, /CREATE TABLE `lawyer_availability_rules`/);
  assert.match(migration, /CREATE TABLE `lawyer_unavailability_periods`/);
  assert.match(migration, /CHECK \(`starts_at` < `ends_at`\)/);
  assert.doesNotMatch(migration, /DROP\s+TABLE/iu);
});

test("consultation transitions are participant-scoped, audited and return a real result", () => {
  const route = readFileSync(new URL("../app/api/platform/lawyer-consultations/route.ts", import.meta.url), "utf8");
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.match(route, /!isLawyer && !isClient/);
  assert.match(route, /!isClient \|\| existing\.status !== "proposed"/);
  assert.match(route, /!isLawyer \|\| !\["confirmed", "in_progress"\]\.includes/);
  assert.match(route, /resultNote: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(4_000\)/);
  assert.match(route, /lawyer_consultation_\$\{status\}/);
  assert.match(route, /CASE WHEN \?='completed' THEN \? ELSE result_note END/);
});

test("lawyer application has an explicit submit gate and draft saves do not publish", () => {
  const profileRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/route.ts", import.meta.url), "utf8");
  const submitRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/submit/route.ts", import.meta.url), "utf8");
  assert.match(profileRoute, /lawyer_profile_draft_saved/);
  assert.doesNotMatch(profileRoute, /lawyer_profile_submitted/);
  assert.match(submitRoute, /marketplace_status='pending_review'/);
  assert.match(submitRoute, /missingLawyerMarketplaceFields/);
  assert.match(submitRoute, /lawyer_profile_submitted/);
  assert.match(submitRoute, /profile_revision=\?/);
});

test("availability-only edits preserve an approved public profile", () => {
  const profileRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/route.ts", import.meta.url), "utf8");
  assert.match(profileRoute, /preservesPublishedProfile/);
  assert.match(profileRoute, /!moderatedFieldsChanged\(current, next\)/);
  assert.match(profileRoute, /public_approved_at=CASE WHEN \?='public_approved' THEN public_approved_at ELSE NULL END/);
  assert.match(profileRoute, /publicationPreserved: preservesPublishedProfile/);
});

test("a correction-requested profile remains fail-closed if it reaches a directory projection", () => {
  const [lawyer] = projectPublicLawyerDirectory([{
    id: "correction-requested-lawyer",
    displayName: "Юрист JURO",
    specialtiesJson: '["Договоры"]',
    languagesJson: '["ru","uz"]',
    experienceYears: 5,
    priceDescription: "По договорённости",
    availabilityStatus: "available",
    nextAvailableAt: null,
    advocateStatus: "not_verified",
    firmName: null,
    bio: null,
    marketplaceStatus: "changes_requested",
  }], [], []);
  assert.equal(lawyer.marketplaceStatus, "pending_review");
  assert.equal(lawyer.canReceiveRequests, false);
});

test("profile photos remain fail-closed until the malware scanner verifies their checksum", () => {
  const route = readFileSync(new URL("../app/api/platform/lawyer-profile/photo/route.ts", import.meta.url), "utf8");
  assert.match(route, /malwareScannerResponseSchema/);
  assert.match(route, /MALWARE_SCANNER_UNAVAILABLE/);
  assert.match(route, /scanVerdict !== "clean"/);
  assert.match(route, /parsed\.data\.sourceSha256 !== checksum/);
  assert.ok(route.indexOf("const scanVerdict") < route.indexOf("const objectKey"));
});

test("a completed profile stays private until approval and retains a self-only preview", () => {
  const publicPhotoRoute = readFileSync(new URL("../app/api/public/lawyers/[profileId]/photo/route.ts", import.meta.url), "utf8");
  const directoryRoute = readFileSync(new URL("../app/api/platform/lawyers/route.ts", import.meta.url), "utf8");
  const publicDirectoryRoute = readFileSync(new URL("../app/api/public/lawyers/route.ts", import.meta.url), "utf8");
  const publicDetailRoute = readFileSync(new URL("../app/api/public/lawyers/[profileId]/route.ts", import.meta.url), "utf8");
  const directoryClient = readFileSync(new URL("../app/_platform/LawyerDirectoryClient.tsx", import.meta.url), "utf8");
  const detailRoute = readFileSync(new URL("../app/api/platform/lawyers/[lawyerId]/route.ts", import.meta.url), "utf8");
  const detailClient = readFileSync(new URL("../app/_platform/LawyerProfileClient.tsx", import.meta.url), "utf8");
  const privatePhotoRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/photo/route.ts", import.meta.url), "utf8");
  const privateProfileRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/route.ts", import.meta.url), "utf8");
  for (const source of [publicPhotoRoute, directoryRoute, publicDirectoryRoute, publicDetailRoute, detailRoute]) {
    assert.match(source, /status='public_approved'/);
    assert.match(source, /marketplace_status='public_approved'/);
    assert.doesNotMatch(source, /marketplace_status='pending_review' AND status='pending'/);
  }
  assert.doesNotMatch(publicDirectoryRoute, /phone|user_profiles|moderation_notes/i);
  assert.match(detailClient, /consultations\?lawyer=/);
  assert.match(privateProfileRoute, /lawyer_profile_status/);
  const application = readFileSync(new URL("../app/_platform/LawyerProfessionalProfile.tsx", import.meta.url), "utf8");
  assert.match(application, /lawyer-profile-preview/);
  assert.match(application, /Предпросмотр публичного профиля/);
  assert.match(privatePhotoRoute, /export const GET/);
  assert.match(privatePhotoRoute, /WHERE user_id=\?/);
  assert.match(privatePhotoRoute, /lawyer_profile_status/);
  assert.match(directoryClient, /canReceiveRequests/);
});

test("JURO approval and Top Lawyer remain separate public designations", () => {
  const designationRoute = readFileSync(new URL("../app/api/platform/admin/lawyer-profiles/[profileId]/designation/route.ts", import.meta.url), "utf8");
  const designationService = readFileSync(new URL("../lib/platform/lawyer-profile-designation-service.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0116_lawyer_trust_designations.sql", import.meta.url), "utf8");
  const directory = readFileSync(new URL("../app/_platform/LawyerDirectoryClient.tsx", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../app/_platform/LawyerProfileClient.tsx", import.meta.url), "utf8");
  const staffPanel = readFileSync(new URL("../app/_staff/LawyerTrustDesignationPanel.tsx", import.meta.url), "utf8");
  assert.match(designationRoute, /freshMfaWithinMs: 15 \* 60 \* 1_000/);
  assert.match(designationRoute, /lawyer\.profiles\.moderate/);
  assert.match(designationService, /marketplace_status='public_approved'/);
  assert.match(designationService, /workspace_audit_events/);
  assert.match(migration, /lawyer_profile_trust_designations/);
  assert.match(migration, /append-only/);
  assert.match(directory, /Одобрен JURO/);
  assert.match(directory, /Top Lawyer/);
  assert.match(profile, /Фото:/);
  assert.match(profile, /Критерии Top Lawyer/);
  assert.match(staffPanel, /\/designation/);
  assert.match(staffPanel, /Публичные критерии Top Lawyer/);
});
