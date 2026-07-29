"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Bell, BookOpenText, BookUser, Files, LogIn, Plus, UserRound } from "lucide-react";
import { builderNavigationPaths } from "../../../lib/platform/builder-paths";

export interface BuilderUser {
  displayName: string;
  email: string;
  fullName: string | null;
}

export function BuilderHeader({ user, signInPath, compact = false }: { user: BuilderUser | null; signInPath?: string; compact?: boolean }) {
  const paths = builderNavigationPaths(usePathname());
  const uz = paths.locale === "uz";
  return <header className="dbt-header">
    <Link className="dbt-brand" href={paths.builder} aria-label={uz ? "JURO — Hujjat yaratish" : "JURO — Создать документ"}>
      <Image src="/juro-mark.png" alt="" width={38} height={38} aria-hidden="true" unoptimized/>
      <b>JURO</b>
      {!compact && <span>{uz ? "Hujjat konstruktori" : "Конструктор документов"}</span>}
    </Link>
    <nav aria-label={uz ? "Hujjat konstruktori navigatsiyasi" : "Навигация конструктора документов"}>
      <Link href={paths.library}><BookOpenText size={17}/>{uz ? "Kutubxona" : "Библиотека"}</Link>
      <Link href={paths.builder}><Plus size={17}/>{uz ? "Yaratish" : "Создать"}</Link>
      {user && <><Link href={paths.documents}><Files size={17}/>{uz ? "Mening hujjatlarim" : "Мои документы"}</Link><Link href={paths.contacts}><BookUser size={17}/>{uz ? "Kontaktlar" : "Контакты"}</Link><Link href={paths.notifications} aria-label={uz ? "Bildirishnomalar" : "Уведомления"}><Bell size={17}/><span className="dbt-nav-wide">{uz ? "Bildirishnomalar" : "Уведомления"}</span></Link></>}
    </nav>
    <div className="dbt-user">
      {user ? <><UserRound size={18}/><span><strong>{user.fullName || user.email}</strong><small>{user.email}</small></span></> : <a className="dbt-sign-in" href={signInPath}><LogIn size={17}/>Войти</a>}
    </div>
  </header>;
}
