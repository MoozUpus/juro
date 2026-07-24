import { requireD1 } from "../document-builder/storage/runtime";
import type { AccountType, PlatformLocale } from "./routing";

export async function workspaceProfile(email: string): Promise<{ locale: PlatformLocale; accountType: AccountType } | null> {
  try {
    const row = await requireD1().prepare("SELECT locale, account_type AS accountType FROM user_profiles WHERE lower(email)=lower(?) LIMIT 1")
      .bind(email).first<{ locale: string; accountType: string }>();
    if (!row) return null;
    return { locale: row.locale === "uz" ? "uz" : "ru", accountType: row.accountType === "business" ? "business" : "individual" };
  } catch { return null; }
}
