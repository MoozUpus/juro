import { redirect } from "next/navigation";
import { getChatGPTUser } from "./chatgpt-auth";
import { workspaceProfile } from "../lib/platform/profile";

export const dynamic = "force-dynamic";

export default async function Root() {
  const user = await getChatGPTUser();
  if (!user) redirect("/uz/auth/login");
  const profile = await workspaceProfile(user.email);
  if (!profile?.onboardingCompleted) redirect("/uz/onboarding");
  redirect(`/${profile.locale}/${profile.accountType}/main`);
}
