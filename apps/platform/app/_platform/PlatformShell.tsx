"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the persisted sidebar preference is restored after hydration */

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  Bell,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  CalendarCheck2,
  CalendarDays,
  ChevronDown,
  Ellipsis,
  FileCheck2,
  FilePenLine,
  Files,
  HelpCircle,
  History,
  Home,
  Languages,
  Menu,
  PanelLeftClose,
  MessageSquareText,
  PanelLeftOpen,
  ReceiptText,
  CreditCard,
  Scale,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  platformBasePath,
  type AccountType,
  type PlatformLocale,
} from "../../lib/platform/routing";
import type { WorkspaceOption } from "../../lib/platform/workspace";
import { GlobalSearch } from "./GlobalSearch";
import { LogoutButton } from "./LogoutButton";
import { PlatformRouteProvider } from "./PlatformRouteContext";
import { useSessionRefresh } from "./useSessionRefresh";
import { ThemeSwitcher } from "../_theme/ThemeSwitcher";
import { SidebarSectionLabel } from "./SidebarSectionLabel";

type Props = {
  locale: PlatformLocale;
  accountType: AccountType;
  userName: string;
  activeWorkspaceId: string;
  workspaces: WorkspaceOption[];
  demoAccount: { accountKey: "client_demo" | "lawyer_demo" | "admin_demo"; datasetVersion: number; syntheticDisclosure: string } | null;
  children: React.ReactNode;
};

const primaryNav = [
  ["ai-chat", Bot, "Спросить AI", "AI’dan so‘rash"],
  ["document-builder", FilePenLine, "Создать документ", "Hujjat yaratish"],
  ["document-review", FileCheck2, "Проверить документ", "Hujjatni tekshirish"],
  ["cases", BriefcaseBusiness, "Мои дела", "Mening ishlarim"],
] as const;

const lawyerPrimaryNav = [
  ["dashboard", Home, "Главная", "Bosh sahifa"],
  ["consultations?view=requests", Bell, "Заявки", "So‘rovlar"],
  [
    "consultations?view=schedule",
    CalendarCheck2,
    "Консультации",
    "Maslahatlar",
  ],
  ["consultations?view=matters", BriefcaseBusiness, "Дела", "Ishlar"],
] as const;

const lawyerClientNav = [
  ["consultations?view=clients", UsersRound, "Клиенты", "Mijozlar"],
  ["consultations?view=messages", MessageSquareText, "Сообщения", "Xabarlar"],
  ["consultations?view=documents", Files, "Документы", "Hujjatlar"],
  ["consultations?view=tasks", CalendarCheck2, "Задачи", "Vazifalar"],
] as const;

const lawyerAiNav = [
  ["ai-chat", Bot, "Профессиональный AI", "Professional AI"],
  ["document-builder", FilePenLine, "Создать документ", "Hujjat yaratish"],
  ["document-review", FileCheck2, "Анализ и сравнение", "Tahlil va taqqoslash"],
  ["monitoring", Scale, "Мониторинг", "Monitoring"],
] as const;

const lawyerPracticeNav = [
  ["calendar", CalendarDays, "Календарь", "Kalendar"],
  ["knowledge", BookOpen, "База знаний", "Bilimlar bazasi"],
  ["profile", UserRound, "Публичный профиль", "Ommaviy profil"],
  ["settings", ShieldCheck, "Настройки", "Sozlamalar"],
] as const;

const lawyerFinanceNav = [
  ["billing", CreditCard, "Подписка и расчёты", "Obuna va hisob-kitob"],
  ["demo-payments", ReceiptText, "Демо-платежи", "Demo to‘lovlar"],
] as const;

const documentNav = [
  ["documents", Files, "Мои документы", "Mening hujjatlarim"],
  [
    "document-review?mode=compare",
    Files,
    "Сравнить версии",
    "Versiyalarni solishtirish",
  ],
] as const;

const caseworkNav = [
  ["action-plan", CalendarCheck2, "Планы действий", "Harakatlar rejalari"],
  ["calendar", CalendarDays, "Календарь", "Kalendar"],
  ["archive", Archive, "Архив", "Arxiv"],
  ["history", History, "История", "Tarix"],
] as const;

const helpNav = [
  ["consultations", ReceiptText, "Консультации", "Maslahatlar"],
  ["lawyers", UsersRound, "Юристы", "Yuristlar"],
  [
    "monitoring",
    Scale,
    "Мониторинг законодательства",
    "Qonunchilik monitoringi",
  ],
] as const;

const managementNav = [
  ["team", UsersRound, "Команда", "Jamoa"],
  ["notifications", Bell, "Уведомления", "Bildirishnomalar"],
  ["billing", CreditCard, "Тариф", "Tarif"],
] as const;

