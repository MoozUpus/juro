"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect } from "react";
import {
  trackPublicEvent,
  type PublicAnalyticsLocale,
  type PublicPageKind,
} from "../../../lib/analytics";

function pageKind(pathname: string): PublicPageKind {
  const path = pathname.replace(/^\/(?:ru|uz|en)(?=\/|$)/u, "") || "/";
  if (path === "/") return "landing";
  if (path.startsWith("/lawyers")) return "lawyers";
  if (path.startsWith("/video")) return "video";
  if (path.startsWith("/legal") || path.includes("privacy") || path.includes("terms")) return "legal";
  if (path.startsWith("/knowledge")) return "knowledge";
  return "other";
}

export function PublicAnalyticsBridge({ locale }: { locale: PublicAnalyticsLocale }) {
  const pathname = usePathname();
  const trackCurrentPage = useCallback(() => {
    const page = pageKind(pathname);
    if (page === "landing") trackPublicEvent({ event: "landing_view", locale, page });
    if (page === "lawyers") trackPublicEvent({ event: "lawyer_viewed", locale, page });
  }, [locale, pathname]);

  useEffect(() => {
    trackCurrentPage();
    window.addEventListener("juro:consent-change", trackCurrentPage);
    return () => window.removeEventListener("juro:consent-change", trackCurrentPage);
  }, [trackCurrentPage]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor) return;
      try {
        const target = new URL(anchor.href, window.location.href);
        if ((target.hostname === "app.juro.uz" || target.hostname === "app.staging.juro.uz") && target.pathname === "/register") {
          trackPublicEvent({ event: "signup_started", locale, page: pageKind(pathname) });
        }
      } catch {
        // Invalid navigation is handled by the browser and is not telemetry.
      }
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [locale, pathname]);

  return null;
}
