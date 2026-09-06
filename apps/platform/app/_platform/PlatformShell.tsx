"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the persisted sidebar preference is restored after hydration */

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  Bell,
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
  AUTHENTICATED_PLATFORM_UI_LOCALES,
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
import { platformApiError, platformLocaleValue } from "../../content/platform-ui";

type Props = {
  locale: PlatformLocale;
  accountType: AccountType;
  userName: string;
  activeWorkspaceId: string;
  workspaces: WorkspaceOption[];
  children: React.ReactNode;
};

const primaryNav = [
  ["ai-chat", Bot, "Спросить AI", "AI’dan so‘rash", "Ask AI"],
  ["document-builder", FilePenLine, "Создать документ", "Hujjat yaratish", "Create a document"],
  ["document-review", FileCheck2, "Проверить документ", "Hujjatni tekshirish", "Review a document"],
  ["cases", BriefcaseBusiness, "Мои дела", "Mening ishlarim", "My matters"],
] as const;

const lawyerPrimaryNav = [
  ["dashboard", Home, "Главная", "Bosh sahifa", "Home"],
  ["consultations?view=requests", Bell, "Заявки", "So‘rovlar", "Requests"],
  [
    "consultations?view=schedule",
    CalendarCheck2,
    "Консультации",
    "Maslahatlar",
    "Consultations",
  ],
  ["consultations?view=matters", BriefcaseBusiness, "Дела", "Ishlar", "Matters"],
] as const;

const lawyerClientNav = [
  ["consultations?view=clients", UsersRound, "Клиенты", "Mijozlar", "Clients"],
  ["consultations?view=messages", MessageSquareText, "Сообщения", "Xabarlar", "Messages"],
  ["consultations?view=documents", Files, "Документы", "Hujjatlar", "Documents"],
  ["consultations?view=tasks", CalendarCheck2, "Задачи", "Vazifalar", "Tasks"],
] as const;

const lawyerPracticeNav = [
  ["calendar", CalendarDays, "Календарь", "Kalendar", "Calendar"],
  ["profile", UserRound, "Публичный профиль", "Ommaviy profil", "Public profile"],
  ["settings", ShieldCheck, "Настройки", "Sozlamalar", "Settings"],
] as const;

const documentNav = [
  ["documents", Files, "Мои документы", "Mening hujjatlarim", "My documents"],
  [
    "document-review?mode=compare",
    Files,
    "Сравнить версии",
    "Versiyalarni solishtirish",
    "Compare versions",
  ],
] as const;

const caseworkNav = [
  ["action-plan", CalendarCheck2, "Планы действий", "Harakatlar rejalari", "Action plans"],
  ["calendar", CalendarDays, "Календарь", "Kalendar", "Calendar"],
  ["archive", Archive, "Архив", "Arxiv", "Archive"],
  ["history", History, "История", "Tarix", "History"],
] as const;

const helpNav = [
  ["consultations", ReceiptText, "Консультации", "Maslahatlar", "Consultations"],
  ["lawyers", UsersRound, "Юристы", "Yuristlar", "Lawyers"],
  [
    "monitoring",
    Scale,
    "Мониторинг законодательства",
    "Qonunchilik monitoringi",
    "Legal monitoring",
  ],
] as const;

const managementNav = [
  ["team", UsersRound, "Команда", "Jamoa", "Team"],
  ["notifications", Bell, "Уведомления", "Bildirishnomalar", "Notifications"],
  ["billing", CreditCard, "Тариф", "Tarif", "Plan"],
] as const;

