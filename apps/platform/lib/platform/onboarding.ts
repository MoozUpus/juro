import { z } from "zod";
import {
  prepareUserIdentityWrite,
  userIdentityById,
  type IdentityProtectionContext,
} from "../auth/identity-protection";
import { parseJsonRequest, type JsonRequestError } from "../auth/input";
import { registrationPolicies } from "../legal/policies";

export const ONBOARDING_MAX_BYTES = 4_096;

export const accountPersonas = [
  "individual",
  "entrepreneur",
  "lawyer",
] as const;
export type AccountPersona = (typeof accountPersonas)[number];

export const onboardingGoals = [
  "legal_answer",
  "review_document",
  "create_document",
  "manage_case",
  "find_lawyer",
  "professional_work",
] as const;
export type OnboardingGoal = (typeof onboardingGoals)[number];

const normalizedName = z.string()
  .trim()
  .min(1)
  .max(80)
  .transform((value) => value.normalize("NFKC").replace(/\s+/g, " "))
  .refine(
    (value) => /^[\p{L}\p{M}][\p{L}\p{M}'‘’ʼʻ` -]*$/u.test(value),
    "invalid_name",
  );

function normalizePhone(value: string): string {
  let compact = value
    .normalize("NFKC")
    .trim()
    .replace(/[\s().-]+/g, "");
  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;
  if (/^\d{9}$/.test(compact)) compact = `+998${compact}`;
  if (/^998\d{9}$/.test(compact)) compact = `+${compact}`;
  return compact;
}

export const onboardingInputSchema = z.object({
  lastName: normalizedName,
  firstName: normalizedName,
  middleName: z.union([normalizedName, z.literal("")])
    .optional()
    .transform((value) => value || null),
  phone: z.string()
    .trim()
    .min(1)
    .max(40)
    .transform(normalizePhone)
    .refine((value) => /^\+[1-9]\d{7,14}$/.test(value), "invalid_phone"),
  locale: z.enum(["ru", "uz"]),
  accountPersona: z.enum(accountPersonas),
  primaryGoal: z.enum(onboardingGoals),
}).strict();

export type OnboardingInput = z.infer<typeof onboardingInputSchema>;

type ExistingProfile = {
  accountType: string;
  defaultWorkspaceId: string | null;
  onboardingCompletedAt: string | null;
};

type PolicyEvidenceRow = {
  documentKey: string;
  documentVersion: string;
  locale: string;
  contentSha256: string;
};

type OnboardingDependencies = {
  db: D1Database;
  identityContext: IdentityProtectionContext;
  userId: string;
  allowDevelopmentPolicyBypass?: boolean;
  now?: string;
};

export type OnboardingCompletion =
  | {
    status: "completed" | "already_completed";
    accountPersona: AccountPersona;
    locale: "ru" | "uz";
    workspaceId: string;
    redirectTo: string;
  }
  | { status: "profile_not_found" }
  | { status: "policy_evidence_required" };

function fullName(input: OnboardingInput): string {
  return [input.lastName, input.firstName, input.middleName]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function deterministicPersonalWorkspaceId(userId: string): string {
  const safeUserId = userId.toLocaleLowerCase("en-US").replace(
    /[^a-z0-9]/g,
    "",
  );
  if (!safeUserId) throw new Error("INVALID_USER_ID");
  return `ws_personal_${safeUserId.slice(0, 96)}`;
}

/**
 * The current application shell is still workspace-routed. Entrepreneur and
 * lawyer personas therefore enter their private workspace through the existing
 * individual route until the separate account-route migration is completed.
 */
export function onboardingRedirect(locale: "ru" | "uz"): string {
  return `/${locale}/individual/dashboard`;
}

async function hasCurrentRegistrationPolicyEvidence(
  db: D1Database,
  userId: string,
): Promise<boolean> {
  const [ruPolicies, uzPolicies] = await Promise.all([
    registrationPolicies("ru"),
    registrationPolicies("uz"),
  ]);
  const accepted = await db.prepare(
    `SELECT
       acceptance.document_key AS documentKey,
       acceptance.document_version AS documentVersion,
       acceptance.locale,
       acceptance.content_sha256 AS contentSha256
     FROM user_acceptances acceptance
     JOIN policy_documents policy
       ON policy.id=acceptance.policy_document_id
      AND policy.document_key=acceptance.document_key
      AND policy.document_version=acceptance.document_version
      AND policy.locale=acceptance.locale
      AND policy.content_sha256=acceptance.content_sha256
     WHERE acceptance.user_id=?
       AND acceptance.acceptance_method='registration_checkbox'
       AND acceptance.auth_source='email_otp'`,
  ).bind(userId).all<PolicyEvidenceRow>();
  const expected = new Map(
    [...ruPolicies, ...uzPolicies].map((policy) => [
      [
        policy.documentKey,
        policy.documentVersion,
        policy.locale,
        policy.contentSha256,
      ].join(":"),
      policy.documentKey,
    ]),
  );
  const verifiedKeys = new Set(
    accepted.results.flatMap((row) => {
      const key = [
        row.documentKey,
        row.documentVersion,
        row.locale,
        row.contentSha256,
      ].join(":");
      const documentKey = expected.get(key);
      return documentKey ? [documentKey] : [];
    }),
  );
  const mandatoryKeys = new Set(ruPolicies.map((policy) =>
    policy.documentKey
  ));
  return [...mandatoryKeys].every((documentKey) =>
    verifiedKeys.has(documentKey)
  );
}

async function personalWorkspaceForUser(
  db: D1Database,
  profile: ExistingProfile,
  userId: string,
): Promise<string> {
  const existing = await db.prepare(
    `SELECT w.id
     FROM workspace_members member
     JOIN workspaces w ON w.id=member.workspace_id
     WHERE member.user_id=?
       AND member.role='owner'
       AND member.status='active'
       AND w.type='individual'
     ORDER BY CASE WHEN w.id=? THEN 0 ELSE 1 END,member.joined_at,w.id
     LIMIT 1`,
  ).bind(userId, profile.defaultWorkspaceId).first<{ id: string }>();
  return existing?.id ?? deterministicPersonalWorkspaceId(userId);
}

export async function completeOnboarding(
  input: OnboardingInput,
  dependencies: OnboardingDependencies,
): Promise<OnboardingCompletion> {
  const { db, identityContext, userId } = dependencies;
  const profile = await db.prepare(
    `SELECT account_type AS accountType,
       default_workspace_id AS defaultWorkspaceId,
       onboarding_completed_at AS onboardingCompletedAt
     FROM user_profiles WHERE id=? LIMIT 1`,
  ).bind(userId).first<ExistingProfile>();
  if (!profile) return { status: "profile_not_found" };

  if (profile.onboardingCompletedAt) {
    const workspaceId = await personalWorkspaceForUser(
      db,
      profile,
      userId,
    );
    return {
      status: "already_completed",
      accountPersona: accountPersonas.includes(
          profile.accountType as AccountPersona,
        )
        ? profile.accountType as AccountPersona
        : "individual",
      locale: input.locale,
      workspaceId,
      redirectTo: onboardingRedirect(input.locale),
    };
  }

  const hasPolicyEvidence = await hasCurrentRegistrationPolicyEvidence(
    db,
    userId,
  );
  if (!hasPolicyEvidence && !dependencies.allowDevelopmentPolicyBypass) {
    return { status: "policy_evidence_required" };
  }

  const currentIdentity = await userIdentityById(
    db,
    identityContext,
    userId,
  );
  if (!currentIdentity) return { status: "profile_not_found" };
  const identity = await prepareUserIdentityWrite(identityContext, {
    userId,
    email: currentIdentity.email,
    phone: input.phone,
  });
  const workspaceId = await personalWorkspaceForUser(db, profile, userId);
  const now = dependencies.now ?? new Date().toISOString();
  const formattedName = fullName(input);
  const membershipId = `wm_${crypto.randomUUID()}`;
  const lawyerProfileId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const lawyerProfileStatement = input.accountPersona === "lawyer"
    ? db.prepare(
      `INSERT OR IGNORE INTO lawyer_profiles (
         id,user_id,display_name,specialties_json,languages_json,status,
         marketplace_status,created_at,updated_at
       ) VALUES (?, ?, ?, '[]', '[]', 'pending', 'profile_incomplete', ?, ?)`,
    ).bind(lawyerProfileId, userId, formattedName, now, now)
    : null;

  const results = await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (
         id,type,name,locale,created_at,updated_at
       ) VALUES (?,'individual',?,?,?,?)`,
    ).bind(workspaceId, formattedName, input.locale, now, now),
    db.prepare(
      `INSERT OR IGNORE INTO workspace_members (
         id,workspace_id,user_id,role,status,joined_at,created_at,updated_at
       )
       SELECT ?,workspace.id,?,'owner','active',?,?,?
       FROM workspaces workspace
       WHERE workspace.id=?
         AND workspace.type='individual'
         AND NOT EXISTS (
           SELECT 1 FROM workspace_members other
           WHERE other.workspace_id=workspace.id
             AND other.user_id<>?
         )`,
    ).bind(
      membershipId,
      userId,
      now,
      now,
      now,
      workspaceId,
      userId,
    ),
    ...(lawyerProfileStatement ? [lawyerProfileStatement] : []),
    db.prepare(
      `UPDATE workspaces
       SET name=?,locale=?,updated_at=?
       WHERE id=?
         AND type='individual'
         AND EXISTS (
           SELECT 1 FROM workspace_members member
           WHERE member.workspace_id=workspaces.id
             AND member.user_id=?
             AND member.role='owner'
             AND member.status='active'
         )`,
    ).bind(formattedName, input.locale, now, workspaceId, userId),
    db.prepare(
      `UPDATE user_profiles SET
         last_name=?,first_name=?,middle_name=?,full_name=?,
         phone=?,phone_ciphertext=?,phone_iv=?,phone_key_version=?,
         phone_lookup_hash=?,phone_lookup_key_version=?,
         phone_verified=0,phone_verified_at=NULL,
         locale=?,account_type=?,company_name=NULL,
         organization_role=NULL,primary_goal=?,
         timezone='Asia/Tashkent',default_workspace_id=?,
         onboarding_completed_at=?,updated_at=?
       WHERE id=?
         AND onboarding_completed_at IS NULL
         AND EXISTS (
           SELECT 1
           FROM workspace_members member
           JOIN workspaces workspace ON workspace.id=member.workspace_id
           WHERE member.workspace_id=?
             AND member.user_id=user_profiles.id
             AND member.role='owner'
             AND member.status='active'
             AND workspace.type='individual'
         )`,
    ).bind(
      input.lastName,
      input.firstName,
      input.middleName,
      formattedName,
      identity.phone,
      identity.phoneCiphertext,
      identity.phoneIv,
      identity.phoneKeyVersion,
      identity.phoneLookupHash,
      identity.phoneLookupKeyVersion,
      input.locale,
      input.accountPersona,
      input.primaryGoal,
      workspaceId,
      now,
      now,
      userId,
      workspaceId,
    ),
    db.prepare(
      `INSERT INTO workspace_audit_events (
         id,workspace_id,actor_user_id,entity_type,entity_id,action,
         metadata_json,created_at
       )
       SELECT ?,?,?, 'user',?,'onboarding_completed',?,?
       FROM user_profiles profile
       WHERE profile.id=?
         AND profile.onboarding_completed_at=?
         AND profile.default_workspace_id=?
         AND changes()=1`,
    ).bind(
      auditId,
      workspaceId,
      userId,
      userId,
      JSON.stringify({
        accountPersona: input.accountPersona,
        primaryGoal: input.primaryGoal,
        lawyerProfileProvisioned: input.accountPersona === "lawyer",
        policyEvidence: hasPolicyEvidence
          ? "registration_digests"
          : "development_bypass",
      }),
      now,
      userId,
      now,
      workspaceId,
    ),
  ]);

  const profileUpdate = results[input.accountPersona === "lawyer" ? 4 : 3];
  if (!profileUpdate.success || Number(profileUpdate.meta.changes ?? 0) !== 1) {
    const completed = await db.prepare(
      `SELECT account_type AS accountType,locale,default_workspace_id AS workspaceId
       FROM user_profiles
       WHERE id=? AND onboarding_completed_at IS NOT NULL
       LIMIT 1`,
    ).bind(userId).first<{
      accountType: string;
      locale: string;
      workspaceId: string | null;
    }>();
    if (completed?.workspaceId) {
      return {
        status: "already_completed",
        accountPersona: accountPersonas.includes(
            completed.accountType as AccountPersona,
          )
          ? completed.accountType as AccountPersona
          : "individual",
        locale: completed.locale === "uz" ? "uz" : "ru",
        workspaceId: completed.workspaceId,
        redirectTo: onboardingRedirect(
          completed.locale === "uz" ? "uz" : "ru",
        ),
      };
    }
    throw new Error("ONBOARDING_ATOMIC_WRITE_FAILED");
  }

  return {
    status: "completed",
    accountPersona: input.accountPersona,
    locale: input.locale,
    workspaceId,
    redirectTo: onboardingRedirect(input.locale),
  };
}

function invalidRequestResponse(
  error: JsonRequestError,
): Response {
  const status = error === "payload_too_large"
    ? 413
    : error === "invalid_content_type"
      ? 415
      : 400;
  return Response.json({
    code: error.toLocaleUpperCase("en-US"),
    error: "Проверьте формат запроса. / So‘rov formatini tekshiring.",
  }, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

function localizedError(
  code: "PROFILE_NOT_FOUND" | "POLICY_EVIDENCE_REQUIRED",
  locale: "ru" | "uz",
): Response {
  const ru = locale === "ru";
  const error = code === "PROFILE_NOT_FOUND"
    ? (ru ? "Профиль не найден." : "Profil topilmadi.")
    : (
      ru
        ? "Не найдены подтверждения обязательных документов. Повторите регистрацию или обратитесь в поддержку."
        : "Majburiy hujjatlar tasdig‘i topilmadi. Qayta ro‘yxatdan o‘ting yoki yordam xizmatiga murojaat qiling."
    );
  return Response.json({ code, error }, {
    status: code === "PROFILE_NOT_FOUND" ? 404 : 409,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

export async function handleOnboardingRequest(
  request: Request,
  dependencies: OnboardingDependencies,
): Promise<Response> {
  const parsed = await parseJsonRequest(
    request,
    onboardingInputSchema,
    ONBOARDING_MAX_BYTES,
  );
  if (!parsed.ok) return invalidRequestResponse(parsed.error);
  const result = await completeOnboarding(parsed.data, dependencies);
  if (result.status === "profile_not_found") {
    return localizedError("PROFILE_NOT_FOUND", parsed.data.locale);
  }
  if (result.status === "policy_evidence_required") {
    return localizedError("POLICY_EVIDENCE_REQUIRED", parsed.data.locale);
  }
  return Response.json({
    ok: true,
    accountPersona: result.accountPersona,
    workspaceId: result.workspaceId,
    redirectTo: result.redirectTo,
  }, {
    status: 200,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}
