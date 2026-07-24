import { redirect } from "next/navigation";
import { getChatGPTUser } from "./chatgpt-auth";
export const dynamic="force-dynamic";
export default async function Root(){redirect((await getChatGPTUser())?"/main":"/login");}