export function PlatformShell({
  locale,
  accountType,
  userName,
  activeWorkspaceId,
  workspaces,
  demoAccount,
  children,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const sidebarRef = useRef<HTMLElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useSessionRefresh(locale);
  const base = platformBasePath(locale, accountType, activeWorkspaceId);
  const business = accountType === "business";
  const lawyer = accountType === "lawyer";
  const primaryItems = lawyer ? lawyerPrimaryNav : primaryNav;
  const toolGroups = lawyer
    ? ([
        {
          key: "clients",
          ru: "Клиенты и работа",
          uz: "Mijozlar va ish",
          items: lawyerClientNav,
        },
        {
          key: "ai",
          ru: "AI и документы",
          uz: "AI va hujjatlar",
          items: lawyerAiNav,
        },
        {
          key: "practice",
          ru: "Практика",
          uz: "Amaliyot",
          items: lawyerPracticeNav,
        },
        {
          key: "finance",
          ru: "Финансы",
          uz: "Moliya",
          items: lawyerFinanceNav,
        },
      ] as const)
    : ([
        {
          key: "documents",
          ru: "Документы",
          uz: "Hujjatlar",
          items: documentNav,
        },
        { key: "casework", ru: "Дела", uz: "Ishlar", items: caseworkNav },
        { key: "help", ru: "Помощь", uz: "Yordam", items: helpNav },
        {
          key: "management",
          ru: "Управление",
          uz: "Boshqaruv",
          items: managementNav.filter(([slug]) => slug !== "team" || business),
        },
      ] as const);
  const routeIsActive = (slug: string) => {
    const [route, query] = slug.split("?");
    const href = `${base}/${route}`;
    const matchesRoute = pathname === href || pathname.startsWith(`${href}/`);
    if (!matchesRoute) return false;
    if (!query) return true;
    const expectedParams = new URLSearchParams(query);
    return Array.from(expectedParams.entries()).every(
      ([key, value]) => searchParams.get(key) === value,
    );
  };
  const documentRouteIsActive = (slug: string) => {
    if (slug !== "documents") return routeIsActive(slug);
    const href = `${base}/${slug}`;
    return (
      pathname === href ||
      (pathname.startsWith(`${href}/`) &&
        !pathname.startsWith(`${href}/comparisons`))
    );
  };
  const moreHasActiveRoute = toolGroups.some((group) =>
    group.items.some(([slug]) => documentRouteIsActive(slug)),
  );
  useEffect(() => {
    setCollapsed(localStorage.getItem("juro-sidebar-collapsed") === "1");
  }, []);
  useEffect(() => {
    if (moreHasActiveRoute) setMoreOpen(true);
  }, [moreHasActiveRoute]);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const sync = () => setMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        openButtonRef.current?.focus();
        return;
      }
      if (event.key === "Tab") {
        const focusable = Array.from(
          sidebarRef.current?.querySelectorAll<HTMLElement>(
            "a[href],button:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex='-1'])",
          ) ?? [],
        );
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
    document.documentElement.lang = next;
    document.cookie = `juro_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    // Preserve the concrete object state (conversation, branch, comparison,
    // selected case) instead of sending a user back to an empty screen after
    // changing language. Route-level authorization still validates every ID.
    const nextPath = pathname.replace(`/${locale}/`, `/${next}/`);
    const query = searchParams.toString();
    router.push(query ? `${nextPath}?${query}` : nextPath);
  };
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("juro-sidebar-collapsed", next ? "1" : "0");
  };
  const closeMobileMenu = () => {
    setOpen(false);
    window.requestAnimationFrame(() => openButtonRef.current?.focus());
  };
  const switchWorkspace = async (workspaceId: string) => {
    if (!workspaceId || workspaceId === activeWorkspaceId || switchingWorkspace)
      return;
    setSwitchingWorkspace(true);
    setWorkspaceError("");
    try {
      const response = await fetch("/api/platform/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ workspaceId, locale }),
      });
      const body = (await response.json()) as {
        redirectTo?: string;
        error?: string;
      };
      if (!response.ok || !body.redirectTo) {
        throw new Error(
          body.error ||
            (locale === "ru"
              ? "Не удалось переключить пространство."
              : "Makonni almashtirib bo‘lmadi."),
        );
      }
      window.location.assign(body.redirectTo);
    } catch (value) {
      setWorkspaceError(value instanceof Error ? value.message : String(value));
      setSwitchingWorkspace(false);
    }
  };
  return (
    <PlatformRouteProvider basePath={base}>
      <div className={`platform-shell ${collapsed ? "is-collapsed" : ""}`}>
        <a className="platform-skip-link" href="#main-content">
          {locale === "ru" ? "Перейти к содержанию" : "Asosiy mazmunga o‘tish"}
        </a>
        <aside
          ref={sidebarRef}
          id="platform-navigation"
          className={`platform-sidebar ${open ? "open" : ""}`}
          aria-label={
            locale === "ru" ? "Основная навигация" : "Asosiy navigatsiya"
          }
          aria-hidden={mobile && !open ? true : undefined}
          inert={mobile && !open ? true : undefined}
        >
          <div className="platform-brand">
            <Link href={`${base}/dashboard`} aria-label="JURO">
              <Image
                src="/juro-logo-light.png"
                alt="JURO"
                width={236}
                height={120}
                priority
                unoptimized
              />
            </Link>
            <button
              type="button"
              className="platform-mobile-close"
              ref={closeButtonRef}
              onClick={closeMobileMenu}
              aria-label={locale === "ru" ? "Закрыть меню" : "Menyuni yopish"}
            >
              <X />
            </button>
          </div>
          <div
            className={`platform-account ${switchingWorkspace ? "switching" : ""}`}
          >
            <span>{business ? <BriefcaseBusiness /> : <UserRound />}</span>
            <div>
              <small>{locale === "ru" ? "Пространство" : "Makon"}</small>
              {!lawyer && workspaces.length > 1 ? (
                <select
                  value={activeWorkspaceId}
                  disabled={switchingWorkspace}
                  onChange={(event) => void switchWorkspace(event.target.value)}
                  aria-label={
                    locale === "ru"
                      ? "Выбрать личное или бизнес-пространство"
                      : "Shaxsiy yoki biznes makonini tanlash"
                  }
                >
                  {workspaces.map((workspace) => (
                    <option value={workspace.id} key={workspace.id}>
                      {workspace.type === "business"
                        ? locale === "ru"
                          ? "Бизнес"
                          : "Biznes"
                        : locale === "ru"
                          ? "Личное"
                          : "Shaxsiy"}{" "}
                      · {workspace.name}
                    </option>
                  ))}
                </select>
              ) : (
                <b>
                  {lawyer
                    ? locale === "ru"
                      ? "Кабинет юриста"
                      : "Yurist kabineti"
                    : business
                      ? locale === "ru"
                        ? "Бизнес"
                        : "Biznes"
                      : locale === "ru"
                        ? "Личное"
                        : "Shaxsiy"}
                </b>
              )}
            </div>
          </div>
          {workspaceError && (
            <p className="platform-workspace-error" role="alert">
              {workspaceError}
            </p>
          )}
          <nav>
            <div className="platform-nav-group">
              {primaryItems.map(([slug, Icon, ru, uz]) => {
                const href = `${base}/${slug}`;
                const active = routeIsActive(slug);
                const label = locale === "ru" ? ru : uz;
                return (
                  <Link
                    key={slug}
                    className={active ? "active" : ""}
                    aria-current={active ? "page" : undefined}
                    href={href}
                    onClick={() => setOpen(false)}
                    title={collapsed ? label : undefined}
                  >
                    <Icon />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
            <details
              className="platform-nav-more"
              open={moreOpen}
              onToggle={(event) => setMoreOpen(event.currentTarget.open)}
            >
              <summary
                title={
                  collapsed
                    ? locale === "ru"
                      ? "Все инструменты"
                      : "Barcha vositalar"
                    : undefined
                }
              >
                <Ellipsis />
                <span>
                  {locale === "ru" ? "Все инструменты" : "Barcha vositalar"}
                </span>
                <ChevronDown
                  className="platform-nav-more-chevron"
                  aria-hidden="true"
                />
              </summary>
              <div className="platform-nav-more-content">
                {toolGroups.map((group) => (
                  <section
                    className="platform-nav-tool-group"
                    key={group.key}
                    aria-label={locale === "ru" ? group.ru : group.uz}
                  >
                    <SidebarSectionLabel
                      locale={locale}
                      ru={group.ru}
                      uz={group.uz}
                    />
                    {group.items.map(([slug, Icon, ru, uz]) => {
                      const href = `${base}/${slug}`;
                      const active = documentRouteIsActive(slug);
                      const label = locale === "ru" ? ru : uz;
                      return (
                        <Link
                          key={slug}
                          className={active ? "active" : ""}
                          aria-current={active ? "page" : undefined}
                          href={href}
                          onClick={() => setOpen(false)}
                          title={collapsed ? label : undefined}
                        >
                          <Icon />
                          <span>{label}</span>
                        </Link>
                      );
                    })}
                  </section>
                ))}
              </div>
            </details>
          </nav>
          <div className="platform-sidebar-bottom">
            <Link href={`${base}/security`}>
              <ShieldCheck />
              <span>{locale === "ru" ? "Безопасность" : "Xavfsizlik"}</span>
            </Link>
            <Link href={`${base}/help`}>
              <HelpCircle />
              <span>{locale === "ru" ? "Помощь" : "Yordam"}</span>
            </Link>
            <LogoutButton
              className="platform-sidebar-logout"
              locale={locale}
              label={locale === "ru" ? "Выйти" : "Chiqish"}
            />
          </div>
          <button
            className="platform-collapse"
            onClick={toggleCollapsed}
            aria-label={
              collapsed
                ? locale === "ru"
                  ? "Развернуть меню"
                  : "Menyuni kengaytirish"
                : locale === "ru"
                  ? "Свернуть меню"
                  : "Menyuni yig‘ish"
            }
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            <span>{locale === "ru" ? "Свернуть" : "Yig‘ish"}</span>
          </button>
        </aside>
        {open && (
          <button
            type="button"
            className="platform-backdrop"
            aria-hidden="true"
            tabIndex={-1}
            onClick={closeMobileMenu}
          />
        )}
        <div className="platform-main">
          <header className="platform-topbar">
            <div>
              <small>
                {lawyer
                  ? locale === "ru"
                    ? "JURO · практика юриста"
                    : "JURO · yurist amaliyoti"
                  : locale === "ru"
                    ? "JURO · защищённое пространство"
                    : "JURO · himoyalangan makon"}
              </small>
              {userName ? <strong>{userName}</strong> : null}
            </div>
            <div>
              <GlobalSearch locale={locale} accountType={accountType} />
              <ThemeSwitcher locale={locale} compact />
              <button
                className="platform-language-switcher"
                onClick={switchLanguage}
                aria-label={
                  locale === "ru"
                    ? "Переключить на узбекский"
                    : "Rus tiliga o‘tish"
                }
              >
                <Languages />
                {locale.toUpperCase()}
              </button>
              <Link
                href={`${base}/profile`}
                aria-label={locale === "ru" ? "Профиль" : "Profil"}
              >
                <UserRound />
              </Link>
              <LogoutButton
                className="platform-topbar-logout"
                locale={locale}
                label={locale === "ru" ? "Выйти" : "Chiqish"}
              />
            </div>
          </header>
          <main className="platform-content" id="main-content" tabIndex={-1}>
            {demoAccount && <div className="platform-demo-banner" role="status"><strong>{locale === "ru" ? "Investor Demo · синтетические данные" : "Investor Demo · sintetik ma’lumotlar"}</strong><span>{demoAccount.syntheticDisclosure} · v{demoAccount.datasetVersion}</span></div>}
            {children}
          </main>
          <nav
            className="platform-mobile-nav"
            aria-label={
              locale === "ru" ? "Мобильная навигация" : "Mobil navigatsiya"
            }
          >
            {(lawyer
              ? [
                  ["dashboard", Home, locale === "ru" ? "Главная" : "Bosh"],
                  [
                    "consultations?view=requests",
                    Bell,
                    locale === "ru" ? "Заявки" : "So‘rov",
                  ],
                  [
                    "consultations?view=schedule",
                    CalendarCheck2,
                    locale === "ru" ? "Приёмы" : "Qabul",
                  ],
                  [
                    "consultations?view=matters",
                    BriefcaseBusiness,
                    locale === "ru" ? "Дела" : "Ishlar",
                  ],
                ]
              : [
                  ["ai-chat", Bot, locale === "ru" ? "AI" : "AI"],
                  [
                    "document-builder",
                    FilePenLine,
                    locale === "ru" ? "Создать" : "Yaratish",
                  ],
                  [
                    "document-review",
                    FileCheck2,
                    locale === "ru" ? "Проверить" : "Tekshirish",
                  ],
                  [
                    "cases",
                    BriefcaseBusiness,
                    locale === "ru" ? "Дела" : "Ishlar",
                  ],
                ]
            ).map(([slug, Icon, label]) => {
              const href = `${base}/${slug as string}`;
              const active = routeIsActive(slug as string);
              const NavIcon = Icon as typeof Home;
              return (
                <Link
                  href={href}
                  key={slug as string}
                  className={active ? "active" : ""}
                  aria-current={active ? "page" : undefined}
                >
                  <NavIcon />
                  <span>{label as string}</span>
                </Link>
              );
            })}
            <button
              ref={openButtonRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-label={locale === "ru" ? "Открыть меню" : "Menyuni ochish"}
              aria-expanded={open}
              aria-controls="platform-navigation"
            >
              <Menu />
              <span>{locale === "ru" ? "Ещё" : "Yana"}</span>
            </button>
          </nav>
        </div>
      </div>
    </PlatformRouteProvider>
  );
}
