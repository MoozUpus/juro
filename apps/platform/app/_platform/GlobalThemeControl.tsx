"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function GlobalThemeControl() {
  const [theme, setTheme] = useState<Theme>("light");
  const [locale, setLocale] = useState<"ru" | "uz">("ru");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
      setLocale(document.documentElement.lang === "uz" ? "uz" : "ru");
    });
    const sync = (event: Event) => {
      const next = (event as CustomEvent<Theme>).detail;
      if (next === "light" || next === "dark") setTheme(next);
    };
    window.addEventListener("juro-theme-change", sync);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("juro-theme-change", sync);
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("juro-theme", next);
    const sharedDomain = location.hostname === "juro.uz" || location.hostname.endsWith(".juro.uz") ? "; Domain=.juro.uz" : "";
    document.cookie = `juro_theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax${sharedDomain}`;
    setTheme(next);
    window.dispatchEvent(new CustomEvent("juro-theme-change", { detail: next }));
  };

  const label = theme === "dark"
    ? (locale === "ru" ? "Включить светлую тему" : "Yorug‘ mavzuni yoqish")
    : (locale === "ru" ? "Включить тёмную тему" : "Qorong‘i mavzuni yoqish");

  return <button className="global-theme-control" type="button" onClick={toggleTheme} aria-label={label} aria-pressed={theme === "dark"} title={label}>{theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}</button>;
}
