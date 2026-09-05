"use client";
import { LoaderCircle, LogOut } from "lucide-react";
import { useRef, useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";
import { platformLocaleValue } from "../../content/platform-ui";
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
  const pendingLabel = platformLocaleValue(locale, {
    ru: "Выполняется выход",
    uz: "Chiqilmoqda",
    en: "Signing out",
  });
  const pendingVisibleLabel = platformLocaleValue(locale, {
    ru: "Выходим…",
    uz: "Chiqilmoqda…",
    en: "Signing out…",
  });
  return (
    <button
      className={className}
      aria-label={pending ? pendingLabel : label}
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
        ? <span>{pending ? pendingVisibleLabel : label}</span>
        : null}
    </button>
  );
}
