"use client";

import Link from "next/link";
import Image from "next/image";
import { Bell, BookOpenText, BookUser, Files, LogIn, Plus, UserRound } from "lucide-react";

export interface BuilderUser {
  displayName: string;
  email: string;
  fullName: string | null;
}

export function BuilderHeader({ user, signInPath, compact = false }: { user: BuilderUser | null; signInPath?: string; compact?: boolean }) {
  return <header className="dbt-header">
    <Link className="dbt-brand" href="/document-builder" aria-label="JURO — Создать документ">
      <Image src="/juro-mark.png" alt="" width={38} height={38} aria-hidden="true" unoptimized/>
      <b>JURO</b>
      {!compact && <span>Конструктор документов</span>}
    </Link>
    <nav aria-label="Тестовый модуль документов">
      <Link href="/document-builder/library"><BookOpenText size={17}/>Библиотека</Link>
      <Link href="/document-builder"><Plus size={17}/>Создать</Link>
      {user && <><Link href="/document-builder/documents"><Files size={17}/>Мои документы</Link><Link href="/document-builder/contacts"><BookUser size={17}/>Контакты</Link><Link href="/document-builder/notifications" aria-label="Уведомления"><Bell size={17}/><span className="dbt-nav-wide">Уведомления</span></Link></>}
    </nav>
    <div className="dbt-user">
      {user ? <><UserRound size={18}/><span><strong>{user.fullName || user.email}</strong><small>{user.email}</small></span></> : <a className="dbt-sign-in" href={signInPath}><LogIn size={17}/>Войти</a>}
    </div>
  </header>;
}
