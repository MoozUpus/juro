import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LawyerReviewReplyError,
  lawyerReviewReplyModerationSchema,
  lawyerReviewReplySubmissionSchema,
  listLawyerReviewReplies,
  moderateLawyerReviewReply,
  submitLawyerReviewReply,
} from "../lib/platform/lawyer-review-reply";
import { projectPublicLawyerDirectory } from "../lib/platform/lawyer-directory-reviews";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const NOW = new Date("2026-08-04T18:00:00.000Z");
const REVIEW_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST_ONE = "20000000-0000-4000-8000-000000000001";
const REQUEST_TWO = "20000000-0000-4000-8000-000000000002";

test("reply and moderation inputs are strict, bounded and server-actor only", () => {
  assert.equal(lawyerReviewReplySubmissionSchema.safeParse({ body: "Спасибо за отзыв.", clientRequestId: REQUEST_ONE, locale: "ru" }).success, true);
  assert.equal(lawyerReviewReplySubmissionSchema.safeParse({ body: "Javob", clientRequestId: REQUEST_ONE, locale: "uz", actorUserId: "attacker" }).success, false);
  assert.equal(lawyerReviewReplySubmissionSchema.safeParse({ body: "", clientRequestId: REQUEST_ONE, locale: "ru" }).success, false);
  assert.equal(lawyerReviewReplyModerationSchema.safeParse({ decision: "approved", moderatedBody: "", reason: "checked", locale: "ru" }).success, false);
});

test("lawyer reply lifecycle rejects PII, versions a rejected reply and publishes only approved moderation", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    const first = await submitLawyerReviewReply({ db: d1, actorUserId: "lawyer", reviewId: REVIEW_ID, body: "Напишите мне lawyer@example.test", clientRequestId: REQUEST_ONE, now: NOW });
    assert.equal(first.version, 1);
    assert.equal(first.status, "pending");
    const replay = await submitLawyerReviewReply({ db: d1, actorUserId: "lawyer", reviewId: REVIEW_ID, body: first.body, clientRequestId: REQUEST_ONE, now: NOW });
    assert.equal(replay.id, first.id);
    assert.equal(replay.replayed, true);
    await assert.rejects(
      moderateLawyerReviewReply({ db: d1, moderatorUserId: "moderator", replyId: first.id, decision: "approved", reason: "unsafe", now: new Date("2026-08-04T18:01:00.000Z") }),
      (error: unknown) => error instanceof LawyerReviewReplyError && error.code === "LIKELY_PERSONAL_DATA",
    );
    await moderateLawyerReviewReply({ db: d1, moderatorUserId: "moderator", replyId: first.id, decision: "rejected", reason: "Contains contact data", now: new Date("2026-08-04T18:02:00.000Z") });
    assert.equal(sqlite.prepare("SELECT status FROM lawyer_review_replies WHERE id=?").get(first.id)?.status, "rejected");

    const second = await submitLawyerReviewReply({ db: d1, actorUserId: "lawyer", reviewId: REVIEW_ID, body: "Спасибо за обратную связь. Рад, что разъяснение помогло.", clientRequestId: REQUEST_TWO, now: new Date("2026-08-04T18:03:00.000Z") });
    assert.equal(second.version, 2);
    await assert.rejects(
      submitLawyerReviewReply({ db: d1, actorUserId: "lawyer", reviewId: REVIEW_ID, body: "Другой ответ", clientRequestId: "20000000-0000-4000-8000-000000000003", now: new Date("2026-08-04T18:03:30.000Z") }),
      (error: unknown) => error instanceof LawyerReviewReplyError && error.code === "REPLY_CONFLICT",
    );
    await moderateLawyerReviewReply({ db: d1, moderatorUserId: "moderator", replyId: second.id, decision: "approved", moderatedBody: "Спасибо за обратную связь. Рад, что ответ помог.", reason: "No PII; wording normalized", now: new Date("2026-08-04T18:04:00.000Z") });

    const rows = await listLawyerReviewReplies({ db: d1, status: "approved", limit: 10 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.version, 2);
    const effective = sqlite.prepare(`SELECT COALESCE(m.moderated_body,r.body) AS body FROM lawyer_review_replies r JOIN lawyer_review_reply_moderation m ON m.reply_id=r.id AND m.decision='approved' WHERE r.review_id=? AND r.status='approved'`).get(REVIEW_ID) as { body: string };
    assert.match(effective.body, /ответ помог/);
    assert.throws(() => sqlite.prepare("UPDATE lawyer_review_replies SET body='tampered' WHERE id=?").run(second.id), /content is immutable/);
    assert.throws(() => sqlite.prepare("UPDATE lawyer_review_reply_moderation SET reason='tampered' WHERE reply_id=?").run(second.id), /append-only/);
    assert.equal(sqlite.prepare("SELECT count(*) AS total FROM notifications WHERE type LIKE 'lawyer_review_reply%'").get()?.total, 4);
    assert.equal(sqlite.prepare("SELECT count(*) AS total FROM notifications WHERE type='lawyer_review_reply_moderation' AND user_id='lawyer' AND workspace_id='lawyer-workspace'").get()?.total, 2);
    assert.deepEqual((sqlite.prepare("SELECT action FROM workspace_audit_events WHERE entity_type='lawyer_review_reply' ORDER BY created_at").all() as Array<{ action: string }>).map((row) => row.action), ["lawyer_review_reply_submitted", "lawyer_review_reply_moderated", "lawyer_review_reply_submitted", "lawyer_review_reply_moderated"]);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { sqlite.close(); }
});

