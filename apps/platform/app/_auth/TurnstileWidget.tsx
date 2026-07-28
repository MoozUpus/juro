"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: Record<string, unknown>,
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

type TurnstileWindow = Window & { turnstile?: TurnstileApi };

export function TurnstileWidget({
  siteKey,
  locale,
  resetSignal,
  onToken,
}: {
  siteKey: string;
  locale: "ru" | "uz";
  resetSignal: number;
  onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const callback = useRef(onToken);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let cancelled = false;
    const turnstileWindow = window as TurnstileWindow;
    const render = () => {
      if (cancelled || !container.current || !turnstileWindow.turnstile) {
        return;
      }
      if (widgetId.current) {
        turnstileWindow.turnstile.remove(widgetId.current);
      }
      widgetId.current = turnstileWindow.turnstile.render(
        container.current,
        {
          sitekey: siteKey,
          action: "auth_otp",
          language: locale,
          theme: "light",
          size: "flexible",
          appearance: "interaction-only",
          callback(token: string) {
            callback.current(token);
            setStatus("ready");
          },
          "expired-callback"() {
            callback.current("");
            setStatus("loading");
          },
          "error-callback"() {
            callback.current("");
            setStatus("error");
          },
        },
      );
      setStatus("loading");
    };

    const scriptId = "juro-turnstile-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    const handleLoad = () => render();
    const handleError = () => {
      if (!cancelled) setStatus("error");
    };
    if (turnstileWindow.turnstile) {
      render();
    } else {
      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", handleLoad);
      script.addEventListener("error", handleError);
    }

    return () => {
      cancelled = true;
      script?.removeEventListener("load", handleLoad);
      script?.removeEventListener("error", handleError);
      if (widgetId.current && turnstileWindow.turnstile) {
        turnstileWindow.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [locale, siteKey]);

  useEffect(() => {
    const turnstile = (window as TurnstileWindow).turnstile;
    if (!turnstile || !widgetId.current) return;
    callback.current("");
    turnstile.reset(widgetId.current);
    setStatus("loading");
  }, [resetSignal]);

  const ru = locale === "ru";
  return (
    <div className="auth-turnstile">
      <div ref={container} />
      <span className="auth-turnstile-status" role="status">
        {status === "ready"
          ? (ru ? "Проверка пройдена." : "Tekshiruvdan o‘tildi.")
          : status === "error"
            ? (ru
              ? "Проверка не загрузилась. Обновите её и повторите."
              : "Tekshiruv yuklanmadi. Uni yangilang va qayta urinib ko‘ring.")
            : (ru ? "Выполняется проверка…" : "Tekshiruv bajarilmoqda…")}
      </span>
    </div>
  );
}
