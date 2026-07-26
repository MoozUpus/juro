import { redirect } from "next/navigation";
import { getChatGPTUser } from "../chatgpt-auth";
import { AuthForm } from "../_auth/AuthForm";
import "../_auth/auth.css";
import { runtimeEnv } from "../../lib/document-builder/storage/runtime";
export const dynamic="force-dynamic";
export default async function Register({searchParams}:{searchParams:Promise<{lang?:string;accountType?:string;returnTo?:string}>}){if(await getChatGPTUser())redirect("/main");const query=await searchParams;const env=runtimeEnv();return <AuthForm mode="register" initialLocale={query.lang==="uz"?"uz":"ru"} initialAccountType={query.accountType==="business"?"business":"individual"} returnTo={query.returnTo} otpEnabled={Boolean(env.RESEND_API_KEY&&env.EMAIL_FROM)} platformAuthEnabled={env.ALLOW_PLATFORM_AUTH_HEADERS==="true"}/>;}
