import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  isLawyerMarketplaceProfileComplete,
  marketplaceStatusAfterProfileEdit,
  mayReceiveLawyerRequests,
  missingLawyerMarketplaceFields,
  type LawyerMarketplaceCompletionInput,
} from "../lib/platform/lawyer-marketplace";

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
  assert.equal(mayReceiveLawyerRequests("rejected"), false);
  assert.equal(mayReceiveLawyerRequests("public_approved"), true);
});

test("profile photos remain fail-closed until the malware scanner verifies their checksum", () => {
  const route = readFileSync(new URL("../app/api/platform/lawyer-profile/photo/route.ts", import.meta.url), "utf8");
  assert.match(route, /malwareScannerResponseSchema/);
  assert.match(route, /MALWARE_SCANNER_UNAVAILABLE/);
  assert.match(route, /scanVerdict !== "clean"/);
  assert.match(route, /parsed\.data\.sourceSha256 !== checksum/);
  assert.ok(route.indexOf("const scanVerdict") < route.indexOf("const objectKey"));
});

test("a completed profile under review is visible but cannot receive a request", () => {
  const publicPhotoRoute = readFileSync(new URL("../app/api/public/lawyers/[profileId]/photo/route.ts", import.meta.url), "utf8");
  const directoryRoute = readFileSync(new URL("../app/api/platform/lawyers/route.ts", import.meta.url), "utf8");
  const publicDirectoryRoute = readFileSync(new URL("../app/api/public/lawyers/route.ts", import.meta.url), "utf8");
  const publicDetailRoute = readFileSync(new URL("../app/api/public/lawyers/[profileId]/route.ts", import.meta.url), "utf8");
  const directoryClient = readFileSync(new URL("../app/_platform/LawyerDirectoryClient.tsx", import.meta.url), "utf8");
  const privatePhotoRoute = readFileSync(new URL("../app/api/platform/lawyer-profile/photo/route.ts", import.meta.url), "utf8");
  assert.match(publicPhotoRoute, /marketplace_status='pending_review' AND status='pending'/);
  assert.match(directoryRoute, /marketplace_status='pending_review' AND status='pending'/);
  assert.match(publicDirectoryRoute, /marketplace_status='pending_review' AND status='pending'/);
  assert.match(publicDetailRoute, /marketplace_status='pending_review' AND status='pending'/);
  assert.doesNotMatch(publicDirectoryRoute, /phone|user_profiles|moderation_notes/i);
  assert.match(directoryClient, /Профиль на проверке JURO/);
  assert.match(directoryClient, /Запись после проверки/);
  assert.match(privatePhotoRoute, /export const GET/);
  assert.match(privatePhotoRoute, /WHERE user_id=\?/);
});
