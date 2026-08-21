import { z } from "zod";
import { parseJsonRequest } from "../../../../../lib/auth/input";
import {
  assertSafeWrite,
  requireApiUser,
  withApiErrors,
} from "../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../lib/document-builder/storage/db";
import {
  requireD1,
  runtimeEnv,
} from "../../../../../lib/document-builder/storage/runtime";
import { missingLawyerMarketplaceFields } from "../../../../../lib/platform/lawyer-marketplace";
import { localizedLawyerProfileStatusNotification } from "../../../../../lib/platform/lawyer-profile-notifications";
import { isLawyerProfileDirectoryPreviewEnabled } from "../../../../../lib/platform/lawyer-profile-preview";
import { lawyerTrialEndsAt } from "../../../../../lib/platform/lawyer-trial";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

const input = z.object({
  locale: z.enum(["ru", "uz"]),
  publicationConsent: z.literal(true),
}).strict();

type SubmissionProfile = {
  id: string;
  displayName: string;
  specialtiesJson: string;
  languagesJson: string;
  experienceYears: number | null;
  education: string | null;
  firmName: string | null;
  city: string | null;
  region: string | null;
  priceDescription: string | null;
  consultationFormatsJson: string;
  availabilityStatus: string;
  profilePhotoKey: string | null;
  hasPhone: number;
  status: string;
  marketplaceStatus: string;
  profileRevision: number;
};

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

