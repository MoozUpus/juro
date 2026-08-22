"use client";

import { useState } from "react";

export function AdminConsoleLaunch({
  locale,
  environment,
}: {
  locale: "ru" | "uz";
  environment: "production" | "staging";
}) {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const isProduction = environment === "production";
  const copy = locale === "ru"
    ? {
        title: "Изолированная административная консоль",
        body: `Откроется отдельный ${isProduction ? "production" : "staging"}-домен с независимой 15‑минутной admin-сессией. Роль и свежий TOTP проверяются снова на каждом запросе.`,
        button: "Открыть защищённую консоль",
        error: "Не удалось открыть отдельную сессию. Обновите TOTP/MFA и повторите попытку.",
      }
    : {
        title: "Ajratilgan administrator konsoli",
        body: `Alohida ${isProduction ? "production" : "staging"} domeni 15 daqiqalik mustaqil admin-sessiya bilan ochiladi. Rol va yangi TOTP har bir so‘rovda qayta tekshiriladi.`,
        button: "Himoyalangan konsolni ochish",
        error: "Alohida sessiyani ochib bo‘lmadi. TOTP/MFA ni yangilang va qayta urinib ko‘ring.",
      };

  async function launch() {
    setState("working");
    try {
      const response = await fetch("/api/platform/admin/handoff", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ locale }),
      });
      const payload = await response.json() as { url?: string };
      if (!response.ok || !payload.url) throw new Error("handoff-denied");
      window.location.assign(payload.url);
    } catch {
      setState("error");
    }
  }

  return <main style={{ maxWidth: "44rem", margin: "4rem auto", padding: "1.5rem", fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif" }}>
    <p style={{ color: "#6b541f", fontWeight: 700, letterSpacing: ".08em" }}>
      {isProduction ? "JURO · ADMIN" : "JURO · STAGING ADMIN"}
    </p>
    <h1 style={{ color: "#062844" }}>{copy.title}</h1>
    <p style={{ lineHeight: 1.6, color: "#334e68" }}>{copy.body}</p>
    <button type="button" onClick={() => void launch()} disabled={state === "working"} style={{ minHeight: 44, border: 0, borderRadius: 8, padding: "0.75rem 1rem", background: "#062844", color: "white", fontWeight: 700, cursor: state === "working" ? "wait" : "pointer" }}>
      {state === "working" ? "…" : copy.button}
    </button>
    {state === "error" && <p role="alert" style={{ color: "#9b2c2c", marginTop: "1rem" }}>{copy.error}</p>}
  </main>;
}
