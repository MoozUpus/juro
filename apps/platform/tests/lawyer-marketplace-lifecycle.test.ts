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
import { lawyerTrialReminderStage } from "../lib/platform/lawyer-trial-reminders";
import { lawyerTrialEndsAt, lawyerTrialView } from "../lib/platform/lawyer-trial";
import { lawyerRequestSchema } from "../lib/platform/lawyer-request";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

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

test("a lawyer profile is ready for self-publication only after every required professional field is present", () => {
  assert.equal(isLawyerMarketplaceProfileComplete(completeProfile), true);
  assert.equal(marketplaceStatusAfterProfileEdit(completeProfile), "pending_review");

  const incomplete = { ...completeProfile, profilePhotoKey: null, hasPhone: false };
  assert.deepEqual(missingLawyerMarketplaceFields(incomplete), ["profilePhoto", "phone"]);
  assert.equal(isLawyerMarketplaceProfileComplete(incomplete), false);
  assert.equal(marketplaceStatusAfterProfileEdit(incomplete), "profile_incomplete");
});

test("only a published profile may receive a client request", () => {
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
  assert.equal(uz.title, "Yurist profilingiz e’lon qilishga tayyor");
  assert.doesNotMatch(uz.body, /Izoh:/u);
  const published = localizedLawyerProfileStatusNotification("ru", "public_approved");
  assert.equal(published.title, "Профиль юриста опубликован");
  assert.doesNotMatch(published.body, /одобрен|проверен/iu);
});