function list(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export const POST = withApiErrors(async function POST(request: Request) {
  if (!isLawyerProfileDirectoryPreviewEnabled(runtimeEnv()))
    return response({ code: "NOT_AVAILABLE" }, 404);
  assertSafeWrite(request);
  const user = await requireApiUser();
  const parsed = await parseJsonRequest(request, input, 1_024);
  if (!parsed.ok)
    return response(
      {
        code: "INVALID_INPUT",
        error: "Проверьте данные заявки / Ariza ma’lumotlarini tekshiring.",
      },
      400,
    );
  const db = requireD1();
  const profile = await db
    .prepare(
      `SELECT p.id,p.display_name AS displayName,p.specialties_json AS specialtiesJson,
      p.languages_json AS languagesJson,p.experience_years AS experienceYears,p.education,
      p.firm_name AS firmName,p.city,p.region,p.price_description AS priceDescription,
      p.consultation_formats_json AS consultationFormatsJson,p.availability_status AS availabilityStatus,
      p.profile_photo_key AS profilePhotoKey,p.status,p.marketplace_status AS marketplaceStatus,
      p.profile_revision AS profileRevision,
      CASE WHEN u.phone IS NOT NULL AND length(trim(u.phone))>0 THEN 1 ELSE 0 END AS hasPhone
     FROM lawyer_profiles p JOIN user_profiles u ON u.id=p.user_id
     WHERE p.user_id=? AND u.account_type='lawyer' LIMIT 1`,
    )
    .bind(user.id)
    .first<SubmissionProfile>();
  if (!profile)
    return response(
      {
        code: "PROFILE_UNAVAILABLE",
        error: "Профиль юриста недоступен / Yurist profili mavjud emas.",
      },
      404,
    );
  if (profile.marketplaceStatus === "public_approved") {
    return response({
      ok: true,
      marketplaceStatus: profile.marketplaceStatus,
      missingRequiredFields: [],
    });
  }
  if (
    ["suspended", "blocked", "archived"].includes(profile.marketplaceStatus)
  ) {
    return response(
      {
        code: "PROFILE_LOCKED",
        error:
          "Профиль ограничен модерацией / Profil moderatsiya bilan cheklangan.",
      },
      423,
    );
  }
  const missingRequiredFields = missingLawyerMarketplaceFields({
    displayName: profile.displayName,
    specialties: list(profile.specialtiesJson),
    languages: list(profile.languagesJson),
    experienceYears: profile.experienceYears,
    education: profile.education,
    firmName: profile.firmName,
    city: profile.city,
    region: profile.region,
    priceDescription: profile.priceDescription,
    consultationFormats: list(profile.consultationFormatsJson),
    availabilityStatus: profile.availabilityStatus,
    profilePhotoKey: profile.profilePhotoKey,
    hasPhone: profile.hasPhone === 1,
  });
  if (missingRequiredFields.length) {
    return response(
      {
        code: "PROFILE_INCOMPLETE",
        error:
          "Заполните обязательные поля перед отправкой / Yuborishdan oldin majburiy maydonlarni to‘ldiring.",
        missingRequiredFields,
      },
      409,
    );
  }
  const workspace = await workspaceForUser(user);
  const now = isoNow();
  const trialEndsAt = lawyerTrialEndsAt(now);
  const notification = localizedLawyerProfileStatusNotification(
    parsed.data.locale,
    "public_approved",
  );
  const results = await db.batch([
    db
      .prepare(
        `UPDATE lawyer_profiles SET status='public_approved',marketplace_status='public_approved',
          public_approved_at=COALESCE(public_approved_at,?),
          publication_consent_at=COALESCE(publication_consent_at,?),updated_at=?
       WHERE id=? AND user_id=? AND profile_revision=?
         AND marketplace_status IN ('profile_incomplete','pending_review','changes_requested','rejected')`,
      )
      .bind(now, now, now, profile.id, user.id, profile.profileRevision),
    db
      .prepare(
        `INSERT INTO lawyer_trials
          (id,lawyer_profile_id,starts_at,ends_at,status,post_expiry_mode,created_at,updated_at)
         SELECT ?,p.id,?,?,'active','stay_published',?,?
         FROM lawyer_profiles p
         WHERE p.id=? AND p.user_id=? AND p.profile_revision=?
           AND p.status='public_approved' AND p.marketplace_status='public_approved'
         ON CONFLICT(lawyer_profile_id) DO NOTHING`,
      )
      .bind(
        crypto.randomUUID(),
        now,
        trialEndsAt,
        now,
        now,
        profile.id,
        user.id,
        profile.profileRevision,
      ),
    db
      .prepare(
        `INSERT INTO lawyer_profile_publication_events
          (id,lawyer_profile_id,actor_user_id,profile_revision,previous_profile_status,
           previous_marketplace_status,publication_consent_at,created_at)
         SELECT ?,p.id,?,?,?,?,?,?
         FROM lawyer_profiles p
         WHERE p.id=? AND p.user_id=? AND p.profile_revision=?
           AND p.status='public_approved' AND p.marketplace_status='public_approved'
           AND p.updated_at=?`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        profile.profileRevision,
        profile.status,
        profile.marketplaceStatus,
        now,
        now,
        profile.id,
        user.id,
        profile.profileRevision,
        now,
      ),
    db
      .prepare(
        `INSERT INTO notifications (id,workspace_id,user_id,document_id,target_type,target_id,type,title,body,read_at,created_at)
        SELECT ?,?,?,NULL,'lawyer_profile',?,'lawyer_profile_status',?,?,NULL,?
        WHERE EXISTS (SELECT 1 FROM lawyer_profiles WHERE id=? AND user_id=? AND profile_revision=?
          AND marketplace_status='public_approved' AND publication_consent_at IS NOT NULL AND updated_at=?)`,
      )
      .bind(
        crypto.randomUUID(),
        workspace.id,
        user.id,
        profile.id,
        notification.title,
        notification.body,
        now,
        profile.id,
        user.id,
        profile.profileRevision,
        now,
      ),
    db
      .prepare(
        `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       SELECT ?,?,?,'lawyer_profile',?,'lawyer_profile_auto_published',?,?
       WHERE EXISTS (SELECT 1 FROM lawyer_profiles WHERE id=? AND user_id=? AND profile_revision=?
          AND marketplace_status='public_approved' AND publication_consent_at IS NOT NULL AND updated_at=?)`,
      )
      .bind(
        crypto.randomUUID(),
        workspace.id,
        user.id,
        profile.id,
        JSON.stringify({
          profileRevision: profile.profileRevision,
          publicationConsent: true,
          trialStartsAt: now,
          trialEndsAt,
          juroVerificationGranted: false,
        }),
        now,
        profile.id,
        user.id,
        profile.profileRevision,
        now,
      ),
  ]);
  if (
    Number(results[0]?.meta.changes ?? 0) !== 1 ||
    ![0, 1].includes(Number(results[1]?.meta.changes ?? 0)) ||
    results.slice(2).some((result) => Number(result?.meta.changes ?? 0) !== 1)
  ) {
    return response(
      {
        code: "PROFILE_UNAVAILABLE",
        error: "Профиль изменился. Обновите страницу и повторите отправку.",
      },
      409,
    );
  }
  return response({
    ok: true,
    marketplaceStatus: "public_approved",
    missingRequiredFields: [],
    updatedAt: now,
    trial: {
      startsAt: now,
      endsAt: trialEndsAt,
      daysRemaining: 90,
      effectiveStatus: "active",
    },
  });
});
