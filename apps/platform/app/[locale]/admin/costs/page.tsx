import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CostConsole } from "../../../_staff/CostConsole";
import "../../../_staff/legal-source-reviews.css";
import { readAiCostDashboard } from "../../../../lib/ai/provider-usage";
import { requirePlatformStaffAccess } from "../../../../lib/auth/staff-access";
import { localSessionForRequest } from "../../../../lib/auth/mfa-http";
import { runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { isLocale } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function CostsPage({ params }: { params: Promise<{ locale: string }> }) {
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
    const session = await localSessionForRequest(new Request("https://app.juro.local/staff-access", { headers: new Headers(incoming) }), { now });
    await requirePlatformStaffAccess(runtime.DB, session, "staff.operations.manage", { now, freshMfaWithinMs: 15 * 60 * 1000 });
    staffName = session.fullName || session.email;
  } catch {
    notFound();
  }
  const initial = await readAiCostDashboard({
    db: runtime.DB,
    environment: appEnv,
  });
  return <CostConsole locale={locale} staffName={staffName} initial={initial}/>;
}
