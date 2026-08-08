import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { AdminConsoleLaunch } from "../../../_staff/AdminConsoleLaunch";
import { localSessionForRequest } from "../../../../lib/auth/mfa-http";
import { requirePlatformStaffAccess } from "../../../../lib/auth/staff-access";
import { runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { isLocale } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function AdminConsolePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const runtime = runtimeEnv();
  if (!isLocale(locale) || !runtime.DB || !runtime.ADMIN_CONSOLE_ORIGIN) notFound();
  try {
    const incoming = await headers();
    const now = new Date();
    const request = new Request("https://app.juro.local/staff-access", { headers: new Headers(incoming) });
    const session = await localSessionForRequest(request, { now });
    await requirePlatformStaffAccess(runtime.DB, session, "staff.console.view", {
      now,
      freshMfaWithinMs: 15 * 60 * 1_000,
    });
  } catch {
    notFound();
  }
  return <AdminConsoleLaunch locale={locale} />;
}
