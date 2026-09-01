"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PublicLanguage } from "../../../content/types";
import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  ANALYTICS_CONSENT_SETTINGS_EVENT,
  ANALYTICS_CONSENT_STORAGE_KEY,
  type AnalyticsConsent,
  type PublicAnalyticsAccountType,
  readAnalyticsConsent,
  trackPublicEvent,
  writeAnalyticsConsent,
} from "../../../lib/analytics";
import styles from "./public-analytics.module.css";

const copy = {
  ru: {
    title: "Настройки аналитики",
    body: "JURO может считать только обезличенные действия — без текста вопросов, документов, URL и идентификаторов людей.",
    essential: "Только необходимые",
    analytics: "Разрешить аналитику",
    policy: "Политика cookies",
  },
  uz: {
    title: "Analitika sozlamalari",
    body: "JURO faqat shaxssiz harakatlarni sanashi mumkin — savollar matni, hujjatlar, URL va shaxs identifikatorlarisiz.",
    essential: "Faqat zaruriy",
    analytics: "Analitikaga ruxsat berish",
    policy: "Cookie siyosati",
  },
  en: {
    title: "Analytics settings",
    body: "JURO can count anonymous actions only — never question text, documents, URLs or personal identifiers.",
    essential: "Essential only",
    analytics: "Allow analytics",
    policy: "Cookie policy",
  },
} as const;

function accountTypeFromLink(link: HTMLAnchorElement): PublicAnalyticsAccountType {
  try {
    const url = new URL(link.href, window.location.href);
    const requested = url.searchParams.get("accountType") ?? url.searchParams.get("intent");
    if (requested === "business" || requested === "entrepreneur" || requested === "individual" || requested === "lawyer") return requested;
    if (requested === "enterprise") return "business";
  } catch {
    // A malformed link is not an analytics event.
  }
  return "individual";
}

function isProductScenarioLink(link: HTMLAnchorElement): boolean {
  try {
    const url = new URL(link.href, window.location.href);
    return url.hostname === "app.juro.uz" && !url.pathname.includes("/auth/login");
  } catch {
    return false;
  }
}

export function PublicAnalytics({ locale }: { locale: PublicLanguage }) {
  const pathname = usePathname();
  const t = copy[locale];
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const seenViews = useRef(new Set<string>());

  useEffect(() => {
    const current = readAnalyticsConsent();
    const hydrationTimer = window.setTimeout(() => {
      setConsent(current);
      setSettingsOpen(current === null);
    }, 0);

    const onConsentChanged = (event: Event) => {
      const next = (event as CustomEvent<AnalyticsConsent>).detail;
      if (next === "essential" || next === "analytics") setConsent(next);
    };
    const onSettings = () => setSettingsOpen(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ANALYTICS_CONSENT_STORAGE_KEY) return;
      setConsent(readAnalyticsConsent());
    };
    window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onConsentChanged);
    window.addEventListener(ANALYTICS_CONSENT_SETTINGS_EVENT, onSettings);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearTimeout(hydrationTimer);
      window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onConsentChanged);
      window.removeEventListener(ANALYTICS_CONSENT_SETTINGS_EVENT, onSettings);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (consent !== "analytics") return;
    const normalized = pathname.replace(/\/+$/, "") || "/";
    const viewEvent = normalized === `/${locale}` || normalized === "/"
      ? "landing_view"
      : /^\/(?:ru|uz|en)\/lawyers\/[^/]+$/.test(normalized)
        ? "lawyer_viewed"
        : null;
    if (!viewEvent) return;
    const viewKey = `${viewEvent}:${normalized}`;
    if (seenViews.current.has(viewKey)) return;
    if (trackPublicEvent(viewEvent, { locale, accountType: "guest" })) seenViews.current.add(viewKey);
  }, [consent, locale, pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link) return;
      if (link.dataset.juroProductEvent === "source_opened") {
        trackPublicEvent("source_opened", { locale, accountType: "guest" });
        return;
      }
      if (isProductScenarioLink(link)) {
        trackPublicEvent("start_scenario", { locale, accountType: accountTypeFromLink(link) });
      }
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [locale]);

  const choose = (next: AnalyticsConsent) => {
    writeAnalyticsConsent(next);
    setConsent(next);
    setSettingsOpen(false);
  };

  if (!settingsOpen) return null;
  return (
    <aside aria-labelledby="juro-analytics-consent-title" className={styles.banner} role="region">
      <div>
        <strong id="juro-analytics-consent-title">{t.title}</strong>
        <p>{t.body}</p>
        <Link href={`/${locale}/cookies`}>{t.policy}</Link>
      </div>
      <div className={styles.actions}>
        <button onClick={() => choose("essential")} type="button">{t.essential}</button>
        <button onClick={() => choose("analytics")} type="button">{t.analytics}</button>
      </div>
    </aside>
  );
}