export function PlatformShell({
  locale,
  accountType,
  userName,
  activeWorkspaceId,
  workspaces,
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
  const text = (value: { ru: string; uz: string; en: string }) =>
    platformLocaleValue(locale, value);
  const readyLocaleIndex = AUTHENTICATED_PLATFORM_UI_LOCALES.findIndex((candidate) => candidate === locale);
  const nextLocale: PlatformLocale = AUTHENTICATED_PLATFORM_UI_LOCALES[
    (Math.max(readyLocaleIndex, 0) + 1) % AUTHENTICATED_PLATFORM_UI_LOCALES.length
  ] ?? "ru";
  const primaryItems = lawyer ? lawyerPrimaryNav : primaryNav;
  const toolGroups = lawyer
    ? ([
        {
          key: "clients",
          ru: "Клиенты и работа",
          uz: "Mijozlar va ish",
          en: "Clients and work",
          items: lawyerClientNav,
        },
        {
          key: "practice",
          ru: "Практика",
          uz: "Amaliyot",
          en: "Practice",
          items: lawyerPracticeNav,
        },
      ] as const)
    : ([
        {
          key: "documents",
          ru: "Документы",
          uz: "Hujjatlar",
          en: "Documents",
          items: documentNav,
        },
        { key: "casework", ru: "Дела", uz: "Ishlar", en: "Matters", items: caseworkNav },
        { key: "help", ru: "Помощь", uz: "Yordam", en: "Support", items: helpNav },
        {
          key: "management",
          ru: "Управление",
          uz: "Boshqaruv",
          en: "Management",
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
    document.documentElement.lang = nextLocale;
    document.cookie = `juro_locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    // Preserve the concrete object state (conversation, branch, comparison,
    // selected case) instead of sending a user back to an empty screen after
    // changing language. Route-level authorization still validates every ID.
    const nextPath = pathname.replace(`/${locale}/`, `/${nextLocale}/`);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("prompt");
    const query = nextParams.toString();
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
        throw new Error(platformApiError(locale, body.error, text({
          ru: "Не удалось переключить пространство.",
          uz: "Makonni almashtirib bo‘lmadi.",
          en: "We could not switch workspaces.",
        })));
      }
      window.location.assign(body.redirectTo);
    } catch (value) {
      setWorkspaceError(value instanceof Error ? value.message : String(value));
      setSwitchingWorkspace(false);
    }
  };
  return (
    <PlatformRouteProvider basePath={base} workspaceId={activeWorkspaceId}>
      <div className={`platform-shell ${collapsed ? "is-collapsed" : ""}`}>
        <a className="platform-skip-link" href="#main-content">
          {text({ ru: "Перейти к содержанию", uz: "Asosiy mazmunga o‘tish", en: "Skip to main content" })}
        </a>
        <aside
          ref={sidebarRef}
          id="platform-navigation"
          className={`platform-sidebar ${open ? "open" : ""}`}
          aria-label={
            text({ ru: "Основная навигация", uz: "Asosiy navigatsiya", en: "Main navigation" })
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
              aria-label={text({ ru: "Закрыть меню", uz: "Menyuni yopish", en: "Close menu" })}
            >
              <X />
            </button>
          </div>
          <div
            className={`platform-account ${switchingWorkspace ? "switching" : ""}`}
          >
            <span>{business ? <BriefcaseBusiness /> : <UserRound />}</span>
            <div>
              <small>{text({ ru: "Пространство", uz: "Makon", en: "Workspace" })}</small>
              {!lawyer && workspaces.length > 1 ? (
                <select
                  value={activeWorkspaceId}
                  disabled={switchingWorkspace}
                  onChange={(event) => void switchWorkspace(event.target.value)}
                  aria-label={
                    text({
                      ru: "Выбрать личное или бизнес-пространство",
                      uz: "Shaxsiy yoki biznes makonini tanlash",
                      en: "Choose a personal or business workspace",
                    })
                  }
                >
                  {workspaces.map((workspace) => (
                    <option value={workspace.id} key={workspace.id}>
                      {workspace.type === "business"
                        ? text({ ru: "Бизнес", uz: "Biznes", en: "Business" })
                        : text({ ru: "Личное", uz: "Shaxsiy", en: "Personal" })}{" "}
                      · {workspace.name}
                    </option>
                  ))}
                </select>
              ) : (
                <b>
                  {lawyer
                    ? text({ ru: "Кабинет юриста", uz: "Yurist kabineti", en: "Lawyer workspace" })
                    : business
                      ? text({ ru: "Бизнес", uz: "Biznes", en: "Business" })
                      : text({ ru: "Личное", uz: "Shaxsiy", en: "Personal" })}
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
              {primaryItems.map(([slug, Icon, ru, uz, en]) => {
                const href = `${base}/${slug}`;
                const active = routeIsActive(slug);
                const label = platformLocaleValue(locale, { ru, uz, en });
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
                    ? text({ ru: "Все инструменты", uz: "Barcha vositalar", en: "All tools" })
                    : undefined
                }
              >
                <Ellipsis />
                <span>
                  {text({ ru: "Все инструменты", uz: "Barcha vositalar", en: "All tools" })}
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
                    aria-label={platformLocaleValue(locale, group)}
                  >
                    <SidebarSectionLabel
                      locale={locale}
                      ru={group.ru}
                      uz={group.uz}
                      en={group.en}
                    />
                    {group.items.map(([slug, Icon, ru, uz, en]) => {
                      const href = `${base}/${slug}`;
                      const active = documentRouteIsActive(slug);
                      const label = platformLocaleValue(locale, { ru, uz, en });
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
              <span>{text({ ru: "Безопасность", uz: "Xavfsizlik", en: "Security" })}</span>
            </Link>
            <Link href={`${base}/help`}>
              <HelpCircle />
              <span>{text({ ru: "Помощь", uz: "Yordam", en: "Help" })}</span>
            </Link>
            <LogoutButton
              className="platform-sidebar-logout"
              locale={locale}
              label={text({ ru: "Выйти", uz: "Chiqish", en: "Sign out" })}
            />
          </div>
          <button
            className="platform-collapse"
            onClick={toggleCollapsed}
            aria-label={
              collapsed
                ? text({ ru: "Развернуть меню", uz: "Menyuni kengaytirish", en: "Expand menu" })
                : text({ ru: "Свернуть меню", uz: "Menyuni yig‘ish", en: "Collapse menu" })
            }
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            <span>{text({ ru: "Свернуть", uz: "Yig‘ish", en: "Collapse" })}</span>
          </button>
        </aside>
        {open && (
          <button
            type="button"
            className="platform-backdrop"
            aria-label={text({ ru: "Закрыть меню", uz: "Menyuni yopish", en: "Close menu" })}
            onClick={closeMobileMenu}
          />
        )}
        <div className="platform-main">
          <header className="platform-topbar">
            <div>
              <small>
                {lawyer
                  ? text({ ru: "JURO · практика юриста", uz: "JURO · yurist amaliyoti", en: "JURO · legal practice" })
                  : text({ ru: "JURO · защищённое пространство", uz: "JURO · himoyalangan makon", en: "JURO · secure workspace" })}
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
                  {
                    ru: { ru: "Переключить на русский", uz: "Переключить на узбекский", en: "Переключить на английский" },
                    uz: { ru: "Rus tiliga o‘tish", uz: "O‘zbek tiliga o‘tish", en: "Ingliz tiliga o‘tish" },
                    en: { ru: "Switch to Russian", uz: "Switch to Uzbek", en: "Switch to English" },
                  }[locale][nextLocale]
                }
              >
                <Languages />
                {locale.toUpperCase()}
              </button>
              <Link
                href={`${base}/profile`}
                aria-label={text({ ru: "Профиль", uz: "Profil", en: "Profile" })}
              >
                <UserRound />
              </Link>
              <LogoutButton
                className="platform-topbar-logout"
                locale={locale}
                label={text({ ru: "Выйти", uz: "Chiqish", en: "Sign out" })}
              />
            </div>
          </header>
          <main className="platform-content" id="main-content" tabIndex={-1}>
            {children}
          </main>
          <nav
            className="platform-mobile-nav"
            aria-label={
              text({ ru: "Мобильная навигация", uz: "Mobil navigatsiya", en: "Mobile navigation" })
            }
          >
            {(lawyer
              ? [
                  ["dashboard", Home, text({ ru: "Главная", uz: "Bosh", en: "Home" })],
                  [
                    "consultations?view=requests",
                    Bell,
                    text({ ru: "Заявки", uz: "So‘rov", en: "Requests" }),
                  ],
                  [
                    "consultations?view=schedule",
                    CalendarCheck2,
                    text({ ru: "Приёмы", uz: "Qabul", en: "Meetings" }),
                  ],
                  [
                    "consultations?view=matters",
                    BriefcaseBusiness,
                    text({ ru: "Дела", uz: "Ishlar", en: "Matters" }),
                  ],
                ]
              : [
                  ["ai-chat", Bot, "AI"],
                  [
                    "document-builder",
                    FilePenLine,
                    text({ ru: "Создать", uz: "Yaratish", en: "Create" }),
                  ],
                  [
                    "document-review",
                    FileCheck2,
                    text({ ru: "Проверить", uz: "Tekshirish", en: "Review" }),
                  ],
                  [
                    "cases",
                    BriefcaseBusiness,
                    text({ ru: "Дела", uz: "Ishlar", en: "Matters" }),
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
              aria-label={text({ ru: "Открыть меню", uz: "Menyuni ochish", en: "Open menu" })}
              aria-expanded={open}
              aria-controls="platform-navigation"
            >
              <Menu />
              <span>{text({ ru: "Ещё", uz: "Yana", en: "More" })}</span>
            </button>
          </nav>
        </div>
      </div>
    </PlatformRouteProvider>
  );
}
