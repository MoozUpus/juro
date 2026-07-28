"use client";
import { LogOut } from "lucide-react";
import type { PlatformLocale } from "../../lib/platform/routing";
export function LogoutButton({ label, locale }: { label: string; locale: PlatformLocale }) {
  const returnTo = encodeURIComponent(`/${locale}/auth/login`);
  return <button aria-label={label} onClick={async()=>{await fetch("/api/auth/logout",{method:"POST",headers:{"x-juro-csrf":"1"}}).catch(()=>null);window.location.assign(`/signout-with-chatgpt?return_to=${returnTo}`);}}><LogOut/></button>;
}
