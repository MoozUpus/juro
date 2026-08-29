import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { AdminConsoleAccess } from "../../../_staff/AdminConsoleAccess";
import { ProductKpiConsole } from "../../../_staff/ProductKpiConsole";
import "../../../_staff/legal-source-reviews.css";
import { readProductKpiDashboard } from "../../../../lib/analytics/product-kpis";
import { requirePlatformStaffAccess } from "../../../../lib/auth/staff-access";
import { localSessionForRequest } from "../../../../lib/auth/mfa-http";
import { runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { isLocale } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function ProductKpisPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const runtime = runtimeEnv();
  const appEnv = runtime.APP_ENV;
  if (
    !isLocale(locale)
    || !runtime.DB
    || (appEnv !== "development" && appEnv !== "staging" && appEnv !== "production")
  ) notFound();
  let staffName = "";
  try {
    const incoming = await headers();
    const now = new Date();
    const session = await localSessionForRequest(
      new Request("https://app.juro.local/staff-access", { headers: new Headers(incoming) }),
      { now },
    );
    await requirePlatformStaffAccess(runtime.DB, session, "staff.operations.manage", {
      now,
      freshMfaWithinMs: 15 * 60 * 1_000,
    });
    staffName = session.fullName || session.email;
  } catch {
    return <AdminConsoleAccess
      locale={locale}
      environment={appEnv === "production" ? "production" : "staging"}
      returnTo={`/${locale}/admin/product-kpis`}
    />;
  }
  const dashboard = await readProductKpiDashboard({ db: runtime.DB });
  return <ProductKpiConsole
    locale={locale}
    staffName={staffName}
    environment={appEnv}
    dashboard={dashboard}
  />;
}
