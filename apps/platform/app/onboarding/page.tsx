import { redirect } from "next/navigation";
import { requireChatGPTUser } from "../chatgpt-auth";
import { getOrCreateUserProfile } from "../../lib/document-builder/storage/db";
import { requireD1 } from "../../lib/document-builder/storage/runtime";
import { OnboardingForm } from "./OnboardingForm";
import {
  accountPersonas,
  type AccountPersona,
} from "../../lib/platform/onboarding";
import "./onboarding.css";

export const dynamic = "force-dynamic";

export async function OnboardingScreen({ locale: requestedLocale }: {
  locale: "ru" | "uz";
}) {
  const authUser = await requireChatGPTUser(
    `/${requestedLocale}/onboarding`,
  );
  const user = await getOrCreateUserProfile(authUser);
  const profile = await requireD1().prepare(
    `SELECT locale,account_type AS accountType,full_name AS fullName,
       last_name AS lastName,first_name AS firstName,
       middle_name AS middleName,onboarding_completed_at AS completedAt
     FROM user_profiles WHERE id = ? LIMIT 1`,
  ).bind(user.id).first<{
    locale: string;
    accountType: string;
    fullName: string | null;
    lastName: string | null;
    firstName: string | null;
    middleName: string | null;
    completedAt: string | null;
  }>();
  const locale = requestedLocale;
  const legacyName = (profile?.fullName ?? user.fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const accountPersona = accountPersonas.includes(
      profile?.accountType as AccountPersona,
    )
    ? profile?.accountType as AccountPersona
    : "individual";
  if (profile?.completedAt) redirect(`/${locale}/${accountPersona}/dashboard`);
  return (
    <OnboardingForm
      initialLocale={locale}
      initialAccountPersona={accountPersona}
      initialLastName={profile?.lastName ?? legacyName.slice(1).join(" ")}
      initialFirstName={profile?.firstName ?? legacyName[0] ?? ""}
      initialMiddleName={profile?.middleName ?? ""}
      initialPhone={user.phone ?? ""}
    />
  );
}

export default async function Onboarding({ searchParams }: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const query = await searchParams;
  return <OnboardingScreen locale={query.lang === "ru" ? "ru" : "uz"} />;
}