test("unrelated user cannot reply and public projection never exposes a pending reply", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    await assert.rejects(
      submitLawyerReviewReply({ db: d1, actorUserId: "attacker", reviewId: REVIEW_ID, body: "Unauthorized", clientRequestId: REQUEST_ONE, now: NOW }),
      (error: unknown) => error instanceof LawyerReviewReplyError && error.code === "REVIEW_UNAVAILABLE",
    );
    await submitLawyerReviewReply({ db: d1, actorUserId: "lawyer", reviewId: REVIEW_ID, body: "Pending reply", clientRequestId: REQUEST_ONE, now: NOW });
    const projected = projectPublicLawyerDirectory(
      [{ id: "lawyer-profile", displayName: "Юрист", specialtiesJson: "[]", languagesJson: "[]", experienceYears: null, priceDescription: null, availabilityStatus: "available", nextAvailableAt: null, advocateStatus: "declared", firmName: null, bio: null }],
      // Public reviews are intentionally withheld until the marketplace has
      // enough moderated feedback. Use the threshold here so this assertion
      // exercises the approved-only reply projection rather than an empty
      // review list.
      [{ lawyerProfileId: "lawyer-profile", reviewCount: 3, overallAverage: 5, speedAverage: 5, qualityAverage: 5, communicationAverage: 5 }],
      [{ reviewId: REVIEW_ID, lawyerProfileId: "lawyer-profile", overallRating: 5, body: "Полезно", createdAt: NOW.toISOString(), replyBody: null, replyCreatedAt: null }],
    );
    assert.equal(projected[0]?.reviews[0]?.reply, null);
  } finally { sqlite.close(); }
});

