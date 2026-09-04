"use client";
import { LoaderCircle, LogOut } from "lucide-react";
import { useRef, useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";
import { performLogout } from "./logout-client";
export function LogoutButton({
  className,
  label,
  locale,
}: {
  className?: string;
  label: string;
  locale: PlatformLocale;
}) {
  const started = useRef(false);
  const [pending, setPending] = useState(false);
  return (
    <button
      className={className}
      aria-label={pending ? (locale === "ru" ? "Выполняется выход" : "Chiqilmoqda") : label}
      aria-busy={pending}
      disabled={pending}
      onClick={() => {
        if (started.current) return;
        started.current = true;
        setPending(true);
        void performLogout(locale);
      }}
    >
      {pending
        ? <LoaderCircle className="spin" aria-hidden="true" />
        : <LogOut aria-hidden="true" />}
      {className === "platform-sidebar-logout"
        ? <span>{pending ? (locale === "ru" ? "Выходим…" : "Chiqilmoqda…") : label}</span>
        : null}
    </button>
  );
}
