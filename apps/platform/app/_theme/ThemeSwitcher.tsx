"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { isThemeMode, type ThemeMode } from "./theme";

type Props = {
  locale: "ru" | "uz";
  compact?: boolean;
  persistAccount?: boolean;
};

const options = [
  ["system", Laptop, "Системная", "Tizim"],
  ["light", Sun, "Светлая", "Yorug‘"],
  ["dark", Moon, "Тёмная", "Qorong‘i"],
] as const;

const THEME_CHANGE_EVENT = "juro-theme-change";

function readThemeMode(): ThemeMode {
  if (typeof document === "undefined") return "system";
  const value = document.documentElement.dataset.themeMode;
  return isThemeMode(value) ? value : "system";
}

function subscribeThemeMode(onStoreChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
}

function announceThemeMode() {
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

function applyTheme(mode: ThemeMode) {
  const resolved = mode === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : mode;
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

function writePreference(mode: ThemeMode) {
  localStorage.setItem("juro-theme", mode);
  const shared = window.location.hostname === "juro.uz" || window.location.hostname.endsWith(".juro.uz");
  document.cookie = `juro_theme=${mode}; Path=/; Max-Age=31536000; SameSite=Lax${shared ? "; Domain=.juro.uz; Secure" : ""}`;
}

export function ThemeSwitcher({ locale, compact = false, persistAccount = true }: Props) {
  const mode = useSyncExternalStore(
    subscribeThemeMode,
    readThemeMode,
    () => "system",
  );

  useEffect(() => {
    if (!persistAccount) return;
    const controller = new AbortController();
    fetch("/api/platform/theme", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ theme?: unknown }> : null)
      .then((body) => {
        if (!body || !isThemeMode(body.theme)) return;
        writePreference(body.theme);
        applyTheme(body.theme);
        announceThemeMode();
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [persistAccount]);

  useEffect(() => {
    if (mode !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme("system");
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [mode]);

  async function select(next: ThemeMode) {
    writePreference(next);
    applyTheme(next);
    announceThemeMode();
    if (!persistAccount) return;
    try {
      await fetch("/api/platform/theme", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ theme: next }),
      });
    } catch {
      // The device preference remains useful when account persistence is offline.
    }
  }

  return (
    <div className={`theme-switcher ${compact ? "is-compact" : ""}`} role="group" aria-label={locale === "ru" ? "Тема оформления" : "Ko‘rinish mavzusi"}>
      {options.map(([value, Icon, ru, uz]) => {
        const label = locale === "ru" ? ru : uz;
        return (
          <button
            type="button"
            key={value}
            aria-label={label}
            aria-pressed={mode === value}
            title={label}
            onClick={() => void select(value)}
          >
            <Icon aria-hidden="true" />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