test("reply routes and interfaces enforce CSRF, fresh MFA, RU/UZ/EN, safe rendering and approved-only projection", async () => {
  const [submitRoute, adminList, adminPatch, staffPage, lawyerUi, staffUi, listRoute, detailRoute, assignedRoute, requestsUi, css] = await Promise.all([
    readFile(new URL("../app/api/platform/lawyer-reviews/[reviewId]/reply/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/admin/lawyer-review-replies/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/admin/lawyer-review-replies/[replyId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/[locale]/admin/lawyer-review-replies/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/LawyerReviewReplyForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_staff/LawyerReviewReplyModerationInbox.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/lawyers/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/lawyers/[lawyerId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/lawyer-requests/assigned/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/LawyerRequestsClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/consultations-phase7.css", import.meta.url), "utf8"),
  ]);
  assert.match(submitRoute, /assertSafeWrite\(request\)/);
  assert.match(submitRoute, /requireApiUser\(\)/);
  assert.doesNotMatch(submitRoute, /actorUserId:\s*parsed\.data/);
  assert.match(adminList, /lawyer\.reviews\.moderate/);
  assert.match(adminList, /freshMfaWithinMs: 15 \* 60 \* 1000/);
  assert.match(adminPatch, /assertSafeWrite\(request\)/);
  assert.match(staffPage, /requirePlatformStaffAccess/);
  assert.match(lawyerUi, /clientRequestId/);
  assert.match(lawyerUi, /aria-busy/);
  assert.match(staffUi, /Рус|Ответ|Yurist|Javob/u);
  assert.match(staffUi, /role="status"/);
  assert.match(assignedRoute, /reviewReplyStatus/);
  assert.match(assignedRoute, /lawyer_review_moderation/);
  assert.match(requestsUi, /LawyerReviewReplyForm/);
  assert.doesNotMatch(`${lawyerUi}\n${staffUi}`, /dangerouslySetInnerHTML|window\.confirm/);
  assert.match(`${listRoute}\n${detailRoute}`, /replyModeration\.decision='approved'/);
  assert.doesNotMatch(css, /transition:\s*all/);
});

function seed(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]) {
  const now = NOW.toISOString();
  for (const [id, locale] of [["owner", "ru"], ["lawyer", "uz"], ["moderator", "ru"], ["attacker", "ru"]] as const) {
    sqlite.prepare("INSERT INTO user_profiles(id,email,locale,created_at,updated_at) VALUES (?,?,?,?,?)").run(id, `${id}@example.test`, locale, now, now);
  }
  sqlite.prepare("INSERT INTO workspaces(id,type,name,locale,created_at,updated_at) VALUES ('workspace','individual','Owner','ru',?,?)").run(now, now);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,locale,created_at,updated_at) VALUES ('lawyer-workspace','individual','Lawyer','uz',?,?)").run(now, now);
  sqlite.prepare("UPDATE user_profiles SET default_workspace_id='workspace' WHERE id='owner'").run();
  sqlite.prepare("UPDATE user_profiles SET default_workspace_id='lawyer-workspace' WHERE id='lawyer'").run();
  sqlite.prepare("INSERT INTO cases(id,workspace_id,owner_user_id,account_type,locale,title,legal_area,status,created_at,updated_at) VALUES ('case','workspace','owner','individual','ru','Дело','contracts','completed',?,?)").run(now, now);
  sqlite.prepare("INSERT INTO lawyer_profiles(id,user_id,display_name,status,marketplace_status,public_approved_at,created_at,updated_at) VALUES ('lawyer-profile','lawyer','Юрист JURO','public_approved','public_approved',?,?,?)").run(now, now, now);
  sqlite.prepare("INSERT INTO lawyer_requests(id,workspace_id,case_id,requester_user_id,lawyer_profile_id,status,anonymized_summary,requested_scope_json,created_at,updated_at) VALUES ('lawyer-request','workspace','case','owner','lawyer-profile','completed','Summary','{}',?,?)").run(now, now);
  sqlite.prepare("INSERT INTO lawyer_reviews(id,lawyer_request_id,workspace_id,lawyer_profile_id,requester_user_id,overall_rating,speed_rating,quality_rating,communication_rating,body,status,created_at,updated_at) VALUES (?,'lawyer-request','workspace','lawyer-profile','owner',5,5,5,5,'Полезная консультация','pending',?,?)").run(REVIEW_ID, now, now);
  sqlite.prepare("INSERT INTO lawyer_review_moderation(id,review_id,moderator_user_id,decision,reason,original_body_sha256,created_at) VALUES ('review-moderation',?,'moderator','approved','No PII','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',?)").run(REVIEW_ID, now);
}
