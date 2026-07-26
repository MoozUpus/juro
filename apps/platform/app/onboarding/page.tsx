import { redirect } from "next/navigation";
import { requireChatGPTUser } from "../chatgpt-auth";
import { getOrCreateUserProfile } from "../../lib/document-builder/storage/db";
import { requireD1 } from "../../lib/document-builder/storage/runtime";
import { OnboardingForm } from "./OnboardingForm";
import "./onboarding.css";

export const dynamic = "force-dynamic";

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const query = await searchParams;
  const authUser = await requireChatGPTUser(`/onboarding?lang=${query.lang === "uz" ? "uz" : "ru"}`);
  const user = await getOrCreateUserProfile(authUser);
  const profile = await requireD1().prepare(
    "SELECT locale,account_type AS accountType,full_name AS fullName,company_name AS companyName,onboarding_completed_at AS completedAt FROM user_profiles WHERE id = ? LIMIT 1",
  ).bind(user.id).first<{ locale: string; accountType: string; fullName: string | null; companyName: string | null; completedAt: string | null }>();
  if (profile?.completedAt) redirect(`/${profile.locale === "uz" ? "uz" : "ru"}/${profile.accountType === "business" ? "business" : "individual"}/main`);
  return (
    <OnboardingForm
      initialLocale={query.lang === "uz" || profile?.locale === "uz" ? "uz" : "ru"}
      initialAccountType={profile?.accountType === "business" ? "business" : "individual"}
      initialName={profile?.fullName ?? user.fullName ?? ""}
      initialCompanyName={profile?.companyName ?? ""}
    />
  );
}
