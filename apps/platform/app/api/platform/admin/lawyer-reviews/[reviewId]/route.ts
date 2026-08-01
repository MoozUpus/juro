import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest } from "../../../../../../lib/auth/staff-http";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { assertReviewId, hasLikelyPersonalData, lawyerReviewModerationSchema } from "../../../../../../lib/platform/lawyer-review-moderation";

type Context = { params: Promise<{ reviewId: string }> };

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (item) => item.toString(16).padStart(2, "0")).join("");
}

export async function PATCH(request: Request, context: Context) {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "lawyer.reviews.moderate", { freshMfaWithinMs: 15 * 60 * 1000 });
  const parsed = await parseJsonRequest(request, lawyerReviewModerationSchema, 8_192);
  if (!parsed.ok) return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
  const { reviewId: rawReviewId } = await context.params;
  let reviewId: string;
  try { reviewId = assertReviewId(rawReviewId); } catch { return Response.json({ code: "NOT_FOUND" }, { status: 404 }); }
  const db = requireD1();
  const review = await db.prepare(
    "SELECT id,workspace_id AS workspaceId,body,status FROM lawyer_reviews WHERE id=? LIMIT 1",
  ).bind(reviewId).first<{ id: string; workspaceId: string; body: string | null; status: string }>();
  if (!review || review.status !== "pending") return Response.json({ code: "REVIEW_UNAVAILABLE" }, { status: 409 });
  const effectiveBody = parsed.data.moderatedBody ?? review.body;
  if (parsed.data.decision === "approved" && hasLikelyPersonalData(effectiveBody)) {
    return Response.json({ code: "LIKELY_PERSONAL_DATA", error: "Remove personal data before approval." }, { status: 400 });
  }
  const now = isoNow();
  const originalBodySha256 = await sha256(review.body ?? "");
  try {
    const inserted = await db.prepare(
      "INSERT INTO lawyer_review_moderation (id,review_id,moderator_user_id,decision,moderated_body,reason,original_body_sha256,created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).bind(crypto.randomUUID(), review.id, staff.userId, parsed.data.decision, parsed.data.moderatedBody ?? null, parsed.data.reason, originalBodySha256, now).run();
    if (inserted.meta.changes !== 1) return Response.json({ code: "REVIEW_UNAVAILABLE" }, { status: 409 });
  } catch {
    return Response.json({ code: "REVIEW_UNAVAILABLE" }, { status: 409 });
  }
  await db.prepare(
    "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'lawyer_review',?,'lawyer_review_moderated',?,?)",
  ).bind(crypto.randomUUID(), review.workspaceId, staff.userId, review.id, JSON.stringify({ decision: parsed.data.decision, originalBodySha256 }), now).run();
  return Response.json({ ok: true, status: parsed.data.decision }, { headers: { "cache-control": "private, no-store" } });
}