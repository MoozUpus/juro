import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SystemStatusConsole } from "../../../_staff/SystemStatusConsole";
import "../../../_staff/legal-source-reviews.css";
import { requirePlatformStaffAccess } from "../../../../lib/auth/staff-access";
import { localSessionForRequest } from "../../../../lib/auth/mfa-http";
import { runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { readStatusIncidentAdminDashboard } from "../../../../lib/operations/system-status";
import { dependencyHealthEnvironment } from "../../../../lib/operations/dependency-health";
import { isLocale } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function SystemStatusAdminPage({ params }: { params: Promise<{ locale: string }> }) {
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
  const initial = await readStatusIncidentAdminDashboard({
    db: runtime.DB,
    environment: dependencyHealthEnvironment(runtime.APP_ENV),
  });
  return <SystemStatusConsole locale={locale} staffName={staffName} initial={initial}/>;
}
