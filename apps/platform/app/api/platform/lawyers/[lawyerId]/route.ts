import { z } from "zod";
import { requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import { projectPublicLawyerDirectory } from "../../../../../lib/platform/lawyer-directory-reviews";

type Context = { params: Promise<{ lawyerId: string }> };

export const GET = withApiErrors(async function GET(_request: Request, context: Context) {
  await requireApiUser();
  const parsedId = z.string().uuid().safeParse((await context.params).lawyerId);
  if (!parsedId.success) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const db = requireD1();
  const now = new Date().toISOString();
  const lawyer = await db.prepare(
    `SELECT id,display_name AS displayName,specialties_json AS specialtiesJson,languages_json AS languagesJson,
      experience_years AS experienceYears,price_description AS priceDescription,
      consultation_duration_minutes AS consultationDurationMinutes,
      additional_services_json AS additionalServicesJson,availability_status AS availabilityStatus,
      next_available_at AS nextAvailableAt,advocate_status AS advocateStatus,firm_name AS firmName,bio,
      marketplace_status AS marketplaceStatus,accepting_new_requests AS acceptingNewRequests,city,region,education,
      consultation_formats_json AS consultationFormatsJson,
      juro_approval_status AS juroApprovalStatus,top_lawyer_status AS topLawyerStatus,
      top_lawyer_criteria AS topLawyerCriteria,
      (SELECT ends_at FROM lawyer_trials WHERE lawyer_profile_id=lawyer_profiles.id LIMIT 1) AS trialEndsAt,
      (SELECT post_expiry_mode FROM lawyer_trials WHERE lawyer_profile_id=lawyer_profiles.id LIMIT 1) AS trialPostExpiryMode,
      CASE WHEN profile_photo_key IS NOT NULL THEN '/api/public/lawyers/' || id || '/photo' ELSE NULL END AS profilePhotoUrl
     FROM lawyer_profiles WHERE id=? AND status='public_approved'
       AND marketplace_status='public_approved'
       AND public_approved_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM lawyer_trials t WHERE t.lawyer_profile_id=lawyer_profiles.id AND t.ends_at<=? AND t.post_expiry_mode='hide_profile') LIMIT 1`,
  ).bind(parsedId.data, now).all<{id:string;displayName:string;specialtiesJson:unknown;languagesJson:unknown;experienceYears:number|null;priceDescription:string|null;consultationDurationMinutes:number;additionalServicesJson:unknown;availabilityStatus:string;nextAvailableAt:string|null;advocateStatus:string;firmName:string|null;bio:string|null;marketplaceStatus:string;acceptingNewRequests:number;city:string|null;region:string|null;education:string|null;consultationFormatsJson:unknown;profilePhotoUrl:string|null;juroApprovalStatus:string;topLawyerStatus:string;topLawyerCriteria:string|null;trialEndsAt:string|null;trialPostExpiryMode:"stay_published"|"limit_new_requests"|"hide_profile"|null}>();
  if (!lawyer.results.length) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const aggregates = await db.prepare(`SELECT r.lawyer_profile_id AS lawyerProfileId,COUNT(*) AS reviewCount,AVG(r.overall_rating) AS overallAverage,AVG(r.speed_rating) AS speedAverage,AVG(r.quality_rating) AS qualityAverage,AVG(r.communication_rating) AS communicationAverage FROM lawyer_reviews r JOIN lawyer_review_moderation m ON m.review_id=r.id AND m.decision='approved' WHERE r.lawyer_profile_id=? AND r.status='approved' GROUP BY r.lawyer_profile_id`).bind(parsedId.data).all<{lawyerProfileId:string;reviewCount:number;overallAverage:number;speedAverage:number;qualityAverage:number;communicationAverage:number}>();
  const reviews = await db.prepare(`SELECT r.id AS reviewId,r.lawyer_profile_id AS lawyerProfileId,r.overall_rating AS overallRating,COALESCE(m.moderated_body,r.body) AS body,r.created_at AS createdAt,
    (SELECT COALESCE(replyModeration.moderated_body,reply.body) FROM lawyer_review_replies reply JOIN lawyer_review_reply_moderation replyModeration ON replyModeration.reply_id=reply.id AND replyModeration.decision='approved' WHERE reply.review_id=r.id AND reply.status='approved' ORDER BY reply.version DESC LIMIT 1) AS replyBody,
    (SELECT reply.created_at FROM lawyer_review_replies reply JOIN lawyer_review_reply_moderation replyModeration ON replyModeration.reply_id=reply.id AND replyModeration.decision='approved' WHERE reply.review_id=r.id AND reply.status='approved' ORDER BY reply.version DESC LIMIT 1) AS replyCreatedAt
    FROM lawyer_reviews r JOIN lawyer_review_moderation m ON m.review_id=r.id AND m.decision='approved' WHERE r.lawyer_profile_id=? AND r.status='approved' ORDER BY m.created_at DESC,r.id DESC LIMIT 3`).bind(parsedId.data).all<{reviewId:string;lawyerProfileId:string;overallRating:number;body:string|null;createdAt:string;replyBody:string|null;replyCreatedAt:string|null}>();
  return Response.json({ lawyer: projectPublicLawyerDirectory(lawyer.results, aggregates.results, reviews.results)[0] }, { headers: { "cache-control": "private, no-store" } });
});
