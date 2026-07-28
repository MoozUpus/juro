"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the persisted sidebar preference is restored after hydration */

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarCheck2,
  FileCheck2,
  FilePenLine,
  Files,
  HelpCircle,
  History,
  Home,
  Languages,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Scale,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AccountType, PlatformLocale } from "../../lib/platform/routing";
import type { WorkspaceOption } from "../../lib/platform/workspace";
import { GlobalSearch } from "./GlobalSearch";
import { LogoutButton } from "./LogoutButton";

type Props = {
  locale: PlatformLocale;
  accountType: AccountType;
  userName: string;
  activeWorkspaceId: string;
  workspaces: WorkspaceOption[];
  children: React.ReactNode;
};

const nav = [
  ["main", Home, "Главная", "Bosh sahifa"], ["ai-chat", Bot, "AI-юрист", "AI-yurist"],
  ["cases", BriefcaseBusiness, "Мои дела", "Mening ishlarim"], ["documents", Files, "Документы", "Hujjatlar"],
  ["document-builder", FilePenLine, "Создать документ", "Hujjat yaratish"], ["document-review", FileCheck2, "Проверить документ", "Hujjatni tekshirish"],
  ["monitoring", Scale, "Мониторинг", "Monitoring"],
  ["action-plan", CalendarCheck2, "План действий", "Harakatlar rejasi"], ["consultations", ReceiptText, "Консультации", "Maslahatlar"],
  ["history", History, "История", "Tarix"], ["archive", Archive, "Архив", "Arxiv"],
  ["team", UsersRound, "Команда", "Jamoa"], ["notifications", Bell, "Уведомления", "Bildirishnomalar"],
] as const;