test("a first-time client can create a private intake case together with a consented lawyer request", () => {
  const requestInput = readFileSync(new URL("../lib/platform/lawyer-request.ts", import.meta.url), "utf8");
  const requestRoute = readFileSync(new URL("../app/api/platform/lawyer-requests/route.ts", import.meta.url), "utf8");
  const handoffClient = readFileSync(new URL("../app/_platform/LawyerHandoffClient.tsx", import.meta.url), "utf8");

  assert.match(requestInput, /caseId: uuid\.optional\(\)/);
  assert.match(requestRoute, /const autoCreatedCase = !parsed\.data\.caseId/);
  assert.match(requestRoute, /caseScenarioSteps\("other", locale\)/);
  assert.match(requestRoute, /source: "lawyer_handoff_intake"/);
  assert.match(requestRoute, /autoCreatedCase,/);
  assert.match(handoffClient, /Новое приватное дело из заявки/);
  assert.match(handoffClient, /Юрист не получит доступ до conflict check/);
  assert.match(handoffClient, /caseId: caseId \|\| undefined/);
  assert.doesNotMatch(handoffClient, /\|\| !caseId \|\|/);
  assert.doesNotMatch(handoffClient, /!cases\.length \|\|/);

  const parsed = lawyerRequestSchema.safeParse({
    anonymizedSummary: "Нужна первичная консультация по договорному вопросу.",
    serviceCode: "initial_consultation",
    preferredFormat: "video",
    consent: true,
    locale: "ru",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.caseId, undefined);
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
  assert.match(route, /lawyer_consultation_\$\{eventStatus\}/);
  assert.match(route, /transition === "no_show"/);
  assert.match(route, /attendance_outcome/);
  assert.match(route, /UPDATE_LAWYER_CONSULTATION_TRANSITION_SQL/);
  assert.doesNotMatch(route, /CASE WHEN \?='completed' THEN \? ELSE result_note END/);
});

test("lawyer application auto-publishes only after explicit consent and starts a 90-day trial", () => {
  const migration = readFileSync(new URL("../drizzle/0146_lawyer_trial_publication.sql", import.meta.url), "utf8");
  const profileRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/route.ts", import.meta.url), "utf8");
  const submitRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/submit/route.ts", import.meta.url), "utf8");
  assert.match(profileRoute, /lawyer_profile_draft_saved/);
  assert.doesNotMatch(profileRoute, /lawyer_profile_submitted/);
  assert.match(submitRoute, /publicationConsent: z\.literal\(true\)/);
  assert.match(submitRoute, /marketplace_status='public_approved'/);
  assert.match(submitRoute, /missingLawyerMarketplaceFields/);
  assert.match(submitRoute, /lawyer_profile_auto_published/);
  assert.match(submitRoute, /lawyer_trials/);
  assert.match(submitRoute, /lawyerTrialEndsAt/);
  assert.match(submitRoute, /profile_revision=\?/);
  assert.match(submitRoute, /lawyer_profile_publication_events/);
  assert.doesNotMatch(submitRoute, /lawyer_profile_lifecycle_events[\s\S]*auto_publish/);
  assert.match(migration, /DROP TRIGGER IF EXISTS `lawyer_profiles_status_requires_moderation`/);
  assert.match(migration, /NEW\.`publication_consent_at`=NEW\.`public_approved_at`/);
  assert.match(migration, /lawyer_profile_publication_events_no_update/);
  assert.match(migration, /lawyer_profile_publication_events_no_delete/);
});

test("the D1 publication guard accepts consent evidence and still rejects an unaudited status change", () => {
  const { sqlite } = sqliteD1Fixture();
  const now = "2026-08-22T00:00:00.000Z";
  try {
    sqlite.prepare(`INSERT INTO user_profiles(id,email,locale,account_type,created_at,updated_at)
      VALUES ('lawyer-self-publish','self-publish@example.test','ru','lawyer',?,?)`).run(now, now);
    sqlite.prepare(`INSERT INTO lawyer_profiles(id,user_id,display_name,status,marketplace_status,created_at,updated_at)
      VALUES ('profile-self-publish','lawyer-self-publish','Юрист','pending','pending_review',?,?)`).run(now, now);
    assert.throws(() => sqlite.prepare(`UPDATE lawyer_profiles
      SET status='public_approved',marketplace_status='public_approved',public_approved_at=?
      WHERE id='profile-self-publish'`).run(now), /moderation or publication consent evidence required/);
    sqlite.prepare(`UPDATE lawyer_profiles
      SET status='public_approved',marketplace_status='public_approved',public_approved_at=?,publication_consent_at=?
      WHERE id='profile-self-publish'`).run(now, now);
    sqlite.prepare(`INSERT INTO lawyer_profile_publication_events
      (id,lawyer_profile_id,actor_user_id,profile_revision,previous_profile_status,previous_marketplace_status,publication_consent_at,created_at)
      VALUES ('publication-event','profile-self-publish','lawyer-self-publish',1,'pending','pending_review',?,?)`).run(now, now);
    assert.equal((sqlite.prepare("SELECT status FROM lawyer_profiles WHERE id='profile-self-publish'").get() as { status: string }).status, "public_approved");
    assert.throws(() => sqlite.prepare("DELETE FROM lawyer_profile_publication_events WHERE id='publication-event'").run(), /append-only/);
  } finally {
    sqlite.close();
  }
});

test("lawyer service details and six-step application are persisted and reviewable", () => {
  const migration = readFileSync(new URL("../drizzle/0145_lawyer_profile_services.sql", import.meta.url), "utf8");
  const profileRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/route.ts", import.meta.url), "utf8");
  const application = readFileSync(new URL("../app/_platform/LawyerProfessionalProfile.tsx", import.meta.url), "utf8");
  const adminDetail = readFileSync(new URL("../app/api/platform/admin/lawyer-profiles/[profileId]/route.ts", import.meta.url), "utf8");
  const adminPhoto = readFileSync(new URL("../app/api/platform/admin/lawyer-profiles/[profileId]/photo/route.ts", import.meta.url), "utf8");
  const adminInbox = readFileSync(new URL("../app/_staff/LawyerProfileModerationInbox.tsx", import.meta.url), "utf8");
  assert.match(migration, /consultation_duration_minutes/);
  assert.match(migration, /additional_services_json/);
  assert.match(migration, /BETWEEN 15 AND 480/);
  assert.doesNotMatch(migration, /DROP\s+TABLE|DELETE\s+FROM/iu);
  assert.match(profileRoute, /consultation_duration_minutes/);
  assert.match(profileRoute, /additional_services_json/);
  assert.match(application, /Стандартная длительность консультации/);
  assert.match(application, /Дополнительные услуги через запятую/);
  assert.match(application, /Шаг 4 · Расписание/);
  assert.match(application, /Согласиться и опубликовать/);
  assert.match(adminDetail, /lawyer_profile_moderation/);
  assert.match(adminDetail, /lawyer_profile_lifecycle_events/);
  assert.match(adminDetail, /lawyer_availability_rules/);
  assert.match(adminPhoto, /lawyer\.profiles\.moderate/);
  assert.match(adminPhoto, /freshMfaWithinMs: 15 \* 60 \* 1_000/);
  assert.match(adminInbox, /REVIEW VIEW/);
  assert.match(adminInbox, /\/lifecycle/);
});

test("availability-only edits preserve an approved public profile", () => {
  const profileRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/route.ts", import.meta.url), "utf8");
  assert.match(profileRoute, /preservesPublishedProfile/);
  assert.match(profileRoute, /public_approved_at=CASE WHEN \?='public_approved' THEN public_approved_at ELSE NULL END/);
  assert.match(profileRoute, /publicationPreserved: preservesPublishedProfile/);
  assert.match(profileRoute, /lawyer_profile_published_edit_saved/);
  assert.match(profileRoute, /lawyer_profile_revisions/);
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
    acceptingNewRequests: 1,
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

test("a completed profile stays private until self-publication and retains a self-only preview", () => {
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

test("published profiles remain discoverable while request intake is paused", () => {
  const [lawyer] = projectPublicLawyerDirectory([{
    id: "paused-lawyer",
    displayName: "Юрист JURO",
    specialtiesJson: '["Договоры"]',
    languagesJson: '["ru","uz"]',
    experienceYears: 5,
    priceDescription: "По договорённости",
    availabilityStatus: "available",
    nextAvailableAt: null,
    advocateStatus: "declared",
    firmName: null,
    bio: null,
    marketplaceStatus: "public_approved",
    acceptingNewRequests: 0,
  }], [], []);
  assert.equal(lawyer.marketplaceStatus, "public_approved");
  assert.equal(lawyer.acceptingNewRequests, false);
  assert.equal(lawyer.canReceiveRequests, false);
  const requestRoute = readFileSync(new URL("../app/api/platform/lawyer-requests/route.ts", import.meta.url), "utf8");
  assert.match(requestRoute, /accepting_new_requests=1/);
});

test("trial expiry can limit intake without silently unpublishing a profile", () => {
  const base = {
    id: "expired-trial-lawyer", displayName: "Юрист JURO", specialtiesJson: '[]', languagesJson: '["ru"]',
    experienceYears: 5, priceDescription: "По договорённости", availabilityStatus: "available",
    nextAvailableAt: null, advocateStatus: "declared", firmName: null, bio: null,
    marketplaceStatus: "public_approved", acceptingNewRequests: 1,
    trialEndsAt: new Date(Date.now() - 60_000).toISOString(),
  } as const;
  const [limited] = projectPublicLawyerDirectory([{ ...base, trialPostExpiryMode: "limit_new_requests" }], [], []);
  const [published] = projectPublicLawyerDirectory([{ ...base, trialPostExpiryMode: "stay_published" }], [], []);
  assert.equal(limited.marketplaceStatus, "public_approved");
  assert.equal(limited.trialExpired, true);
  assert.equal(limited.canReceiveRequests, false);
  assert.equal(published.canReceiveRequests, true);
  const requestRoute = readFileSync(new URL("../app/api/platform/lawyer-requests/route.ts", import.meta.url), "utf8");
  const publicDirectory = readFileSync(new URL("../app/api/public/lawyers/route.ts", import.meta.url), "utf8");
  assert.match(requestRoute, /post_expiry_mode IN \('limit_new_requests','hide_profile'\)/);
  assert.match(publicDirectory, /post_expiry_mode='hide_profile'/);
});

test("lawyer workspace maps parallel D1 results to the correct response fields", () => {
  const route = readFileSync(new URL("../app/api/platform/lawyer-workspace/route.ts", import.meta.url), "utf8");
  assert.match(route, /\[requests, matters, messages, unreadMessages, documents, tasks, taskComments, ownDocuments, consultations, caseEvents\]/);
  assert.ok(route.indexOf("FROM tasks t JOIN lawyer_access_grants") < route.indexOf("FROM lawyer_task_comments c"));
  assert.ok(route.indexOf("FROM lawyer_task_comments c") < route.indexOf("FROM documents d JOIN user_profiles"));
});

test("profile deletion is a controlled admin decision with append-only evidence", () => {
  const migration = readFileSync(new URL("../drizzle/0146_lawyer_trial_publication.sql", import.meta.url), "utf8");
  const ownerRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/deletion-request/route.ts", import.meta.url), "utf8");
  const staffRoute = readFileSync(new URL("../app/api/platform/admin/lawyer-profile-deletion-requests/[requestId]/route.ts", import.meta.url), "utf8");
  assert.match(migration, /lawyer_profile_deletion_requests_no_delete/);
  assert.match(migration, /lawyer_profile_deletion_requests_terminal_guard/);
  assert.match(ownerRoute, /confirmation: z\.literal\(true\)/);
  assert.match(ownerRoute, /lawyer_profile_deletion_requested/);
  assert.match(ownerRoute, /admin_lawyer_profile_deletion/);
  assert.match(staffRoute, /freshMfaWithinMs: 15 \* 60 \* 1_000/);
  assert.match(staffRoute, /lawyer_profile_deletion_approved/);
  assert.match(staffRoute, /lawyer_profile_lifecycle_events/);
  assert.match(staffRoute, /marketplace_status='archived'/);
});

test("the 90-day trial exposes stable expiry and non-duplicating reminder stages", () => {
  const startsAt = "2026-08-22T00:00:00.000Z";
  const endsAt = lawyerTrialEndsAt(startsAt);
  assert.equal(endsAt, "2026-11-20T00:00:00.000Z");
  assert.equal(lawyerTrialView({ id: "trial", startsAt, endsAt, status: "active", postExpiryMode: "stay_published" }, Date.parse("2026-11-19T00:00:00.000Z")).daysRemaining, 1);
  const blank = { endsAt, reminder30SentAt: null, reminder7SentAt: null, reminder1SentAt: null, reminderExpiredSentAt: null };
  assert.equal(lawyerTrialReminderStage(blank, Date.parse("2026-10-21T00:00:00.000Z")), "30");
  assert.equal(lawyerTrialReminderStage({ ...blank, reminder30SentAt: "sent" }, Date.parse("2026-11-13T00:00:00.000Z")), "7");
  assert.equal(lawyerTrialReminderStage({ ...blank, reminder30SentAt: "sent", reminder7SentAt: "sent" }, Date.parse("2026-11-19T00:00:00.000Z")), "1");
  assert.equal(lawyerTrialReminderStage({ ...blank, reminder30SentAt: "sent", reminder7SentAt: "sent", reminder1SentAt: "sent" }, Date.parse(endsAt)), "expired");
  assert.equal(lawyerTrialReminderStage({ ...blank, reminder30SentAt: "sent", reminder7SentAt: "sent", reminder1SentAt: "sent", reminderExpiredSentAt: "sent" }, Date.parse(endsAt)), null);
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
