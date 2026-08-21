import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getChatGPTUser } from "./chatgpt-auth";
import { workspaceProfile } from "../lib/platform/profile";
import {
  isLawyerHostRequest,
  lawyerLandingDestination,
} from "../lib/platform/lawyer-entry-routing";

export const dynamic = "force-dynamic";

export default async function Root() {
  const user = await getChatGPTUser();
  if (!user) redirect("/uz/auth/login");
  const profile = await workspaceProfile(user.email);
  const requestHeaders = await headers();
  if (profile?.accountType === "lawyer") {
    redirect(lawyerLandingDestination(
      profile,
      isLawyerHostRequest(requestHeaders),
      requestHeaders.get("host"),
    ));
  }
  if (!profile?.onboardingCompleted) redirect("/uz/onboarding");
  redirect(`/${profile.locale}/${profile.accountType}/dashboard`);
}
