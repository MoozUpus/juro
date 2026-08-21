import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../../lib/auth/staff-http";
import { requireD1, runtimeEnv } from "../../../../../../lib/document-builder/storage/runtime";
import { lawyerProfileModerationSchema } from "../../../../../../lib/platform/lawyer-profile";
import { isLawyerProfileDirectoryPreviewEnabled } from "../../../../../../lib/platform/lawyer-profile-preview";
import { LawyerProfileModerationError, moderateLawyerProfile } from "../../../../../../lib/platform/lawyer-profile-moderation-service";
import { z } from "zod";

type Context = { params: Promise<{ profileId: string }> };

async function getLawyerProfile(request: Request, context: Context) {
  const runtime = runtimeEnv();
  if (!isLawyerProfileDirectoryPreviewEnabled(runtime)) return Response.json({ code: "NOT_AVAILABLE" }, { status: 404, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
  await requirePlatformStaffRequest(request, "lawyer.profiles.moderate", { freshMfaWithinMs: 15 * 60 * 1000 });
  const profileId = z.string().uuid().safeParse((await context.params).profileId);
  if (!profileId.success) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const db = requireD1();
  const profile = await db.prepare(
    `SELECT p.id,p.display_name AS displayName,p.specialties_json AS specialtiesJson,
      p.languages_json AS languagesJson,p.status,p.marketplace_status AS marketplaceStatus,
      p.profile_revision AS profileRevision,p.experience_years AS experienceYears,
      p.price_description AS priceDescription,
      p.consultation_duration_minutes AS consultationDurationMinutes,
      p.additional_services_json AS additionalServicesJson,
      p.availability_status AS availabilityStatus,p.next_available_at AS nextAvailableAt,
      p.advocate_status AS advocateStatus,p.firm_name AS firmName,p.bio,p.city,p.region,
      p.education,p.consultation_formats_json AS consultationFormatsJson,
      p.profile_photo_key IS NOT NULL AS hasProfilePhoto,
      p.juro_approval_status AS juroApprovalStatus,p.top_lawyer_status AS topLawyerStatus,
      p.top_lawyer_criteria AS topLawyerCriteria,p.public_approved_at AS publicApprovedAt,
      p.created_at AS createdAt,p.updated_at AS updatedAt,u.full_name AS accountName,
      u.email,u.phone
     FROM lawyer_profiles p JOIN user_profiles u ON u.id=p.user_id
     WHERE p.id=? LIMIT 1`,
  ).bind(profileId.data).first();
  if (!profile) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const [moderationHistory, lifecycleHistory, scheduleRules, unavailability, trial] = await Promise.all([
    db.prepare(
      `SELECT profile_revision AS profileRevision,decision,reason,
        moderator_user_id AS moderatorUserId,profile_sha256 AS profileSha256,
        created_at AS createdAt
       FROM lawyer_profile_moderation WHERE lawyer_profile_id=?
       ORDER BY created_at DESC,id DESC LIMIT 100`,
    ).bind(profileId.data).all(),
    db.prepare(
      `SELECT from_profile_revision AS fromProfileRevision,to_profile_revision AS toProfileRevision,
        action,reason,from_marketplace_status AS fromMarketplaceStatus,
        to_marketplace_status AS toMarketplaceStatus,actor_user_id AS actorUserId,
        created_at AS createdAt
       FROM lawyer_profile_lifecycle_events WHERE lawyer_profile_id=?
       ORDER BY created_at DESC,id DESC LIMIT 100`,
    ).bind(profileId.data).all(),
    db.prepare(
      `SELECT weekday,starts_at AS startsAt,ends_at AS endsAt,timezone,status
       FROM lawyer_availability_rules WHERE lawyer_profile_id=?
       ORDER BY weekday,starts_at`,
    ).bind(profileId.data).all(),
    db.prepare(
      `SELECT starts_at AS startsAt,ends_at AS endsAt,reason
       FROM lawyer_unavailability_periods WHERE lawyer_profile_id=?
       ORDER BY starts_at`,
    ).bind(profileId.data).all(),
    db.prepare(
      `SELECT id,starts_at AS startsAt,ends_at AS endsAt,status,post_expiry_mode AS postExpiryMode,
        reminder_30_sent_at AS reminder30SentAt,reminder_7_sent_at AS reminder7SentAt,
        reminder_1_sent_at AS reminder1SentAt,reminder_expired_sent_at AS reminderExpiredSentAt
       FROM lawyer_trials WHERE lawyer_profile_id=? LIMIT 1`,
    ).bind(profileId.data).first(),
  ]);
  return Response.json({
    profile: {
      ...profile,
      profilePhotoUrl: (profile as { hasProfilePhoto?: number }).hasProfilePhoto
        ? `/api/platform/admin/lawyer-profiles/${profileId.data}/photo`
        : null,
    },
    moderationHistory: moderationHistory.results,
    lifecycleHistory: lifecycleHistory.results,
    schedule: { rules: scheduleRules.results, unavailability: unavailability.results },
    trial: trial ?? null,
    supportingDocuments: [],
  }, { headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

async function patchLawyerProfile(request: Request, context: Context) {
  const runtime = runtimeEnv();
  if (!isLawyerProfileDirectoryPreviewEnabled(runtime)) return Response.json({ code: "NOT_AVAILABLE" }, { status: 404, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "lawyer.profiles.moderate", { freshMfaWithinMs: 15 * 60 * 1000 });
  const parsed = await parseJsonRequest(request, lawyerProfileModerationSchema, 4_096);
  if (!parsed.ok) return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
  const profileId = z.string().uuid().safeParse((await context.params).profileId);
  if (!profileId.success) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  try {
    const result = await moderateLawyerProfile(requireD1(), {
      profileId: profileId.data,
      moderatorUserId: staff.userId,
      decision: parsed.data.decision,
      reason: parsed.data.reason,
    });
    return Response.json({ ok: true, status: result.status }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof LawyerProfileModerationError) {
      return Response.json({ code: error.code }, { status: 409 });
    }
    return Response.json({ code: "PROFILE_UNAVAILABLE" }, { status: 409 });
  }
}

export const PATCH = withPlatformStaffErrors(patchLawyerProfile);
export const GET = withPlatformStaffErrors(getLawyerProfile);
