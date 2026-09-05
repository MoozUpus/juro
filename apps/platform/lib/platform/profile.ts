import { requireD1 } from "../document-builder/storage/runtime";
import { userIdByEmail } from "../auth/identity-protection";
import { runtimeIdentityProtection } from "../auth/identity-runtime";
import {
  isPersonalAccountType,
  type AccountType,
  type PlatformLocale,
} from "./routing";

export type WorkspaceProfile = {
  locale: PlatformLocale;
  accountType: AccountType;
  onboardingCompleted: boolean;
  lawyerProfileStatus: string | null;
  lawyerMarketplaceStatus: string | null;
};

export async function workspaceProfile(email: string): Promise<WorkspaceProfile | null> {
  try {
    const db = requireD1();
    const userId = await userIdByEmail(
      db,
      runtimeIdentityProtection(),
      email,
    );
    if (!userId) return null;
    const row = await db.prepare(
      `SELECT p.locale,p.account_type AS accountPersona,
        w.type AS workspaceType,
        p.onboarding_completed_at AS onboardingCompletedAt,
        lp.status AS lawyerProfileStatus,
        lp.marketplace_status AS lawyerMarketplaceStatus
       FROM user_profiles p
       LEFT JOIN workspaces w ON w.id=p.default_workspace_id
       LEFT JOIN lawyer_profiles lp ON lp.user_id=p.id
       WHERE p.id=? LIMIT 1`,
    )
      .bind(userId).first<{
        locale: string;
        accountPersona: string;
        workspaceType: string | null;
        onboardingCompletedAt: string | null;
        lawyerProfileStatus: string | null;
        lawyerMarketplaceStatus: string | null;
      }>();
    if (!row) return null;
    return {
      locale: row.locale === "uz" ? "uz" : "ru",
      accountType: row.workspaceType === "business"
        ? "business"
        : isPersonalAccountType(row.accountPersona)
          ? row.accountPersona
          : "individual",
      onboardingCompleted: Boolean(row.onboardingCompletedAt),
      lawyerProfileStatus: row.lawyerProfileStatus,
      lawyerMarketplaceStatus: row.lawyerMarketplaceStatus,
    };
  } catch { return null; }
}
