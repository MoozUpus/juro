"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { PublicAnalyticsLocale } from "../../../lib/analytics";
import styles from "./cookie-consent.module.css";

const copy = {
  ru: {
    label: "Настройки аналитики",
    text: "JURO может собирать только обезличенные события использования, без текста вопросов, документов и идентификаторов.",
    policy: "Подробнее о cookies",
    essential: "Только необходимые",
    analytics: "Разрешить аналитику",
  },
  uz: {
    label: "Analitika sozlamalari",
    text: "JURO savollar, hujjatlar matni va identifikatorlarsiz faqat anonim foydalanish hodisalarini yig‘ishi mumkin.",
    policy: "Cookie haqida batafsil",
    essential: "Faqat zarur",
    analytics: "Analitikaga ruxsat berish",
  },
  en: {
    label: "Analytics settings",
    text: "JURO may collect only anonymous usage events, without question text, documents, or identifiers.",
    policy: "Read the cookie policy",
    essential: "Essential only",
    analytics: "Allow analytics",
  },
} as const;

type Consent = "analytics" | "essential";

function consentSnapshot(): Consent | "unset" {
  try {
    const saved = window.localStorage.getItem("juro-cookie-consent");
    return saved === "analytics" || saved === "essential" ? saved : "unset";
  } catch {
    return "essential";
  }
}

function subscribeConsent(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener("juro:consent-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("juro:consent-change", callback);
  };
}

export function CookieConsentBanner({ locale }: { locale: PublicAnalyticsLocale }) {
  const consent = useSyncExternalStore(subscribeConsent, consentSnapshot, () => "essential");
  const t = copy[locale];

  const choose = (consent: Consent) => {
    try {
      window.localStorage.setItem("juro-cookie-consent", consent);
    } catch {
      return;
    }
    window.dispatchEvent(new Event("juro:consent-change"));
  };

  if (consent !== "unset") return null;
  return (
    <aside className={styles.banner} aria-label={t.label}>
      <div>
        <p>{t.text}</p>
        <Link href={`/${locale}/cookies`}>{t.policy}</Link>
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={() => choose("essential")}>{t.essential}</button>
        <button type="button" className={styles.primary} onClick={() => choose("analytics")}>{t.analytics}</button>
      </div>
    </aside>
  );
}
