import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { lawyerLandingDestination, type LawyerEntryProfile } from "../lib/platform/lawyer-entry-routing";
import { lawyerDocumentStatus, lawyerIntlLocale, lawyerText } from "../lib/platform/lawyer-localization";
import { lawyerOfferCreateSchema, lawyerOfferError } from "../lib/platform/lawyer-offer";
import { lawyerProfileError, lawyerProfileUpdateSchema } from "../lib/platform/lawyer-profile";
import { localizedLawyerProfileStatusNotification } from "../lib/platform/lawyer-profile-notifications";
import {
  formatLawyerRequestDate,
  lawyerRequestFormatLabel,
  lawyerRequestServiceLabel,
} from "../lib/platform/lawyer-request-presentation";
import { lawyerRequestMessageError, lawyerRequestMessageSchema } from "../lib/platform/lawyer-request-message";
import { localizedHandoffError, lawyerRequestSchema } from "../lib/platform/lawyer-request";
import { lawyerReviewModerationSchema } from "../lib/platform/lawyer-review-moderation";
import { localizedLawyerReviewReplyError, lawyerReviewReplySubmissionSchema } from "../lib/platform/lawyer-review-reply";
import { lawyerReviewSchema } from "../lib/platform/lawyer-review";
import { lawyerTaskOperationSchema, lawyerWorkspaceOperationError } from "../lib/platform/lawyer-workspace-operations";

const uuid = "00000000-0000-4000-8000-000000000001";

test("lawyer locale helpers and public routing preserve English explicitly", () => {
  assert.equal(lawyerText("en", "Русский", "O‘zbekcha", "English"), "English");
  assert.equal(lawyerIntlLocale("en"), "en-GB");
  assert.equal(lawyerDocumentStatus("Черновик", "en"), "Draft");

  const profile: LawyerEntryProfile = {
    locale: "en",
    accountType: "lawyer",
    onboardingCompleted: true,
    lawyerProfileStatus: "public_approved",
    lawyerMarketplaceStatus: "public_approved",
  };
  assert.equal(lawyerLandingDestination(profile, true, "lawyer.juro.uz"), "/en/dashboard");
  assert.equal(
    lawyerLandingDestination(profile, false, "app.juro.uz"),
    "https://lawyer.juro.uz/en/dashboard",
  );
});

test("lawyer marketplace schemas accept English without changing RU or UZ contracts", () => {
  assert.equal(lawyerOfferCreateSchema.safeParse({
    scopeDescription: "Review the proposed agreement and advise the client.",
    priceDescription: "Fixed fee",
    durationDescription: "Three business days",
    locale: "en",
  }).success, true);
  assert.equal(lawyerRequestSchema.safeParse({
    caseId: uuid,
    anonymizedSummary: "Contract review is required before the signing date.",
    consent: true,
    locale: "en",
  }).success, true);
  assert.equal(lawyerRequestMessageSchema.safeParse({ body: "Please review the attached evidence.", locale: "en" }).success, true);
  assert.equal(lawyerProfileUpdateSchema.safeParse({ displayName: "JURO Counsel", locale: "en" }).success, true);
  assert.equal(lawyerReviewSchema.safeParse({
    overallRating: 5,
    speedRating: 5,
    qualityRating: 5,
    communicationRating: 5,
    body: "Clear, timely and practical advice.",
    locale: "en",
  }).success, true);
  assert.equal(lawyerReviewModerationSchema.safeParse({ decision: "approved", reason: "Verified review", locale: "en" }).success, true);
  assert.equal(lawyerReviewReplySubmissionSchema.safeParse({ body: "Thank you for your feedback.", clientRequestId: uuid, locale: "en" }).success, true);
  assert.equal(lawyerTaskOperationSchema.safeParse({ action: "create", requestId: uuid, title: "Review evidence", locale: "en" }).success, true);
});

