import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { lawyerOfferCreateSchema, lawyerOfferError, lawyerOfferResponseSchema } from "../../../../../../lib/platform/lawyer-offer";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

type Context = { params: Promise<{ requestId: string }> };

type OfferRow = { id: string; version: number; status: string; scopeDescription: string; priceDescription: string; durationDescription: string; createdAt: string; updatedAt: string; respondedAt?: string | null };

export const GET = withApiErrors(async function GET(_request: Request, context: Context) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { requestId } = await context.params;
  const db = requireD1();
  const ownerOffer = await db.prepare(
    `SELECT o.id,o.version,o.status,o.scope_description AS scopeDescription,o.price_description AS priceDescription,o.duration_description AS durationDescription,o.created_at AS createdAt,o.updated_at AS updatedAt,o.responded_at AS respondedAt
     FROM lawyer_offers o JOIN lawyer_requests r ON r.id=o.lawyer_request_id
     WHERE r.id=? AND r.workspace_id=? AND r.requester_user_id=? ORDER BY o.version DESC LIMIT 1`,
  ).bind(requestId, workspace.id, user.id).first<OfferRow>();
  if (ownerOffer) return response({ offer: ownerOffer, audience: "requester" });

  const lawyerOffer = await db.prepare(
    `SELECT o.id,o.version,o.status,o.scope_description AS scopeDescription,o.price_description AS priceDescription,o.duration_description AS durationDescription,o.created_at AS createdAt,o.updated_at AS updatedAt,o.responded_at AS respondedAt
     FROM lawyer_offers o
     JOIN lawyer_requests r ON r.id=o.lawyer_request_id
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id AND p.user_id=? AND p.status='public_approved' AND p.marketplace_status='public_approved'
     JOIN lawyer_access_grants g ON g.lawyer_request_id=r.id AND g.lawyer_user_id=? AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?)
     WHERE r.id=? ORDER BY o.version DESC LIMIT 1`,
  ).bind(user.id, user.id, new Date().toISOString(), requestId).first<OfferRow>();
  if (!lawyerOffer) return response({ code: "REQUEST_UNAVAILABLE" }, 404);
  return response({ offer: lawyerOffer, audience: "lawyer" });
});

export const POST = withApiErrors(async function POST(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const { requestId } = await context.params;
  const parsed = await parseJsonRequest(request, lawyerOfferCreateSchema, 4_096);
  const locale = parsed.ok ? parsed.data.locale : "ru";
  if (!parsed.ok) return response({ code: "INVALID_INPUT", error: lawyerOfferError(locale, "INVALID_INPUT") }, parsed.error === "payload_too_large" ? 413 : 400);

  const db = requireD1();
  const handoff = await db.prepare(
    `SELECT r.id,r.workspace_id AS workspaceId
     FROM lawyer_requests r
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id AND p.user_id=? AND p.status='public_approved' AND p.marketplace_status='public_approved'
     JOIN lawyer_access_grants g ON g.lawyer_request_id=r.id AND g.lawyer_user_id=? AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?)
     WHERE r.id=? AND r.status IN ('access_granted','offer_proposed') LIMIT 1`,
  ).bind(user.id, user.id, new Date().toISOString(), requestId).first<{ id: string; workspaceId: string }>();
  if (!handoff) return response({ code: "REQUEST_UNAVAILABLE", error: lawyerOfferError(locale, "REQUEST_UNAVAILABLE") }, 404);

  const now = isoNow();
  const offerId = crypto.randomUUID();
  await db.batch([
    db.prepare("UPDATE lawyer_offers SET status='superseded',updated_at=? WHERE lawyer_request_id=? AND status='proposed'").bind(now, handoff.id),
    db.prepare(
      "INSERT INTO lawyer_offers (id,lawyer_request_id,version,status,scope_description,price_description,duration_description,created_by_user_id,created_at,updated_at) VALUES (?, ?, COALESCE((SELECT MAX(version)+1 FROM lawyer_offers WHERE lawyer_request_id=?),1), 'proposed', ?, ?, ?, ?, ?, ?)",
    ).bind(offerId, handoff.id, handoff.id, parsed.data.scopeDescription, parsed.data.priceDescription, parsed.data.durationDescription, user.id, now, now),
    db.prepare("UPDATE lawyer_requests SET status='offer_proposed',updated_at=? WHERE id=? AND status IN ('access_granted','offer_proposed','offer_accepted')").bind(now, handoff.id),
    db.prepare(
      "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'lawyer_offer',?,'lawyer_offer_proposed',?,?)",
    ).bind(crypto.randomUUID(), handoff.workspaceId, user.id, offerId, JSON.stringify({ requestId: handoff.id }), now),
  ]);
  return response({ ok: true, offerId, status: "proposed" }, 201);
});

export const PATCH = withApiErrors(async function PATCH(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { requestId } = await context.params;
  const parsed = await parseJsonRequest(request, lawyerOfferResponseSchema, 1_024);
  const locale = parsed.ok ? parsed.data.locale : "ru";
  if (!parsed.ok) return response({ code: "INVALID_INPUT", error: lawyerOfferError(locale, "INVALID_INPUT") }, 400);

  const db = requireD1();
  const offer = await db.prepare(
    `SELECT o.id,o.lawyer_request_id AS requestId
     FROM lawyer_offers o JOIN lawyer_requests r ON r.id=o.lawyer_request_id
     WHERE r.id=? AND r.workspace_id=? AND r.requester_user_id=? AND o.status='proposed'
     ORDER BY o.version DESC LIMIT 1`,
  ).bind(requestId, workspace.id, user.id).first<{ id: string; requestId: string }>();
  if (!offer) return response({ code: "OFFER_UNAVAILABLE", error: lawyerOfferError(locale, "OFFER_UNAVAILABLE") }, 404);

  const now = isoNow();
  const requestStatus = parsed.data.decision === "accepted" ? "offer_accepted" : "offer_declined";
  await db.batch([
    db.prepare("UPDATE lawyer_offers SET status=?,responded_by_user_id=?,responded_at=?,updated_at=? WHERE id=? AND status='proposed'").bind(parsed.data.decision, user.id, now, now, offer.id),
    db.prepare("UPDATE lawyer_requests SET status=?,updated_at=? WHERE id=? AND status='offer_proposed'").bind(requestStatus, now, offer.requestId),
    db.prepare(
      "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'lawyer_offer',?,?,?,?)",
    ).bind(crypto.randomUUID(), workspace.id, user.id, offer.id, parsed.data.decision === "accepted" ? "lawyer_offer_accepted" : "lawyer_offer_declined", JSON.stringify({ requestId: offer.requestId }), now),
  ]);
  return response({ ok: true, status: parsed.data.decision });
});
