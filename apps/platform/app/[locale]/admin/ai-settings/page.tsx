import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { AiSettingsConsole } from "../../../_staff/AiSettingsConsole";
import "../../../_staff/legal-source-reviews.css";
import { requirePlatformStaffAccess } from "../../../../lib/auth/staff-access";
import { localSessionForRequest } from "../../../../lib/auth/mfa-http";
import { runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { isLocale } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function AiSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const runtime = runtimeEnv();
  if (!isLocale(locale) || !runtime.DB) notFound();
  let staffName = "";
  try {
    const incoming = await headers();
    const now = new Date();
    const session = await localSessionForRequest(
      new Request("https://app.juro.local/staff-access", { headers: new Headers(incoming) }),
      { now },
    );
    await requirePlatformStaffAccess(runtime.DB, session, "ai.settings.manage", {
      now,
      freshMfaWithinMs: 15 * 60 * 1_000,
    });
    staffName = session.fullName || session.email;
  } catch {
    notFound();
  }
  return <AiSettingsConsole locale={locale} staffName={staffName}/>;
}
