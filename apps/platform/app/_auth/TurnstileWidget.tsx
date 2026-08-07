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
  action = "auth_otp",
}: {
  siteKey: string;
  locale: "ru" | "uz";
  resetSignal: number;
  onToken: (token: string) => void;
  action?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const callback = useRef(onToken);
  const [attempt, setAttempt] = useState(0);
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
      try {
        widgetId.current = turnstileWindow.turnstile.render(
          container.current,
          {
            sitekey: siteKey,
            action,
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
      } catch {
        callback.current("");
        setStatus("error");
      }
    };

    const scriptId = "juro-turnstile-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    let timeout: number | undefined;
    const handleLoad = () => render();
    const handleError = () => {
      if (!cancelled) {
        callback.current("");
        setStatus("error");
      }
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
        // Register handlers before insertion: a cached script may finish before
        // listeners attached after appendChild, leaving the form disabled.
        script.addEventListener("load", handleLoad, { once: true });
        script.addEventListener("error", handleError, { once: true });
        document.head.appendChild(script);
      } else {
        script.addEventListener("load", handleLoad, { once: true });
        script.addEventListener("error", handleError, { once: true });
      }
      timeout = window.setTimeout(() => {
        if (!cancelled && !turnstileWindow.turnstile) handleError();
      }, 12_000);
    }

    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
      script?.removeEventListener("load", handleLoad);
      script?.removeEventListener("error", handleError);
      if (widgetId.current && turnstileWindow.turnstile) {
        turnstileWindow.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [action, attempt, locale, siteKey]);

  useEffect(() => {
    const turnstile = (window as TurnstileWindow).turnstile;
    if (!turnstile || !widgetId.current) return;
    callback.current("");
    turnstile.reset(widgetId.current);
    setStatus("loading");
  }, [resetSignal]);

  const ru = locale === "ru";
  const retry = () => {
    callback.current("");
    const script = document.getElementById("juro-turnstile-script");
    script?.remove();
    setStatus("loading");
    setAttempt((value) => value + 1);
  };
  return (
    <div className="auth-turnstile">
      <div ref={container} />
      <span className="auth-turnstile-status" role="status">
        {status === "ready"
          ? (ru ? "Проверка пройдена." : "Tekshiruvdan o‘tildi.")
          : status === "error"
            ? (ru
              ? "Проверка не загрузилась. Разрешите challenges.cloudflare.com в блокировщике содержимого и повторите."
              : "Tekshiruv yuklanmadi. Kontent bloklagichida challenges.cloudflare.com manziliga ruxsat bering va qayta urinib ko‘ring.")
            : (ru ? "Выполняется проверка…" : "Tekshiruv bajarilmoqda…")}
      </span>
      {status === "error" && <button type="button" className="auth-turnstile-retry" onClick={retry}>
        {ru ? "Повторить проверку" : "Tekshiruvni takrorlash"}
      </button>}
    </div>
  );
}