test("lawyer-facing labels, errors and notifications have professional English copy", () => {
  assert.equal(lawyerRequestServiceLabel("document_review", "en"), "Document review");
  assert.equal(lawyerRequestFormatLabel("office", "en"), "In person");
  assert.match(formatLawyerRequestDate("2026-09-05T09:30:00.000Z", "en"), /5 Sept 2026/u);
  assert.equal(lawyerOfferError("en", "OFFER_UNAVAILABLE"), "The offer is unavailable.");
  assert.equal(localizedHandoffError("en", "LAWYER_UNAVAILABLE"), "The selected lawyer is currently unavailable.");
  assert.equal(lawyerRequestMessageError("en", "INVALID_INPUT"), "Add a message or select a document.");
  assert.equal(lawyerProfileError("en", "PROFILE_LOCKED"), "This profile is temporarily restricted by moderation and cannot be edited.");
  assert.equal(lawyerWorkspaceOperationError("en", "TASK_UNAVAILABLE"), "This task cannot be updated.");
  assert.equal(localizedLawyerReviewReplyError("en", "REVIEW_UNAVAILABLE"), "The published review is unavailable for a reply.");

  const notification = localizedLawyerProfileStatusNotification(
    "en",
    "changes_requested",
    "Add your bar registration details.",
  );
  assert.equal(notification.title, "Your lawyer profile needs changes");
  assert.match(notification.body, /Note: Add your bar registration details\./u);
});

