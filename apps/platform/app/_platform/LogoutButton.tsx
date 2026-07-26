"use client";
import { LogOut } from "lucide-react";
export function LogoutButton({ label }: { label: string }) {
  return <button aria-label={label} onClick={async()=>{await fetch("/api/auth/logout",{method:"POST",headers:{"x-juro-csrf":"1"}}).catch(()=>null);window.location.assign("/signout-with-chatgpt?return_to=/login");}}><LogOut/></button>;
}
