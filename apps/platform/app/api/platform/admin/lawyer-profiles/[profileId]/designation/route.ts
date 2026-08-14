import { z } from "zod";

import { parseJsonRequest } from "../../../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../../../lib/auth/staff-http";
import { requireD1, runtimeEnv } from "../../../../../../../lib/document-builder/storage/runtime";
import { designateLawyerProfile, LawyerProfileDesignationError } from "../../../../../../../lib/platform/lawyer-profile-designation-service";
import { isLawyerProfileDirectoryPreviewEnabled } from "../../../../../../../lib/platform/lawyer-profile-preview";

type Context = { params: Promise<{ profileId: string }> };

const designationSchema = z.object({
  designation: z.enum(["juro_approval", "top_lawyer"]),
  decision: z.enum(["approved", "revoked"]),
  reason: z.string().trim().min(1).max(2_000),
  criteria: z.string().trim().min(20).max(1_200).optional(),
}).strict().superRefine((value, context) => {
  if (value.designation === "top_lawyer" && value.decision === "approved" && !value.criteria) {
    context.addIssue({ code: "custom", path: ["criteria"], message: "Top Lawyer criteria are required" });
  }
});

async function handlePost(request: Request, context: Context) {
  if (!isLawyerProfileDirectoryPreviewEnabled(runtimeEnv())) return Response.json({ code: "NOT_AVAILABLE" }, { status: 404 });
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "lawyer.profiles.moderate", { freshMfaWithinMs: 15 * 60 * 1_000 });
  const profileId = z.string().uuid().safeParse((await context.params).profileId);
  if (!profileId.success) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const parsed = await parseJsonRequest(request, designationSchema, 4_096);
  if (!parsed.ok) return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
  try {
    const result = await designateLawyerProfile({
      db: requireD1(), profileId: profileId.data, moderatorUserId: staff.userId, ...parsed.data,
    });
    return Response.json({ ok: true, ...result }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof LawyerProfileDesignationError) return Response.json({ code: error.code }, { status: 409 });
    throw error;
  }
}

export const POST = withPlatformStaffErrors(handlePost);
