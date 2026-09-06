"use client";

import { useEffect, useRef, useState } from "react";
import {
  turnstileClientFailure,
  turnstileClientRetryMode,
} from "../../lib/auth/turnstile-client";

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: Record<string, unknown>,
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

type TurnstileWindow = Window & { turnstile?: TurnstileApi };
type TurnstileTheme = "light" | "dark";

function turnstileLanguage(locale: "ru" | "uz" | "en"): "ru" | "en" | "auto" {
  // Cloudflare does not currently offer Uzbek. `auto` lets the provider use a
  // supported browser language without rejecting `uz`; JURO-owned status and
  // error copy remains localized in Uzbek below.
  return locale === "uz" ? "auto" : locale;
}

function documentTheme(): TurnstileTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function TurnstileWidget({
  siteKey,
  locale,
  resetSignal,
  onToken,
  action = "auth_otp",
}: {
  siteKey: string;
  locale: "ru" | "uz" | "en";
  resetSignal: number;
  onToken: (token: string) => void;
  action?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const callback = useRef(onToken);
  const [attempt, setAttempt] = useState(0);
  const [theme, setTheme] = useState<TurnstileTheme>("light");
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [failure, setFailure] = useState<ReturnType<
    typeof turnstileClientFailure
  > | null>(null);

  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);

  useEffect(() => {
    const updateTheme = () => setTheme(documentTheme());
    updateTheme();
    window.addEventListener("juro-theme-change", updateTheme);
    return () => window.removeEventListener("juro-theme-change", updateTheme);
  }, []);

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
        callback.current("");
        widgetId.current = turnstileWindow.turnstile.render(
          container.current,
          {
            sitekey: siteKey,
            action,
            language: turnstileLanguage(locale),
            theme,
            size: "flexible",
            appearance: "interaction-only",
            retry: turnstileClientRetryMode,
            callback(token: string) {
              callback.current(token);
              setFailure(null);
              setStatus("ready");
            },
            "expired-callback"() {
              callback.current("");
              setFailure(null);
              setStatus("loading");
            },
            "error-callback"(errorCode: string) {
              callback.current("");
              setFailure(turnstileClientFailure(errorCode, locale));
              setStatus("error");
              return true;
            },
          },
        );
        setFailure(null);
        setStatus("loading");
      } catch {
        callback.current("");
        setFailure(turnstileClientFailure(null, locale));
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
        setFailure(turnstileClientFailure(null, locale));
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
  }, [action, attempt, locale, siteKey, theme]);

  useEffect(() => {
    const turnstile = (window as TurnstileWindow).turnstile;
    if (!turnstile || !widgetId.current) return;
    callback.current("");
    turnstile.reset(widgetId.current);
    setFailure(null);
    setStatus("loading");
  }, [resetSignal]);

  const statusText = (ru: string, uz: string, en: string) =>
    locale === "ru" ? ru : locale === "uz" ? uz : en;
  const retry = () => {
    if (failure && !failure.retryable) {
      window.location.reload();
      return;
    }
    callback.current("");
    const script = document.getElementById("juro-turnstile-script");
    script?.remove();
    setFailure(null);
    setStatus("loading");
    setAttempt((value) => value + 1);
  };
  return (
    <div className="auth-turnstile">
      <div ref={container} />
      <span className="auth-turnstile-status" role="status">
        {status === "ready"
          ? statusText("Проверка пройдена.", "Tekshiruvdan o‘tildi.", "Security check complete.")
          : status === "error"
            ? failure?.message
            : statusText("Выполняется проверка…", "Tekshiruv bajarilmoqda…", "Running security check…")}
      </span>
      {status === "error" && <button type="button" className="auth-turnstile-retry" onClick={retry}>
        {failure && !failure.retryable
          ? statusText("Обновить страницу", "Sahifani yangilash", "Refresh page")
          : statusText("Повторить проверку", "Tekshiruvni takrorlash", "Try again")}
      </button>}
    </div>
  );
}
