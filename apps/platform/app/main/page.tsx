import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getChatGPTUser } from "../chatgpt-auth";
import { workspaceProfile } from "../../lib/platform/profile";
export const dynamic="force-dynamic";
export default async function Main(){const user=await getChatGPTUser();if(!user)redirect("/login?returnTo=/main");const profile=await workspaceProfile(user.email);if(profile)redirect(`/${profile.locale}/${profile.accountType}/main`);const store=await cookies();const locale=store.get("juro_locale")?.value==="uz"?"uz":"ru";const account=store.get("juro_account_type")?.value==="business"?"business":"individual";redirect(`/${locale}/${account}/main`);}
