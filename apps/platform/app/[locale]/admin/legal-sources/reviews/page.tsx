import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { LegalSourceHealthPanel } from "../../../../_staff/LegalSourceHealthPanel";
import { LegalSourceReviewInbox } from "../../../../_staff/LegalSourceReviewInbox";
import "../../../../_staff/legal-source-reviews.css";
import { requirePlatformStaffAccess } from "../../../../../lib/auth/staff-access";
import { localSessionForRequest } from "../../../../../lib/auth/mfa-http";
import { runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";
import { isLocale } from "../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function LegalSourceReviewsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const runtime = runtimeEnv();
  if (runtime.LEGAL_SOURCE_STAFF_API_ENABLED !== "true" || !runtime.DB) {
    notFound();
  }
  let reviewerName: string;
  try {
    const incomingHeaders = await headers();
    const request = new Request("https://app.juro.local/staff-access", {
      headers: new Headers(incomingHeaders),
    });
    const now = new Date();
    const session = await localSessionForRequest(request, { now });
    await requirePlatformStaffAccess(
      runtime.DB,
      session,
      "legal.sources.review",
      { now, freshMfaWithinMs: 15 * 60 * 1_000 },
    );
    reviewerName = session.fullName || session.email;
  } catch {
    notFound();
  }
  return <><LegalSourceHealthPanel locale={locale}/><LegalSourceReviewInbox locale={locale} reviewerName={reviewerName}/></>;
}
