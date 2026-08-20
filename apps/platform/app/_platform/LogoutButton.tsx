"use client";
import { LogOut } from "lucide-react";
import type { PlatformLocale } from "../../lib/platform/routing";
export function LogoutButton({
  className,
  label,
  locale,
}: {
  className?: string;
  label: string;
  locale: PlatformLocale;
}) {
  const returnTo = encodeURIComponent(`/${locale}/auth/login`);
  return (
    <button
      className={className}
      aria-label={label}
      onClick={async () => {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "x-juro-csrf": "1" },
        }).catch(() => null);
        window.location.assign(
          `/signout-with-chatgpt?return_to=${returnTo}`,
        );
      }}
    >
      <LogOut />
      {className === "platform-sidebar-logout" ? <span>{label}</span> : null}
    </button>
  );
}
