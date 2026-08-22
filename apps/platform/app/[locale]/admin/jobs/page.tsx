import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AdminConsoleAccess } from "../../../_staff/AdminConsoleAccess";
import { JobOperationsConsole } from "../../../_staff/JobOperationsConsole";
import "../../../_staff/legal-source-reviews.css";
import { requirePlatformStaffAccess } from "../../../../lib/auth/staff-access";
import { localSessionForRequest } from "../../../../lib/auth/mfa-http";
import { runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { operationalEnvironment } from "../../../../lib/operations/operational-feature-flags";
import { readOperationalJobsDashboard } from "../../../../lib/operations/job-operations";
import { isLocale } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function JobsAdminPage({ params }: { params: Promise<{ locale: string }> }) {
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
  } catch {
    return <AdminConsoleAccess
      locale={locale}
      environment={runtime.APP_ENV === "production" ? "production" : "staging"}
      returnTo={`/${locale}/admin/jobs`}
    />;
  }
  const initial = await readOperationalJobsDashboard({
    db: runtime.DB,
    environment: operationalEnvironment(runtime.APP_ENV),
  });
  return <JobOperationsConsole locale={locale} staffName={staffName} initial={initial}/>;
}
