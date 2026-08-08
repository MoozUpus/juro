"use client";

import { useEffect, useRef } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

export function useSessionRefresh(locale: PlatformLocale): void {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let authenticationRetryUsed = false;
    let nextCheckAt = 0;
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const schedule = (
      nextRefreshAt?: string,
      fallbackMs = 15 * 60 * 1_000,
    ) => {
      if (disposed) return;
      clearTimer();
      const parsed = nextRefreshAt ? Date.parse(nextRefreshAt) : Number.NaN;
      const baseDelay = Number.isFinite(parsed)
        ? Math.max(1_000, parsed - Date.now())
        : fallbackMs;
      const jitter = baseDelay >= 60_000
        ? Math.floor(Math.random() * 30_000)
        : 0;
      const delay = baseDelay + jitter;
      nextCheckAt = Date.now() + delay;
      timerRef.current = window.setTimeout(() => void refresh(), delay);
    };
    async function refresh() {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(
          `/api/platform/security/sessions/refresh?lang=${locale}`,
          {
            method: "POST",
            headers: { "x-juro-csrf": "1" },
            credentials: "same-origin",
            cache: "no-store",
          },
        );
        if (response.status === 401) {
          if (!authenticationRetryUsed) {
            authenticationRetryUsed = true;
            schedule(undefined, 5_000);
          } else {
            nextCheckAt = Number.POSITIVE_INFINITY;
            clearTimer();
          }
          return;
        }
        if (response.status === 403) {
          nextCheckAt = Number.POSITIVE_INFINITY;
          clearTimer();
          return;
        }
        if (response.status === 409) {
          schedule(undefined, 5_000);
          return;
        }
        if (!response.ok) {
          schedule();
          return;
        }
        const body = await response.json().catch(() => null) as {
          nextRefreshAt?: string;
        } | null;
        authenticationRetryUsed = false;
        schedule(body?.nextRefreshAt);
      } catch {
        schedule();
      } finally {
        inFlight = false;
      }
    }

    const initialDelay = 10_000 + Math.floor(Math.random() * 30_000);
    nextCheckAt = Date.now() + initialDelay;
    timerRef.current = window.setTimeout(() => void refresh(), initialDelay);
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() >= nextCheckAt) {
        clearTimer();
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [locale]);
}
