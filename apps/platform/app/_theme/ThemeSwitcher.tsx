"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { isThemeMode, type ThemeMode } from "./theme";

type Props = {
  locale: "ru" | "uz" | "en";
  compact?: boolean;
  persistAccount?: boolean;
};

const options = [
  ["light", Sun, "Светлая", "Yorug‘", "Light"],
  ["dark", Moon, "Тёмная", "Qorong‘i", "Dark"],
] as const;

const THEME_CHANGE_EVENT = "juro-theme-change";

function readThemeInteractionRevision() {
  if (typeof document === "undefined") return "";
  return document.documentElement.dataset.themeInteractionRevision ?? "";
}

function markThemeInteraction() {
  const current = Number.parseInt(readThemeInteractionRevision(), 10);
  document.documentElement.dataset.themeInteractionRevision = String(Number.isSafeInteger(current) ? current + 1 : 1);
}

function readThemeMode(): ThemeMode {
  if (typeof document === "undefined") return "light";
  const value = document.documentElement.dataset.themeMode;
  return isThemeMode(value) ? value : "light";
}

function subscribeThemeMode(onStoreChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
}

function announceThemeMode() {
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
}

function writePreference(mode: ThemeMode) {
  try {
    localStorage.setItem("juro-theme", mode);
  } catch {
    // Storage can be unavailable in privacy-restricted contexts; the live
    // document theme and cookie still provide a useful fallback.
  }
  const shared = window.location.hostname === "juro.uz" || window.location.hostname.endsWith(".juro.uz");
  try {
    document.cookie = `juro_theme=${mode}; Path=/; Max-Age=31536000; SameSite=Lax${shared ? "; Domain=.juro.uz; Secure" : ""}`;
  } catch {
    // Applying the in-page theme must not depend on cookie availability.
  }
}

export function ThemeSwitcher({ locale, compact = false, persistAccount = true }: Props) {
  const mode = useSyncExternalStore(
    subscribeThemeMode,
    readThemeMode,
    () => "light",
  );

  useEffect(() => {
    if (!persistAccount) return;
    const controller = new AbortController();
    const startedRevision = readThemeInteractionRevision();
    fetch("/api/platform/theme", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ theme?: unknown }> : null)
      .then((body) => {
        if (!body || !isThemeMode(body.theme) || readThemeInteractionRevision() !== startedRevision) return;
        writePreference(body.theme);
        applyTheme(body.theme);
        announceThemeMode();
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [persistAccount]);

  async function select(next: ThemeMode) {
    markThemeInteraction();
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
    <div className={`theme-switcher ${compact ? "is-compact" : ""}`} role="group" aria-label={locale === "ru" ? "Тема оформления" : locale === "uz" ? "Ko‘rinish mavzusi" : "Appearance theme"}>
      {options.map(([value, Icon, ru, uz, en]) => {
        const label = locale === "ru" ? ru : locale === "uz" ? uz : en;
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
