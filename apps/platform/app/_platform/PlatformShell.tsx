"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Bot, BriefcaseBusiness, CalendarCheck2, FileCheck2, FilePenLine, Files, HelpCircle, History, Home, Languages, Menu, ReceiptText, ShieldCheck, UserRound, X } from "lucide-react";
import { useState } from "react";
import type { AccountType, PlatformLocale } from "../../lib/platform/routing";
import { LogoutButton } from "./LogoutButton";

type Props = { locale: PlatformLocale; accountType: AccountType; userName: string; children: React.ReactNode };

const nav = [
  ["main", Home, "Главная", "Bosh sahifa"], ["ai-chat", Bot, "AI-юрист", "AI-yurist"],
  ["cases", BriefcaseBusiness, "Мои дела", "Mening ishlarim"], ["documents", Files, "Документы", "Hujjatlar"],
  ["document-builder", FilePenLine, "Создать документ", "Hujjat yaratish"], ["document-review", FileCheck2, "Проверить документ", "Hujjatni tekshirish"],
  ["action-plan", CalendarCheck2, "План действий", "Harakatlar rejasi"], ["consultations", ReceiptText, "Консультации", "Maslahatlar"],
  ["history", History, "История", "Tarix"], ["notifications", Bell, "Уведомления", "Bildirishnomalar"],
] as const;

export function PlatformShell({ locale, accountType, userName, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const base = `/${locale}/${accountType}`;
  const business = accountType === "business";
  const switchLanguage = () => {
    const next = locale === "ru" ? "uz" : "ru";
    document.cookie = `juro_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    router.push(pathname.replace(`/${locale}/`, `/${next}/`));
  };
  return <div className="platform-shell">
    <aside className={`platform-sidebar ${open ? "open" : ""}`}>
      <div className="platform-brand"><img src="/juro-logo-light.png" alt="JURO"/><button onClick={()=>setOpen(false)} aria-label="Закрыть меню"><X/></button></div>
      <div className="platform-account"><span>{business ? <BriefcaseBusiness/> : <UserRound/>}</span><div><small>{locale === "ru" ? "Пространство" : "Makon"}</small><b>{business ? (locale === "ru" ? "Бизнес" : "Biznes") : (locale === "ru" ? "Личное" : "Shaxsiy")}</b></div></div>
      <nav>{nav.map(([slug, Icon, ru, uz]) => { const href=`${base}/${slug}`; const active=pathname===href || pathname.startsWith(`${href}/`); return <Link className={active?"active":""} href={href} key={slug} onClick={()=>setOpen(false)}><Icon/><span>{locale === "ru" ? ru : uz}</span></Link>; })}</nav>
      <div className="platform-sidebar-bottom"><Link href={`${base}/security`}><ShieldCheck/>{locale === "ru" ? "Безопасность" : "Xavfsizlik"}</Link><Link href={`${base}/help`}><HelpCircle/>{locale === "ru" ? "Помощь" : "Yordam"}</Link></div>
    </aside>
    {open && <button className="platform-backdrop" aria-label="Закрыть меню" onClick={()=>setOpen(false)}/>} 
    <div className="platform-main"><header className="platform-topbar"><button className="platform-menu" onClick={()=>setOpen(true)} aria-label="Открыть меню"><Menu/></button><div><small>{locale === "ru" ? "JURO · защищённое пространство" : "JURO · himoyalangan makon"}</small><strong>{userName}</strong></div><div><button onClick={switchLanguage}><Languages/>{locale.toUpperCase()}</button><Link href={`${base}/profile`} aria-label={locale === "ru" ? "Профиль" : "Profil"}><UserRound/></Link><LogoutButton label={locale === "ru" ? "Выйти" : "Chiqish"}/></div></header><main className="platform-content">{children}</main></div>
  </div>;
}