test("every owned lawyer surface uses the three-locale copy helper", () => {
  const components = [
    "LawyerConsultationPanel",
    "LawyerDirectoryClient",
    "LawyerDocumentRequests",
    "LawyerHandoffClient",
    "LawyerPhoneContact",
    "LawyerProfessionalProfile",
    "LawyerProfileClient",
    "LawyerRequestMessages",
    "LawyerRequestsClient",
    "LawyerReviewForm",
    "LawyerReviewReplyForm",
    "LawyerWorkspaceClient",
  ];
  for (const component of components) {
    const source = readFileSync(new URL(`../app/_platform/${component}.tsx`, import.meta.url), "utf8");
    assert.match(source, /lawyerText\(/u, `${component} must select explicit RU, UZ and EN copy`);
    assert.doesNotMatch(source, /\blocale\s*===\s*["'](?:ru|uz)["']|\bru\s*\?/u, `${component} must not use a binary locale fallback`);
  }
});

test("lawyer service proposals persist, project and fail closed on English translations", () => {
  const proposalRoute = readFileSync(new URL("../app/api/cases/[caseId]/proposals/route.ts", import.meta.url), "utf8");
  const acceptRoute = readFileSync(new URL("../app/api/cases/[caseId]/proposals/[proposalId]/accept/route.ts", import.meta.url), "utf8");

  for (const token of ["titleEn", "scopeEn", "durationDescriptionEn", "title_en", "scope_en", "duration_description_en"]) {
    assert.match(proposalRoute, new RegExp(token, "u"));
  }
  assert.match(acceptRoute, /locale:\s*z\.enum\(\["ru",\s*"uz",\s*"en"\]\)/u);
  assert.match(acceptRoute, /PROPOSAL_TRANSLATION_UNAVAILABLE/u);
  assert.match(acceptRoute, /!proposal\.titleEn\s*\|\|\s*!proposal\.scopeEn\s*\|\|\s*!proposal\.durationDescriptionEn/u);
});

test("lawyer APIs preserve English locale and never leak mixed-language fallback copy", () => {
  const consultationRoute = readFileSync(new URL("../app/api/platform/lawyer-consultations/route.ts", import.meta.url), "utf8");
  const consultationPanel = readFileSync(new URL("../app/_platform/LawyerConsultationPanel.tsx", import.meta.url), "utf8");
  const scheduleRoute = readFileSync(new URL("../app/api/platform/lawyer-schedule/route.ts", import.meta.url), "utf8");
  const profileSubmitRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/submit/route.ts", import.meta.url), "utf8");
  const profilePhotoRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/photo/route.ts", import.meta.url), "utf8");
  const taskRoute = readFileSync(new URL("../app/api/platform/lawyer-tasks/route.ts", import.meta.url), "utf8");

  for (const source of [consultationRoute, scheduleRoute, profileSubmitRoute]) {
    assert.match(source, /\["ru",\s*"uz",\s*"en"\]/u);
  }
  assert.match(consultationPanel, /JSON\.stringify\(\{\s*requestId,\s*locale,\s*\.\.\.payload\s*\}\)/u);
  assert.match(profilePhotoRoute, /WHEN u\.locale='en' THEN 'en'/u);
  assert.match(consultationRoute, /consultationStatusNotification\(status,\s*recipientLocale\)/u);
  assert.match(taskRoute, /lawyerText\(participant\.clientLocale/u);

  const notificationRoutes = [
    "../app/api/platform/lawyer-document-requests/route.ts",
    "../app/api/platform/lawyer-tasks/route.ts",
    "../app/api/platform/lawyer-requests/[requestId]/messages/route.ts",
  ];
  for (const path of notificationRoutes) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /lawyerText\(/u, `${path} must localize notifications for all three locales`);
    assert.match(source, /\b(?:A lawyer|A client|New case message|Open the case|The task status)/u, `${path} must contain explicit English notification copy`);
  }
  const documentRequestsRoute = readFileSync(new URL("../app/api/platform/lawyer-document-requests/route.ts", import.meta.url), "utf8");
  const messagesRoute = readFileSync(new URL("../app/api/platform/lawyer-requests/[requestId]/messages/route.ts", import.meta.url), "utf8");
  const profileRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(documentRequestsRoute, /lawyerWorkspaceOperationError\("ru"/u);
  assert.doesNotMatch(messagesRoute, /lawyerRequestMessageError\("ru"/u);
  assert.match(documentRequestsRoute, /lawyerText\(participant\.(?:clientLocale|lawyerLocale)/u);
  assert.match(messagesRoute, /lawyerText\(recipientLocale/u);
  assert.doesNotMatch(profileRoute, /lawyerProfileError\("ru"/u);

  const codeOnlyRoutes = [
    "../app/api/platform/lawyer-workspace/route.ts",
    "../app/api/platform/lawyer-requests/[requestId]/access-grant/route.ts",
    "../app/api/platform/lawyer-requests/[requestId]/completion/route.ts",
    "../app/api/platform/lawyer-requests/[requestId]/conflict-check/route.ts",
    "../app/api/platform/lawyer-requests/[requestId]/offer/route.ts",
    "../app/api/platform/lawyer-requests/[requestId]/phone/route.ts",
  ];
  for (const path of codeOnlyRoutes) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /[А-Яа-яЁё]/u, `${path} must not return mixed RU/UZ fallback copy without a locale`);
  }
});

test("lawyer moderation consoles provide complete English copy and navigation", () => {
  const components = [
    "LawyerProfileModerationInbox",
    "LawyerTrustDesignationPanel",
    "LawyerReviewModerationInbox",
    "LawyerReviewReplyModerationInbox",
  ];
  for (const component of components) {
    const source = readFileSync(new URL(`../app/_staff/${component}.tsx`, import.meta.url), "utf8");
    assert.match(source, /PlatformLocale/u, `${component} must accept the complete platform locale`);
    assert.match(source, /(?:English|Lawyer|lawyer|Trust|trust|Profile|profile|Review|review)/u, `${component} must contain explicit professional English copy`);
    assert.doesNotMatch(source, /type Locale\s*=\s*"ru"\s*\|\s*"uz"|\blocale\s*===\s*["'](?:ru|uz)["']|\bru\s*\?/u, `${component} must not use a binary locale fallback`);
  }
  const profileInbox = readFileSync(new URL("../app/_staff/LawyerProfileModerationInbox.tsx", import.meta.url), "utf8");
  const reviewInbox = readFileSync(new URL("../app/_staff/LawyerReviewModerationInbox.tsx", import.meta.url), "utf8");
  const reviewRoute = readFileSync(new URL("../app/api/platform/admin/lawyer-reviews/[reviewId]/route.ts", import.meta.url), "utf8");
  assert.match(profileInbox, /"Lawyer applications"/u);
  assert.match(reviewInbox, /"Lawyer review moderation"/u);
  assert.match(profileInbox, /\["ru",\s*"uz",\s*"en"\]/u);
  assert.match(reviewInbox, /\["ru",\s*"uz",\s*"en"\]/u);
  assert.match(reviewRoute, /lawyerText\(\s*parsed\.data\.locale/u);
  assert.match(reviewRoute, /"Remove personal data before approval\."/u);
});
