import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { FeatureFlagConsole } from "../../../_staff/FeatureFlagConsole";
import "../../../_staff/legal-source-reviews.css";
import { requirePlatformStaffAccess } from "../../../../lib/auth/staff-access";
import { localSessionForRequest } from "../../../../lib/auth/mfa-http";
import { runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { operationalEnvironment, readOperationalFeatureDashboard } from "../../../../lib/operations/operational-feature-flags";
import { isLocale } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function FeatureFlagsAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const runtime = runtimeEnv();
  if (!isLocale(locale) || !runtime.DB) notFound();
  let staffName = "";
  try {
    const incoming = await headers();
    const now = new Date();
    const session = await localSessionForRequest(new Request("https://app.juro.local/staff-access", { headers: new Headers(incoming) }), { now });
    await requirePlatformStaffAccess(runtime.DB, session, "staff.operations.manage", { now, freshMfaWithinMs: 15 * 60 * 1_000 });
    staffName = session.fullName || session.email;
  } catch { notFound(); }
  const initial = await readOperationalFeatureDashboard({ db: runtime.DB, environment: operationalEnvironment(runtime.APP_ENV) });
  return <FeatureFlagConsole locale={locale} staffName={staffName} initial={initial}/>;
}
