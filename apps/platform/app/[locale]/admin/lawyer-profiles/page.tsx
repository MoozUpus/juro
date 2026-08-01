import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { LawyerProfileModerationInbox } from "../../../_staff/LawyerProfileModerationInbox";
import "../../../_staff/legal-source-reviews.css";
import { requirePlatformStaffAccess } from "../../../../lib/auth/staff-access";
import { localSessionForRequest } from "../../../../lib/auth/mfa-http";
import { isLocale } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function LawyerProfilesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const runtime = runtimeEnv();
  if (runtime.APP_ENV !== "staging" || runtime.LAWYER_PROFILE_DIRECTORY_ENABLED !== "true" || !runtime.DB) notFound();
  let reviewerName: string;
  try {
    const incoming = await headers(); const request = new Request("https://app.juro.local/staff-access", { headers: new Headers(incoming) }); const now = new Date(); const session = await localSessionForRequest(request, { now }); await requirePlatformStaffAccess(runtime.DB, session, "lawyer.profiles.moderate", { now, freshMfaWithinMs: 15 * 60 * 1_000 }); reviewerName = session.fullName || session.email;
  } catch { notFound(); }
  return <LawyerProfileModerationInbox locale={locale} reviewerName={reviewerName} />;
}
