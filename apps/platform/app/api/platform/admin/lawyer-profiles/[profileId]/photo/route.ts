import { z } from "zod";
import {
  requirePlatformStaffRequest,
  withPlatformStaffErrors,
} from "../../../../../../../lib/auth/staff-http";
import {
  requireD1,
  requireR2,
  runtimeEnv,
} from "../../../../../../../lib/document-builder/storage/runtime";
import { isLawyerProfileDirectoryPreviewEnabled } from "../../../../../../../lib/platform/lawyer-profile-preview";

type Context = { params: Promise<{ profileId: string }> };

async function getProfilePhoto(request: Request, context: Context) {
  if (!isLawyerProfileDirectoryPreviewEnabled(runtimeEnv())) {
    return new Response(null, { status: 404 });
  }
  await requirePlatformStaffRequest(request, "lawyer.profiles.moderate", {
    freshMfaWithinMs: 15 * 60 * 1_000,
  });
  const profileId = z.string().uuid().safeParse((await context.params).profileId);
  if (!profileId.success) return new Response(null, { status: 404 });
  const profile = await requireD1().prepare(
    `SELECT profile_photo_key AS profilePhotoKey,
      profile_photo_mime AS profilePhotoMime,
      profile_photo_sha256 AS profilePhotoSha256,
      profile_photo_size_bytes AS profilePhotoSizeBytes
     FROM lawyer_profiles
     WHERE id=? AND profile_photo_key IS NOT NULL
       AND profile_photo_mime IN ('image/jpeg','image/png','image/webp')
     LIMIT 1`,
  ).bind(profileId.data).first<{
    profilePhotoKey: string;
    profilePhotoMime: string;
    profilePhotoSha256: string | null;
    profilePhotoSizeBytes: number | null;
  }>();
  if (!profile) return new Response(null, { status: 404 });
  const object = await requireR2().get(profile.profilePhotoKey);
  if (!object || object.size !== profile.profilePhotoSizeBytes) {
    return new Response(null, { status: 404 });
  }
  return new Response(object.body, {
    headers: {
      "content-type": profile.profilePhotoMime,
      "cache-control": "private, no-store",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
      etag: profile.profilePhotoSha256
        ? `\"${profile.profilePhotoSha256}\"`
        : object.httpEtag,
    },
  });
}

export const GET = withPlatformStaffErrors(getProfilePhoto);
