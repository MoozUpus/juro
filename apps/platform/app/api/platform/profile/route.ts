import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import {
  prepareUserIdentityWrite,
  resolveUserIdentity,
  userIdentityById,
  userIdentitySelect,
  type UserIdentityRow,
} from "../../../../lib/auth/identity-protection";
import { runtimeIdentityProtection } from "../../../../lib/auth/identity-runtime";
import { workspaceForUser } from "../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const [profile, workspaceRow, consents, acceptances, deletionRequest] =
    await db.batch([
    db.prepare(
      `SELECT id,${userIdentitySelect("user_profiles")},
        full_name AS fullName,locale,account_type AS accountType,
        company_name AS companyName,organization_role AS organizationRole,primary_goal AS primaryGoal,
        timezone,onboarding_completed_at AS onboardingCompletedAt,created_at AS createdAt
       FROM user_profiles WHERE id=? LIMIT 1`,
    ).bind(user.id),
    db.prepare("SELECT id,name,type,locale FROM workspaces WHERE id=? LIMIT 1").bind(workspace.id),
    db.prepare(
      "SELECT type,version,granted_at AS grantedAt,revoked_at AS revokedAt FROM consents WHERE user_id=? ORDER BY granted_at DESC",
    ).bind(user.id),
    db.prepare(
      `SELECT
         acceptance.document_key AS type,
         acceptance.document_version AS version,
         acceptance.locale,
         acceptance.content_sha256 AS contentSha256,
         acceptance.accepted_at AS acceptedAt,
         CASE
           WHEN acceptance.policy_document_id IS NULL
             THEN 'legacy_unverified'
           ELSE coalesce(policy.status,'registry_missing')
         END AS status
       FROM user_acceptances acceptance
       LEFT JOIN policy_documents policy
         ON policy.id=acceptance.policy_document_id
       WHERE acceptance.user_id=?
       ORDER BY acceptance.accepted_at DESC`,
    ).bind(user.id),
    db.prepare(
      `SELECT
         id,status,requested_at AS requestedAt,verified_at AS verifiedAt
       FROM account_deletion_requests
       WHERE user_id=? AND status IN ('requested','reviewing')
       ORDER BY requested_at DESC
       LIMIT 1`,
    ).bind(user.id),
  ]);
  const profileRow = profile.results[0] as (UserIdentityRow & {
    fullName: string | null;
    locale: string;
    accountType: string;
    companyName: string | null;
    organizationRole: string | null;
    primaryGoal: string | null;
    timezone: string;
    onboardingCompletedAt: string | null;
    createdAt: string;
  }) | undefined;
  const identity = profileRow
    ? await resolveUserIdentity(runtimeIdentityProtection(), profileRow)
    : null;
  return response({
    profile: profileRow && identity ? {
      id: profileRow.id,
      email: identity.email,
      fullName: profileRow.fullName,
      phone: identity.phone,
      locale: profileRow.locale,
      accountType: profileRow.accountType,
      companyName: profileRow.companyName,
      organizationRole: profileRow.organizationRole,
      primaryGoal: profileRow.primaryGoal,
      timezone: profileRow.timezone,
      onboardingCompletedAt: profileRow.onboardingCompletedAt,
      createdAt: profileRow.createdAt,
    } : null,
    workspace: workspaceRow.results[0] ?? null,
    role: workspace.role,
    consents: consents.results,
    acceptances: acceptances.results,
    deletionRequest: deletionRequest.results[0] ?? null,
  });
});

export const PATCH = withApiErrors(async function PATCH(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const body = await request.json().catch(() => null) as { fullName?: string; phone?: string; locale?: string; timezone?: string; companyName?: string; organizationRole?: string } | null;
  if (!body) return response({ error: "Некорректные данные." }, 400);
  const fullName = body.fullName?.trim().slice(0, 160);
  if (!fullName) return response({ error: "Укажите имя." }, 400);
  const locale = body.locale === "uz" ? "uz" : "ru";
  const timezone = body.timezone === "UTC" ? "UTC" : "Asia/Tashkent";
  const phone = body.phone?.trim().slice(0, 40) || null;
  const companyName = body.companyName?.trim().slice(0, 180) || null;
  const organizationRole = body.organizationRole?.trim().slice(0, 120) || null;
  const now = isoNow();
  const db = requireD1();
  const identityContext = runtimeIdentityProtection();
  const currentIdentity = await userIdentityById(
    db,
    identityContext,
    user.id,
  );
  if (!currentIdentity) {
    return response({ error: "Профиль не найден." }, 404);
  }
  const protectedIdentity = identityContext.mode === "dual_write"
    ? await prepareUserIdentityWrite(identityContext, {
        userId: user.id,
        email: currentIdentity.email,
        phone,
      })
    : null;
  const profileUpdate = protectedIdentity
    ? db.prepare(
      `UPDATE user_profiles SET
         full_name=?,phone=?,
         email_ciphertext=?,email_iv=?,email_key_version=?,
         email_lookup_hash=?,email_lookup_key_version=?,
         phone_ciphertext=?,phone_iv=?,phone_key_version=?,
         phone_lookup_hash=?,phone_lookup_key_version=?,
         locale=?,timezone=?,company_name=?,organization_role=?,updated_at=?
       WHERE id=?`,
    ).bind(
      fullName,
      protectedIdentity.phone,
      protectedIdentity.emailCiphertext,
      protectedIdentity.emailIv,
      protectedIdentity.emailKeyVersion,
      protectedIdentity.emailLookupHash,
      protectedIdentity.emailLookupKeyVersion,
      protectedIdentity.phoneCiphertext,
      protectedIdentity.phoneIv,
      protectedIdentity.phoneKeyVersion,
      protectedIdentity.phoneLookupHash,
      protectedIdentity.phoneLookupKeyVersion,
      locale,
      timezone,
      companyName,
      organizationRole,
      now,
      user.id,
    )
    : db.prepare(
      `UPDATE user_profiles SET
         full_name=?,phone=?,locale=?,timezone=?,
         company_name=?,organization_role=?,updated_at=?
       WHERE id=?`,
    ).bind(
      fullName,
      phone,
      locale,
      timezone,
      companyName,
      organizationRole,
      now,
      user.id,
    );
  await db.batch([
    profileUpdate,
    db.prepare("UPDATE workspaces SET locale=?,name=CASE WHEN type='business' AND ? IS NOT NULL THEN ? ELSE name END,updated_at=? WHERE id=?")
      .bind(locale, companyName, companyName, now, workspace.id),
    db.prepare(
      "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'user',?,'profile_updated',?,?)",
    ).bind(crypto.randomUUID(), workspace.id, user.id, user.id, JSON.stringify({ locale, timezone }), now),
  ]);
  return response({ ok: true, locale });
});
