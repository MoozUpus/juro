import { requireD1 } from "../document-builder/storage/runtime";
import type { AccountType, PlatformLocale } from "./routing";

export async function workspaceProfile(email: string): Promise<{ locale: PlatformLocale; accountType: AccountType; onboardingCompleted: boolean } | null> {
  try {
    const row = await requireD1().prepare(
      `SELECT p.locale,coalesce(w.type,p.account_type) AS accountType,
        p.onboarding_completed_at AS onboardingCompletedAt
       FROM user_profiles p LEFT JOIN workspaces w ON w.id=p.default_workspace_id
       WHERE lower(p.email)=lower(?) LIMIT 1`,
    )
      .bind(email).first<{ locale: string; accountType: string; onboardingCompletedAt: string | null }>();
    if (!row) return null;
    return {
      locale: row.locale === "uz" ? "uz" : "ru",
      accountType: row.accountType === "business" ? "business" : "individual",
      onboardingCompleted: Boolean(row.onboardingCompletedAt),
    };
  } catch { return null; }
}