export function PlatformShell({ locale, accountType, userName, activeWorkspaceId, workspaces, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const sidebarRef = useRef<HTMLElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const base = `/${locale}/${accountType}`;
  const business = accountType === "business";
  const visibleNav = nav.filter(([slug]) => slug !== "team" || business);
  const activeIndex = visibleNav.findIndex(([slug]) => {
    const href = `${base}/${slug}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  });
  useEffect(() => {
    setCollapsed(localStorage.getItem("juro-sidebar-collapsed") === "1");
  }, []);
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        openButtonRef.current?.focus();
        return;
      }
      if (event.key === "Tab") {
        const focusable = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex='-1'])",
        ) ?? []);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);
  const switchLanguage = () => {
    const next = locale === "ru" ? "uz" : "ru";
    document.cookie = `juro_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    router.push(pathname.replace(`/${locale}/`, `/${next}/`));
  };
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("juro-sidebar-collapsed", next ? "1" : "0");
  };
  const switchWorkspace = async (workspaceId: string) => {
    if (!workspaceId || workspaceId === activeWorkspaceId || switchingWorkspace) return;
    setSwitchingWorkspace(true);
    setWorkspaceError("");
    try {
      const response = await fetch("/api/platform/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ workspaceId, locale }),
      });
      const body = await response.json() as { redirectTo?: string; error?: string };
      if (!response.ok || !body.redirectTo) {
        throw new Error(body.error || (
          locale === "ru" ? "Не удалось переключить пространство." : "Makonni almashtirib bo‘lmadi."
        ));
      }
      window.location.assign(body.redirectTo);
    } catch (value) {
      setWorkspaceError(value instanceof Error ? value.message : String(value));
      setSwitchingWorkspace(false);
    }
  };
  return <div className={`platform-shell ${collapsed ? "is-collapsed" : ""}`}>
    <a className="platform-skip-link" href="#main-content">{locale === "ru" ? "Перейти к содержанию" : "Asosiy mazmunga o‘tish"}</a>
    <aside ref={sidebarRef} id="platform-navigation" className={`platform-sidebar ${open ? "open" : ""}`} aria-label={locale === "ru" ? "Основная навигация" : "Asosiy navigatsiya"}>
      <div className="platform-brand"><Image src="/juro-logo-light.png" alt="JURO" width={236} height={120} priority unoptimized/><button className="platform-mobile-close" ref={closeButtonRef} onClick={()=>setOpen(false)} aria-label={locale === "ru" ? "Закрыть меню" : "Menyuni yopish"}><X/></button></div>
      <div className={`platform-account ${switchingWorkspace ? "switching" : ""}`}>
        <span>{business ? <BriefcaseBusiness/> : <UserRound/>}</span>
        <div>
          <small>{locale === "ru" ? "Пространство" : "Makon"}</small>
          {workspaces.length > 1 ? (
            <select
              value={activeWorkspaceId}
              disabled={switchingWorkspace}
              onChange={(event) => void switchWorkspace(event.target.value)}
              aria-label={locale === "ru" ? "Выбрать личное или бизнес-пространство" : "Shaxsiy yoki biznes makonini tanlash"}
            >
              {workspaces.map((workspace) => (
                <option value={workspace.id} key={workspace.id}>
                  {workspace.type === "business"
                    ? (locale === "ru" ? "Бизнес" : "Biznes")
                    : (locale === "ru" ? "Личное" : "Shaxsiy")} · {workspace.name}
                </option>
              ))}
            </select>
          ) : <b>{business ? (locale === "ru" ? "Бизнес" : "Biznes") : (locale === "ru" ? "Личное" : "Shaxsiy")}</b>}
        </div>
      </div>
      {workspaceError && <p className="platform-workspace-error" role="alert">{workspaceError}</p>}
      <nav>
        {activeIndex >= 0 && <i className="platform-nav-indicator" style={{ transform: `translateY(${activeIndex * 48}px)` }} aria-hidden="true"/>}
        {visibleNav.map(([slug, Icon, ru, uz]) => { const href=`${base}/${slug}`; const active=pathname===href || pathname.startsWith(`${href}/`); const label=locale === "ru" ? ru : uz; return <Link className={active?"active":""} aria-current={active ? "page" : undefined} href={href} key={slug} onClick={()=>setOpen(false)} title={collapsed ? label : undefined}><Icon/><span>{label}</span></Link>; })}
      </nav>
      <div className="platform-sidebar-bottom"><Link href={`${base}/security`}><ShieldCheck/><span>{locale === "ru" ? "Безопасность" : "Xavfsizlik"}</span></Link><Link href={`${base}/help`}><HelpCircle/><span>{locale === "ru" ? "Помощь" : "Yordam"}</span></Link></div>
      <button className="platform-collapse" onClick={toggleCollapsed} aria-label={collapsed ? (locale === "ru" ? "Развернуть меню" : "Menyuni kengaytirish") : (locale === "ru" ? "Свернуть меню" : "Menyuni yig‘ish")} aria-expanded={!collapsed}>
        {collapsed ? <PanelLeftOpen/> : <PanelLeftClose/>}<span>{locale === "ru" ? "Свернуть" : "Yig‘ish"}</span>
      </button>
    </aside>
    {open && <button className="platform-backdrop" aria-label={locale === "ru" ? "Закрыть меню" : "Menyuni yopish"} onClick={()=>setOpen(false)}/>}
    <div className="platform-main"><header className="platform-topbar"><button ref={openButtonRef} className="platform-menu" onClick={()=>setOpen(true)} aria-label={locale === "ru" ? "Открыть меню" : "Menyuni ochish"} aria-expanded={open} aria-controls="platform-navigation"><Menu/></button><div><small>{locale === "ru" ? "JURO · защищённое пространство" : "JURO · himoyalangan makon"}</small><strong>{userName}</strong></div><div><GlobalSearch locale={locale} accountType={accountType}/><button onClick={switchLanguage} aria-label={locale === "ru" ? "Переключить на узбекский" : "Rus tiliga o‘tish"}><Languages/>{locale.toUpperCase()}</button><Link href={`${base}/profile`} aria-label={locale === "ru" ? "Профиль" : "Profil"}><UserRound/></Link><LogoutButton locale={locale} label={locale === "ru" ? "Выйти" : "Chiqish"}/></div></header><main className="platform-content" id="main-content">{children}</main>
      <nav className="platform-mobile-nav" aria-label={locale === "ru" ? "Мобильная навигация" : "Mobil navigatsiya"}>
        {[
          ["main", Home, locale === "ru" ? "Главная" : "Bosh sahifa"],
          ["ai-chat", Bot, locale === "ru" ? "AI-юрист" : "AI-yurist"],
          ["cases", BriefcaseBusiness, locale === "ru" ? "Дела" : "Ishlar"],
          ["documents", Files, locale === "ru" ? "Документы" : "Hujjatlar"],
        ].map(([slug, Icon, label]) => {
          const href = `${base}/${slug as string}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const NavIcon = Icon as typeof Home;
          return <Link href={href} key={slug as string} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><NavIcon/><span>{label as string}</span></Link>;
        })}
        <button onClick={()=>setOpen(true)} aria-expanded={open} aria-controls="platform-navigation"><MoreHorizontal/><span>{locale === "ru" ? "Ещё" : "Yana"}</span></button>
      </nav>
    </div>
  </div>;
}
