"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import type { PublicLanguage } from "../../../content/types";

type ThemeMode = "system" | "light" | "dark";

const labels = {
  ru: { system: "Системная тема", light: "Светлая тема", dark: "Тёмная тема", group: "Тема оформления" },
  uz: { system: "Tizim mavzusi", light: "Yorug‘ mavzu", dark: "Qorong‘i mavzu", group: "Ko‘rinish mavzusi" },
  en: { system: "System theme", light: "Light theme", dark: "Dark theme", group: "Appearance" },
} as const;

const modes = [["system", Laptop], ["light", Sun], ["dark", Moon]] as const;
const THEME_CHANGE_EVENT = "juro-theme-change";

function readThemeMode(): ThemeMode {
  if (typeof document === "undefined") return "system";
  const value = document.documentElement.dataset.themeMode;
  return value === "system" || value === "light" || value === "dark" ? value : "system";
}

function subscribeThemeMode(onStoreChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
}

function announceThemeMode() {
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

function apply(mode: ThemeMode) {
  const resolved = mode === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode;
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

function writeThemeCookie(value: string) {
  document.cookie = value;
}

export function PublicThemeSwitcher({ locale }: { locale: PublicLanguage }) {
  const mode = useSyncExternalStore(subscribeThemeMode, readThemeMode, () => "system");
  useEffect(() => {
    if (mode !== "system") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const update = () => apply("system");
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [mode]);

  function select(next: ThemeMode) {
    localStorage.setItem("juro-theme", next);
    const shared = location.hostname === "juro.uz" || location.hostname.endsWith(".juro.uz");
    writeThemeCookie(`juro_theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax${shared ? "; Domain=.juro.uz; Secure" : ""}`);
    apply(next);
    announceThemeMode();
  }

  return <div className="public-theme-switcher" role="group" aria-label={labels[locale].group}>{modes.map(([value, Icon]) => <button aria-label={labels[locale][value]} aria-pressed={mode === value} title={labels[locale][value]} key={value} onClick={() => select(value)} type="button"><Icon aria-hidden="true" /></button>)}</div>;
}
