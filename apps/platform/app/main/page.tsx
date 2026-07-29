import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getChatGPTUser } from "../chatgpt-auth";
import { workspaceProfile } from "../../lib/platform/profile";
import { getOrCreateUserProfile } from "../../lib/document-builder/storage/db";
export const dynamic="force-dynamic";
export default async function Main(){const user=await getChatGPTUser();if(!user)redirect("/uz/auth/login?returnTo=/main");let profile=await workspaceProfile(user.email);if(!profile){await getOrCreateUserProfile(user);profile=await workspaceProfile(user.email);}if(profile&&!profile.onboardingCompleted)redirect(`/${profile.locale}/onboarding`);if(profile)redirect(`/${profile.locale}/${profile.accountType}/dashboard`);const store=await cookies();const locale=store.get("juro_locale")?.value==="ru"?"ru":"uz";const saved=store.get("juro_account_type")?.value;const account=saved==="business"||saved==="entrepreneur"||saved==="lawyer"?saved:"individual";redirect(`/${locale}/${account}/dashboard`);}
